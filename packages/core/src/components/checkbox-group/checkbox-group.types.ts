import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, Orientation } from "../../types";
import type { CheckedState } from "../checkbox/checkbox.types";

export interface CheckboxGroupValueChangeDetails {
  readonly value: readonly string[];
}

export interface CheckboxGroupMachineProps {
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  readonly value?: readonly string[] | undefined;
  readonly defaultValue?: readonly string[] | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  /**
   * "At least one" — never spelled `required` on the boxes themselves, where the
   * browser would read it as "this one".
   */
  readonly required?: boolean | undefined;
  /** Shared by every item, and how the group finds them. Derived from the id when absent. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** Ids of the text describing this group — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  readonly onValueChange?: ((details: CheckboxGroupValueChangeDetails) => void) | undefined;
}

export interface ResolvedCheckboxGroupMachineProps extends CheckboxGroupMachineProps {
  readonly orientation: Orientation;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
}

export interface CheckboxGroupSchema extends MachineSchema {
  state: "idle";
  props: ResolvedCheckboxGroupMachineProps;
  context: {
    value: readonly string[];
    /** Item values the user can actually reach — the summary is computed over these. */
    enabledValues: readonly string[];
    itemCount: number;
    hasLabel: boolean;
  };
  computed: { parentChecked: CheckedState; parentDisabled: boolean };
  event:
    | { type: "ITEM.TOGGLE"; value: string }
    | { type: "VALUE.SET"; value: readonly string[] }
    | { type: "PARENT.TOGGLE"; checked: boolean }
    | { type: "ITEMS.SYNC" };
  action: "toggleItem" | "setValue" | "toggleAll" | "syncItems";
  guard: "isInteractive";
  effect: "trackItems";
}

export interface CheckboxGroupApi<T extends PropTypes = PropTypes> {
  readonly value: readonly string[];
  /** Every item carries it, and it is what makes them items. */
  readonly name: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly form: string | undefined;
  /** The summary over the items the user can toggle, in a checkbox's own vocabulary. */
  readonly parentChecked: CheckedState;
  readonly parentDisabled: boolean;
  isChecked(value: string): boolean;
  setValue(value: readonly string[]): void;
  toggleValue(value: string): void;
  toggleAll(checked: boolean): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
}
