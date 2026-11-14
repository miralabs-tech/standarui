import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualIndex, type VirtualIndex } from "./virtual-index";
import { getScrollTarget, getScrollToIndex } from "./virtualizer";

function counted(size = 20): { estimateSize: (index: number) => number; calls: () => number } {
  let calls = 0;
  return {
    estimateSize: () => {
      calls += 1;
      return size;
    },
    calls: () => calls,
  };
}

describe("createVirtualIndex", () => {
  it("sums the estimated sizes into offsets and a total", () => {
    const index = createVirtualIndex({ count: 5, estimateSize: (row) => (row + 1) * 10 });

    expect([0, 1, 2, 3, 4, 5].map((row) => index.offsetOf(row))).toEqual([0, 10, 30, 60, 100, 150]);
    expect(index.totalSize()).toBe(150);
    expect(index.sizeOf(2)).toBe(30);
    expect(index.sizeOf(9)).toBe(0);
  });

  it("reports a size change, and none when the size is the same", () => {
    const index = createVirtualIndex({ count: 4, estimateSize: () => 20 });

    expect(index.setSize(1, 50)).toBe(true);
    expect(index.setSize(1, 50)).toBe(false);
    expect(index.setSize(2, 20)).toBe(false);
    expect(index.setSize(9, 50)).toBe(false);
    expect(index.setSize(-1, 50)).toBe(false);
    expect(index.offsetOf(2)).toBe(70);
    expect(index.totalSize()).toBe(110);
  });

  it("recomputes lazily, from the row after the lowest one that changed", () => {
    const index = createVirtualIndex({ count: 10, estimateSize: () => 10 });
    index.totalSize();
    expect(index.dirtyFrom).toBe(Number.POSITIVE_INFINITY);

    index.setSize(6, 30);
    expect(index.dirtyFrom).toBe(7);
    index.setSize(3, 30);
    expect(index.dirtyFrom).toBe(4);
    index.setSize(8, 30);
    expect(index.dirtyFrom).toBe(4);

    expect(index.offsetOf(4)).toBe(60);
    expect(index.dirtyFrom).toBe(Number.POSITIVE_INFINITY);
    expect(index.totalSize()).toBe(160);
  });

  it("finds the row under an offset, at the edges and between two rows", () => {
    const index = createVirtualIndex({ count: 5, estimateSize: () => 10, gap: 4 });

    expect(index.findIndex(-50)).toBe(0);
    expect(index.findIndex(0)).toBe(0);
    expect(index.findIndex(9)).toBe(0);
    expect(index.findIndex(10)).toBe(1);
    expect(index.findIndex(13)).toBe(1);
    expect(index.findIndex(14)).toBe(1);
    expect(index.findIndex(24)).toBe(2);
    expect(index.findIndex(1e6)).toBe(4);
  });

  it("returns the window with its overscan, clamped to both ends", () => {
    const index = createVirtualIndex({ count: 1000, estimateSize: () => 20 });

    const middle = index.range(200, 400, 2);
    expect(middle.startIndex).toBe(18);
    expect(middle.endIndex).toBe(31);
    expect(middle.items[0]).toEqual({ index: 18, start: 360, size: 20, end: 380 });
    expect(middle.totalSize).toBe(20000);

    expect(index.range(200, 0, 5).startIndex).toBe(0);
    expect(index.range(200, 1e6, 5).endIndex).toBe(999);
    expect(index.range(200, 0).endIndex).toBe(12);
  });

  it("places rows after the leading padding and across the gap", () => {
    const index = createVirtualIndex({
      count: 3,
      estimateSize: () => 10,
      paddingStart: 50,
      gap: 5,
    });

    const range = index.range(1000, 0, 0);
    expect(range.items.map((item) => item.start)).toEqual([50, 65, 80]);
    expect(range.items.map((item) => item.end)).toEqual([60, 75, 90]);
    expect(index.totalSize()).toBe(50 + 30 + 10);
  });

  it("shortens the list and grows it again with fresh estimates", () => {
    const index = createVirtualIndex({ count: 10, estimateSize: () => 10 });
    index.setSize(8, 100);
    expect(index.totalSize()).toBe(190);

    index.setCount(5);
    expect(index.totalSize()).toBe(50);
    expect(index.range(30, 1000, 0).endIndex).toBe(4);

    index.setCount(8);
    expect(index.totalSize()).toBe(80);
    expect(index.sizeOf(7)).toBe(10);

    index.setCount(0);
    expect(index.totalSize()).toBe(0);
    expect(index.range(100, 0)).toEqual({ startIndex: 0, endIndex: -1, totalSize: 0, items: [] });
  });

  it("does not recompute anything when it scrolls without a measure", () => {
    const probe = counted();
    const index = createVirtualIndex({ count: 10_000, estimateSize: probe.estimateSize });
    index.range(600, 0);
    const afterFirst = probe.calls();
    expect(afterFirst).toBe(10_000);

    for (let offset = 0; offset < 190_000; offset += 777) index.range(600, offset);

    expect(probe.calls()).toBe(afterFirst);
    expect(index.dirtyFrom).toBe(Number.POSITIVE_INFINITY);
  });

  it("settles a measure once, however many ranges are read after it", () => {
    const index = createVirtualIndex({ count: 10_000, estimateSize: () => 20 });
    index.range(600, 0);

    index.setSize(5_000, 80);
    expect(index.dirtyFrom).toBe(5_001);
    index.range(600, 100_000);
    expect(index.dirtyFrom).toBe(Number.POSITIVE_INFINITY);
    index.range(600, 100_100);
    expect(index.dirtyFrom).toBe(Number.POSITIVE_INFINITY);
    expect(index.totalSize()).toBe(200_060);
  });
});

describe("createVirtualIndex on inputs that are not sizes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads an estimate that is NaN, infinite or negative as 0 and warns once", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createVirtualIndex } = await import("./virtual-index");
    const estimates = [Number.NaN, 10, -5, Number.POSITIVE_INFINITY];
    const index = createVirtualIndex({ count: 4, estimateSize: (row) => estimates[row] ?? 0 });

    expect([0, 1, 2, 3].map((row) => index.sizeOf(row))).toEqual([0, 10, 0, 0]);
    expect(index.totalSize()).toBe(10);
    expect(Number.isNaN(index.range(100, 0).totalSize)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns once for the process, not once per index, however many indexes a call builds", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = await import("./virtual-index");
    const range = await import("./virtualizer");

    fresh.createVirtualIndex({ count: 2, estimateSize: () => Number.NaN }).totalSize();
    fresh.createVirtualIndex({ count: 2, estimateSize: () => Number.NaN }).totalSize();
    for (let call = 0; call < 3; call++) {
      range.getVirtualRange({
        count: 5,
        estimateSize: () => Number.NaN,
        viewportSize: 100,
        scrollOffset: 0,
      });
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reads a measure that is not a size as 0", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = createVirtualIndex({ count: 3, estimateSize: () => 10 });

    expect(index.setSize(1, Number.NaN)).toBe(true);
    expect(index.sizeOf(1)).toBe(0);
    expect(index.setSize(2, -4)).toBe(true);
    expect(index.sizeOf(2)).toBe(0);
    expect(index.totalSize()).toBe(10);
  });

  it("reads a padding or a gap that is not a size as 0", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = createVirtualIndex({
      count: 3,
      estimateSize: () => 10,
      paddingStart: Number.NaN,
      gap: -3,
    });

    expect(index.offsetOf(0)).toBe(0);
    expect(index.totalSize()).toBe(30);
  });

  it("clamps a count that is not a count to an empty list instead of looping", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = createVirtualIndex({ count: 5, estimateSize: () => 10 });

    index.setCount(Number.POSITIVE_INFINITY);
    expect(index.totalSize()).toBe(0);
    index.setCount(5);
    index.setCount(-3);
    expect(index.totalSize()).toBe(0);
    index.setCount(5);
    index.setCount(Number.NaN);
    expect(index.totalSize()).toBe(0);
    expect(
      createVirtualIndex({ count: Number.POSITIVE_INFINITY, estimateSize: () => 1 }).totalSize(),
    ).toBe(0);
  });
});

describe("getScrollTarget", () => {
  function probed(index: VirtualIndex): { index: VirtualIndex; reads: () => number } {
    let reads = 0;
    return {
      index: {
        ...index,
        sizeOf: (row) => {
          reads += 1;
          return index.sizeOf(row);
        },
        offsetOf: (row) => {
          reads += 1;
          return index.offsetOf(row);
        },
      },
      reads: () => reads,
    };
  }

  it("answers from the index it is given in a constant number of reads", () => {
    const base = createVirtualIndex({ count: 100_000, estimateSize: () => 20, gap: 2 });
    const probe = probed(base);

    const to = getScrollTarget(probe.index, 100_000, 60_000, {
      viewportSize: 300,
      scrollOffset: 0,
      align: "center",
    });

    expect(to).toBe(60_000 * 22 - (300 - 20) / 2);
    expect(probe.reads()).toBeLessThanOrEqual(3);
  });

  it("agrees with getScrollToIndex for every alignment", () => {
    const options = {
      count: 50,
      viewportSize: 100,
      scrollOffset: 200,
      estimateSize: (row: number) => 10 + (row % 4) * 5,
      paddingStart: 8,
      gap: 3,
    };
    const live = createVirtualIndex(options);

    for (const align of ["start", "center", "end", "nearest"] as const) {
      for (const row of [-1, 0, 7, 18, 49, 50]) {
        expect(
          getScrollTarget(live, 50, row, { viewportSize: 100, scrollOffset: 200, align }),
        ).toBe(getScrollToIndex(row, { ...options, align }));
      }
    }
  });
});
