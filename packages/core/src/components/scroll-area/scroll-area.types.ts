import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, Orientation } from "../../types";

export type ScrollAreaOrientation = Orientation | "both";

export type ScrollAxis = "x" | "y";

export interface ScrollAreaMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Which bars are drawn; the sheet hides the overflow of an axis with no bar. Defaults to `vertical`. */
  readonly orientation?: ScrollAreaOrientation | undefined;
  /** Keeps the bars visible instead of letting them fade after a scroll. */
  readonly always?: boolean | undefined;
  /** How long the bars stay up after the last scroll, in ms. */
  readonly hideDelay?: number | undefined;
  readonly label?: string | undefined;
  readonly labelledBy?: string | undefined;
}

export interface ResolvedScrollAreaMachineProps extends ScrollAreaMachineProps {
  readonly orientation: ScrollAreaOrientation;
  readonly always: boolean;
  readonly hideDelay: number;
}

export interface ScrollAreaScrollToOptions {
  /** Distance from the block start, in px. */
  readonly top?: number | undefined;
  /** Distance from the inline start, in px, whichever way the line runs. */
  readonly left?: number | undefined;
}

export interface ScrollAreaSchema extends MachineSchema {
  state: "idle" | "scrolling" | "lingering" | "dragging";
  props: ResolvedScrollAreaMachineProps;
  context: {
    viewportX: number;
    viewportY: number;
    contentX: number;
    contentY: number;
    /** Distance from the inline start: RTL is folded into the same `0..max` range. */
    offsetX: number;
    offsetY: number;
    hoverAxis: ScrollAxis | null;
    hasFocusable: boolean;
    viewportFocused: boolean;
    dragAxis: ScrollAxis | null;
  };
  computed: {
    overflowX: boolean;
    overflowY: boolean;
    corner: boolean;
    thumbSizeX: number;
    thumbSizeY: number;
    thumbOffsetX: number;
    thumbOffsetY: number;
  };
  refs: {
    dragStart: number | null;
  };
  event:
    | {
        type: "VIEWPORT.SCROLL";
        offsetX: number;
        offsetY: number;
      }
    | {
        type: "VIEWPORT.RESIZE";
        viewportX: number;
        viewportY: number;
        contentX: number;
        contentY: number;
        offsetX: number;
        offsetY: number;
      }
    | { type: "CONTENT.FOCUSABLES"; has: boolean }
    | { type: "VIEWPORT.FOCUS" }
    | { type: "VIEWPORT.BLUR" }
    | { type: "SCROLLBAR.POINTERENTER"; axis: ScrollAxis }
    | { type: "SCROLLBAR.POINTERLEAVE"; axis: ScrollAxis }
    | { type: "THUMB.DRAG_START"; axis: ScrollAxis; offset: number }
    | { type: "THUMB.DRAG"; position: number }
    | { type: "THUMB.DRAG_END"; position: number }
    | { type: "THUMB.DRAG_CANCEL" }
    | { type: "TRACK.PAGE"; axis: ScrollAxis; direction: 1 | -1 }
    | { type: "HIDE.TIMEOUT" };
  action:
    | "setOffsets"
    | "setMetrics"
    | "setFocusables"
    | "setViewportFocus"
    | "setHovering"
    | "clearHovering"
    | "clearHoverAxis"
    | "beginDrag"
    | "updateDrag"
    | "endDrag"
    | "cancelDrag"
    | "pageTrack";
  guard: "isAlways" | "canDrag" | "restartsHide";
  effect:
    | "trackScroll"
    | "observeResize"
    | "trackFocusables"
    | "trackViewportFocus"
    | "warnIfAnonymous"
    | "trackPointer"
    | "armHideTimer";
}

export interface ScrollAreaApi<T extends PropTypes = PropTypes> {
  readonly overflowX: boolean;
  readonly overflowY: boolean;
  readonly scrolling: boolean;
  readonly dragging: boolean;
  scrollTo(options: ScrollAreaScrollToOptions): void;
  getRootProps(): T["element"];
  getViewportProps(): T["element"];
  getContentProps(): T["element"];
  getScrollbarProps(options: { orientation: Orientation }): T["element"];
  getThumbProps(options: { orientation: Orientation }): T["element"];
  getCornerProps(): T["element"];
}
