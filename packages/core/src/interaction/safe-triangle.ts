/**
 * The pointer's intent, read from where it has been rather than from where it is.
 *
 * A cascading surface — a submenu, a nested `select`, a `navigation-menu` panel —
 * sits diagonally from the item that opened it, so a pointer travelling towards it
 * necessarily crosses items that are not it. Closing on that crossing is the
 * single most complained-about bug in every menu implementation that does not do
 * this, and re-opening afterwards is not the same thing: the child would flicker.
 *
 * Pure, and deliberately so — the whole rule is testable with four numbers and no
 * DOM. The trail is the caller's; this module only reads it.
 */

import type { Rect } from "../types";

export interface TrailPoint {
  readonly x: number;
  readonly y: number;
}

/** Enough to have a direction, few enough that a flick does not outlive itself. */
const DEFAULT_TRAIL_LENGTH = 3;

/** How far past the surface's edges the cone still counts as "heading in". */
const DEFAULT_PAD = 12;

export function pushTrail(
  trail: readonly TrailPoint[],
  point: TrailPoint,
  length: number = DEFAULT_TRAIL_LENGTH,
): TrailPoint[] {
  return [...trail, point].slice(-length);
}

/**
 * Whether the pointer, extended along its recent travel, would cross the near edge
 * of `rect` between its top and bottom. A cone rather than the literal triangle of
 * the classic implementation: the two are the same test, and one line of algebra
 * is cheaper than three cross products.
 */
export function isPointerHeadingTo(
  trail: readonly TrailPoint[],
  rect: Rect | null,
  pad: number = DEFAULT_PAD,
): boolean {
  if (rect === null || rect.width === 0 || trail.length < 2) return false;
  const to = trail[trail.length - 1];
  const from = trail[0];
  if (to === undefined || from === undefined) return false;

  const dx = to.x - from.x;
  if (dx === 0) return false;
  // The edge the pointer would reach first: the surface is on one side or the other.
  const distance = (rect.x >= to.x ? rect.x : rect.x + rect.width) - to.x;
  // Travelling away from it, or already past it.
  if (distance * dx <= 0) return false;

  const y = to.y + ((to.y - from.y) * distance) / dx;
  return y >= rect.y - pad && y <= rect.y + rect.height + pad;
}
