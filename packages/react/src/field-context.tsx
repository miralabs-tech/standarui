/**
 * The context a control reads to find the field it sits in — deliberately *not*
 * inside the field component's folder.
 *
 * A checkbox that imported `components/field/field` to reach this would drag the
 * field's machine, its five parts and its DOM helpers into every bundle that has
 * a checkbox in it. Measured: 0,26 kB on a wrapper budgeted at 1 kB. The context
 * is the only thing the two sides share, so the context is what lives apart.
 */

import { createPartContext, type PartContext } from "./part-context";

/**
 * The shape a control needs, plus the getters the field's own parts read. Stated
 * structurally rather than imported: `FieldApi` lives in the component, and
 * importing it here would put the dependency back the way it came.
 *
 * The getters are `object` because that is all `useRender` asks of them; the
 * field's real api, which returns React's own prop types, satisfies it.
 */
export interface FieldContextValue {
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly controlProps: {
    readonly id: string;
    readonly "aria-describedby": string | undefined;
  };
  /** The label's id for a control `<label for>` cannot name; `undefined` if none. */
  readonly labelId: string | undefined;
  getLabelProps(): object;
  getRequiredIndicatorProps(): object;
  getHelperTextProps(): object;
  getErrorTextProps(): object;
}

export const FieldContext: PartContext<FieldContextValue> = createPartContext("Field");

/**
 * `null` outside a field, which is what lets every control work on its own.
 */
export function useFieldContext(): FieldContextValue | null {
  return FieldContext.useOptional();
}

export interface FieldInheritable {
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly describedBy?: string | undefined;
  readonly labelledBy?: string | undefined;
}

/**
 * What a control inherits from its field, handed to the machine as props rather
 * than merged over its output: merging would let a field's `disabled: false`
 * clobber a control that disabled itself, and the control's id has to reach the
 * machine anyway for `label[for]` to point at the right element.
 *
 * `??` and not `||`: a control that explicitly says `invalid={false}` inside an
 * invalid field means it, and the field must not talk over it.
 */
export function inheritFromField<T extends FieldInheritable>(
  props: T,
  field: FieldContextValue | null,
): T {
  if (field === null) return props;
  return {
    ...props,
    disabled: props.disabled ?? field.disabled,
    invalid: props.invalid ?? field.invalid,
    readOnly: props.readOnly ?? field.readOnly,
    required: props.required ?? field.required,
    describedBy: props.describedBy ?? field.controlProps["aria-describedby"],
    // Only a control that `<label for>` cannot name reads this — the labelable
    // ones take `controlProps.id` and are named by the label itself. Handing it
    // to every control would be harmless but redundant; handing it to none left
    // `role="slider"` with no name at all.
    labelledBy: props.labelledBy ?? field.labelId,
  };
}
