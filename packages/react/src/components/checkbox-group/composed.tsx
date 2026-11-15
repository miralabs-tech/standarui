/**
 * `<CheckboxGroup label="…" options={…}/>` — the field `checkbox-group.stories.tsx`
 * writes by hand: a `CheckboxGroupRoot`, its label, and one full checkbox tree per
 * entry (`CheckboxRoot` > `CheckboxHiddenInput`, `CheckboxControl` >
 * `CheckboxIndicator`, `CheckboxLabel`).
 *
 * The group is not a composite (`checkbox-group.machine.ts`'s header) — every box
 * keeps its own tab stop, so there is nothing here to route focus through and
 * nothing to memoise over the entries. This is a placement, the way `Select`'s
 * options are: the collection is still the live DOM the machine reads, and an
 * array mapped into `<CheckboxRoot>` elements before the render holds nothing.
 *
 * One thing the type system cannot make on its own: an entry with no `value` is
 * the tri-state summary, not an item — `checkbox-group-context.ts`'s "role rule",
 * where a box's `value` is what makes it one. That is why `CheckboxGroupOption`
 * leaves `value` exactly as optional as `CheckboxRootProps` already has it,
 * rather than narrowing it to required the way `SelectOption.value` is.
 */

import type { ReactNode } from "react";
import type { ComposedSeparator } from "../../composed";
import type { PartProps } from "../../create-part";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
  type CheckboxRootProps,
} from "../checkbox/checkbox";
import { SeparatorRoot } from "../separator/separator";
import {
  CheckboxGroupLabel,
  CheckboxGroupRoot,
  type UseCheckboxGroupProps,
} from "./checkbox-group";

/**
 * A box's own props, minus `children`: the composed layer places the checkbox's
 * whole subtree itself, so nothing here can replace it. `label` is what an entry
 * names itself with, the way `SelectOption.label` is — required for the same
 * reason a nameless control is a defect rather than a shape to leave compilable.
 */
export type CheckboxGroupOption = Omit<CheckboxRootProps, "children"> & {
  readonly label: ReactNode;
};

/** Narrowed structurally — `"separator" in entry` — the test `Select` already uses. */
export type CheckboxGroupEntry = CheckboxGroupOption | ComposedSeparator;

export interface CheckboxGroupComposedProps
  extends UseCheckboxGroupProps,
    Omit<PartProps<"div", UseCheckboxGroupProps>, "children"> {
  /**
   * Rendered only when given. `CheckboxGroupRoot`'s `aria-labelledby` is written
   * only once `hasLabel` finds a label part in the DOM
   * (`checkbox-group.dom.ts`/`hasLabel`), so a group left unlabelled here keeps
   * whatever other name it has — an `aria-label` on the root, a `Field`'s own
   * caption — instead of gaining a second, unlinked one.
   */
  readonly label?: ReactNode;
  readonly options: readonly CheckboxGroupEntry[];
}

export function CheckboxGroup(props: CheckboxGroupComposedProps): ReactNode {
  const { label, options, ...root } = props;

  return (
    <CheckboxGroupRoot {...root}>
      {label == null ? null : <CheckboxGroupLabel>{label}</CheckboxGroupLabel>}
      {options.map((entry, index) => {
        // A separator holds no value to key on and no state to preserve across a
        // re-render — the same reasoning `Select`'s composed layer states for its
        // own separators.
        if ("separator" in entry) {
          // biome-ignore lint/suspicious/noArrayIndexKey: safe on a separator, and on nothing else in this list — see above.
          return <SeparatorRoot key={`sep:${index}`} />;
        }
        const { label: boxLabel, ...box } = entry;
        return (
          <CheckboxRoot key={box.value ?? "summary"} {...box}>
            <CheckboxHiddenInput />
            <CheckboxControl>
              <CheckboxIndicator />
            </CheckboxControl>
            <CheckboxLabel>{boxLabel}</CheckboxLabel>
          </CheckboxRoot>
        );
      })}
    </CheckboxGroupRoot>
  );
}
