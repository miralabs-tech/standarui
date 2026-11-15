/**
 * The context a checkbox reads to find the group it sits in — deliberately *not*
 * inside the group component's folder, for the reason `field-context` spells out:
 * a checkbox that imported `components/checkbox-group/checkbox-group` to reach it
 * would drag the group's machine and DOM helpers into every bundle that has a
 * checkbox in it.
 *
 * **The role rule.** In a group, a checkbox with a `value` is an item; the one
 * without is the tri-state summary. That is not a flag invented here — an item is
 * defined by the value it submits, so a box with nothing to submit cannot be one,
 * and the only other thing it can be is the summary. It is also exactly how the
 * group finds its items in the DOM: they are the boxes carrying its name, and the
 * summary carries none.
 */

import type { CheckboxCheckedChangeDetails, CheckedState } from "@standarui/core/checkbox";
import { createPartContext, type PartContext } from "./part-context";

/**
 * What a checkbox needs from its group, plus the getter the group's own label
 * reads. Stated structurally rather than imported: `CheckboxGroupApi` lives in the
 * component, and importing it here would put the dependency back the way it came.
 *
 * The getter is `object` because that is all `useRender` asks of it; the group's
 * real api, which returns React's own prop types, satisfies it.
 */
export interface CheckboxGroupContextValue {
  /** Every item carries it, and it is what makes them items. */
  readonly name: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly form: string | undefined;
  readonly parentChecked: CheckedState;
  readonly parentDisabled: boolean;
  isChecked(value: string): boolean;
  toggleValue(value: string): void;
  toggleAll(checked: boolean): void;
  getLabelProps(): object;
}

export const CheckboxGroupContext: PartContext<CheckboxGroupContextValue> =
  createPartContext("CheckboxGroup");

/** `null` outside a group, which is what lets a checkbox work on its own. */
export function useCheckboxGroupContext(): CheckboxGroupContextValue | null {
  return CheckboxGroupContext.useOptional();
}

export interface CheckboxGroupInheritable {
  readonly value?: string | undefined;
  readonly checked?: CheckedState | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly onCheckedChange?: ((details: CheckboxCheckedChangeDetails) => void) | undefined;
}

/**
 * What a checkbox inherits from its group, handed to the machine as props rather
 * than merged over its output — the same reason a field's are.
 *
 * `??` everywhere except the name: a box that says `disabled={false}` inside a
 * disabled group means it, but a box that renames itself leaves the field the
 * group is submitting, and stops being one of its items at all.
 */
export function inheritFromCheckboxGroup<T extends CheckboxGroupInheritable>(
  props: T,
  group: CheckboxGroupContextValue | null,
): T {
  if (group === null) return props;

  const shared = {
    readOnly: props.readOnly ?? group.readOnly,
    invalid: props.invalid ?? group.invalid,
  };

  if (props.value === undefined) {
    return {
      ...props,
      ...shared,
      // No name, so it submits nothing and the group does not count it as an item.
      name: undefined,
      checked: props.checked ?? group.parentChecked,
      disabled: props.disabled ?? group.parentDisabled,
      onCheckedChange(details: CheckboxCheckedChangeDetails): void {
        // From "mixed" a press goes to checked, which is what the checkbox
        // machine already does and what APG asks a tri-state parent to do.
        group.toggleAll(details.checked === true);
        props.onCheckedChange?.(details);
      },
    };
  }

  const value = props.value;
  return {
    ...props,
    ...shared,
    name: group.name,
    form: props.form ?? group.form,
    checked: props.checked ?? group.isChecked(value),
    disabled: props.disabled ?? group.disabled,
    onCheckedChange(details: CheckboxCheckedChangeDetails): void {
      group.toggleValue(value);
      props.onCheckedChange?.(details);
    },
  };
}
