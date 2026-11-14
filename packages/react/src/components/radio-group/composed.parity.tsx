/**
 * The radio group's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import { SeparatorRoot } from "../separator/separator";
import { RadioGroup } from "./composed";
import {
  RadioGroupIndicator,
  RadioGroupItem,
  RadioGroupItemControl,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupLabel,
  RadioGroupRoot,
} from "./radio-group";

export const parity: readonly ParityCase[] = [
  {
    name: "radio-group",
    composed: (
      <RadioGroup
        id="size"
        options={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
        ]}
      />
    ),
    parts: (
      <RadioGroupRoot id="size">
        <RadioGroupItem value="small">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Small</RadioGroupItemText>
        </RadioGroupItem>
        <RadioGroupItem value="medium">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Medium</RadioGroupItemText>
        </RadioGroupItem>
      </RadioGroupRoot>
    ),
  },
  /**
   * Every non-trivial translation at once: the group's own `label`, the sliding
   * `indicator`, a disabled option, a `{ separator: true }` entry between it and
   * the rest, and every root prop that is not the composed prop's own name
   * (`orientation`, `defaultValue`, `invalid`, `required`) passed straight
   * through. `describedBy` is deliberately absent: it names an id the consumer
   * owns, so in a fixture rendered on its own it is a dangling IDREF and the
   * harness is right to refuse it.
   */
  {
    name: "radio-group",
    composed: (
      <RadioGroup
        id="condition"
        label="Condition"
        orientation="horizontal"
        defaultValue="clear"
        invalid
        required
        indicator
        options={[
          { value: "storm", label: "Storm", disabled: true },
          { separator: true },
          { value: "clear", label: "Clear" },
        ]}
      />
    ),
    parts: (
      <RadioGroupRoot id="condition" orientation="horizontal" defaultValue="clear" invalid required>
        <RadioGroupLabel>Condition</RadioGroupLabel>
        <RadioGroupIndicator />
        <RadioGroupItem value="storm" disabled>
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Storm</RadioGroupItemText>
        </RadioGroupItem>
        <SeparatorRoot />
        <RadioGroupItem value="clear">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Clear</RadioGroupItemText>
        </RadioGroupItem>
      </RadioGroupRoot>
    ),
  },
  /**
   * `renderOption` decorates `defaults` rather than replacing it, and `meta` rides
   * along for exactly this: a hint sentence threaded from the entry to the
   * render prop, with no eighth field in the vocabulary for it.
   */
  {
    name: "radio-group",
    composed: (
      <RadioGroup
        id="plan"
        options={[
          { value: "free", label: "Free", meta: "No card required" },
          { value: "pro", label: "Pro", meta: "Billed monthly" },
        ]}
        renderOption={(option, defaults) => (
          <>
            {defaults}
            <span className="hint">{option.meta}</span>
          </>
        )}
      />
    ),
    parts: (
      <RadioGroupRoot id="plan">
        <RadioGroupItem value="free">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Free</RadioGroupItemText>
          <span className="hint">No card required</span>
        </RadioGroupItem>
        <RadioGroupItem value="pro">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>Pro</RadioGroupItemText>
          <span className="hint">Billed monthly</span>
        </RadioGroupItem>
      </RadioGroupRoot>
    ),
  },
];
