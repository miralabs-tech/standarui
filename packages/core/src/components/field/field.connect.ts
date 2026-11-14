import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./field.anatomy";
import { getControlId, getErrorTextId, getHelperTextId, getLabelId, getRootId } from "./field.dom";
import type { FieldApi, FieldControlProps, FieldSchema } from "./field.types";

export function connect<T extends PropTypes>(
  service: Service<FieldSchema>,
  normalize: NormalizeProps<T>,
): FieldApi<T> {
  const { context, prop, scope } = service;

  const invalid = prop("invalid");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const required = prop("required");
  const group = prop("group");

  const stateAttrs = {
    "data-invalid": dataAttr(invalid),
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-required": dataAttr(required),
  };

  // Only ids that exist, and the error first: a screen reader reads them in the
  // order they are listed, and what is wrong matters more than what was advised.
  const describedBy =
    [
      invalid && context.get("hasErrorText") ? getErrorTextId(scope) : null,
      context.get("hasHelperText") ? getHelperTextId(scope) : null,
    ]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  const labelId = context.get("hasLabel") ? getLabelId(scope) : undefined;

  const controlProps: FieldControlProps = {
    id: getControlId(scope),
    "aria-describedby": describedBy,
    "aria-invalid": ariaAttr(invalid),
    disabled,
    readOnly,
    required,
  };

  return {
    invalid,
    disabled,
    required,
    readOnly,
    controlProps,
    labelId,

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir: prop("dir"),
        role: group ? "group" : undefined,
        // A group labels itself through its own label; a single field labels its
        // control, and the control is what carries the name. Only once that label
        // is really rendered — a group without one would name itself after an id
        // that is in no document.
        "aria-labelledby": group ? labelId : undefined,
      }),

    getLabelProps: (): T["label"] =>
      normalize.label({
        ...parts.label.attrs,
        ...stateAttrs,
        id: getLabelId(scope),
        // `for` only when there is a single control to point at — on a group it
        // would name one member and hide the rest — and only when that control is
        // something a label may name. A `div[role="slider"]` is not: the thumb
        // reads `labelId` back through `aria-labelledby` instead.
        for: group || !context.get("hasLabelableControl") ? undefined : getControlId(scope),
      }),

    getRequiredIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.requiredIndicator.attrs,
        // The control already says `required`; the asterisk is decoration, and
        // announcing "star" after every label is noise.
        "aria-hidden": ariaAttr(true),
        hidden: !required,
      }),

    getHelperTextProps: (): T["element"] =>
      normalize.element({ ...parts.helperText.attrs, ...stateAttrs, id: getHelperTextId(scope) }),

    getErrorTextProps: (): T["element"] =>
      normalize.element({
        ...parts.errorText.attrs,
        ...stateAttrs,
        id: getErrorTextId(scope),
        // Not a live region: it is a `aria-describedby` target, and the
        // announcement goes through the shared announcer instead (see
        // `announceError`). Making this element live *and* describing the
        // control with it would also have it read twice.
        hidden: !invalid,
      }),
  };
}
