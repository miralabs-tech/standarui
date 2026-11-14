/**
 * The segmented control, and the sliding pill that is the design system's
 * signature. Two things are worth stating.
 *
 * **The item list is read from the DOM, never registered.** A composite that has
 * to be told about its own children goes out of sync the first time one is
 * rendered conditionally. Roving needs the order, the indicator needs the index,
 * and both come from `[data-part~="toggle-group:item"]` under the root — re-read when the value
 * changes and whenever the children do.
 *
 * **The pill is measured, in every sizing.** A column is as wide as the room and
 * the labels make it, and a group that scrolls along its line has a visible track
 * narrower than the whole one, so no index or percentage can name a segment. The
 * active item's layout box is read against the root, and the root, every item and
 * the web fonts are watched for the moment it moves.
 *
 * **Single and multiple are different ARIA patterns, not a flag on one.** Single
 * selection is a radio group, where arrows move *and* select; multiple is a group
 * of pressed buttons, where arrows only move and Space selects. The machine
 * implements both because APG says they are two patterns, and the presentation
 * happens to be identical.
 */

import { focusElement, getInputModality, trackInputModality } from "@standarx/nav";
import { observeChildren, observeResize } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { getInitialIndex, getNextIndex } from "../../focus/roving-focus";
import { trackInlineScrollbar } from "../../interaction/inline-scrollbar";
import { scrollIntoInlineView, trackInlineScrollEdges } from "../../interaction/scroll-edges";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import type { InputModality } from "../../types";
import { measureIndicator } from "../../utils/indicator-rect";
import {
  getItemEl,
  getItemEls,
  getItemValues,
  getRootEl,
  getScrollbarEl,
  getThumbEl,
  hasLabel,
} from "./toggle-group.dom";
import type { ToggleGroupSchema } from "./toggle-group.types";

/**
 * Where the pill belongs, read from layout against the root — the indicator's
 * own containing block, so the number the sheet consumes as an `inset` and the
 * number measured here cannot disagree. `null` when there is nothing to point at:
 * several things are selected, or none, or the item is not in the DOM.
 *
 * **Measured to a fraction of a pixel where the rects can be trusted**
 * (`measureIndicator`), and from the layout boxes, whole pixels, where they
 * cannot: a segment springs to `--sui-press-scale` while it is pressed, which is
 * exactly when the choice is measured, and a bounding rect would carry that scale
 * into the number. The sheet positions the root, so a segment's `offsetParent` is
 * the root; one that is not (hidden, or wrapped in a positioned element) has no
 * box to point at and measures `null`.
 */
function readIndicatorMetrics({
  context,
  prop,
  scope,
}: Pick<MachineParams<ToggleGroupSchema>, "context" | "prop" | "scope">): {
  offset: number | null;
  size: number | null;
} {
  const root = getRootEl(scope);
  const value = prop("multiple") ? undefined : context.get("value")[0];
  const item = value === undefined ? null : getItemEl(scope, value);
  if (root === null || item === null) return { offset: null, size: null };

  if (item.offsetParent !== root) return { offset: null, size: null };

  const vertical = prop("orientation") === "vertical";
  const rtl = resolveDir(prop("dir"), root) === "rtl";
  const measured = measureIndicator(root, item, scope.getComputedStyle, {
    orientation: vertical ? "vertical" : "horizontal",
    dir: rtl ? "rtl" : "ltr",
  });
  if (measured !== null) return measured;

  if (vertical) return { offset: item.offsetTop, size: item.offsetHeight };
  return {
    offset: rtl ? root.clientWidth - item.offsetLeft - item.offsetWidth : item.offsetLeft,
    size: item.offsetWidth,
  };
}

export const machine: Machine<ToggleGroupSchema> = createMachine<ToggleGroupSchema>({
  props({ props }) {
    return {
      orientation: "horizontal",
      multiple: false,
      disabled: false,
      // A radio group has no deselect, and single mode is a radio group (APG).
      // Multiple mode is a set of independent toggles, where clicking an on item
      // is the only way to turn it off.
      deselectable: props.multiple ?? false,
      loopFocus: true,
      sizing: "equal",
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<readonly string[]>(() => ({
        defaultValue: prop("defaultValue") ?? [],
        value: prop("value"),
        // Order is not meaning here: a segmented control that reports a change
        // because the same two values arrived the other way round would loop.
        isEqual: (a, b) => a.length === b.length && a.every((entry) => b.includes(entry)),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "toggle-group value",
      })),
      activeIndex: bindable<number>(() => ({ defaultValue: -1 })),
      itemCount: bindable<number>(() => ({ defaultValue: 0 })),
      tabbableValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusedValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
      // False until a sync proves the value moved rather than the track, which
      // makes the first paint a snap: `tabs` draws the same line with the same
      // default (`tabs.machine.ts`, `indicatorAnimated`).
      indicatorAnimated: bindable<boolean>(() => ({ defaultValue: false })),
      indicatorOffset: bindable<number | null>(() => ({ defaultValue: null })),
      indicatorSize: bindable<number | null>(() => ({ defaultValue: null })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackItems", "trackIndicator", "trackScrollEdges", "trackScrollbar"],

  watch({ context, prop, scope, track, action }) {
    // The item list is a dependency like any other. Reading it here means an
    // adapter that re-renders keeps the indicator in step synchronously, and the
    // observer below is left to cover the mutations no render caused.
    //
    // The separator is spelled out rather than typed: the raw byte used to sit
    // in this file, which made ripgrep call the whole module binary and skip it
    // — every grep in the repo, and every review agent built on one, has been
    // blind to this file. It stays U+0000 because that is the one character an
    // attribute value cannot carry (the HTML parser rewrites it to U+FFFD), so
    // two different item lists can never key the same.
    track(
      () => [context.get("value"), getItemValues(scope).join("\u0000"), hasLabel(scope)],
      () => action(["syncItems", "syncIndicator"]),
    );

    // A change of sizing, axis or direction is a layout the measured pill has to
    // be re-read for. It is a layout and never a choice: it lands where it
    // belongs rather than travelling.
    track(
      () => [prop("sizing"), prop("orientation"), prop("dir")],
      () => action(["settleIndicator", "syncIndicator"]),
    );
  },

  on: {
    "ITEM.CLICK": { guard: "isInteractive", actions: ["selectItem", "revealItem"] },
    "VALUE.SET": { actions: ["setValue"] },
    "ITEM.FOCUS": { actions: ["setFocusedValue"] },
    "ITEM.BLUR": { actions: ["clearFocus"] },
    "ITEM.NAVIGATE": { guard: "isInteractive", actions: ["navigate"] },
    "ITEMS.SYNC": { actions: ["syncItems", "remeasureIndicator"] },
    "INDICATOR.MEASURE": { actions: ["remeasureIndicator"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
    },

    actions: {
      selectItem({ context, prop, event }) {
        if (event.type !== "ITEM.CLICK") return;
        const current = context.get("value");
        const selected = current.includes(event.value);

        if (prop("multiple")) {
          context.set(
            "value",
            selected ? current.filter((entry) => entry !== event.value) : [...current, event.value],
          );
          return;
        }
        if (selected && !prop("deselectable")) return;
        context.set("value", selected ? [] : [event.value]);
      },

      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },

      setFocusedValue({ context, event, scope }) {
        if (event.type !== "ITEM.FOCUS") return;
        context.set("focusedValue", event.value);
        // Tab leaves and comes back to where the user was, not to the start.
        context.set("tabbableValue", event.value);
        // Read here and held: an arrow key moving between items is a new focus,
        // so the source follows a keyboard user across the composite, while a
        // mouse merely crossing the page never touches it.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocus({ context }) {
        context.set("focusedValue", null);
        context.set("focusSource", null);
      },

      /**
       * A segment chosen ends inside the window, as one the arrows reach does: a
       * click on a segment the edge cuts used to check it and leave it cut. On the
       * click and not on the focus, which a pointer brings at `pointerdown`: a
       * segment that moved before the button came up would take the release away
       * from the press. Not after an arrow either, whose `navigate` has already
       * scrolled to the same segment.
       */
      revealItem({ prop, scope, event }) {
        if (event.type !== "ITEM.CLICK" || event.origin === "navigate") return;
        if (prop("orientation") === "vertical") return;
        const item = getItemEl(scope, event.value);
        if (item !== null) scrollIntoInlineView(getRootEl(scope), item);
      },

      navigate({ context, prop, scope, event, send }) {
        if (event.type !== "ITEM.NAVIGATE") return;
        const items = getItemEls(scope);
        const current = items.findIndex((item) => item.dataset.value === event.value);
        const next = getNextIndex(current, event.action, {
          count: items.length,
          loop: prop("loopFocus"),
          isDisabled: (index) => items[index]?.hasAttribute("disabled") === true,
        });
        const target = items[next];
        if (target === undefined || next === current) return;

        focusElement(target);
        if (prop("orientation") !== "vertical") scrollIntoInlineView(getRootEl(scope), target);
        // Single selection follows the focus: in a radio group the arrow keys
        // choose, they do not merely visit (APG). In multiple mode they only
        // move, and Space is what selects.
        const value = target.dataset.value ?? "";
        context.set("tabbableValue", value);
        if (!prop("multiple")) send({ type: "ITEM.CLICK", value, origin: "navigate" });
      },

      // The index the indicator is gated by has to be a fact about the DOM rather
      // than about the value array (motion.md §2.9). The tab
      // stop is settled here too: without one the whole composite would be
      // unreachable by Tab until something had been selected.
      syncItems({ context, scope }) {
        const items = getItemEls(scope);
        const values = getItemValues(scope);
        const selected = context.get("value")[0];
        const labelled = hasLabel(scope);

        // This is the only place that can tell the two apart, which is why the
        // decision lives here and not in the actions that commit a value: if the
        // segment count or the label changed, what moved the pill is the track,
        // and a track that changes shape must not be chased across the control.
        // The first sync is always one of those — the count goes 0 -> n — so a
        // freshly painted group snaps into place instead of sliding in from
        // `--sui-segment-count: 1`, which puts it a full track-width off-screen.
        //
        // Both branches are conditional, and neither may become an `else`: this
        // action runs again whenever the observer reports and nothing has to have
        // changed for it to. A sync that moves nothing must leave the flag where
        // it was, or the second one of a mount would arm the very spring the
        // first one disarmed.
        const nextIndex = selected === undefined ? -1 : values.indexOf(selected);
        const trackChanged =
          values.length !== context.get("itemCount") || labelled !== context.get("hasLabel");
        if (trackChanged) context.set("indicatorAnimated", false);
        else if (nextIndex !== context.get("activeIndex")) {
          context.set("indicatorAnimated", true);
        }

        context.set("activeIndex", nextIndex);
        context.set("itemCount", values.length);
        context.set("hasLabel", labelled);

        // The composite exposes exactly one tab stop, and it has to be an item
        // the browser will actually stop on: parked on a disabled button, the
        // only `tabindex="0"` is skipped and the whole control falls out of the
        // tab order.
        const isDisabled = (index: number): boolean =>
          items[index]?.hasAttribute("disabled") === true;
        const enabled = (value: string | undefined): boolean => {
          const index = value === undefined ? -1 : values.indexOf(value);
          return index !== -1 && !isDisabled(index);
        };

        const tabbable = context.get("tabbableValue");
        if (enabled(tabbable ?? undefined)) return;
        const first = getInitialIndex({ count: items.length, isDisabled });
        context.set(
          "tabbableValue",
          enabled(selected) ? (selected ?? null) : (values[first] ?? null),
        );
      },

      /**
       * Run after `syncItems` has decided the latch from the index, so a choice
       * travels and a changed track snaps exactly as in `"equal"` sizing. The one
       * thing added is the empty state, in both directions: a pill arriving from
       * nowhere has no position to travel from and would slide in from
       * `inset-inline-start: 0`, and one leaving for nowhere would slide there and
       * shrink to nothing while it fades.
       */
      syncIndicator(params) {
        const { context } = params;
        const { offset, size } = readIndicatorMetrics(params);
        if (context.get("indicatorOffset") === null || offset === null) {
          context.set("indicatorAnimated", false);
        }
        context.set("indicatorOffset", offset);
        context.set("indicatorSize", size);
      },

      settleIndicator({ context }) {
        context.set("indicatorAnimated", false);
      },

      /**
       * The observers' own path, and the only one that compares instead of
       * consulting: a remeasure that finds the pill where it already was is not an
       * event, and lowering the latch on it would cancel the spring a choice had
       * just armed — `ResizeObserver` delivers the size it was armed with at the
       * first rendering opportunity, which lands after the first click a person
       * can make.
       */
      remeasureIndicator(params) {
        const { context } = params;
        const { offset, size } = readIndicatorMetrics(params);

        if (offset !== context.get("indicatorOffset") || size !== context.get("indicatorSize")) {
          context.set("indicatorAnimated", false);
        }
        context.set("indicatorOffset", offset);
        context.set("indicatorSize", size);
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackItems({ scope, send }) {
        send({ type: "ITEMS.SYNC" });
        // Items appear and disappear with the app's own state; the indicator has
        // to survive that without the consumer telling anyone.
        return observeChildren(getRootEl(scope), () => send({ type: "ITEMS.SYNC" }));
      },

      /**
       * A group wider than the room it is given scrolls along its inline axis, and
       * a hidden scrollbar says nothing about it: the sheet fades the edge this
       * attribute names. Written on the root, which is the scroller.
       */
      trackScrollEdges({ prop, scope, send }) {
        return trackInlineScrollEdges(getRootEl(scope), {
          active: () => prop("orientation") !== "vertical" && !prop("disabled"),
          attributes: ["data-disabled"],
          onToggle: () => send({ type: "INDICATOR.MEASURE" }),
        });
      },

      /**
       * The drawn bar of that scroller: a part outside it that a `Frame` places, so a
       * group without one simply has nothing to bind.
       */
      trackScrollbar({ scope }) {
        return trackInlineScrollbar(getRootEl(scope), getScrollbarEl(scope), getThumbEl(scope));
      },

      /**
       * The root and every item are observed, never "the active one" — a segment
       * is as wide as its label, and a label that changes inside a root of fixed
       * width moves the pill without the root's own box changing. A text node
       * edited in place is a `characterData` mutation, which `trackItems` does not
       * see either, and a web font arriving late changes every width at once.
       */
      trackIndicator({ scope, send }) {
        let disposed = false;
        const measure = (): void => {
          if (!disposed) send({ type: "INDICATOR.MEASURE" });
        };

        const root = getRootEl(scope);
        const stopRoot = observeResize(root, measure);
        const observeItems = (): VoidFunction => {
          const stops = getItemEls(scope).map((item) => observeResize(item, measure));
          return (): void => {
            for (const stop of stops) stop();
          };
        };

        let stopItems = observeItems();
        // Re-armed rather than re-measured: the measurement on a child mutation is
        // already `trackItems`' job.
        const stopChildren = observeChildren(root, () => {
          stopItems();
          stopItems = observeItems();
        });

        // A one-shot, and the flag is why the disposer sets one at all: the
        // promise outlives the effect, and a measurement after teardown is a
        // `send` into a stopped service.
        void scope.getDoc().fonts?.ready.then(measure);

        return () => {
          disposed = true;
          stopChildren();
          stopItems();
          stopRoot();
        };
      },
    },
  },
});
