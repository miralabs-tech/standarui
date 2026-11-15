/**
 * `<Checkbox label="…"/>` — the bare name beside the parts: one root, four
 * children, no collection. The root is the `<label>` itself
 * (`checkbox.anatomy.ts` has no separate element for it), so the composed
 * props are the root's own — `render`, `asChild`, every machine prop — and
 * `children` is excluded from them: what the root contains is the four parts
 * below, hardcoded here, not a slot a consumer fills.
 *
 * `checked` stays exactly `CheckedState` (`boolean | "indeterminate"`,
 * `checkbox.types.ts`) because it is `CheckboxMachineProps`'s own field,
 * reached here through `UseCheckboxProps` — the composed layer invents no
 * third state and no narrower type for it.
 *
 * One translation the type system cannot make on its own: `label` names the
 * box, but `CheckboxLabel` is placed only once it is given. Leaving it out is
 * not a defect to guard against — a checkbox living under a `Field` is named
 * by the field's own label instead, through the native `label[for]` the root
 * already wires to the hidden input (`checkbox.tsx`, `ids.hiddenInput`) — so
 * an empty part written unconditionally would double that name rather than
 * complete it.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
  type UseCheckboxProps,
} from "./checkbox";

export interface CheckboxComposedProps
  extends UseCheckboxProps,
    Omit<PartProps<"label", UseCheckboxProps>, "children"> {
  /** The visible text. Omit it only where something else names the box — see above. */
  readonly label?: ReactNode;
}

export function Checkbox(props: CheckboxComposedProps): ReactNode {
  const { label, ...root } = props;

  return (
    <CheckboxRoot {...root}>
      <CheckboxHiddenInput />
      <CheckboxControl>
        <CheckboxIndicator />
      </CheckboxControl>
      {label == null ? null : <CheckboxLabel>{label}</CheckboxLabel>}
    </CheckboxRoot>
  );
}
