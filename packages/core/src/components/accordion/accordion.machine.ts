/**
 * An accordion has no lifecycle of its own — one state, everything on the root
 * `on:`, the shape `tabs` and `toggle-group` already have. The lives that do exist
 * are per panel, and they live in `exitingValues` plus a map of `Collapse`.
 *
 * **The choreography has one entrance.** `syncCollapses` is the only place a panel
 * is told to open or close, and it is driven by a `watch` on the value rather than
 * by the actions that write it — so a controlled consumer moving the value from
 * outside gets the same measurement, the same animation and the same deferred
 * `hidden` as a click does. Nothing else has to know a panel is animating.
 *
 * **A panel that is leaving is marked before the value moves.** `hidden` is what
 * hides a closed panel, and `hidden` is `display: none` (`_utilities.scss`), which
 * both cancels an animation and makes `scrollHeight` read 0. If the commit that
 * closed a panel were allowed to render `hidden`, the watch that follows it would
 * measure a collapsed box and animate 0 → 0 — an exit that exists in the machine
 * and never on the screen. So `commitValue` puts the closing values in
 * `exitingValues` in the same batch, and `syncCollapses` takes them out again when
 * the presence says the animation is really over. The one path that cannot be
 * covered this way is a controlled value arriving as a prop: the render happens
 * before any machine code runs, so that first render carries `hidden` for one
 * pre-paint commit before the watch removes it again.
 *
 * **No roving tabindex.** APG makes every accordion header a tab stop, unlike a
 * tab list; the arrows move the focus and the tab order is the DOM's.
 */

import { contains, getEventTarget } from "../../dom/query";
import { restoreFocus } from "../../focus/restore-focus";
import { getNextIndex } from "../../focus/roving-focus";
import { type Collapse, createCollapse } from "../../interaction/collapse";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement, getInputModality, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import {
  getContentEl,
  getOwnContentEl,
  getRootEl,
  getTriggerEl,
  getTriggerEls,
} from "./accordion.dom";
import type { AccordionSchema } from "./accordion.types";

type Params = MachineParams<AccordionSchema>;

function disabledAt(triggers: readonly HTMLElement[]): (index: number) => boolean {
  return (index: number): boolean => triggers[index]?.hasAttribute("disabled") === true;
}

/**
 * Order is not meaning: an accordion that reported a change because the same
 * values arrived in another order would loop against a consumer that normalises
 * them (checkbox-group.machine.ts:53, the same two lines).
 */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}

/**
 * The `Collapse` for one value, created on first use. The closure is what makes
 * the exit self-reporting: when the presence says the panel may go, the value
 * leaves `exitingValues` and the next render writes `hidden`.
 *
 * `params` is the interpreter's single, stable parameter object — `event` is a
 * getter on it — so holding it in this closure holds no stale state.
 */
function collapseFor(params: Params, value: string): Collapse {
  const collapses = params.refs.get("collapses");
  const existing = collapses.get(value);
  if (existing !== undefined) return existing;

  const created = createCollapse({
    onExitComplete: (): void => {
      params.context.set("exitingValues", (previous) =>
        previous.filter((entry) => entry !== value),
      );
    },
  });
  collapses.set(value, created);
  return created;
}

/**
 * The mount state: whatever is open was open before anybody looked, so it gets a
 * presence that already says "present" and a measured height, but no animation.
 *
 * Priming the presence is not optional. A `Collapse` that has never been opened
 * declines to close — `createPresence` answers nothing when it was never present
 * — and the value would sit in `exitingValues` for the rest of the session with
 * the panel never taking `hidden`.
 */
function seed(params: Params): void {
  const { context, refs, scope } = params;
  const open = context.get("value");
  for (const value of open) collapseFor(params, value).setOpen(true, getContentEl(scope, value));
  refs.set("prevOpen", new Set(open));
}

/**
 * The one place `value` is written. See the header: the panels this commit closes
 * are marked as leaving *before* the value moves, so the render that closes them
 * still finds them present and the watch that follows still finds them measurable.
 */
function commitValue(params: Params, next: readonly string[]): void {
  const { context, refs } = params;
  const closing = context.get("value").filter((entry) => !next.includes(entry));
  if (closing.length > 0) {
    const immediate = refs.get("immediateValues");
    // Whatever revealed a panel, it animates on the way out: a panel leaving is
    // always something somebody asked for.
    for (const entry of closing) immediate.delete(entry);
    context.set("exitingValues", (previous) => [
      ...previous,
      ...closing.filter((entry) => !previous.includes(entry)),
    ]);
  }
  context.set("value", next);
}

export const machine: Machine<AccordionSchema> = createMachine<AccordionSchema>({
  props({ props }) {
    return {
      multiple: false,
      deselectable: true,
      disabled: false,
      loopFocus: true,
      hiddenUntilFound: false,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<readonly string[]>(() => ({
        defaultValue: prop("defaultValue") ?? [],
        value: prop("value"),
        isEqual: sameMembers,
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "accordion value",
      })),
      exitingValues: bindable<readonly string[]>(() => ({
        defaultValue: [],
        isEqual: sameMembers,
      })),
      focusedValue: bindable<string | null>(() => ({
        defaultValue: null,
        onChange: (value) => prop("onFocusChange")?.({ value }),
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  refs({ context }) {
    return {
      collapses: new Map<string, Collapse>(),
      prevOpen: null,
      // Whatever is open before the component has been looked at once. This runs
      // during `createService`, so the very first `connect` already carries
      // `data-immediate` — a panel a `defaultValue` opened must not expand from
      // zero on every page load.
      immediateValues: new Set<string>(context.get("value")),
    };
  },

  computed: {
    interactive: ({ prop }) => !prop("disabled"),
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackCollapses", "trackBeforematch"],

  watch({ context, track, action }) {
    // The array itself, not a serialisation of it. A bindable only writes when
    // `sameMembers` says the members really moved, so identity *is* the change on
    // the uncontrolled path; a controlled consumer handing down a fresh array per
    // render costs one idempotent pass through `syncCollapses`, which writes
    // nothing when `prevOpen` already equals `open`. Joining the values would buy
    // nothing over that and would need a separator no value can contain.
    track(
      () => [context.get("value")],
      () => action(["syncCollapses"]),
    );
  },

  on: {
    "TRIGGER.TOGGLE": { guard: "isInteractive", actions: ["toggleValue"] },
    "TRIGGER.FOCUS": { actions: ["setFocusedValue"] },
    "TRIGGER.BLUR": { actions: ["clearFocus"] },
    "TRIGGER.NAVIGATE": { guard: "isInteractive", actions: ["navigate"] },
    "VALUE.SET": { actions: ["setValue"] },
    "CONTENT.BEFOREMATCH": { guard: "isInteractive", actions: ["openOnMatch"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
    },

    actions: {
      toggleValue(params) {
        const { context, prop, refs, event } = params;
        if (event.type !== "TRIGGER.TOGGLE") return;
        const current = context.get("value");
        const open = current.includes(event.value);

        let next: readonly string[];
        if (prop("multiple")) {
          next = open
            ? current.filter((entry) => entry !== event.value)
            : [...current, event.value];
        } else if (!open) {
          next = [event.value];
        } else {
          // Single and not deselectable: APG's "one panel is always open"
          // presentation. Radix makes this the default; here it is the opt-in,
          // because the `<details>` this component replaces close freely.
          if (!prop("deselectable")) return;
          next = [];
        }

        // A press is a choice, so the panel animates from here on however it was
        // revealed the last time.
        refs.get("immediateValues").delete(event.value);
        commitValue(params, next);
      },

      setValue(params) {
        const { refs, event } = params;
        if (event.type !== "VALUE.SET") return;
        // The whole array is being replaced by something that asked for it.
        refs.get("immediateValues").clear();
        commitValue(params, event.value);
      },

      setFocusedValue({ context, event, scope }) {
        if (event.type !== "TRIGGER.FOCUS") return;
        context.set("focusedValue", event.value);
        // Read here and held: an arrow key moving between headers is a new focus,
        // so the source follows a keyboard user down the list, while a mouse
        // merely crossing the page never touches it.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocus({ context }) {
        context.set("focusedValue", null);
        context.set("focusSource", null);
      },

      /**
       * Moves the focus and nothing else — no roving stop to update, because an
       * accordion has none. The trigger list is read from the DOM and filtered to
       * this root, so a nested accordion's headers are somebody else's.
       */
      navigate({ prop, scope, event }) {
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
        focusElement(target);
      },

      /**
       * Find-in-page has already removed `hidden` and is scrolling to the text.
       * The machine's job is to agree with the browser — open the panel — and to
       * make sure the stylesheet does not play a 350ms expansion under a scroll
       * the user did not ask for, which is what `immediateValues` buys.
       */
      openOnMatch(params) {
        const { context, prop, refs, scope, event } = params;
        if (event.type !== "CONTENT.BEFOREMATCH") return;
        if (getTriggerEl(scope, event.value)?.hasAttribute("disabled") === true) return;

        const current = context.get("value");
        if (current.includes(event.value)) return;

        refs.get("immediateValues").add(event.value);
        commitValue(params, prop("multiple") ? [...current, event.value] : [event.value]);
      },

      /**
       * Open and close every panel the value moved, and take the ones whose exit
       * has already finished back out of `exitingValues`.
       *
       * The writes happen *before* the `setOpen` calls, and that order is load
       * bearing: a presence with nothing to wait on — no window, reduced motion
       * set to `none`, a panel with no animation — completes synchronously inside
       * `setOpen`, and a commit made afterwards would write the value it had just
       * been told to drop straight back in.
       */
      syncCollapses(params) {
        const { context, refs, scope } = params;
        const previous = refs.get("prevOpen");
        if (previous === null) {
          seed(params);
          return;
        }

        const open = new Set(context.get("value"));
        const exiting = new Set(context.get("exitingValues"));
        // A panel that re-opened mid-exit is not leaving any more, and one a
        // controlled consumer refused to close never was.
        for (const value of open) exiting.delete(value);
        const closing: string[] = [];
        for (const value of previous) {
          if (open.has(value)) continue;
          exiting.add(value);
          closing.push(value);
        }
        const opening = [...open].filter((value) => !previous.has(value));

        context.set("exitingValues", [...exiting]);
        refs.set("prevOpen", open);

        for (const value of closing) {
          const content = getContentEl(scope, value);
          // A focus left inside a panel that is closing would fall to `body` once
          // it is `hidden`; it goes back to the panel's header instead, or to its
          // neighbour when the header was disabled while open (R61).
          if (contains(content, scope.getActiveElement())) {
            restoreFocus(getTriggerEl(scope, value), content);
          }
          collapseFor(params, value).setOpen(false, content);
        }
        for (const value of opening) {
          collapseFor(params, value).setOpen(true, getContentEl(scope, value));
        }
      },
    },

    effects: {
      // No listener: the source is read once, when the focus lands. Holding the
      // handle is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackCollapses(params) {
        seed(params);

        return (): void => {
          const collapses = params.refs.get("collapses");
          for (const collapse of collapses.values()) collapse.destroy();
          collapses.clear();
          // A restart re-seeds rather than treating the state it woke up in as a
          // change — StrictMode mounts, unmounts and mounts again.
          params.refs.set("prevOpen", null);
        };
      },

      /**
       * One delegated listener, in capture, and it is installed whatever
       * `hiddenUntilFound` says. `beforematch` only fires on an element that
       * really carries `hidden="until-found"`, so an accordion that never asks for
       * one never hears from it — and installing unconditionally is what keeps a
       * consumer who flips the prop at runtime from needing the effects re-armed,
       * which `machine.effects` never does.
       *
       * Capture rather than bubble because capture reaches an ancestor for every
       * event, bubbling or not, and delegation rather than one listener per panel
       * because panels come and go with the app's own state.
       */
      trackBeforematch({ scope, send }) {
        const root = getRootEl(scope);
        if (root === null) return;

        const onBeforeMatch = (event: Event): void => {
          const content = getOwnContentEl(scope, getEventTarget<HTMLElement>(event));
          const value = content?.dataset.value;
          if (value === undefined) return;
          send({ type: "CONTENT.BEFOREMATCH", value });
        };

        root.addEventListener("beforematch", onBeforeMatch, true);
        return (): void => root.removeEventListener("beforematch", onBeforeMatch, true);
      },
    },
  },
});
