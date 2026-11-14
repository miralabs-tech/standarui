import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

/** Tri-state, and `"indeterminate"` is a state the user cannot reach by clicking. */
export type CheckedState = boolean | "indeterminate";

export interface CheckboxCheckedChangeDetails {
  readonly checked: CheckedState;
}

export interface CheckboxMachineProps {
  readonly dir?: Direction | undefined;
  readonly checked?: CheckedState | undefined;
  readonly defaultChecked?: CheckedState | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  /** Form association, straight through to the hidden native input. */
  readonly name?: string | undefined;
  readonly value?: string | undefined;
  readonly form?: string | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  readonly onCheckedChange?: ((details: CheckboxCheckedChangeDetails) => void) | undefined;
}

export interface ResolvedCheckboxMachineProps extends CheckboxMachineProps {
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly value: string;
}

export interface CheckboxSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedCheckboxMachineProps;
  context: { checked: CheckedState; focusSource: InputModality | null };
  computed: { indeterminate: boolean; state: "checked" | "unchecked" | "indeterminate" };
  event:
    | { type: "CHECKED.TOGGLE" }
    | { type: "CHECKED.SET"; checked: CheckedState }
    | { type: "ROOT.FOCUS" }
    | { type: "ROOT.BLUR" };
  action:
    | "toggleChecked"
    | "setChecked"
    | "captureFocusSource"
    | "clearFocusSource"
    | "syncIndeterminate";
  guard: "isInteractive";
  effect: "trackModality";
}

export interface CheckboxApi<T extends PropTypes = PropTypes> {
  readonly checked: CheckedState;
  readonly indeterminate: boolean;
  readonly disabled: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  setChecked(checked: CheckedState): void;
  toggle(): void;
  getRootProps(): T["label"];
  getLabelProps(): T["element"];
  getControlProps(): T["element"];
  getIndicatorProps(): T["element"];
  getHiddenInputProps(): T["input"];
}
