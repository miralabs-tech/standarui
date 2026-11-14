/**
 * One machine for the text field, the multi-line field and the password field:
 * they differ in which element renders and whether the characters are hidden,
 * not in what they do. That is CDC D10 in the small — one machine, several
 * presentations — and it is why `password-input` is not a component of its own.
 *
 * The value is a bindable like any other, so a text field is controlled or
 * uncontrolled by the same rule as a checkbox. The DOM's own value is the source
 * of truth while typing; the machine only records what the browser reports.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import type { InputSchema } from "./input.types";

export const machine: Machine<InputSchema> = createMachine<InputSchema>({
  props({ props }) {
    return {
      type: "text",
      shape: "capsule",
      disabled: false,
      invalid: false,
      readOnly: false,
      required: false,
      clearOnEscape: false,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<string>(() => ({
        defaultValue: prop("defaultValue") ?? "",
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "input value",
      })),
      masked: bindable<boolean>(() => ({ defaultValue: prop("defaultMasked") ?? true })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    isPassword: ({ prop }) => prop("type") === "password",
    // A revealed password is a text field to the browser — which is also what
    // stops a password manager from re-masking it.
    resolvedType({ prop, context }) {
      if (prop("type") !== "password") return prop("type");
      return context.get("masked") ? "password" : "text";
    },
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality"],

  on: {
    "VALUE.SET": { guard: "isInteractive", actions: ["setValue"] },
    "VALUE.CLEAR": { guard: "isInteractive", actions: ["clearValue"] },
    "VISIBILITY.TOGGLE": { actions: ["toggleMasked"] },
    "CONTROL.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource"],
      on: { "CONTROL.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },
      clearValue({ context }) {
        context.set("value", "");
      },
      toggleMasked({ context }) {
        context.set("masked", (masked) => !masked);
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },
    },
  },
});
