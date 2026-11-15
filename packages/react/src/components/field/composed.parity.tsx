/**
 * The field's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import { InputControl, InputRoot } from "../input/input";
import { Field } from "./composed";
import {
  FieldErrorText,
  FieldHelperText,
  FieldLabel,
  FieldLegend,
  FieldRequiredIndicator,
  FieldRoot,
} from "./field";

export const parity: readonly ParityCase[] = [
  {
    name: "field",
    composed: (
      <Field id="anon">
        <input name="x" />
      </Field>
    ),
    parts: (
      <FieldRoot id="anon">
        <input name="x" />
      </FieldRoot>
    ),
  },
  /**
   * The row that carries a real control: `InputRoot`/`InputControl` read
   * `useFieldContext()` on their own, so this is what proves the composed layer
   * places the control where the parts form would rather than wrapping it in
   * anything of its own. Pinned twice over — `Field`'s own `id` and the nested
   * `InputRoot`'s — because `InputRoot` mints its OWN root id when none is given,
   * and the loop in `composed.test.tsx` fails the moment a React id survives.
   *
   * `requiredIndicator` is left at its default here on purpose: this is the row
   * that proves the `"*"` the composed layer supplies when the consumer names
   * none, and the next row is the one that overrides it.
   */
  {
    name: "field",
    composed: (
      <Field
        id="email"
        label="Email"
        required
        invalid
        helperText="We only use it to sign you in."
        errorText="Too short."
      >
        <InputRoot id="email-input" type="email">
          <InputControl />
        </InputRoot>
      </Field>
    ),
    parts: (
      <FieldRoot id="email" required invalid>
        <FieldLabel>
          Email
          <FieldRequiredIndicator>*</FieldRequiredIndicator>
        </FieldLabel>
        <InputRoot id="email-input" type="email">
          <InputControl />
        </InputRoot>
        <FieldHelperText>We only use it to sign you in.</FieldHelperText>
        <FieldErrorText>Too short.</FieldErrorText>
      </FieldRoot>
    ),
  },
  /**
   * `group` switches the root to a `fieldset` and picks `FieldLegend` over
   * `FieldLabel` — two different components, not one element with a flag — and
   * this is also the row that overrides the default required indicator, so both
   * translations get a character-level proof rather than a screenshot.
   */
  {
    name: "field",
    composed: (
      <Field id="plan" group label="Plan" required requiredIndicator="(required)">
        <label>
          <input type="radio" name="plan" value="monthly" defaultChecked /> Monthly
        </label>
        <label>
          <input type="radio" name="plan" value="yearly" /> Yearly
        </label>
      </Field>
    ),
    parts: (
      <FieldRoot id="plan" group required>
        <FieldLegend>
          Plan
          <FieldRequiredIndicator>(required)</FieldRequiredIndicator>
        </FieldLegend>
        <label>
          <input type="radio" name="plan" value="monthly" defaultChecked /> Monthly
        </label>
        <label>
          <input type="radio" name="plan" value="yearly" /> Yearly
        </label>
      </FieldRoot>
    ),
  },
];
