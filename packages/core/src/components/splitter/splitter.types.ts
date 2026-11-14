import type { EngageIntent, IntentScopeHost } from "@standarx/nav";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";

export type SplitterUnit = "px" | "%";

export type SplitterPanelSide = "start" | "end";

export interface SplitterSizeChangeDetails {
  readonly size: number;
}

export interface SplitterCollapsedChangeDetails {
  readonly collapsed: boolean;
}

export interface SplitterValueTextDetails {
  readonly size: number;
  readonly collapsed: boolean;
}

export interface SplitterMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** The axis the panels are laid out on: `horizontal` is side by side, and the handle announces the perpendicular `vertical`. */
  readonly orientation?: Orientation | undefined;
  /** Which side of the handle the controlled panel sits on. */
  readonly panelSide?: SplitterPanelSide | undefined;
  readonly unit?: SplitterUnit | undefined;
  readonly min?: number | undefined;
  /** Required in practice under `unit: "px"`: an `aria-valuemax` has to be a finite number, and the default of 100 is a hundred pixels. */
  readonly max?: number | undefined;
  /** What an arrow key moves by, in `unit`. Defaults to 1 for `%` and 10 for `px`. Never snaps a size set by a drag or by `defaultSize`. */
  readonly step?: number | undefined;
  readonly size?: number | undefined;
  readonly defaultSize?: number | undefined;
  readonly onSizeChange?: ((details: SplitterSizeChangeDetails) => void) | undefined;
  /** Once at the end of a user action (a drag, a keyboard step, Enter, a double-click, a gamepad hold) that left the size or the collapsed state different from where it began, with the size just written. Nothing when the action ended where it began. */
  readonly onSizeChangeEnd?: ((details: SplitterSizeChangeDetails) => void) | undefined;
  readonly collapsible?: boolean | undefined;
  /** The size the panel paints while collapsed, in `unit`. */
  readonly collapsedSize?: number | undefined;
  readonly collapsed?: boolean | undefined;
  readonly defaultCollapsed?: boolean | undefined;
  readonly onCollapsedChange?: ((details: SplitterCollapsedChangeDetails) => void) | undefined;
  /** Double-click on the handle restores `defaultSize`. Defaults to `true`. */
  readonly resetOnDoubleClick?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly labelledBy?: string | undefined;
  /** Wins over the bare number `aria-valuenow` carries. */
  readonly getValueText?: ((details: SplitterValueTextDetails) => string) | undefined;
  /** The intent bus engage mode pushes its scope onto. `null` disables the pad. */
  readonly intents?: IntentScopeHost | null | undefined;
}

export interface ResolvedSplitterMachineProps extends SplitterMachineProps {
  readonly orientation: Orientation;
  readonly panelSide: SplitterPanelSide;
  readonly unit: SplitterUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultSize: number;
  readonly collapsible: boolean;
  readonly collapsedSize: number;
  readonly resetOnDoubleClick: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface SplitterSchema extends MachineSchema {
  state: "idle" | "focused" | "engaged";
  props: ResolvedSplitterMachineProps;
  context: {
    /** The last unfolded size: a collapsed panel keeps it, so restoring needs no ref. */
    size: number;
    collapsed: boolean;
    dragging: boolean;
    focusSource: InputModality | null;
  };
  computed: {
    isInteractive: boolean;
    currentSize: number;
    valueMin: number;
    valueText: string | undefined;
  };
  refs: {
    entrySize: number | null;
    entryCollapsed: boolean | null;
    containerSize: number | null;
    lastSize: number | null;
    lastCollapsed: boolean | null;
    originSize: number | null;
    originCollapsed: boolean | null;
  };
  event:
    | { type: "HANDLE.FOCUS" }
    | { type: "HANDLE.BLUR" }
    | { type: "HANDLE.ADJUST"; intent: EngageIntent }
    | { type: "HANDLE.TOGGLE" }
    | { type: "HANDLE.RESET" }
    | { type: "HANDLE.DRAG_START"; containerSize: number }
    | { type: "HANDLE.DRAG"; position: number }
    | { type: "HANDLE.DRAG_END"; position: number }
    | { type: "HANDLE.DRAG_CANCEL" }
    | { type: "HANDLE.ENGAGE" }
    | { type: "HANDLE.RELEASE"; committed: boolean }
    | { type: "SIZE.SET"; size: number }
    | { type: "COLLAPSED.SET"; collapsed: boolean };
  action:
    | "setSize"
    | "setCollapsed"
    | "adjustFromIntent"
    | "toggleCollapsed"
    | "resetSize"
    | "beginDrag"
    | "updateDrag"
    | "endDrag"
    | "cancelDrag"
    | "captureFocusSource"
    | "clearFocusSource"
    | "snapshotSize"
    | "restoreSize"
    | "clearSnapshot"
    | "invokeChangeEnd";
  guard:
    | "isInteractive"
    | "canToggle"
    | "canToggleMidDrag"
    | "canAdjust"
    | "canReset"
    | "canDrag"
    | "isDragging"
    | "canEngage";
  effect:
    | "trackModality"
    | "warnIfAnonymous"
    | "trackPointer"
    | "captureSelectIntent"
    | "captureEngageIntents";
}

export interface SplitterApi<T extends PropTypes = PropTypes> {
  /** The last unfolded size, in `unit`. The panel paints `collapsedSize` while `collapsed`. */
  readonly size: number;
  readonly collapsed: boolean;
  readonly dragging: boolean;
  readonly engaged: boolean;
  readonly focusVisible: boolean;
  setSize(size: number): void;
  setCollapsed(collapsed: boolean): void;
  toggle(): void;
  getPanelProps(): T["element"];
  getHandleProps(): T["element"];
}
