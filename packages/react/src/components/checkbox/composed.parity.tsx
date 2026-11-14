/**
 * The checkbox's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
} from "./checkbox";
import { Checkbox } from "./composed";

export const parity: readonly ParityCase[] = [
  {
    name: "checkbox",
    composed: <Checkbox id="terms" label="Accept the terms" />,
    parts: (
      <CheckboxRoot id="terms">
        <CheckboxHiddenInput />
        <CheckboxControl>
          <CheckboxIndicator />
        </CheckboxControl>
        <CheckboxLabel>Accept the terms</CheckboxLabel>
      </CheckboxRoot>
    ),
  },
  {
    name: "checkbox",
    composed: (
      <Checkbox
        id="marketing"
        label="Marketing emails"
        defaultChecked="indeterminate"
        invalid
        required
        name="preferences"
        value="marketing"
      />
    ),
    parts: (
      <CheckboxRoot
        id="marketing"
        defaultChecked="indeterminate"
        invalid
        required
        name="preferences"
        value="marketing"
      >
        <CheckboxHiddenInput />
        <CheckboxControl>
          <CheckboxIndicator />
        </CheckboxControl>
        <CheckboxLabel>Marketing emails</CheckboxLabel>
      </CheckboxRoot>
    ),
  },
  /**
   * `label` left out: the part it would have named is not rendered at all,
   * never rendered empty. A box like this is named from outside — a `Field`'s
   * own label, wired through the hidden input's id — which is a different
   * tree only above this one, not a different one here.
   */
  {
    name: "checkbox",
    composed: <Checkbox id="silent" defaultChecked />,
    parts: (
      <CheckboxRoot id="silent" defaultChecked>
        <CheckboxHiddenInput />
        <CheckboxControl>
          <CheckboxIndicator />
        </CheckboxControl>
      </CheckboxRoot>
    ),
  },
];
