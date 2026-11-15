import { visuallyHiddenStyle } from "../../a11y/visually-hidden";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./switch.anatomy";
import { getControlId, getHiddenInputId, getLabelId, getRootId } from "./switch.dom";
import type { SwitchApi, SwitchSchema } from "./switch.types";

export function connect<T extends PropTypes>(
  service: Service<SwitchSchema>,
  normalize: NormalizeProps<T>,
): SwitchApi<T> {
  const { context, prop, state, send, scope } = service;

  const checked = context.get("checked");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  const dragProgress = context.get("dragProgress");
  const dragging = dragProgress !== null;
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = state.matches("focused") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-state": checked ? "checked" : "unchecked",
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-invalid": dataAttr(invalid),
    "data-focus-visible": dataAttr(focusVisible),
    "data-focus-source": focusSource ?? undefined,
    "data-pressed": dataAttr(context.get("pressed")),
    "data-dragging": dataAttr(dragging),
  };

  return {
    checked,
    disabled,
    focusSource,
    focusVisible,
    dragging,

    setChecked(next: boolean): void {
      send({ type: "CHECKED.SET", checked: next });
    },
    toggle(): void {
      send({ type: "CHECKED.TOGGLE" });
    },

    getRootProps: (): T["label"] =>
      normalize.label({
        ...parts.root.attrs,
        ...stateAttrs,
        "data-size": prop("size"),
        id: getRootId(scope),
        dir: prop("dir"),
        style: { userSelect: "none" },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getControlProps: (): T["element"] =>
      normalize.element({
        ...parts.control.attrs,
        ...stateAttrs,
        id: getControlId(scope),
        "aria-hidden": ariaAttr(true),
        // The finger owns the horizontal axis for the duration of the gesture; a
        // scroll container underneath must not take it away mid-drag.
        style: { touchAction: "none" },
      }),

    getThumbProps: (): T["element"] =>
      normalize.element({
        ...parts.thumb.attrs,
        ...stateAttrs,
        "aria-hidden": ariaAttr(true),
        // While dragging the thumb follows the finger; parked, it sits where the
        // state says and the CSS transition carries it there.
        style: dragging ? { "--sui-switch-progress": String(dragProgress) } : undefined,
      }),

    getHiddenInputProps: (): T["input"] =>
      normalize.input({
        ...parts.hiddenInput.attrs,
        id: getHiddenInputId(scope),
        type: "checkbox",
        // A switch is not a checkbox to a screen reader: "on/off", not
        // "checked/unchecked" (APG switch pattern).
        role: "switch",
        style: visuallyHiddenStyle,
        checked,
        disabled,
        required: prop("required"),
        name: prop("name"),
        value: prop("value"),
        form: prop("form"),
        "aria-invalid": ariaAttr(invalid),
        "aria-describedby": prop("describedBy"),
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
