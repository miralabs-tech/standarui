import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";

export interface ToggleGroupValueChangeDetails {
  readonly value: readonly string[];
}

export type ToggleGroupSizing = "equal" | "content";

export interface ToggleGroupItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  /**
   * The item's own text, repeated so the styles can reserve the width the label
   * takes at the selected weight. Without it the segment widens when it is
   * selected, the track grows, and the indicator — measured before the weight
   * changed — lands beside the segment it points at. Omitting it is safe:
   * the weight change is gated on the attribute being there.
   */
  readonly label?: string | undefined;
}

export interface ToggleGroupMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  /** Controlled. Always an array — single selection is an array of at most one. */
  readonly value?: readonly string[] | undefined;
  readonly defaultValue?: readonly string[] | undefined;
  readonly multiple?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /**
   * Whether clicking the selected item clears it. Defaults to `multiple`: a
   * radio group has no deselect, and single mode *is* a radio group. Turning it
   * on makes a nullable control, which is no longer the APG pattern.
   */
  readonly deselectable?: boolean | undefined;
  readonly loopFocus?: boolean | undefined;
  /**
   * `"equal"` cuts the track into equal columns, `"content"` sizes each segment
   * by its own label; the pill is placed from a measurement of the active
   * segment's layout box either way. A group can switch at runtime. A horizontal
   * group wider than its room scrolls along its line; nothing folds.
   */
  readonly sizing?: ToggleGroupSizing | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  readonly onValueChange?: ((details: ToggleGroupValueChangeDetails) => void) | undefined;
}

export interface ResolvedToggleGroupMachineProps extends ToggleGroupMachineProps {
  readonly orientation: Orientation;
  readonly multiple: boolean;
  readonly disabled: boolean;
  readonly deselectable: boolean;
  readonly loopFocus: boolean;
  readonly sizing: ToggleGroupSizing;
}

export interface ToggleGroupSchema extends MachineSchema {
  state: "idle";
  props: ResolvedToggleGroupMachineProps;
  context: {
    value: readonly string[];
    /** Where the sliding indicator sits. `-1` when nothing is selected. */
    activeIndex: number;
    /** How many segments there are — the indicator's width is one of them. */
    itemCount: number;
    /** Where the single tab stop sits — the selected item, or the first one. */
    tabbableValue: string | null;
    /** The item that actually holds DOM focus, if any. */
    focusedValue: string | null;
    focusSource: InputModality | null;
    hasLabel: boolean;
    /** False while the track itself changed — a first paint, a segment added, a
     * label arriving. The pill travels for a choice and snaps for a layout. */
    indicatorAnimated: boolean;
    /** Where the pill starts and how long it is, measured from the active segment. `null` until read, and for no selection. */
    indicatorOffset: number | null;
    indicatorSize: number | null;
  };
  event:
    | { type: "ITEM.CLICK"; value: string; origin?: "navigate" }
    | { type: "ITEM.FOCUS"; value: string }
    | { type: "ITEM.BLUR" }
    | { type: "ITEM.NAVIGATE"; action: RovingAction; value: string }
    | { type: "VALUE.SET"; value: readonly string[] }
    | { type: "ITEMS.SYNC" }
    | { type: "INDICATOR.MEASURE" };
  action:
    | "selectItem"
    | "revealItem"
    | "setValue"
    | "setFocusedValue"
    | "clearFocus"
    | "navigate"
    | "syncItems"
    | "syncIndicator"
    | "settleIndicator"
    | "remeasureIndicator";
  guard: "isInteractive";
  effect: "trackModality" | "trackItems" | "trackIndicator" | "trackScrollEdges" | "trackScrollbar";
}

export interface ToggleGroupApi<T extends PropTypes = PropTypes> {
  readonly value: readonly string[];
  readonly disabled: boolean;
  isSelected(value: string): boolean;
  setValue(value: readonly string[]): void;
  getFrameProps(): T["element"];
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getIndicatorProps(): T["element"];
  getScrollbarProps(): T["element"];
  getThumbProps(): T["element"];
  getItemProps(props: ToggleGroupItemProps): T["button"];
}
