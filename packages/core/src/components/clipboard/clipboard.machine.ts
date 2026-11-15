/**
 * Copy a value to the clipboard with visible feedback: idle → copying →
 * copied | error → idle on a timer. There is no APG "clipboard" pattern — the
 * trigger is a plain Button — but there is a machine, because there is a timer,
 * an async operation whose late resolution must be neutralisable, and a
 * screen-reader announcement tied to a transition.
 *
 * Three decisions this file must not lose:
 *
 * 1. `writeText` fires in the effect installed on *entering* `copying`. The
 *    service runs `runTransition` synchronously from the click handler and
 *    installs a state's effects on entry, so the call stays inside the task of
 *    the user gesture — which is what preserves the transient user activation
 *    the Clipboard API requires. Never defer it through a timer or a microtask.
 *
 * 2. A click during `copying` is absorbed. The machine-level `TRIGGER.CLICK`
 *    targets `copying`; from `copying` that is `target === value` without
 *    `reenter`, which the interpreter treats as a no-op — the in-flight write
 *    continues, and no second `writeText` fires. From `copied`/`error` the same
 *    click restarts a full cycle, re-announcement included.
 *
 * 3. `navigator.clipboard.writeText` is the only programmatic path — no
 *    `execCommand("copy")` fallback, it has been deprecated since 2020. Failure
 *    is a first-class state: no clipboard (insecure context) or a rejected
 *    promise both land in `error`, announce `copyFailedText` and call
 *    `onCopyError`. The *user* fallback is structural: the readonly input part
 *    selects itself on focus, so Ctrl/Cmd+C is one keystroke away.
 */

import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { timeout } from "../../dom/raf";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getInputModality, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import { getTriggerEl } from "./clipboard.dom";
import type { ClipboardSchema } from "./clipboard.types";

export const machine: Machine<ClipboardSchema> = createMachine<ClipboardSchema>({
  props({ props }) {
    return {
      disabled: false,
      // Long enough to read a checkmark, short enough that the control comes
      // back. A toast carries text and lasts longer; a glyph does not.
      copiedDuration: 2000,
      copiedText: "Copied to clipboard",
      copyFailedText: "Copy to clipboard failed",
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<string>(() => ({
        defaultValue: prop("defaultValue") ?? "",
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "clipboard value",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  // Pure and SSR-safe: the server always renders idle.
  initialState() {
    return "idle";
  },

  // For the whole life of the service, for the toggle's reason: the tracker has
  // to be running before the first Tab, or the very first focus reads wrong.
  effects: ["trackModality"],

  watch({ context, track, send }) {
    // The checkmark asserts "THIS value is in the clipboard"; a changed value
    // makes that feedback stale, and `copied`/`error` answer by leaving.
    track(
      () => [context.get("value")],
      () => send({ type: "VALUE.CHANGED" }),
    );
  },

  // Machine-level: activation is state-independent, like toggle — a click lands
  // the same way from idle, copied or error.
  on: {
    "TRIGGER.CLICK": { guard: "!isDisabled", target: "copying" },
    "COPY.REQUEST": { guard: "!isDisabled", target: "copying" },
    "VALUE.SET": { actions: ["setValue"] },
    "TRIGGER.FOCUS": { actions: ["captureFocusSource"] },
    "TRIGGER.BLUR": { actions: ["clearFocusSource"] },
  },

  states: {
    idle: {},

    copying: {
      effects: ["performCopy"],
      on: {
        "COPY.SUCCESS": { target: "copied" },
        "COPY.ERROR": { target: "error", actions: ["invokeOnCopyError"] },
      },
    },

    copied: {
      entry: ["announceCopied", "invokeCopiedTrue"],
      exit: ["invokeCopiedFalse"],
      effects: ["waitFeedbackReturn"],
      on: {
        "FEEDBACK.ELAPSED": { target: "idle" },
        "VALUE.CHANGED": { target: "idle" },
      },
    },

    error: {
      entry: ["announceCopyFailed"],
      effects: ["waitFeedbackReturn"],
      on: {
        "FEEDBACK.ELAPSED": { target: "idle" },
        "VALUE.CHANGED": { target: "idle" },
      },
    },
  },

  implementations: {
    guards: {
      isDisabled: ({ prop }) => prop("disabled"),
    },

    actions: {
      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },
      captureFocusSource({ context, scope }) {
        // A machine driven with no page has no modality to read — the node
        // harness sends TRIGGER.FOCUS after start, and silence beats a crash.
        if (scope.getRootNode() === null) return;
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
      // Through the shared announcer, never an `aria-live` on a part: a region
      // that appears with its content is announced by nobody, and doubling the
      // announcer's regions would make every message a phantom duplicate.
      announceCopied({ prop, scope }) {
        if (scope.getRootNode() === null) return;
        getLiveAnnouncer(scope.getDoc()).announce(prop("copiedText"), "polite");
      },
      announceCopyFailed({ prop, scope }) {
        if (scope.getRootNode() === null) return;
        getLiveAnnouncer(scope.getDoc()).announce(prop("copyFailedText"), "polite");
      },
      invokeCopiedTrue({ prop }) {
        prop("onCopiedChange")?.({ copied: true });
      },
      invokeCopiedFalse({ prop }) {
        prop("onCopiedChange")?.({ copied: false });
      },
      invokeOnCopyError({ prop, event }) {
        if (event.type === "COPY.ERROR") prop("onCopyError")?.({ error: event.error });
      },
    },

    effects: {
      trackModality({ scope }) {
        // The guard keeps `connect` with no DOM (ssr.test.ts) from ever
        // touching a document.
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      /**
       * The clock and the navigator come off the element, not off a global:
       * that is the scope rule, and it is also what makes a per-window stub
       * possible in tests. Synchronous on install — see the header.
       */
      performCopy({ context, scope, send }) {
        const win = getTriggerEl(scope)?.ownerDocument.defaultView;
        // No page means no clipboard to write — a silence, not a crash.
        if (win === null || win === undefined) return;
        // The DOM types promise `clipboard` unconditionally; an insecure
        // context does not honour that promise.
        const clipboard: Clipboard | undefined = win.navigator.clipboard;
        if (clipboard === undefined) {
          // Never a synchronous send from an effect installer: the interpreter
          // is still collecting this state's teardowns. Always a timer, even
          // at zero (the tooltip's waitOpenDelay lesson).
          return timeout(
            win,
            () =>
              send({
                type: "COPY.ERROR",
                error: new Error("navigator.clipboard is unavailable (insecure context?)"),
              }),
            0,
          );
        }
        let stale = false;
        void clipboard.writeText(context.get("value")).then(
          () => {
            if (!stale) send({ type: "COPY.SUCCESS" });
          },
          (cause: unknown) => {
            if (!stale)
              send({
                type: "COPY.ERROR",
                error: cause instanceof Error ? cause : new Error(String(cause)),
              });
          },
        );
        // A resolution arriving after `copying` was left is inert.
        return () => {
          stale = true;
        };
      },

      waitFeedbackReturn({ prop, scope, send }) {
        const win = getTriggerEl(scope)?.ownerDocument.defaultView;
        // Unit tests send FEEDBACK.ELAPSED by hand.
        if (win === null || win === undefined) return;
        return timeout(
          win,
          () => send({ type: "FEEDBACK.ELAPSED" }),
          Math.max(0, prop("copiedDuration")),
        );
      },
    },
  },
});
