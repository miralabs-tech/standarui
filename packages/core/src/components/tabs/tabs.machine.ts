/**
 * A tab list has no lifecycle — one state, everything on the root `on:`, the same
 * shape as `toggle-group`. What it does have is three things that one did not.
 *
 * **The indicator is measured, never derived from an index.** Tabs are as wide as
 * their labels, so an index is not a position and arithmetic on one would put the
 * pill next to the tab it points at. The geometry lives in
 * `utils/indicator-rect`, is pure, and is expressed logically so RTL needs no
 * second rule anywhere.
 *
 * **`syncTriggers` re-settles the value.** APG says a tab list always has exactly
 * one selected tab; a consumer who passes no `defaultValue`, or whose selected tab
 * is removed, must still get that invariant. Re-settling costs nothing here
 * because the trigger list is read from the DOM anyway.
 *
 * **LB/RB reach in from anywhere in the root**, panel included (CDC §4.4), and the
 * scope is deliberately neither `trapped` nor `base` — the popover's reasoning
 * exactly: a trapping scope answers `consumed` to everything it declines, and the
 * spatial engine is at the bottom of the stack, so a trapping tab list would make
 * its own panel unreachable to a d-pad.
 */

import { observeChildren, observeResize } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { resolveEnvironment } from "../../environment/environment";
import { getInitialIndex, getNextIndex, getRemovalIndex } from "../../focus/roving-focus";
import { trackInlineScrollbar } from "../../interaction/inline-scrollbar";
import { scrollIntoInlineView, trackInlineScrollEdges } from "../../interaction/scroll-edges";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement, getInputModality, getTabbables, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import { getIndicatorMetrics } from "../../utils/indicator-rect";
import {
  getContentEl,
  getListEl,
  getRootEl,
  getScrollbarEl,
  getThumbEl,
  getTriggerEl,
  getTriggerEls,
  getTriggerValues,
  isFocusInList,
  ownsFocus,
} from "./tabs.dom";
import type { TabsSchema } from "./tabs.types";

type Params = MachineParams<TabsSchema>;

function disabledAt(triggers: readonly HTMLElement[]): (index: number) => boolean {
  return (index: number): boolean => triggers[index]?.hasAttribute("disabled") === true;
}

/**
 * Focus, then the list's own scroll brings the tab into view: a tab half under the
 * fade or fully out of the visible window is where the arrows and the shoulder
 * buttons land. A vertical list has no inline overflow and is left alone.
 */
function focusElementInView(
  { prop, scope }: Pick<Params, "prop" | "scope">,
  target: HTMLElement,
): void {
  focusElement(target);
  if (prop("orientation") !== "vertical") scrollIntoInlineView(getListEl(scope), target);
}

/**
 * The one place `value` is written. `animated` is the whole reason it exists: a
 * pill springs into place when a person chose a tab, and snaps when a layout did
 * — the first settle of `syncTriggers` is a layout, not a choice.
 */
function commitValue(params: Params, value: string | null, animated = true): void {
  const { context, refs } = params;
  if (context.get("value") === value) return;
  context.set("indicatorAnimated", animated);
  if (value !== null) refs.get("visited").add(value);
  context.set("value", value);
}

export const machine: Machine<TabsSchema> = createMachine<TabsSchema>({
  props({ props }) {
    return {
      orientation: "horizontal",
      activationMode: "automatic",
      loopFocus: true,
      disabled: false,
      closable: false,
      lazyMount: false,
      keepMounted: false,
      scrollActiveIntoView: true,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<string | null>(() => ({
        defaultValue: prop("defaultValue") ?? null,
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "tabs value",
      })),
      focusedValue: bindable<string | null>(() => ({
        defaultValue: null,
        onChange: (value) => prop("onFocusChange")?.({ value }),
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      activeIndex: bindable<number>(() => ({ defaultValue: -1 })),
      tabbableValue: bindable<string | null>(() => ({ defaultValue: null })),
      itemCount: bindable<number>(() => ({ defaultValue: 0 })),
      indicatorOffset: bindable<number | null>(() => ({ defaultValue: null })),
      indicatorSize: bindable<number | null>(() => ({ defaultValue: null })),
      indicatorAnimated: bindable<boolean>(() => ({ defaultValue: false })),
      contentTabbable: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  refs() {
    return { visited: new Set<string>(), reveal: null };
  },

  computed: {
    selected: ({ context }) => context.get("value"),
    interactive: ({ prop }) => !prop("disabled"),
  },

  initialState() {
    return "idle";
  },

  effects: [
    "trackModality",
    "trackTriggers",
    "trackIndicator",
    "trackScrollEdges",
    "trackScrollbar",
    "captureIntents",
  ],

  watch({ context, scope, prop, track, action }) {
    // The trigger list is a dependency like any other, so an adapter that
    // re-renders keeps the indicator in step synchronously and the observer below
    // is left to cover the mutations no render caused.
    //
    // The separator is spelled out rather than typed: a raw NUL byte makes ripgrep
    // classify the file as binary, which hid two machines from every grep in the
    // repo once already. It stays U+0000 because that is the one character an
    // attribute value cannot carry, so two different tab lists can never key the
    // same.
    track(
      () => [
        context.get("value"),
        getTriggerValues(scope).join("\u0000"),
        prop("orientation"),
        prop("dir"),
      ],
      () =>
        action(["syncTriggers", "syncIndicator", "syncContentTabbable", "scrollActiveIntoView"]),
    );
  },

  on: {
    "TRIGGER.CLICK": { guard: "isInteractive", actions: ["selectValue"] },
    // Two branches rather than a conditional second action: a transition takes one
    // guard, and `isAutomatic` folds the interactivity test in for that reason.
    "TRIGGER.FOCUS": [
      { guard: "isAutomatic", actions: ["setFocusedValue", "selectValue"] },
      { actions: ["setFocusedValue"] },
    ],
    "TRIGGER.BLUR": { actions: ["clearFocus"] },
    "TRIGGER.NAVIGATE": { guard: "isInteractive", actions: ["navigate"] },
    // Enter and Space. On a real `<button>` the browser also produces a click, so
    // this path is what keeps a substituted element correct; the second commit is
    // a no-op because the value is already the one being asked for.
    "TRIGGER.ACTIVATE": { guard: "isInteractive", actions: ["selectValue"] },
    "TRIGGER.CLOSE": { guard: "isClosable", actions: ["closeTab"] },
    "LIST.NEXT": { guard: "isInteractive", actions: ["stepValue"] },
    "LIST.PREV": { guard: "isInteractive", actions: ["stepValue"] },
    "VALUE.SET": { actions: ["setValue"] },
    "TRIGGERS.SYNC": {
      actions: ["syncTriggers", "syncIndicator", "syncContentTabbable", "revealClosedSuccessor"],
    },
    "INDICATOR.MEASURE": { actions: ["syncIndicator"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
      isAutomatic: ({ prop }) => !prop("disabled") && prop("activationMode") === "automatic",
      isClosable: ({ prop }) => !prop("disabled") && prop("closable"),
    },

    actions: {
      selectValue(params) {
        const { event } = params;
        if (
          event.type === "TRIGGER.CLICK" ||
          event.type === "TRIGGER.ACTIVATE" ||
          event.type === "TRIGGER.FOCUS"
        ) {
          commitValue(params, event.value);
        }
      },

      setValue(params) {
        if (params.event.type === "VALUE.SET") commitValue(params, params.event.value);
      },

      setFocusedValue({ context, event, scope }) {
        if (event.type !== "TRIGGER.FOCUS") return;
        context.set("focusedValue", event.value);
        // Read here and held: an arrow key moving between tabs is a new focus, so
        // the source follows a keyboard user across the list, while a mouse merely
        // crossing the page never touches it.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocus({ context }) {
        context.set("focusedValue", null);
        context.set("focusSource", null);
      },

      /**
       * Moves the focus and nothing else. In `automatic` mode the selection
       * follows, but it arrives through `TRIGGER.FOCUS` — one path, whether the
       * focus was moved by an arrow, a d-pad or a click.
       */
      navigate(params) {
        const { prop, scope, event } = params;
        if (event.type !== "TRIGGER.NAVIGATE") return;
        const triggers = getTriggerEls(scope);
        const current = triggers.findIndex((trigger) => trigger.dataset.value === event.value);
        const next = getNextIndex(current, event.action, {
          count: triggers.length,
          loop: prop("loopFocus"),
          isDisabled: disabledAt(triggers),
        });
        const target = triggers[next];
        if (target === undefined || next === current) return;
        focusElementInView(params, target);
      },

      /**
       * LB/RB, and `api.selectNext()`. The selection steps whatever has the focus;
       * the focus only follows when it was in the list already — a shoulder button
       * pressed while the user is reading a panel must not tear them out of it.
       */
      stepValue(params) {
        const { context, prop, scope, event } = params;
        if (event.type !== "LIST.NEXT" && event.type !== "LIST.PREV") return;
        const triggers = getTriggerEls(scope);
        const values = triggers.map((trigger) => trigger.dataset.value ?? "");
        const current = values.indexOf(context.get("value") ?? "");
        const next = getNextIndex(current, event.type === "LIST.NEXT" ? "next" : "prev", {
          count: triggers.length,
          loop: prop("loopFocus"),
          isDisabled: disabledAt(triggers),
        });
        const target = triggers[next];
        if (target === undefined || next === current) return;

        const followFocus = isFocusInList(scope);
        commitValue(params, target.dataset.value ?? null);
        if (followFocus) focusElementInView(params, target);
      },

      /**
       * The consumer owns the removal — `onClose` is the whole request. What the
       * machine owns is where the focus and the selection land afterwards: the next
       * tab, the previous one when there is no next (APG), and `null` when the tab
       * closed was the only one there was.
       */
      closeTab(params) {
        const { context, prop, scope, event } = params;
        if (event.type !== "TRIGGER.CLOSE") return;
        const triggers = getTriggerEls(scope);
        const index = triggers.findIndex((trigger) => trigger.dataset.value === event.value);
        if (index === -1) return;

        const wasSelected = context.get("value") === event.value;
        // Whether the focus is on the tab being closed — its trigger or its close
        // button, and both carry the value. Read before `onClose`, because the
        // consumer removes the tab from inside it. A middle click on a background
        // tab must not pull the focus into the bar, and in `automatic` mode that
        // focus would drag the selection along with it.
        const active = scope.getActiveElement();
        const hadFocus =
          active !== null && isFocusInList(scope) && active.dataset.value === event.value;
        prop("onClose")?.({ value: event.value });

        const target =
          triggers[
            getRemovalIndex(index, { count: triggers.length, isDisabled: disabledAt(triggers) })
          ];
        if (target === undefined) {
          if (wasSelected) commitValue(params, null);
          return;
        }
        if (hadFocus) {
          focusElement(target);
          params.refs.set("reveal", { target, count: triggers.length });
        }
        if (wasSelected) commitValue(params, target.dataset.value ?? null);
      },

      /**
       * The successor of a closed tab is revealed once the list has actually lost a
       * tab, which the observer reports whenever the consumer's removal commits:
       * inside its handler, after a timer or in a transition. Before that the tabs
       * after the closed one are still where they were, and a reveal would place
       * the focus for a layout that is about to change. Only if the successor still
       * has the focus: a person who moved on does not get scrolled back.
       */
      revealClosedSuccessor({ prop, refs, scope }) {
        const pending = refs.get("reveal");
        if (pending === null || getTriggerEls(scope).length >= pending.count) return;
        refs.set("reveal", null);
        if (prop("orientation") === "vertical" || scope.getActiveElement() !== pending.target) {
          return;
        }
        scrollIntoInlineView(getListEl(scope), pending.target);
      },

      /**
       * The DOM order is the tab order, and the selected tab is the single tab
       * stop, so the index has to be a fact about the DOM rather than about the
       * value. Re-settling `value` here is what gives a consumer the APG invariant
       * — a tab list always has one selected tab — without having to pass a
       * `defaultValue`, and what rescues a value left dangling by a removed tab.
       */
      syncTriggers(params) {
        const { context, refs, scope } = params;
        const value = context.get("value");
        // Every value the list has actually held, recorded here and not only in
        // `commitValue`: a controlled consumer moves the value from outside, and
        // `lazyMount` promises a panel that has been shown once stays built.
        if (value !== null) refs.get("visited").add(value);

        // No root yet — a server render, or the first client render before the
        // mount effect. "I cannot see the tabs" is not "there are no tabs", and
        // settling on that would report a change to a controlled consumer before
        // the component exists at all.
        if (getRootEl(scope) === null) return;

        const triggers = getTriggerEls(scope);
        const values = triggers.map((trigger) => trigger.dataset.value ?? "");
        const isDisabled = disabledAt(triggers);
        context.set("itemCount", values.length);

        let index = value === null ? -1 : values.indexOf(value);
        // Disabled counts as unselectable, not merely as un-clickable: the tab stop
        // rides on the selection, and parked on a disabled button the composite's
        // only `tabindex="0"` is skipped and the whole list leaves the tab order.
        if (index === -1 || isDisabled(index)) {
          const fallback = getInitialIndex({ count: values.length, isDisabled });
          // Nothing selectable at all. An empty list drops the value; a list that
          // is merely disabled keeps it — clearing there would erase the
          // consumer's state and report a change nobody made, and a disabled list
          // has no tab stop to rescue anyway.
          if (fallback !== -1 || values.length === 0) {
            index = fallback;
            commitValue(params, values[fallback] ?? null, false);
          }
        }
        context.set("activeIndex", index);
        // The single tab stop, published as a value rather than derived from the
        // selection in `connect`. A controlled consumer may hold `value` at `null`
        // — the types call that a value, not an absence — and `syncTriggers` is
        // right not to re-settle it for them; but a stop that rode on the selection
        // then left *every* trigger at `tabindex="-1"`, and the whole list fell out
        // of the tab order. It falls back to the tab this settle would have chosen.
        context.set(
          "tabbableValue",
          index !== -1 && !isDisabled(index) ? (values[index] ?? null) : null,
        );
      },

      syncIndicator({ context, prop, scope, event }) {
        if (event.type === "INDICATOR.MEASURE") context.set("indicatorAnimated", event.animated);

        const list = getListEl(scope);
        const value = context.get("value");
        const trigger = value === null ? null : getTriggerEl(scope, value);
        if (list === null || trigger === null) {
          context.set("indicatorOffset", null);
          context.set("indicatorSize", null);
          return;
        }

        const metrics = getIndicatorMetrics(
          list.getBoundingClientRect(),
          trigger.getBoundingClientRect(),
          list,
          // From the list, which is where the measured geometry lives: with no
          // `dir` prop the sign of the offset follows whatever the page resolved
          // around the tablist.
          { orientation: prop("orientation"), dir: resolveDir(prop("dir"), list) },
        );
        context.set("indicatorOffset", metrics.offset);
        context.set("indicatorSize", metrics.size);
      },

      /**
       * Measured, never assumed. A panel of plain text is unreachable by keyboard
       * unless it takes a tab stop of its own; a panel holding a link or a field
       * that took one would put an empty stop in front of them.
       */
      syncContentTabbable({ context, scope }) {
        const value = context.get("value");
        const content = value === null ? null : getContentEl(scope, value);
        context.set("contentTabbable", content !== null && getTabbables(content).length === 0);
      },

      scrollActiveIntoView({ context, prop, scope }) {
        if (!prop("scrollActiveIntoView")) return;
        const list = getListEl(scope);
        const value = context.get("value");
        const trigger = value === null ? null : getTriggerEl(scope, value);
        if (list === null || trigger === null) return;

        const overflows =
          prop("orientation") === "vertical"
            ? list.scrollHeight > list.clientHeight
            : list.scrollWidth > list.clientWidth;
        if (!overflows) return;

        trigger.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          // The same resolution order as the styles layer: attributes first, media
          // query second, so an app pinned to `data-motion="reduced"` is obeyed.
          behavior: resolveEnvironment(list).reducedMotion ? "auto" : "smooth",
        });
      },
    },

    effects: {
      // No listener: the source is read once, when the focus lands. Holding the
      // handle is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackTriggers({ scope, send }) {
        send({ type: "TRIGGERS.SYNC" });
        // Tabs appear and disappear with the app's own state; the indicator has to
        // survive that without the consumer telling anyone.
        return observeChildren(getListEl(scope), () => send({ type: "TRIGGERS.SYNC" }));
      },

      /**
       * `animated: false` throughout: a pill must not play a spring because the
       * window moved or a font finished loading.
       */
      trackIndicator({ scope, send }) {
        let disposed = false;
        const measure = (): void => {
          if (!disposed) send({ type: "INDICATOR.MEASURE", animated: false });
        };

        const list = getListEl(scope);
        const stopList = observeResize(list, measure);

        /**
         * Every trigger, never "the selected one". `machine.effects` are installed
         * once by `start()` and are never re-armed on a context change, so an
         * observer aimed at the selection would stay aimed at whichever tab was
         * selected at mount — and at nothing at all for a list that starts without
         * one, which is every list with no `defaultValue`. The list's own box does
         * not answer for a child that grew inside it once the list is a fixed-size
         * scroller, and that is exactly the `tab-bar` presentation this sheet is
         * being built for.
         */
        const observeTriggers = (): VoidFunction => {
          const stops = getTriggerEls(scope).map((trigger) => observeResize(trigger, measure));
          return (): void => {
            for (const stop of stops) stop();
          };
        };

        let stopTriggers = observeTriggers();
        // Re-armed rather than re-measured: the measurement on a child mutation is
        // already `trackTriggers`' job, and doing it twice would spring the pill
        // for one layout change.
        const stopChildren = observeChildren(list, () => {
          stopTriggers();
          stopTriggers = observeTriggers();
        });

        // A one-shot, and the flag is why the disposer sets one at all: the promise
        // outlives the effect, and a measurement after teardown is a `send` into a
        // stopped service.
        const { fonts } = scope.getDoc();
        void fonts?.ready.then(measure);

        return () => {
          disposed = true;
          stopChildren();
          stopTriggers();
          stopList();
        };
      },

      /**
       * A list wider than the room it is given scrolls along its inline axis, and
       * a hidden scrollbar says nothing about it: the sheet fades the edge this
       * attribute names. Written on the list, which is the scroller.
       */
      trackScrollEdges({ prop, scope, send }) {
        return trackInlineScrollEdges(getListEl(scope), {
          active: () => prop("orientation") !== "vertical" && !prop("disabled"),
          attributes: ["data-disabled"],
          onToggle: () => send({ type: "INDICATOR.MEASURE", animated: false }),
        });
      },

      /**
       * The drawn bar of that scroller, a sibling a composed layer or a parts tree
       * places after the list; without one there is nothing to bind.
       */
      trackScrollbar({ scope }) {
        return trackInlineScrollbar(getListEl(scope), getScrollbarEl(scope), getThumbEl(scope));
      },

      /**
       * Neither `trapped` nor `base`. `tabNext`/`tabPrev` escape a trap by design
       * (`TRAP_ESCAPES`), so a `tabs` inside a dialog stays drivable from a pad —
       * which is the point. `back` is deliberately not claimed: a tab list is not a
       * layer, and one that swallowed B would make a dialog containing tabs
       * impossible to leave.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        if (host === null || host === undefined) return;
        return host.pushScope(
          (event) => {
            if (event.intent !== "tabNext" && event.intent !== "tabPrev") return false;
            // A nested `tabs` wins, whatever order the two mounted in — the tree
            // decides, not the scope stack. See `ownsFocus`.
            if (prop("disabled") || !ownsFocus(scope)) return false;
            send({ type: event.intent === "tabNext" ? "LIST.NEXT" : "LIST.PREV" });
            return true;
          },
          { within: () => getRootEl(scope) },
        );
      },
    },
  },
});
