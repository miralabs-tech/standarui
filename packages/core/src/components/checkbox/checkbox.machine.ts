/**
 * A real `<input type="checkbox">` does the work, visually hidden inside the
 * label that is the root. That is not a fallback, it is the design: form
 * association, the click a `<label>` forwards, Space, autofill, and the
 * "required" validation message all come free and correct, and none of them can
 * be re-implemented as well as the browser already does them.
 *
 * Which leaves exactly one thing the platform cannot express through markup:
 * `indeterminate` is a DOM property, not an attribute. It is written in an action
 * on every change, because an attribute-only adapter — SSR, or a framework that
 * only diffs attributes — would otherwise never set it at all.
 */

import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getInputModality, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import { getHiddenInputEl } from "./checkbox.dom";
import type { CheckboxSchema, CheckedState } from "./checkbox.types";

export const machine: Machine<CheckboxSchema> = createMachine<CheckboxSchema>({
  props({ props }) {
    return {
      disabled: false,
      invalid: false,
      required: false,
      readOnly: false,
      value: "on",
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      checked: bindable<CheckedState>(() => ({
        defaultValue: prop("defaultChecked") ?? false,
        value: prop("checked"),
        onChange: (checked) => prop("onCheckedChange")?.({ checked }),
        debugLabel: "checkbox checked",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    indeterminate: ({ context }) => context.get("checked") === "indeterminate",
    state({ context }) {
      const checked = context.get("checked");
      if (checked === "indeterminate") return "indeterminate";
      return checked ? "checked" : "unchecked";
    },
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality"],

  watch({ context, track, action }) {
    track(
      () => [context.get("checked")],
      () => action(["syncIndeterminate"]),
    );
  },

  entry: ["syncIndeterminate"],

  on: {
    "CHECKED.TOGGLE": { guard: "isInteractive", actions: ["toggleChecked"] },
    "CHECKED.SET": { guard: "isInteractive", actions: ["setChecked"] },
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
      // Read-only is not disabled: the control stays focusable and announced, it
      // simply refuses to change — which is what a form in review mode wants.
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      // From indeterminate a click goes to checked, never back to unchecked: the
      // mixed state is the parent's summary, and the user asking for a change is
      // asking for "all of them" (APG, tri-state checkbox).
      toggleChecked({ context }) {
        context.set("checked", (checked) => checked !== true);
      },
      setChecked({ context, event }) {
        if (event.type === "CHECKED.SET") context.set("checked", event.checked);
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
      syncIndeterminate({ scope, computed }) {
        const input = getHiddenInputEl(scope);
        if (input === null) return;
        input.indeterminate = computed("indeterminate");
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
