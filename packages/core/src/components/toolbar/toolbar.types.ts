import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";

export interface ToolbarMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  /** Whether the arrows wrap at the ends. APG leaves it open; `toggle-group` loops. */
  readonly loopFocus?: boolean | undefined;
  /** The toolbar's accessible name (APG requires one) — rendered as `aria-label`. */
  readonly label?: string | undefined;
}

export interface ResolvedToolbarMachineProps extends ToolbarMachineProps {
  readonly orientation: Orientation;
  readonly loopFocus: boolean;
}

export interface ToolbarItemProps {
  /** The item's identity in the roving order. The adapter defaults it to its own id. */
  readonly value?: string | undefined;
}

export interface ToolbarSeparatorProps {
  /**
   * Rare: force the visual orientation. Defaults to the perpendicular of the
   * toolbar's own axis, which is what a rule between two groups means.
   */
  readonly orientation?: Orientation | undefined;
}

export interface ToolbarTitleProps {
  /** Where the title sits in a navigation bar: in the row of controls, or large under it. */
  readonly size?: "inline" | "large" | undefined;
}

export interface ToolbarSchema extends MachineSchema {
  state: "idle";
  props: ResolvedToolbarMachineProps;
  context: {
    /** The single tab stop, and the memory Tab comes back to. */
    tabbableValue: string | null;
    /** The item that actually holds DOM focus, if any. */
    focusedValue: string | null;
    /** The modality the focus arrived under, held until it leaves. */
    focusSource: InputModality | null;
  };
  event:
    | { type: "ITEM.FOCUS"; value: string }
    | { type: "ITEM.BLUR" }
    | { type: "ITEM.CLICK"; value: string }
    | { type: "ITEM.NAVIGATE"; action: RovingAction; value: string }
    | { type: "ITEMS.SYNC" }
    | { type: "ITEMS.CURRENT" };
  action:
    | "setFocusedValue"
    | "clearFocus"
    | "rememberItem"
    | "navigate"
    | "syncItems"
    | "followCurrentPage";
  effect: "trackModality" | "trackItems" | "warnIfAnonymous";
}

export interface ToolbarApi<T extends PropTypes = PropTypes> {
  readonly focusedValue: string | null;
  getRootProps(): T["element"];
  getGroupProps(): T["element"];
  getSeparatorProps(props?: ToolbarSeparatorProps): T["element"];
  getSpacerProps(): T["element"];
  getItemProps(props: ToolbarItemProps & { value: string }): T["element"];
  getTitleProps(props?: ToolbarTitleProps): T["element"];
}
