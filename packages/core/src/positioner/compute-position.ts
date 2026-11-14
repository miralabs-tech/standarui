/**
 * Anchor positioning, written here rather than taken from Floating UI: it is the
 * single biggest dependency Zag carries, and the budget for it is 3 kB (CDC D7).
 *
 * The whole thing is a pure function of three rectangles. No DOM, no measuring,
 * no scheduling — those live in `track-position`. That is what makes flip, shift
 * and arrow placement testable as arithmetic instead of as screenshots.
 *
 * The input placement is logical — `start` is the left edge in LTR and the right
 * edge in RTL — and everything returned is physical, because that is what the
 * arrow, the transform origin and `data-side` / `data-align` all need.
 */

import type { Direction, Rect } from "../types";

export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";
export type Placement = Side | `${Side}-${Align}`;

export interface PositionOptions {
  readonly placement?: Placement | undefined;
  /** Distance from the anchor along the main axis. */
  readonly gap?: number | undefined;
  /** Nudge along the cross axis, before any shifting. */
  readonly offset?: number | undefined;
  /** Flip to the opposite side when the preferred one overflows. */
  readonly flip?: boolean | undefined;
  /**
   * Where to go when the preferred placement does not fit, in order of
   * preference. Left unset the list is the opposite side alone, which is the only
   * thing this function knew how to try before — so a caller that asks for nothing
   * gets the answer it always got.
   *
   * The list is what lets a surface leave its **axis**: a submenu that fits on
   * neither side has no opposite left to try, and without a perpendicular
   * candidate it stays where it does not fit and is cropped by the stylesheet's
   * own `max-inline-size` instead — a position error turned into a width error.
   */
  readonly fallbackPlacements?: readonly Placement[] | undefined;
  /** Slide along the cross axis to stay inside the boundary. */
  readonly shift?: boolean | undefined;
  /** Breathing room kept between the surface and the boundary. */
  readonly padding?: number | undefined;
  readonly arrowSize?: number | undefined;
  /** Keeps the arrow away from a rounded corner. */
  readonly arrowPadding?: number | undefined;
  /**
   * Floor the surface at the anchor's width. A **floor**, never an identity: a
   * surface that needs more room keeps its own width, because clamping it down
   * is how a select ends up ellipsising every row it was opened to show.
   */
  readonly matchWidth?: boolean | undefined;
  readonly dir?: Direction | undefined;
}

export interface ArrowPosition {
  readonly x: number;
  readonly y: number;
}

export interface PositionResult {
  readonly x: number;
  readonly y: number;
  readonly placement: Placement;
  readonly side: Side;
  readonly align: Align;
  readonly arrow: ArrowPosition | null;
  /** For `--sui-transform-origin`: growth starts at the anchor. */
  readonly transformOrigin: string;
  /**
   * The width to write on the surface, and `null` whenever it already has the
   * one it should keep — `matchWidth` off, or a surface wider than its anchor.
   */
  readonly width: number | null;
  /** True when the surface had to leave its preferred side. */
  readonly flipped: boolean;
  /**
   * Room left for the surface once it sits on `side`, main axis measured from the
   * anchor edge and cross axis from the boundary. Published as
   * `--sui-available-width` / `--sui-available-height` so a surface taller than
   * its room can cap itself in CSS — which it cannot do alone, the stylesheet
   * having no idea where the anchor is.
   */
  readonly availableWidth: number;
  readonly availableHeight: number;
}

const OPPOSITE: Readonly<Record<Side, Side>> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function parsePlacement(placement: Placement): { side: Side; align: Align } {
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];
  return { side, align };
}

function isVertical(side: Side): boolean {
  return side === "top" || side === "bottom";
}

/** `start`/`end` are logical; only the horizontal axis flips in RTL. */
function resolveAlign(align: Align, side: Side, dir: Direction): Align {
  if (align === "center" || !isVertical(side) || dir !== "rtl") return align;
  return align === "start" ? "end" : "start";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function coordsFor(
  anchor: Rect,
  floating: Rect,
  side: Side,
  align: Align,
  gap: number,
  offset: number,
): { x: number; y: number } {
  if (isVertical(side)) {
    const y = side === "top" ? anchor.y - floating.height - gap : anchor.y + anchor.height + gap;
    const x =
      align === "start"
        ? anchor.x
        : align === "end"
          ? anchor.x + anchor.width - floating.width
          : anchor.x + (anchor.width - floating.width) / 2;
    return { x: x + offset, y };
  }

  const x = side === "left" ? anchor.x - floating.width - gap : anchor.x + anchor.width + gap;
  const y =
    align === "start"
      ? anchor.y
      : align === "end"
        ? anchor.y + anchor.height - floating.height
        : anchor.y + (anchor.height - floating.height) / 2;
  return { x, y: y + offset };
}

/** How far past each edge of the boundary the surface would sit. Positive overflows. */
function overflowOn(
  side: Side,
  x: number,
  y: number,
  floating: Rect,
  boundary: Rect,
  padding: number,
): number {
  switch (side) {
    case "top":
      return boundary.y + padding - y;
    case "bottom":
      return y + floating.height - (boundary.y + boundary.height - padding);
    case "left":
      return boundary.x + padding - x;
    case "right":
      return x + floating.width - (boundary.x + boundary.width - padding);
  }
}

/**
 * Room the surface has once it is committed to `side`. The main axis is measured
 * from the anchor edge outwards, because that is the space the surface actually
 * grows into; the cross axis is the boundary itself, because shifting can use all
 * of it. Never negative: an anchor already outside its boundary means no room,
 * not room owed.
 */
function availableSpace(
  side: Side,
  anchor: Rect,
  boundary: Rect,
  gap: number,
  padding: number,
): { width: number; height: number } {
  const crossWidth = Math.max(0, boundary.width - padding * 2);
  const crossHeight = Math.max(0, boundary.height - padding * 2);

  switch (side) {
    case "top":
      return { width: crossWidth, height: Math.max(0, anchor.y - gap - (boundary.y + padding)) };
    case "bottom":
      return {
        width: crossWidth,
        height: Math.max(
          0,
          boundary.y + boundary.height - padding - (anchor.y + anchor.height + gap),
        ),
      };
    case "left":
      return { width: Math.max(0, anchor.x - gap - (boundary.x + padding)), height: crossHeight };
    case "right":
      return {
        width: Math.max(0, boundary.x + boundary.width - padding - (anchor.x + anchor.width + gap)),
        height: crossHeight,
      };
  }
}

function transformOriginFor(side: Side, align: Align): string {
  if (isVertical(side)) {
    const y = side === "top" ? "bottom" : "top";
    const x = align === "center" ? "center" : align === "start" ? "left" : "right";
    return `${x} ${y}`;
  }
  const x = side === "left" ? "right" : "left";
  const y = align === "center" ? "center" : align === "start" ? "top" : "bottom";
  return `${x} ${y}`;
}

/**
 * The origin once the cross axis has been clamped, where the alignment keyword no
 * longer describes anything: a surface shifted 134px away from its trigger still
 * said `left top`, so it grew out of a corner nowhere near the thing that opened
 * it. Measured against the anchor's centre and clamped into the surface, so the
 * growth still starts at the anchor — which is the whole promise of this field.
 */
function shiftedOriginFor(side: Side, anchor: Rect, x: number, y: number, floating: Rect): string {
  if (isVertical(side)) {
    const cross = clamp(anchor.x + anchor.width / 2 - x, 0, floating.width);
    return `${Math.round(cross)}px ${side === "top" ? "bottom" : "top"}`;
  }
  const cross = clamp(anchor.y + anchor.height / 2 - y, 0, floating.height);
  return `${side === "left" ? "right" : "left"} ${Math.round(cross)}px`;
}

export function computePosition(
  anchor: Rect,
  floating: Rect,
  boundary: Rect,
  options: PositionOptions = {},
): PositionResult {
  const { side: preferredSide, align: rawAlign } = parsePlacement(options.placement ?? "bottom");
  const dir = options.dir ?? "ltr";
  const align = resolveAlign(rawAlign, preferredSide, dir);
  const gap = options.gap ?? 0;
  const offset = options.offset ?? 0;
  const padding = options.padding ?? 0;
  // A floor, and it used to be an identity — which is the defect it was written
  // over: a 190px list clamped onto a 140px trigger truncated all five of its
  // rows and both of its headings. Native desktop menus answer flatly against the
  // identity too: they are 18-40px wider than their buttons, and
  // three different button widths sit under one identical menu width.
  //
  // `sized` stays max(anchor, floating) in both branches — the anchor's width
  // when the surface is narrower, the surface's own when it is not — so flip,
  // shift and the arrow clamp see exactly the box they always did.
  const width = options.matchWidth === true && floating.width < anchor.width ? anchor.width : null;
  const sized = width === null ? floating : { ...floating, width };

  let side = preferredSide;
  let placed = align;
  let { x, y } = coordsFor(anchor, sized, side, placed, gap, offset);

  if (options.flip !== false) {
    let overflow = overflowOn(side, x, y, sized, boundary, padding);
    if (overflow > 0) {
      const fallbacks =
        options.fallbackPlacements === undefined
          ? [{ side: OPPOSITE[side], align }]
          : options.fallbackPlacements.map((placement) => {
              const parsed = parsePlacement(placement);
              return { side: parsed.side, align: resolveAlign(parsed.align, parsed.side, dir) };
            });

      // Each candidate in turn, and the first that fits wins. Only ever moving to
      // something *better* is what keeps the old single-candidate behaviour intact:
      // flipping into a worse overflow is how a popover ends up half off-screen at
      // the top instead of at the bottom.
      for (const candidate of fallbacks) {
        const coords = coordsFor(anchor, sized, candidate.side, candidate.align, gap, offset);
        const candidateOverflow = overflowOn(
          candidate.side,
          coords.x,
          coords.y,
          sized,
          boundary,
          padding,
        );
        if (candidateOverflow < overflow) {
          side = candidate.side;
          placed = candidate.align;
          x = coords.x;
          y = coords.y;
          overflow = candidateOverflow;
        }
        if (overflow <= 0) break;
      }
    }
  }

  // Whether the cross axis had to be clamped, which is what makes the alignment
  // keyword stop describing where the surface actually is.
  let shifted = false;
  if (options.shift !== false) {
    if (isVertical(side)) {
      const min = boundary.x + padding;
      const max = boundary.x + boundary.width - padding - sized.width;
      const next = max >= min ? clamp(x, min, max) : min;
      shifted = next !== x;
      x = next;
    } else {
      const min = boundary.y + padding;
      const max = boundary.y + boundary.height - padding - sized.height;
      const next = max >= min ? clamp(y, min, max) : min;
      shifted = next !== y;
      y = next;
    }
  }

  const arrowSize = options.arrowSize ?? 0;
  let arrow: ArrowPosition | null = null;
  if (arrowSize > 0) {
    const arrowPadding = options.arrowPadding ?? 0;
    if (isVertical(side)) {
      // Centred on the anchor, then kept off the rounded corners.
      const centre = anchor.x + anchor.width / 2 - x - arrowSize / 2;
      const max = sized.width - arrowSize - arrowPadding;
      arrow = { x: max >= arrowPadding ? clamp(centre, arrowPadding, max) : centre, y: 0 };
    } else {
      const centre = anchor.y + anchor.height / 2 - y - arrowSize / 2;
      const max = sized.height - arrowSize - arrowPadding;
      arrow = { x: 0, y: max >= arrowPadding ? clamp(centre, arrowPadding, max) : centre };
    }
  }

  const available = availableSpace(side, anchor, boundary, gap, padding);

  return {
    x: Math.round(x),
    y: Math.round(y),
    placement: placed === "center" ? side : `${side}-${placed}`,
    side,
    align: placed,
    arrow,
    transformOrigin: shifted
      ? shiftedOriginFor(side, anchor, x, y, sized)
      : transformOriginFor(side, placed),
    width,
    flipped: side !== preferredSide,
    availableWidth: available.width,
    availableHeight: available.height,
  };
}
