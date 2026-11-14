import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction } from "../../types";

export interface FieldMachineProps {
  readonly dir?: Direction | undefined;
  readonly invalid?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly required?: boolean | undefined;
  /** Groups (`fieldset`/`legend`) instead of a single labelled control. */
  readonly group?: boolean | undefined;
}

export interface ResolvedFieldMachineProps extends FieldMachineProps {
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly group: boolean;
}

export interface FieldSchema extends MachineSchema {
  state: "idle";
  props: ResolvedFieldMachineProps;
  /**
   * Whether the optional parts are actually rendered, and whether the control id
   * reached something `for` may name — all read from the DOM.
   */
  context: {
    hasHelperText: boolean;
    hasErrorText: boolean;
    hasLabel: boolean;
    hasLabelableControl: boolean;
  };
  event: { type: "PARTS.SYNC" };
  action: "syncParts" | "announceError";
  effect: "trackParts";
}

/** What a control merges to be wired into the field. */
export interface FieldControlProps {
  readonly id: string;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": "true" | undefined;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
}

export interface FieldApi<T extends PropTypes = PropTypes> {
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly readOnly: boolean;
  /** The ids and states any control in this field has to carry. */
  readonly controlProps: FieldControlProps;
  /**
   * The label's id, for a control that `<label for>` cannot name and that has to
   * point back with `aria-labelledby` instead. `undefined` while no label part is
   * rendered — an `aria-labelledby` at a missing id names nothing and fails audit.
   */
  readonly labelId: string | undefined;
  getRootProps(): T["element"];
  getLabelProps(): T["label"];
  getRequiredIndicatorProps(): T["element"];
  getHelperTextProps(): T["element"];
  getErrorTextProps(): T["element"];
}
