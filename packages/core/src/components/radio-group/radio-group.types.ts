import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { IntentScopeHost } from "../../nav";
import type { Direction, InputModality, Orientation } from "../../types";

export interface RadioGroupValueChangeDetails {
  readonly value: string | null;
}

export interface RadioItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
}

export interface RadioGroupMachineProps {
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  /** Shared by every input in the group. Derived from the id when absent. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /**
   * Where the group claims the d-pad. The arrows are the browser's own and need
   * no bus; a pad reaches the spatial engine instead, which moves the focus
   * without checking anything, so the group has to claim the move to stay the
   * one control the two inputs drive identically.
   */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onValueChange?: ((details: RadioGroupValueChangeDetails) => void) | undefined;
}

export interface ResolvedRadioGroupMachineProps extends RadioGroupMachineProps {
  readonly orientation: Orientation;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface RadioGroupSchema extends MachineSchema {
  state: "idle";
  props: ResolvedRadioGroupMachineProps;
  context: {
    value: string | null;
    /** Along the main axis, from the root's padding-box start, in CSS pixels. */
    indicatorOffset: number | null;
    indicatorSize: number | null;
    indicatorAnimated: boolean;
    focusedValue: string | null;
    focusSource: InputModality | null;
    hasLabel: boolean;
    /** The values whose radio can take focus, in DOM order. `null` until the first sync. */
    enabledItems: readonly string[] | null;
  };
  event:
    | { type: "ITEM.SELECT"; value: string }
    | { type: "ITEM.FOCUS"; value: string }
    | { type: "ITEM.BLUR" }
    | { type: "ITEMS.SYNC" }
    | { type: "INDICATOR.MEASURE" };
  action:
    | "setValue"
    | "setFocusedValue"
    | "clearFocus"
    | "syncItems"
    | "armIndicator"
    | "settleIndicator"
    | "syncIndicator"
    | "remeasureIndicator";
  guard: "isInteractive";
  effect: "trackModality" | "trackItems" | "trackIndicator" | "captureIntents";
}

export interface RadioGroupApi<T extends PropTypes = PropTypes> {
  readonly value: string | null;
  readonly disabled: boolean;
  isSelected(value: string): boolean;
  setValue(value: string | null): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getIndicatorProps(): T["element"];
  getItemProps(props: RadioItemProps): T["label"];
  getItemControlProps(props: RadioItemProps): T["element"];
  getItemTextProps(props: RadioItemProps): T["element"];
  getItemHiddenInputProps(props: RadioItemProps): T["input"];
}
