/**
 * The APG Disclosure primitive: a toggle plus one measurement.
 *
 * `open` is the single source of truth and the state is a projection of it —
 * the popover's two structural decisions, kept. The projection is what earns
 * this component a machine at all: the height measurement has to run when the
 * DOM already agrees with the value, and "an adapter updates the DOM BEFORE
 * playing its watch" (architecture.md) makes `watch → OPEN.SYNC → entry` the
 * one path where `content` is guaranteed to exist and to carry its new
 * `data-state` at the moment it is measured.
 *
 * `syncSize` writes `--sui-collapsible-height`/`--sui-collapsible-width`
 * straight onto the node rather than through a bindable — the same trade
 * `--sui-transform-origin` and `data-scroll` make: a measurement no state
 * depends on must not cost a transition, a notify and an adapter render. At
 * rest the content is `block-size: auto` (the variables feed only the
 * enter/exit keyframes), so growing content — streamed text, a nested
 * collapsible — follows on its own, which is also why there is deliberately no
 * ResizeObserver: an observer on a box whose `block-size` the sheet animates
 * would be a feedback loop, and the variables only need to be right at the two
 * boundaries, where `syncSize` is replayed every time.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { contains } from "../../dom/query";
import { restoreFocus } from "../../focus/restore-focus";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import { getContentEl, getTriggerEl } from "./collapsible.dom";
import type { CollapsibleSchema } from "./collapsible.types";

export const machine: Machine<CollapsibleSchema> = createMachine<CollapsibleSchema>({
  props({ props }) {
    return { defaultOpen: false, disabled: false, keepMounted: false, ...props };
  },

  context({ prop, bindable }) {
    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "collapsible open",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      animated: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackModality"],

  watch({ context, track, send }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
  },

  on: {
    "TRIGGER.CLICK": { guard: "isEnabled", actions: ["toggleOpen"] },
    // Deliberately unguarded: `disabled` disables the trigger, not the API.
    "OPEN.SET": { actions: ["setOpen"] },
    // `markAnimated` lives here and nowhere else: OPEN.SYNC only fires on a
    // *change* of `open` after `start()`, so the first render never lifts the
    // latch — a `defaultOpen` page load plays no entry animation.
    "OPEN.SYNC": [
      { guard: "isOpen", target: "open", actions: ["markAnimated"] },
      { target: "closed", actions: ["markAnimated"] },
    ],
    "TRIGGER.FOCUS": { actions: ["captureFocusSource"] },
    "TRIGGER.BLUR": { actions: ["clearFocusSource"] },
  },

  // `start()` plays the entry of the initial state, and the adapters start the
  // service after the DOM commit — a `defaultOpen` content is measured at
  // mount, on a node that exists.
  states: {
    open: { entry: ["syncSize"] },
    // The commit has already made the content inert or hidden, or (motion
    // `none`) scheduled its unmount; the focus inside it is still there to read.
    closed: { entry: ["returnFocus", "syncSize"] },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
      isOpen: ({ context }) => context.get("open"),
    },

    actions: {
      toggleOpen({ context }) {
        context.set("open", (open) => !open);
      },

      setOpen({ context, event }) {
        if (event.type === "OPEN.SET") context.set("open", event.open);
      },

      markAnimated({ context }) {
        context.set("animated", true);
      },

      captureFocusSource({ context, scope }) {
        // The default rather than a throw when no document exists — the same
        // answer `getInputModality` gives while nothing is tracking.
        context.set(
          "focusSource",
          scope.getRootNode() === null ? "pointer" : getInputModality(scope.getDoc()),
        );
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      // A focus left inside a content that is closing would fall to `body` when
      // it unmounts or hides; a focus anywhere else was put there by someone. A
      // trigger disabled while open takes nothing, so `restoreFocus` falls back
      // on its neighbour (R61).
      returnFocus({ scope }) {
        const content = getContentEl(scope);
        if (content === null || !contains(content, scope.getActiveElement())) return;
        restoreFocus(getTriggerEl(scope), content);
      },

      /**
       * The heart of the component. DOM in an action, through `scope`, is the
       * popover's own precedent (`captureFinalFocus`); no document, no node —
       * no-op, which is what a server render needs.
       */
      syncSize({ scope }) {
        const content = getContentEl(scope);
        // `hidden` is keepMounted-closed: `display: none`, a zero rect —
        // nothing to measure.
        if (content === null || content.hidden) return;
        const { style } = content;
        const animation = style.animationName;
        const transition = style.transitionDuration;
        // Suspend the motion to read the size at rest: entering `closed`, the
        // exit animation is already applied at t=0 and would freeze the
        // measurement on the previous variable.
        style.animationName = "none";
        style.transitionDuration = "0s";
        const rect = content.getBoundingClientRect();
        style.setProperty("--sui-collapsible-height", `${rect.height}px`);
        style.setProperty("--sui-collapsible-width", `${rect.width}px`);
        style.animationName = animation;
        style.transitionDuration = transition;
      },
    },

    effects: {
      // No listener: the source is read once, when the focus lands. Holding the
      // handle is the whole job — the tracker has to be running before the
      // first Tab. Guarded like the popover's, because the unit project starts
      // this service with no document in the room.
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },
    },
  },
});
