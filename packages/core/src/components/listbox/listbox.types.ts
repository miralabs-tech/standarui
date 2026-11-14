import type { IntentScopeHost } from "@standarx/nav";
import type { RovingAction } from "../../focus/roving-focus";
import type { TypeaheadState } from "../../interaction/typeahead";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";

export type ListboxSelectionMode = "single" | "multiple";

export interface ListboxValueChangeDetails {
  readonly value: readonly string[];
}

export interface ListboxHighlightChangeDetails {
  readonly value: string | null;
}

export interface ListboxSelectDetails {
  readonly value: string;
}

export interface ListboxMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  readonly selectionMode?: ListboxSelectionMode | undefined;
  /** Single mode: re-selecting the selected item clears it. Off by default. */
  readonly deselectable?: boolean | undefined;
  /**
   * The selection follows the focus, which is the native `<select>` model.
   * Resolved default: on in single mode, off in multiple. An extend or a quiet
   * move overrides it for that move alone.
   */
  readonly selectOnHighlight?: boolean | undefined;
  /** Off by default: a list does not wrap. A menu does, and says so. */
  readonly loopFocus?: boolean | undefined;
  readonly typeahead?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** The accessible name when no `label` part is rendered. */
  readonly label?: string | undefined;
  readonly intents?: IntentScopeHost | null | undefined;

  readonly value?: readonly string[] | undefined;
  readonly defaultValue?: readonly string[] | undefined;
  readonly highlightedValue?: string | null | undefined;
  readonly defaultHighlightedValue?: string | null | undefined;

  readonly onValueChange?: ((details: ListboxValueChangeDetails) => void) | undefined;
  readonly onHighlightChange?: ((details: ListboxHighlightChangeDetails) => void) | undefined;
  /**
   * Every user act of selection aimed at an item — a click, Space, the pad's A or
   * X — whether or not the value ends up different.
   */
  readonly onSelect?: ((details: ListboxSelectDetails) => void) | undefined;
}

export interface ResolvedListboxMachineProps extends ListboxMachineProps {
  readonly orientation: Orientation;
  readonly selectionMode: ListboxSelectionMode;
  readonly deselectable: boolean;
  readonly loopFocus: boolean;
  readonly typeahead: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface ListboxItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  /** Feeds the typeahead and `data-label` — the sheet reserves a width from it. */
  readonly label?: string | undefined;
}

export interface ListboxItemGroupProps {
  readonly id: string;
  /**
   * **A flag, not the text.** Say it when the group renders an
   * `itemGroupLabel`; left out, no `aria-labelledby` is written at all, because a
   * dangling IDREF names nothing and axe only ever grades it `incomplete`.
   */
  readonly label?: boolean | undefined;
}

export interface ListboxItemGroupLabelProps {
  readonly htmlFor: string;
}

export interface ListboxItemIndicatorProps {
  readonly value: string;
}

export interface ListboxSchema extends MachineSchema {
  state: "idle";
  props: ResolvedListboxMachineProps;
  context: {
    value: readonly string[];
    highlightedValue: string | null;
    focusSource: InputModality | null;
    /** `-1` until the collection has been read — see `syncItems`. */
    itemCount: number;
    hasLabel: boolean;
    /** The single tab stop, published as a value: DOM order decides it. */
    tabbableValue: string | null;
  };
  refs: {
    /** Where a range extension measures from. No render depends on it. */
    anchor: string | null;
    typeahead: TypeaheadState;
    /** The collection as of the last sync — the focus rescue reads it. */
    orderedValues: readonly string[];
  };
  computed: {
    multiple: boolean;
    followFocus: boolean;
  };
  event:
    | { type: "ITEM.CLICK"; value: string; shift: boolean; toggle: boolean }
    | { type: "ITEM.FOCUS"; value: string }
    | { type: "CONTENT.BLUR" }
    | { type: "HIGHLIGHT.MOVE"; action: RovingAction; extend?: boolean; quiet?: boolean }
    | { type: "HIGHLIGHT.PAGE"; delta: -1 | 1; extend?: boolean }
    | { type: "HIGHLIGHT.SET"; value: string | null }
    | { type: "ITEM.TOGGLE"; value?: string }
    | { type: "SELECTION.SELECT"; value: string }
    | { type: "SELECTION.EXTEND"; value?: string }
    | { type: "SELECTION.ALL" }
    | { type: "SELECTION.CLEAR" }
    | { type: "VALUE.SET"; value: readonly string[] }
    | { type: "TYPEAHEAD.KEY"; key: string }
    | { type: "ITEMS.SYNC" };
  action:
    | "highlightItem"
    | "adoptFocus"
    | "clearFocusSource"
    | "moveHighlight"
    | "pageHighlight"
    | "setHighlight"
    | "focusHighlighted"
    | "applyClick"
    | "selectItem"
    | "toggleItem"
    | "extendToItem"
    | "selectAllItems"
    | "clearSelection"
    | "setValue"
    | "typeaheadHighlight"
    | "syncItems";
  guard: "isInteractive" | "isMultiple" | "isItemEnabled" | "isTypeaheadEnabled";
  effect: "trackModality" | "trackItems" | "trackScrollEdges" | "captureIntents";
}

export interface ListboxApi<T extends PropTypes = PropTypes> {
  readonly value: readonly string[];
  readonly highlightedValue: string | null;
  readonly selectionMode: ListboxSelectionMode;
  readonly disabled: boolean;
  readonly empty: boolean;
  setValue(value: readonly string[]): void;
  setHighlightedValue(value: string | null): void;
  /** Replaces the selection, in both modes. */
  select(value: string): void;
  /** Ctrl/Cmd-click, and the pad's X button. */
  toggle(value: string): void;
  /** A no-op in single mode, where "all" is not a selection. */
  selectAll(): void;
  clearSelection(): void;
  isSelected(value: string): boolean;

  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getContentProps(): T["element"];
  getItemGroupProps(props: ListboxItemGroupProps): T["element"];
  getItemGroupLabelProps(props: ListboxItemGroupLabelProps): T["element"];
  getItemProps(props: ListboxItemProps): T["element"];
  getItemTextProps(): T["element"];
  getItemIndicatorProps(props: ListboxItemIndicatorProps): T["element"];
}
