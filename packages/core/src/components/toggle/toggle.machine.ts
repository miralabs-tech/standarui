/**
 * The smallest complete component, and the one that proves the engine end to end:
 * resolved props, a controlled/uncontrolled bindable, guarded transitions, a state
 * with its own exit action, and a machine-level effect with a teardown.
 *
 * The value lives in `context`, not in the state name. States model interaction
 * modes — idle, focused — while `pressed` is data; folding data into state names
 * is what turns a three-state machine into a twelve-state one as soon as a second
 * flag appears.
 *
 * The modality tracker is installed for the whole life of the service rather than
 * on focus: by the time a focus event arrives, the keydown that caused it has
 * already been and gone, and a tracker started at that moment would report the
 * wrong modality for the very first Tab. It is read once, when focus lands, and
 * the answer is held until focus leaves — see `focusSource` in the schema.
 */

import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getInputModality, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import type { ToggleSchema } from "./toggle.types";

export const machine: Machine<ToggleSchema> = createMachine<ToggleSchema>({
  props({ props }) {
    return { disabled: false, ...props };
  },

  context({ prop, bindable }) {
    return {
      pressed: bindable<boolean>(() => ({
        defaultValue: prop("defaultPressed") ?? false,
        value: prop("pressed"),
        onChange: (pressed) => prop("onPressedChange")?.({ pressed }),
        debugLabel: "toggle pressed",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality"],

  // Activation is state-independent: a click lands the same way whether or not
  // the control happens to be focused.
  on: {
    "TRIGGER.CLICK": { guard: "!isDisabled", actions: ["togglePressed"] },
    "PRESSED.SET": { guard: "!isDisabled", actions: ["setPressed"] },
    "ROOT.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource"],
      on: { "ROOT.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isDisabled: ({ prop }) => prop("disabled"),
    },

    actions: {
      togglePressed({ context }) {
        context.set("pressed", (pressed) => !pressed);
      },
      setPressed({ context, event }) {
        if (event.type === "PRESSED.SET") context.set("pressed", event.pressed);
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
    },

    effects: {
      // No listener: the source is read once at focus, so a modality change no
      // longer has to reach every mounted control. Holding the handle is the
      // whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },
    },
  },
});
