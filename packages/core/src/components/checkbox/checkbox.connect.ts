/**
 * The root is the `<label>`, and the hidden input is inside it. That is what
 * makes a click anywhere on the row toggle the box without a single handler on
 * the root — and why there must not be one: the browser already forwards the
 * click to the input, and a second handler would toggle it back.
 */

import { isFocusVisibleModality } from "@standarx/nav";
import { visuallyHiddenStyle } from "../../a11y/visually-hidden";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./checkbox.anatomy";
import { getHiddenInputId, getLabelId, getRootId } from "./checkbox.dom";
import type { CheckboxApi, CheckboxSchema } from "./checkbox.types";

export function connect<T extends PropTypes>(
  service: Service<CheckboxSchema>,
  normalize: NormalizeProps<T>,
): CheckboxApi<T> {
  const { context, prop, computed, state, send, scope } = service;

  const checked = context.get("checked");
  const indeterminate = computed("indeterminate");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = state.matches("focused") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-state": computed("state"),
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-invalid": dataAttr(invalid),
    "data-focus-visible": dataAttr(focusVisible),
    "data-focus-source": focusSource ?? undefined,
  };

  return {
    checked,
    indeterminate,
    disabled,
    focusSource,
    focusVisible,

    setChecked(next): void {
      send({ type: "CHECKED.SET", checked: next });
    },
    toggle(): void {
      send({ type: "CHECKED.TOGGLE" });
    },

    getRootProps: (): T["label"] =>
      normalize.label({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir: prop("dir"),
        // Without this a double click on the row selects the label text instead of
        // reading as two toggles.
        style: { userSelect: "none" },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getControlProps: (): T["element"] =>
      normalize.element({
        ...parts.control.attrs,
        ...stateAttrs,
        // The input carries the semantics; this is the box that gets drawn.
        "aria-hidden": ariaAttr(true),
      }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({ ...parts.indicator.attrs, ...stateAttrs, "aria-hidden": ariaAttr(true) }),

    getHiddenInputProps: (): T["input"] =>
      normalize.input({
        ...parts.hiddenInput.attrs,
        id: getHiddenInputId(scope),
        type: "checkbox",
        // Visually hidden rather than `display: none`: it stays focusable, stays
        // in the tab order and stays the thing a screen reader reads.
        style: visuallyHiddenStyle,
        checked: checked === true,
        disabled,
        required: prop("required"),
        name: prop("name"),
        value: prop("value"),
        form: prop("form"),
        "aria-invalid": ariaAttr(invalid),
        "aria-describedby": prop("describedBy"),
        // `readOnly` does nothing on a checkbox in HTML — the browser ignores it
        // and toggles anyway — so the guard lives in the machine and the promise
        // to assistive technology is made here.
        "aria-readonly": ariaAttr(readOnly),
        onChange(event) {
          if (event.defaultPrevented) return;
          send({ type: "CHECKED.TOGGLE" });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.BLUR" });
        },
      }),
  };
}
