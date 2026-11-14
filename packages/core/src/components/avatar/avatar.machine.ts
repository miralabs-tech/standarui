/**
 * Three states that *are* the loading status: `loading | loaded | error`. No
 * interaction, no focus, no overlay — what the machine earns its keep with is
 * everything an `onload` handler alone gets wrong: the image that was `complete`
 * before any handler attached (cache, hydration), the `src` that changes under
 * the same element, the image part that is never rendered at all, and a fallback
 * delay that must not re-flash on reload.
 *
 * `delayElapsed` is a latch. Once the fallback has been revealed it stays
 * eligible through every later reload — hiding a monogram the user has already
 * seen, only to flash it back, is the exact churn the delay exists to prevent.
 *
 * The status callback fires from explicit transition actions and never from the
 * initial state's entry, so mounting notifies nothing.
 */

import { observeAttributes, observeChildren } from "../../dom/observers";
import { nextTick, timeout } from "../../dom/raf";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getImageEl, getRootEl } from "./avatar.dom";
import type { AvatarSchema } from "./avatar.types";

export const machine: Machine<AvatarSchema> = createMachine<AvatarSchema>({
  props({ props }) {
    return {
      size: "md",
      fallbackDelay: 0,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      delayElapsed: bindable<boolean>(() => ({
        defaultValue: prop("fallbackDelay") <= 0,
        debugLabel: "avatar delayElapsed",
      })),
      // The image is presumed present until the DOM says otherwise; the first
      // PARTS.SYNC corrects it. Presuming absence would flash the fallback on
      // every mount that does render an image.
      hasImage: bindable<boolean>(() => ({
        defaultValue: true,
        debugLabel: "avatar hasImage",
      })),
    };
  },

  initialState() {
    return "loading";
  },

  effects: ["trackParts"],

  states: {
    loading: {
      effects: ["checkImageState", "waitFallbackDelay", "trackSrcChange"],
      on: {
        "IMAGE.LOAD": { target: "loaded", actions: ["notifyLoaded"] },
        "IMAGE.ERROR": { target: "error", actions: ["notifyError"] },
        // Re-enter to re-arm checkImageState/trackSrcChange against the new
        // src. `delayElapsed` is NOT reset — the latch, by decision.
        "IMAGE.SRC_CHANGE": { target: "loading", reenter: true },
        "DELAY.ELAPSED": { actions: ["revealFallback"] },
        "PARTS.SYNC": [
          { guard: "imageAppeared", target: "loading", reenter: true, actions: ["syncParts"] },
          { actions: ["syncParts"] },
        ],
      },
    },

    loaded: {
      effects: ["trackSrcChange"],
      on: {
        // A src swap that fails fires `error` on the same element.
        "IMAGE.ERROR": { target: "error", actions: ["notifyError"] },
        "IMAGE.SRC_CHANGE": { target: "loading", actions: ["notifyLoading"] },
        // IMAGE.LOAD is deliberately unhandled: a re-load while loaded (srcset
        // reflow) is a no-op.
        "PARTS.SYNC": [
          { guard: "imageAppeared", target: "loading", actions: ["syncParts", "notifyLoading"] },
          { actions: ["syncParts"] },
        ],
      },
    },

    error: {
      effects: ["trackSrcChange"],
      on: {
        // A late success: a consumer retry, or a React remount with the same
        // src already in cache.
        "IMAGE.LOAD": { target: "loaded", actions: ["notifyLoaded"] },
        "IMAGE.SRC_CHANGE": { target: "loading", actions: ["notifyLoading"] },
        "PARTS.SYNC": [
          { guard: "imageAppeared", target: "loading", actions: ["syncParts", "notifyLoading"] },
          { actions: ["syncParts"] },
        ],
      },
    },
  },

  implementations: {
    guards: {
      /**
       * Absent → present only. A removal targets nothing: `syncParts` records
       * it and `showFallback` follows from `!hasImage` without a transition.
       */
      imageAppeared({ context, scope }) {
        return !context.get("hasImage") && getImageEl(scope) !== null;
      },
    },

    actions: {
      revealFallback({ context }) {
        context.set("delayElapsed", true);
      },

      syncParts({ context, scope }) {
        context.set("hasImage", getImageEl(scope) !== null);
      },

      notifyLoading({ prop }) {
        prop("onStatusChange")?.({ status: "loading" });
      },

      notifyLoaded({ prop }) {
        prop("onStatusChange")?.({ status: "loaded" });
      },

      notifyError({ prop }) {
        prop("onStatusChange")?.({ status: "error" });
      },
    },

    effects: {
      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        return observeChildren(getRootEl(scope), () => send({ type: "PARTS.SYNC" }));
      },

      /**
       * The cache catcher: an image already `complete` before any handler
       * attached (SSR hydration, disk cache) will never fire `load` again, so
       * the state is read off the element itself.
       *
       * Read now, send through a microtask — never synchronously from the
       * installer. A synchronous send would transition out of `loading` while
       * the interpreter is still installing this state's remaining effects, and
       * the cleanups it files afterwards would belong to a state nothing is in
       * any more (the tooltip's `waitOpenDelay` documents the same rule). The
       * cancel is the cleanup, so a re-enter cannot double-send.
       */
      checkImageState({ scope, send }) {
        const img = getImageEl(scope);
        if (img === null || !img.complete) return;
        return nextTick(() => {
          if (img.naturalWidth > 0) send({ type: "IMAGE.LOAD" });
          // `complete` with an empty src is neither a load nor an error — the
          // fallback delay covers that gap.
          else if (img.currentSrc !== "" || img.src !== "") send({ type: "IMAGE.ERROR" });
        });
      },

      /**
       * The clock comes off the root element rather than off `scope.getWin()`,
       * which throws where there is no document: a machine driven with no page
       * has nothing to show, and that is a silence rather than a crash (the
       * tooltip's precedent).
       */
      waitFallbackDelay({ context, prop, scope, send }) {
        if (context.get("delayElapsed")) return;
        const win = getRootEl(scope)?.ownerDocument?.defaultView;
        if (win === null || win === undefined) return;
        return timeout(
          win,
          () => send({ type: "DELAY.ELAPSED" }),
          Math.max(0, prop("fallbackDelay")),
        );
      },

      /**
       * Covers attribute mutation on the same element (vanilla, a direct
       * consumer). NOOP while the image part is absent; re-arming goes through
       * `imageAppeared` + reenter. React's node replacement is covered
       * elsewhere: the load/error handlers travel with the prop getter and
       * re-attach to the new node on their own.
       */
      trackSrcChange({ scope, send }) {
        return observeAttributes(getImageEl(scope), ["src", "srcset"], () =>
          send({ type: "IMAGE.SRC_CHANGE" }),
        );
      },
    },
  },
});
