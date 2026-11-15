/**
 * `<Field>` — the composed layer around a single control, or a group of them: a
 * label, its required indicator, the control itself, then the field's own
 * messages. `children` is the control — an `InputRoot`, a `RadioGroupRoot`,
 * anything that reads the field context for its own scope — because a field
 * without a control is the part every other composed layer nests inside.
 *
 * There is no `FieldControl` part to place here: `field/index.ts` never exported
 * one, because the anatomy's `control` is not a node the field renders — it is
 * `controlProps`, merged into whatever the consumer puts inside. `children` is
 * that placement in the composed vocabulary.
 *
 * `group` picks the label part, not just an attribute: a group's caption is a
 * `<legend>` (`FieldLegend`), a single control's is a `<label>` (`FieldLabel`),
 * and the two are different components rather than one element with a flag —
 * the same fork `FieldRoot` already makes for `fieldset`/`div`.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  FieldErrorText,
  FieldHelperText,
  FieldLabel,
  FieldLegend,
  FieldRequiredIndicator,
  FieldRoot,
  type UseFieldProps,
} from "./field";

export interface FieldComposedProps
  extends UseFieldProps,
    Omit<PartProps<"div", UseFieldProps>, "children"> {
  /** The control this field names and describes. */
  readonly children?: ReactNode;
  readonly label?: ReactNode;
  /** Shown beside the label while `required` is true. Defaults to `"*"`. */
  readonly requiredIndicator?: ReactNode;
  readonly helperText?: ReactNode;
  readonly errorText?: ReactNode;
}

export function Field(props: FieldComposedProps): ReactNode {
  const { children, label, requiredIndicator, helperText, errorText, ...rest } = props;
  const Label = rest.group === true ? FieldLegend : FieldLabel;

  return (
    <FieldRoot {...rest}>
      {label == null ? null : (
        <Label>
          {label}
          {rest.required === true ? (
            <FieldRequiredIndicator>{requiredIndicator ?? "*"}</FieldRequiredIndicator>
          ) : null}
        </Label>
      )}
      {children}
      {helperText == null ? null : <FieldHelperText>{helperText}</FieldHelperText>}
      {errorText == null ? null : <FieldErrorText>{errorText}</FieldErrorText>}
    </FieldRoot>
  );
}
