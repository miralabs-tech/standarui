/**
 * The arithmetic of a bounded numeric range, as pure functions. Nothing here
 * reads a document, a service or a prop accessor — which is what lets the snap,
 * the multi-thumb constraint and the point→percent conversion be tested in the
 * `unit` project, with no page anywhere.
 *
 * It sits outside `components/` because `slider` is the first consumer, not the
 * only one: `range-slider` is the same arithmetic with two thumbs already
 * handled below, and any scrubber or rating control lands on `constrainValue`
 * and `getPercentFromPoint` unchanged. Per the CDC §5.1 amendment of 2026-08-28,
 * a shared layer with a single consumer carries its own budget line rather than
 * disappearing from every component's — see `scripts/size-budget.ts`.
 *
 * Two of these carry the traps the pattern is famous for.
 *
 * **The snap has to round twice.** `Math.round((v - min) / step) * step + min` is
 * the textbook formula and it produces `0.30000000000000004` for `step: 0.1`,
 * which then reaches `aria-valuenow` and a screen reader reads it out. The second
 * rounding is to the precision the inputs themselves declare.
 *
 * **The vertical axis has no writing order.** `getPercentFromPoint` inverts it
 * always, because 0 % sits at the bottom whatever the direction — independently
 * of the RTL inversion, which only ever touches the horizontal one.
 */

import type { Direction, Orientation, Rect } from "../types";

/** Explicit positions, a count of evenly spaced ticks, or one tick per step. */
export type RangeMarks = readonly number[] | number | "step";

/** Everything the constraint arithmetic needs, and nothing else. */
export interface RangeBounds {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly minStepsBetweenThumbs: number;
}

export interface RangePointOptions {
  readonly rect: Rect;
  readonly orientation: Orientation;
  readonly dir: Direction;
  /** Thumb extent along the axis — 0 when the thumb is centred on the value. */
  readonly thumbSize: number;
}

/** `marks: "step"` on a tiny step is a mistake, not a design. */
const MAX_MARKS = 256;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function decimalCount(value: number): number {
  const dot = String(value).indexOf(".");
  return dot === -1 ? 0 : String(value).length - dot - 1;
}

export function roundToPrecision(value: number, decimals: number): number {
  if (decimals <= 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Nearest multiple of `step` counted from `min`, then rounded back to sanity. */
export function snapToStep(value: number, min: number, step: number): number {
  if (!(step > 0)) return value;
  const snapped = Math.round((value - min) / step) * step + min;
  return roundToPrecision(snapped, Math.max(decimalCount(step), decimalCount(min)));
}

/**
 * Clamp, snap, clamp. The second clamp is not redundant: snapping a value that
 * sits just under a `max` which is not itself on the step grid pushes it over.
 */
export function constrainValue(value: number, range: RangeBounds): number {
  const snapped = snapToStep(clamp(value, range.min, range.max), range.min, range.step);
  return clamp(snapped, range.min, range.max);
}

/**
 * The one normalisation the props go through. A scalar is an ergonomic shorthand
 * for a one-thumb control; the context never sees it.
 */
export function toValueArray(
  input: number | readonly number[] | undefined,
  fallback = 0,
): number[] {
  if (input === undefined) return [fallback];
  return typeof input === "number" ? [input] : [...input];
}

/** Constrains every thumb, then pushes the array back into ascending order. */
export function normalizeValues(values: readonly number[], range: RangeBounds): number[] {
  const result = values.map((value) => constrainValue(value, range));
  const spacing = range.minStepsBetweenThumbs * range.step;
  for (let index = 1; index < result.length; index++) {
    const floor = (result[index - 1] ?? range.min) + spacing;
    if ((result[index] ?? range.min) < floor) result[index] = clamp(floor, range.min, range.max);
  }
  return result;
}

/**
 * Writing one thumb, bounded by its neighbours. With a single thumb the
 * neighbours are `min` and `max` and the whole thing collapses to a clamp — which
 * is why `range-slider` costs nothing extra later.
 */
export function setValueAtIndex(
  values: readonly number[],
  index: number,
  next: number,
  range: RangeBounds,
): number[] {
  const result = [...values];
  if (index < 0 || index >= result.length) return result;
  const spacing = range.minStepsBetweenThumbs * range.step;
  const last = result.length - 1;
  const low = index === 0 ? range.min : (result[index - 1] ?? range.min) + spacing;
  const high = index === last ? range.max : (result[index + 1] ?? range.max) - spacing;
  result[index] = clamp(constrainValue(next, range), Math.min(low, high), Math.max(low, high));
  return result;
}

/** 0…1, clamped: a controlled value outside the range still paints inside it. */
export function toPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

export function fromPercent(percent: number, min: number, max: number): number {
  return min + percent * (max - min);
}

export function resolveLargeStep(
  requested: number | undefined,
  min: number,
  max: number,
  step: number,
): number {
  if (requested !== undefined && requested > 0) return Math.max(requested, step);
  return Math.max(snapToStep((max - min) / 10, 0, step), step);
}

/**
 * Viewport point → 0…1 along the control. Two inversions, and they are
 * independent: RTL flips the horizontal axis, and the vertical axis is flipped
 * always, because 0 % sits at the bottom whatever the writing direction.
 */
export function getPercentFromPoint(x: number, y: number, options: RangePointOptions): number {
  const { rect, orientation, dir, thumbSize } = options;
  const vertical = orientation === "vertical";
  // A contained thumb: its centre travels between the two half-thumb insets, so
  // the usable track is shorter than the control by exactly one thumb.
  const travel = Math.max((vertical ? rect.height : rect.width) - thumbSize, 0);
  if (travel === 0) return 0;
  const ratio = ((vertical ? y - rect.y : x - rect.x) - thumbSize / 2) / travel;
  return clamp(vertical || dir === "rtl" ? 1 - ratio : ratio, 0, 1);
}

export function resolveMarks(
  marks: RangeMarks | undefined,
  min: number,
  max: number,
  step: number,
): number[] {
  if (marks === undefined) return [];
  if (Array.isArray(marks)) return [...marks];

  const stepped = marks === "step";
  const total = stepped ? Math.floor((max - min) / step) + 1 : (marks as number);
  if (total < 2) return total < 1 ? [] : [min];
  const count = Math.min(total, MAX_MARKS);
  const gap = stepped ? step : (max - min) / (count - 1);
  // Capped: an evenly spaced gap is rarely a round number, and `10 ** 16` is past
  // the point where the rounding trick stops rounding anything.
  const decimals = Math.min(Math.max(decimalCount(gap), decimalCount(min)), 6);
  return Array.from({ length: count }, (_, index) => roundToPrecision(min + index * gap, decimals));
}
