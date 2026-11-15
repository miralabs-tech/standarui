/**
 * A tooltip is a popover the user never asked for, and every difference follows
 * from that one sentence.
 *
 * It is not opened by a click but by lingering, so the machine has a third state:
 * `opening` is the delay, where the pointer is on the trigger and nothing is
 * mounted yet. It is left by leaving, pressing, or the delay elapsing — and the
 * length of that delay is not this machine's to decide alone, because "has the
 * user already seen one of these" is a question about the whole page
 * (`tooltip.store.ts`).
 *
 * **It never takes focus, and nothing inside it is reachable.** `role="tooltip"`
 * has no interactive contents by definition, and the stylesheet gives the
 * surface `pointer-events: none` where the popover turns them back on — so there
 * is no hover to keep alive, no focus to trap, no tab to proxy, and no scrim.
 * What the popover spends two thirds of its machine on does not exist here.
 *
 * **Two openings, two rules.** A pointer opens it after a delay and only when it
 * is a real pointer — a touch `pointerenter` fires on tap, where there is no
 * hover to express intent, and opening there would hide the content behind a
 * gesture nothing advertises. A focus opens it immediately, but only under a
 * modality that warrants a ring: keyboard, or gamepad. That second rule is what
 * makes the tooltip reappear under a d-pad, where it stops being a nicety and
 * becomes the only label some controls have (research/components.md §166) — and
 * it is why the check is `isFocusVisible` rather than `:focus-visible`, which a
 * programmatic focus also matches on all three engines.
 */

import { addDomEvent } from "../../dom/event";
import { timeout } from "../../dom/raf";
import { resolveDir } from "../../dom/text-dir";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack, isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { trackLongPress } from "../../interaction/long-press";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { isFocusVisible, trackInputModality } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { Direction } from "../../types";
import { getContentEl, getContentId, getPositionerEl, getTriggerEl } from "./tooltip.dom";
import { hideTooltip, isTooltipWarm, showTooltip } from "./tooltip.store";
import type { TooltipSchema } from "./tooltip.types";

export const machine: Machine<TooltipSchema> = createMachine<TooltipSchema>({
  props({ props }) {
    return {
      defaultOpen: false,
      // motion.md §2.4. The long delay is the one that keeps a tooltip from
      // appearing under a pointer that is only passing through; the short one is
      // what the same pointer gets once it has demonstrably stopped to read.
      openDelay: 700,
      warmDelay: 300,
      // How long that concession outlives the surface. The annexe fixes the two
      // delays and not this, so it is a decision: long enough to cross a toolbar,
      // short enough that a tooltip read a minute ago grants nothing.
      warmDuration: 300,
      placement: "top",
      // Air, and all of it: with no arrow there is no depth to add on top, which
      // is why a tooltip sits visibly closer to its control than a popover does.
      gap: 8,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      strategy: "fixed",
      closeOnEscape: true,
      closeOnScroll: true,
      longPress: false,
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "tooltip open",
      })),
      // Seeded from the prop rather than from a constant: the server renders
      // `data-side` from this, and the first paint has to agree with the markup.
      currentPlacement: bindable(() => ({ defaultValue: prop("placement") })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
    };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackModality", "trackTouchGesture"],

  watch({ context, track, send }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
  },

  on: {
    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
  },

  states: {
    closed: {
      on: {
        "TRIGGER.POINTER_ENTER": { guard: "canHover", target: "opening" },
        "TRIGGER.FOCUS": { guard: "canFocus", actions: ["openTooltip"] },
        "TRIGGER.LONG_PRESS": { actions: ["openTooltip"] },
      },
    },

    // The delay, and nothing else: no surface is mounted, `open` is still false,
    // and every way out of it is a way of saying the linger did not happen.
    opening: {
      effects: ["waitOpenDelay"],
      on: {
        "DELAY.ELAPSED": { actions: ["openTooltip"] },
        "TRIGGER.FOCUS": { guard: "canFocus", actions: ["openTooltip"] },
        "TRIGGER.POINTER_LEAVE": { target: "closed" },
        "TRIGGER.POINTER_DOWN": { target: "closed" },
        "TRIGGER.BLUR": { target: "closed" },
      },
    },

    open: {
      // `holdVisibleSlot` last, and the order is a contract the interpreter
      // enforces by tearing down in reverse: the surface is placed and its layer
      // is registered before this tooltip claims the page's single slot and
      // closes whichever one held it, and the slot is released before any of
      // that comes back down.
      effects: [
        "trackSurfaceDir",
        "trackAnchorPosition",
        "trackDismissable",
        "dismissOnScroll",
        "captureIntents",
        "holdVisibleSlot",
      ],
      on: {
        "TRIGGER.POINTER_LEAVE": { actions: ["closeTooltip"] },
        "TRIGGER.POINTER_DOWN": { actions: ["closeTooltip"] },
        "TRIGGER.BLUR": { actions: ["closeTooltip"] },
        "CONTENT.SCROLL": { actions: ["closeTooltip"] },
        "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closeTooltip"] },
      },
    },
  },

  implementations: {
    guards: {
      isOpen: ({ context }) => context.get("open"),

      /**
       * A touch `pointerenter` arrives on tap, not on hover, and taking it would
       * open a tooltip the user cannot dismiss by moving away. Read off the event
       * rather than off the density: `pointerType` is the exact question, where
       * "is this a touch layout" is only a correlate of it.
       */
      canHover({ prop, event }) {
        if (prop("disabled") || event.type !== "TRIGGER.POINTER_ENTER") return false;
        return event.pointerType !== "touch";
      },

      canFocus: ({ prop, scope }) => !prop("disabled") && isFocusVisible(scope.getDoc()),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        return isEscapeLikeDismissal(event.reason) ? prop("closeOnEscape") : true;
      },
    },

    actions: {
      openTooltip({ context }) {
        context.set("open", true);
      },

      closeTooltip({ context }) {
        context.set("open", false);
      },

      setOpen({ context, event }) {
        if (event.type === "OPEN.SET") context.set("open", event.open);
      },

      invokeOnDismiss({ prop, event }) {
        if (event.type === "CONTENT.DISMISS") prop("onDismiss")?.({ reason: event.reason });
      },

      syncPlacement({ context, event }) {
        if (event.type === "POSITION.SYNC") context.set("currentPlacement", event.placement);
      },
    },

    effects: {
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      /**
       * The surface is the one part that emits a `dir` nobody asked for,
       * and the portal is the whole reason. The adapter mounts it into
       * `document.body` (react/src/portal.tsx), outside whatever RTL region the
       * trigger sits in, and inheritance does not cross a portal — so the
       * direction has to be carried over explicitly. What was removed everywhere is the
       * ltr DEFAULT, not the attribute: a part still emits `dir` when the consumer
       * passes one. The default was the bug — emitting a direction nobody asked
       * for *overrode* the inheritance that already worked.
       *
       * Read from the anchor, never from the surface: the surface is in the body
       * and would only report the document's own direction back to itself. And in
       * an effect rather than in `connect`, so the server emits nothing and the
       * first client render has nothing to disagree with.
       */
      trackSurfaceDir({ prop, context, scope }) {
        context.set("surfaceDir", resolveDir(prop("dir"), getTriggerEl(scope)));
      },

      /**
       * Installed only where it was asked for, unlike `isDisabled` below which is
       * read live: five pointer listeners on every tooltip on the page is not a
       * price to pay for a prop that no consumer flips at runtime.
       */
      trackTouchGesture({ prop, scope, send }) {
        if (!prop("longPress")) return;
        return trackLongPress(getTriggerEl(scope), {
          isDisabled: () => prop("disabled"),
          onLongPress: () => send({ type: "TRIGGER.LONG_PRESS" }),
        });
      },

      /**
       * Always through a timer, even at zero. Sending synchronously from an
       * effect installer would transition out of `opening` while the interpreter
       * is still collecting this state's teardowns, and the cleanup it files
       * afterwards would belong to a state nothing is in any more.
       *
       * The clock comes off the trigger rather than off `scope.getWin()`, which
       * throws where there is no document: a machine driven with no page has no
       * tooltip to show, and that is a silence rather than a crash.
       */
      waitOpenDelay({ prop, scope, send }) {
        const doc = getTriggerEl(scope)?.ownerDocument;
        const win = doc?.defaultView;
        if (doc === undefined || win === null || win === undefined) return;
        const delay = isTooltipWarm(doc) ? prop("warmDelay") : prop("openDelay");
        return timeout(win, () => send({ type: "DELAY.ELAPSED" }), Math.max(0, delay));
      },

      trackAnchorPosition({ prop, scope, send }) {
        const positioner = getPositionerEl(scope);
        if (positioner === null) return;
        return trackPosition(getTriggerEl(scope), positioner, {
          placement: prop("placement"),
          gap: prop("gap"),
          offset: prop("offset"),
          flip: prop("flip"),
          shift: prop("shift"),
          padding: prop("padding"),
          // From the trigger, not from the surface: the surface is portalled into
          // `document.body` and would report the document direction, while the
          // alignment belongs to the region the trigger sits in.
          dir: resolveDir(prop("dir"), getTriggerEl(scope)),
          strategy: prop("strategy"),
          boundary: prop("boundary"),
          onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
        });
      },

      /**
       * A layer even though nothing in it can be clicked, and that is the point:
       * the Escape that closes the tooltip must not also close the popover it is
       * sitting in. `dismissOnFocusOutside` is off — a tooltip opened by focus is
       * closed by the trigger's own blur, which fires first and says more.
       */
      trackDismissable({ prop, scope, send }) {
        return trackDismissableLayer(getContentEl(scope), {
          id: getContentId(scope),
          type: "tooltip",
          modal: false,
          parentId: prop("parentId"),
          exclude: () => [getTriggerEl(scope)],
          dismissOnFocusOutside: false,
          onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
        });
      },

      /**
       * On the document and in capture, because the scroller is whatever the
       * pointer happens to be over — including an ancestor the surface is not in.
       * Not routed through `CONTENT.DISMISS`: a scroll is not one of the four
       * dismissal reasons, and widening that union to say so would make every
       * other layer in the library answer a question it never asks.
       */
      dismissOnScroll({ prop, scope, send }) {
        if (!prop("closeOnScroll")) return;
        const doc = getContentEl(scope)?.ownerDocument;
        return addDomEvent(doc, "scroll", () => send({ type: "CONTENT.SCROLL" }), {
          capture: true,
          passive: true,
        });
      },

      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        const content = getContentEl(scope);
        if (host === null || host === undefined || content === null) return;
        const id = getContentId(scope);
        const stack = getLayerStack(content.ownerDocument);
        return host.pushScope((event) => {
          if (event.intent !== "back") return false;
          if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
          send({ type: "CONTENT.DISMISS", reason: "back" });
          return true;
        });
      },

      /**
       * The page's single tooltip slot, taken for as long as this state lasts.
       * An effect rather than an entry/exit pair, so the claim and the release
       * are the same object and cannot drift apart — and so the whole thing is
       * skipped where there is no surface, which is what a server render is.
       */
      holdVisibleSlot({ prop, scope, send }) {
        const doc = getContentEl(scope)?.ownerDocument;
        if (doc === undefined) return;
        const id = getContentId(scope);
        showTooltip(doc, id, () => send({ type: "OPEN.SET", open: false }));
        return () => hideTooltip(doc, id, prop("warmDuration"));
      },
    },
  },
});
