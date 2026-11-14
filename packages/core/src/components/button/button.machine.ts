/**
 * A button looks like it needs no machine, and then you write down what it owes:
 * a press state that survives the finger sliding off and back, a loading state
 * that refuses activation without lying to the accessibility tree, a disabled
 * state with two different spellings, and the same behaviour when the root is not
 * a `<button>` at all.
 *
 * Who activates the control depends on that last point, and the split is the one
 * design decision here. On a real `<button>` the browser is already correct:
 * Enter and Space produce a click, forms submit, and the press primitive is used
 * for the pointer *visual* only, with its keyboard handling off — turning it on
 * would `preventDefault` Space and quietly stop `type="submit"` from submitting.
 * On a substituted element there is no native click to wait for, so the press
 * primitive synthesises the APG keyboard behaviour and activation comes from it.
 * Exactly one of the two paths is live at a time, which is what keeps a touch
 * from firing the machine twice through the compatibility click.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { trackPress } from "../../interaction/press";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import { getRootEl } from "./button.dom";
import type { ButtonSchema } from "./button.types";

export const machine: Machine<ButtonSchema> = createMachine<ButtonSchema>({
  props({ props }) {
    return {
      type: "button",
      variant: "filled",
      size: "md",
      disabled: false,
      loading: false,
      focusableWhenDisabled: false,
      nativeButton: true,
      ...props,
    };
  },

  context({ bindable }) {
    return {
      pressed: bindable<boolean>(() => ({ defaultValue: false })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackPointerPress"],

  watch({ prop, track, action }) {
    track(
      () => [prop("loading")],
      () => action(["announceLoading", "clearPressed"]),
    );
  },

  on: {
    "ROOT.CLICK": { guard: "isInteractive", actions: ["invokeOnPress"] },
    "ROOT.PRESS": { guard: "isInteractive", actions: ["invokeOnPress"] },
    "ROOT.PRESS_START": { guard: "isInteractive", actions: ["setPressed"] },
    "ROOT.PRESS_END": { actions: ["clearPressed"] },
    "ROOT.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource", "clearPressed"],
      on: { "ROOT.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("loading"),
    },

    actions: {
      invokeOnPress({ prop, event }) {
        // A real button is activated by its own click, a substituted element by the
        // press primitive. Accepting both would double-fire on touch, where the
        // compatibility click follows the pointer sequence.
        const expected = prop("nativeButton") ? "ROOT.CLICK" : "ROOT.PRESS";
        if (event.type !== expected) return;
        prop("onPress")?.({ originalEvent: event.originalEvent });
      },
      setPressed({ context }) {
        context.set("pressed", true);
      },
      clearPressed({ context }) {
        context.set("pressed", false);
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
      announceLoading({ prop, scope }) {
        const text = prop("loadingText");
        if (!prop("loading") || text === undefined) return;
        getLiveAnnouncer(scope.getDoc()).announce(text, "polite");
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackPointerPress({ scope, prop, send }) {
        return trackPress(getRootEl(scope), {
          isDisabled: () => prop("disabled") || prop("loading"),
          // Off for a real button: see the note at the top of the file.
          keyboard: !prop("nativeButton"),
          onPressStart: () => send({ type: "ROOT.PRESS_START" }),
          onPressEnd: () => send({ type: "ROOT.PRESS_END" }),
          onPressCancel: () => send({ type: "ROOT.PRESS_END" }),
          onPress: (event) => send({ type: "ROOT.PRESS", originalEvent: event.originalEvent }),
        });
      },
    },
  },
});
