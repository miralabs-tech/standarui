import { isDev } from "../utils/env";
import { warn } from "../utils/invariant";
import type { VirtualItem, VirtualRange } from "./virtualizer";

export interface VirtualIndexOptions {
  readonly count: number;
  readonly estimateSize: (index: number) => number;
  readonly paddingStart?: number | undefined;
  readonly gap?: number | undefined;
}

export interface VirtualIndex {
  readonly dirtyFrom: number;
  setCount(count: number): void;
  setSize(index: number, size: number): boolean;
  sizeOf(index: number): number;
  offsetOf(index: number): number;
  totalSize(): number;
  findIndex(offset: number): number;
  range(viewportSize: number, scrollOffset: number, overscan?: number): VirtualRange;
}

const DEFAULT_OVERSCAN = 3;

let warned = false;

export function createVirtualIndex(options: VirtualIndexOptions): VirtualIndex {
  function finite(value: number): number {
    if (Number.isFinite(value) && value >= 0) return value;
    warn(isDev() && !warned, `createVirtualIndex: ${value} is not a size, read as 0`);
    warned = true;
    return 0;
  }

  const estimateSize = (index: number): number => finite(options.estimateSize(index));
  const paddingStart = finite(options.paddingStart ?? 0);
  const gap = finite(options.gap ?? 0);

  let count = 0;
  const sizes: number[] = [];
  const starts: number[] = [paddingStart];
  let dirtyFrom = Number.POSITIVE_INFINITY;

  function setCount(next: number): void {
    const target = Math.floor(finite(next));
    if (target === count) return;
    if (target < count) {
      sizes.length = target;
      starts.length = target + 1;
      dirtyFrom = Math.min(dirtyFrom, target + 1);
    } else {
      for (let index = count; index < target; index++) sizes.push(estimateSize(index));
      dirtyFrom = Math.min(dirtyFrom, count + 1);
    }
    count = target;
  }

  function settle(): void {
    if (dirtyFrom > count) return;
    for (let index = dirtyFrom; index <= count; index++) {
      starts[index] = (starts[index - 1] ?? 0) + (sizes[index - 1] ?? 0) + gap;
    }
    dirtyFrom = Number.POSITIVE_INFINITY;
  }

  function totalSize(): number {
    if (count <= 0) return 0;
    settle();
    return (starts[count] ?? 0) - gap;
  }

  function findIndex(offset: number): number {
    if (count <= 0) return 0;
    settle();
    let low = 0;
    let high = count - 1;
    let result = count - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if ((starts[middle + 1] ?? 0) - gap > offset) {
        result = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    return result;
  }

  function lastStartBefore(limit: number, from: number): number {
    let low = from;
    let high = count - 1;
    let result = from;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if ((starts[middle] ?? 0) < limit) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  }

  setCount(options.count);

  return {
    get dirtyFrom(): number {
      return dirtyFrom;
    },
    setCount,
    setSize(index, size) {
      const clean = finite(size);
      if (index < 0 || index >= count || sizes[index] === clean) return false;
      sizes[index] = clean;
      dirtyFrom = Math.min(dirtyFrom, index + 1);
      return true;
    },
    sizeOf(index) {
      return sizes[index] ?? 0;
    },
    offsetOf(index) {
      settle();
      return starts[Math.max(0, Math.min(index, count))] ?? paddingStart;
    },
    totalSize,
    findIndex,
    range(viewportSize, scrollOffset, overscan = DEFAULT_OVERSCAN): VirtualRange {
      if (count <= 0) return { startIndex: 0, endIndex: -1, totalSize: 0, items: [] };

      const total = totalSize();
      const clamped = Math.max(0, Math.min(scrollOffset, Math.max(0, total - viewportSize)));
      const firstVisible = findIndex(clamped);
      const lastVisible = lastStartBefore(clamped + viewportSize, firstVisible);

      const startIndex = Math.max(0, firstVisible - overscan);
      const endIndex = Math.min(count - 1, lastVisible + overscan);

      const items: VirtualItem[] = [];
      for (let index = startIndex; index <= endIndex; index++) {
        const start = starts[index] ?? 0;
        const size = sizes[index] ?? 0;
        items.push({ index, start, size, end: start + size });
      }
      return { startIndex, endIndex, totalSize: total, items };
    },
  };
}
