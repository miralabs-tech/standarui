/**
 * Windowed virtualisation as a capability of the collection, not a component
 * (research/components.md §2-9). It is a pure function of `{ count, scrollOffset,
 * viewportSize }` — no DOM, no observers, no scheduling — so a listbox, a tree and
 * a data grid all get the same answer and the maths is unit-testable.
 *
 * Measured sizes override estimates as rows are rendered, which is what keeps the
 * scrollbar honest with variable-height content. The caller owns that map: it
 * belongs in the machine's `refs`, where a mutation does not trigger a render.
 */

import { createVirtualIndex, type VirtualIndex } from "./virtual-index";

export interface VirtualizerOptions {
  readonly count: number;
  readonly viewportSize: number;
  readonly scrollOffset: number;
  readonly estimateSize: (index: number) => number;
  /** Real sizes for the rows that have been rendered and measured. */
  readonly measured?: ReadonlyMap<number, number> | undefined;
  /** Rows kept beyond each edge so a fast scroll does not show blanks. */
  readonly overscan?: number | undefined;
  readonly paddingStart?: number | undefined;
  readonly gap?: number | undefined;
}

export interface VirtualItem {
  readonly index: number;
  readonly start: number;
  readonly size: number;
  readonly end: number;
}

export interface VirtualRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalSize: number;
  readonly items: readonly VirtualItem[];
}

function indexOf(options: VirtualizerOptions): VirtualIndex {
  const { measured, estimateSize } = options;
  return createVirtualIndex({
    count: options.count,
    estimateSize: (index) => measured?.get(index) ?? estimateSize(index),
    paddingStart: options.paddingStart,
    gap: options.gap,
  });
}

export function getVirtualRange(options: VirtualizerOptions): VirtualRange {
  return indexOf(options).range(options.viewportSize, options.scrollOffset, options.overscan);
}

export interface ScrollTargetOptions {
  readonly viewportSize: number;
  readonly scrollOffset: number;
  readonly align?: "start" | "center" | "end" | "nearest" | undefined;
}

/** Where to scroll so `index` is visible, read off a live index, or `null` when it already is. */
export function getScrollTarget(
  virtual: VirtualIndex,
  count: number,
  index: number,
  options: ScrollTargetOptions,
): number | null {
  const { viewportSize, scrollOffset } = options;
  if (index < 0 || index >= count) return null;

  const start = virtual.offsetOf(index);
  const end = start + virtual.sizeOf(index);
  const align = options.align ?? "nearest";

  if (align === "start") return start;
  if (align === "end") return end - viewportSize;
  if (align === "center") return start - (viewportSize - (end - start)) / 2;

  if (start < scrollOffset) return start;
  if (end > scrollOffset + viewportSize) return end - viewportSize;
  return null;
}

/** Where to scroll so `index` is visible, or `null` when it already is. */
export function getScrollToIndex(
  index: number,
  options: VirtualizerOptions & { align?: "start" | "center" | "end" | "nearest" },
): number | null {
  if (index < 0 || index >= options.count) return null;
  return getScrollTarget(indexOf(options), options.count, index, options);
}
