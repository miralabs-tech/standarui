import { describe, expect, it } from "vitest";
import {
  type GridKeyOptions,
  getGridIndex,
  getGridKeyAction,
  getGridNextIndex,
  getGridPosition,
  getRowCount,
} from "./grid-collection";
import { createListCollection } from "./list-collection";
import {
  clearSelection,
  createSelection,
  extend,
  isSelected,
  type SelectionOptions,
  select,
  selectAll,
  toggle,
} from "./selection";
import { getScrollToIndex, getVirtualRange } from "./virtualizer";

interface Fruit {
  value: string;
  label: string;
  disabled?: boolean;
  kind?: string;
}

const fruits: Fruit[] = [
  { value: "apple", label: "Apple", kind: "pome" },
  { value: "pear", label: "Pear", kind: "pome", disabled: true },
  { value: "cherry", label: "Cherry", kind: "stone" },
  { value: "plum", label: "Plum", kind: "stone" },
];

const collection = createListCollection<Fruit>({
  items: fruits,
  isItemDisabled: (item) => item.disabled === true,
  groupBy: (item) => item.kind ?? "",
});

describe("createListCollection", () => {
  it("maps between items and values", () => {
    expect(collection.size).toBe(4);
    expect(collection.getValue(fruits[0] as Fruit)).toBe("apple");
    expect(collection.getLabel(fruits[0] as Fruit)).toBe("Apple");
    expect(collection.find("cherry")).toBe(fruits[2]);
    expect(collection.indexOf("plum")).toBe(3);
    expect(collection.indexOf("durian")).toBe(-1);
    expect(collection.find(null)).toBeNull();
  });

  it("falls back to value and label conventions", () => {
    const strings = createListCollection({ items: ["a", "b"] });
    expect(strings.getValue("a")).toBe("a");
    expect(strings.getLabel("a")).toBe("a");
  });

  it("steps over disabled items when navigating", () => {
    expect(collection.next("apple")).toBe("cherry");
    expect(collection.prev("cherry")).toBe("apple");
  });

  it("stops at the edges, and wraps only when asked", () => {
    expect(collection.next("plum")).toBeNull();
    expect(collection.next("plum", { loop: true })).toBe("apple");
    expect(collection.prev("apple")).toBeNull();
    expect(collection.prev("apple", { loop: true })).toBe("plum");
  });

  it("enters on the first and last enabled item", () => {
    expect(collection.first()).toBe("apple");
    expect(collection.last()).toBe("plum");
    expect(createListCollection({ items: [] as string[] }).first()).toBeNull();
  });

  it("groups in the author's order", () => {
    expect(collection.groups().map((group) => group.key)).toEqual(["pome", "stone"]);
    expect(collection.groups()[0]?.items).toHaveLength(2);
    expect(createListCollection({ items: ["a"] }).groups()).toEqual([{ key: "", items: ["a"] }]);
  });

  it("filters into a new collection, leaving the original alone", () => {
    const filtered = collection.filter((item) => item.kind === "stone");

    expect(filtered.values()).toEqual(["cherry", "plum"]);
    expect(filtered.next("cherry")).toBe("plum");
    expect(collection.size).toBe(4);
  });
});

describe("selection", () => {
  const single: SelectionOptions = { mode: "single" };
  const multiple: SelectionOptions = { mode: "multiple" };

  it("replaces in single mode and keeps at least one selected", () => {
    const first = select(createSelection(), "a", single);
    expect(first.value).toEqual(["a"]);

    expect(select(first, "b", single).value).toEqual(["b"]);
    expect(select(first, "a", single).value).toEqual(["a"]);
  });

  it("clears in single mode when deselectable", () => {
    const state = select(createSelection(), "a", single);

    expect(select(state, "a", { mode: "single", deselectable: true }).value).toEqual([]);
  });

  it("toggles in multiple mode", () => {
    let state = toggle(createSelection(), "a", multiple);
    state = toggle(state, "b", multiple);
    expect(state.value).toEqual(["a", "b"]);
    expect(isSelected(state, "a")).toBe(true);

    state = toggle(state, "a", multiple);
    expect(state.value).toEqual(["b"]);
    expect(state.anchor).toBe("b");
  });

  it("extends a range from the anchor, and replaces it on a second extension", () => {
    const ordered = ["a", "b", "c", "d", "e"];
    const anchored = select(createSelection(), "b", multiple);

    const range = extend(anchored, "d", ordered, multiple);
    expect(range.value).toEqual(["b", "c", "d"]);
    expect(range.anchor).toBe("b");

    expect(extend(range, "c", ordered, multiple).value).toEqual(["b", "c"]);
  });

  it("extends backwards", () => {
    const ordered = ["a", "b", "c", "d"];
    const anchored = select(createSelection(), "c", multiple);

    expect(extend(anchored, "a", ordered, multiple).value).toEqual(["a", "b", "c"]);
  });

  it("falls back to a plain selection when the anchor is gone", () => {
    const ordered = ["a", "b"];
    const stale = createSelection(["z"], "z");

    expect(extend(stale, "b", ordered, multiple).value).toEqual(["b"]);
  });

  it("ignores everything in none mode", () => {
    const state = createSelection(["a"]);

    expect(select(state, "b", { mode: "none" })).toBe(state);
    expect(toggle(state, "b", { mode: "none" })).toBe(state);
  });

  it("selects all, in multiple mode only", () => {
    const ordered = ["a", "b"];

    expect(selectAll(createSelection(), ordered, multiple).value).toEqual(ordered);
    expect(selectAll(createSelection(), ordered, single).value).toEqual([]);
    expect(clearSelection().value).toEqual([]);
  });
});

describe("grid navigation", () => {
  const grid = { count: 10, columns: 3 };

  it("maps between index and position", () => {
    expect(getGridPosition(4, 3)).toEqual({ row: 1, column: 1 });
    expect(getGridIndex({ row: 2, column: 2 }, 3)).toBe(8);
    expect(getRowCount(10, 3)).toBe(4);
  });

  it("moves in reading order horizontally", () => {
    expect(getGridNextIndex(2, "right", grid)).toBe(3);
    expect(getGridNextIndex(3, "left", grid)).toBe(2);
  });

  it("stops vertically at the edges unless looping", () => {
    expect(getGridNextIndex(1, "up", grid)).toBe(1);
    expect(getGridNextIndex(9, "down", grid)).toBe(9);
    expect(getGridNextIndex(1, "up", { ...grid, loop: true })).toBe(7);
    expect(getGridNextIndex(1, "down", grid)).toBe(4);
  });

  it("jumps to row and grid boundaries", () => {
    expect(getGridNextIndex(4, "rowStart", grid)).toBe(3);
    expect(getGridNextIndex(4, "rowEnd", grid)).toBe(5);
    expect(getGridNextIndex(4, "gridStart", grid)).toBe(0);
    expect(getGridNextIndex(4, "gridEnd", grid)).toBe(9);
    // The last row is ragged: rowEnd must not point past the end.
    expect(getGridNextIndex(9, "rowEnd", grid)).toBe(9);
  });

  it("pages by rows and clamps", () => {
    expect(getGridNextIndex(0, "pageDown", { ...grid, page: 2 })).toBe(6);
    expect(getGridNextIndex(6, "pageUp", { ...grid, page: 2 })).toBe(0);
    expect(getGridNextIndex(8, "pageDown", { ...grid, page: 2 })).toBe(8);
  });

  it("steps over disabled cells along the direction of travel", () => {
    const options = { ...grid, isDisabled: (index: number) => index === 4 || index === 5 };

    expect(getGridNextIndex(3, "right", options)).toBe(6);
    expect(getGridNextIndex(6, "left", options)).toBe(3);
  });

  it("gives up rather than spin when the whole grid is disabled", () => {
    expect(getGridNextIndex(0, "right", { ...grid, isDisabled: () => true })).toBe(0);
    expect(getGridNextIndex(0, "right", { count: 0, columns: 3 })).toBe(-1);
  });

  it("maps keys, with ctrl widening Home and End", () => {
    expect(getGridKeyAction("ArrowDown")).toBe("down");
    expect(getGridKeyAction("Home")).toBe("rowStart");
    expect(getGridKeyAction("Home", { ctrlKey: true })).toBe("gridStart");
    expect(getGridKeyAction("End", { ctrlKey: true })).toBe("gridEnd");
    expect(getGridKeyAction("a")).toBeNull();
  });

  it("reads left to right unless told otherwise", () => {
    expect(getGridKeyAction("ArrowLeft")).toBe("left");
    expect(getGridKeyAction("ArrowRight")).toBe("right");
    expect(getGridKeyAction("ArrowLeft", { dir: "ltr" })).toBe("left");
    expect(getGridKeyAction("ArrowRight", { dir: "ltr" })).toBe("right");
  });

  it("mirrors the horizontal arrows in RTL, and only those", () => {
    const rtl: GridKeyOptions = { dir: "rtl" };

    expect(getGridKeyAction("ArrowLeft", rtl)).toBe("right");
    expect(getGridKeyAction("ArrowRight", rtl)).toBe("left");
    // The vertical pair has no writing order to mirror, and Home/End are bounds
    // rather than directions — the row already reads right to left on screen, so
    // swapping them would send Home to the far end of the week. Same answer
    // `getRovingKeyAction` gives a one-dimensional composite.
    expect(getGridKeyAction("ArrowUp", rtl)).toBe("up");
    expect(getGridKeyAction("ArrowDown", rtl)).toBe("down");
    expect(getGridKeyAction("Home", rtl)).toBe("rowStart");
    expect(getGridKeyAction("End", rtl)).toBe("rowEnd");
    expect(getGridKeyAction("PageUp", rtl)).toBe("pageUp");
    expect(getGridKeyAction("PageDown", rtl)).toBe("pageDown");
  });

  it("leaves ctrl+Home and ctrl+End alone in RTL", () => {
    expect(getGridKeyAction("Home", { dir: "rtl", ctrlKey: true })).toBe("gridStart");
    expect(getGridKeyAction("End", { dir: "rtl", ctrlKey: true })).toBe("gridEnd");
  });
});

describe("virtualizer", () => {
  const base = { count: 1000, viewportSize: 200, estimateSize: () => 20 };

  it("windows the visible rows plus the overscan", () => {
    const range = getVirtualRange({ ...base, scrollOffset: 400, overscan: 2 });

    expect(range.startIndex).toBe(18);
    expect(range.endIndex).toBe(31);
    expect(range.totalSize).toBe(20000);
    expect(range.items[0]).toEqual({ index: 18, start: 360, size: 20, end: 380 });
  });

  it("does not window past the ends", () => {
    expect(getVirtualRange({ ...base, scrollOffset: 0, overscan: 5 }).startIndex).toBe(0);
    expect(getVirtualRange({ ...base, scrollOffset: 1e6, overscan: 5 }).endIndex).toBe(999);
  });

  it("prefers measured sizes over estimates", () => {
    const measured = new Map([
      [0, 100],
      [1, 100],
    ]);
    const range = getVirtualRange({ ...base, count: 4, scrollOffset: 0, measured, overscan: 0 });

    expect(range.totalSize).toBe(240);
    // Two 100px rows fill the 200px viewport exactly; row 2 starts on its edge.
    expect(range.items).toHaveLength(2);
    expect(range.items[1]).toEqual({ index: 1, start: 100, size: 100, end: 200 });
    expect(
      getVirtualRange({ ...base, count: 4, scrollOffset: 0, measured, overscan: 1 }).items[2],
    ).toEqual({ index: 2, start: 200, size: 20, end: 220 });
  });

  it("honours the leading padding", () => {
    const range = getVirtualRange({ ...base, count: 3, scrollOffset: 0, paddingStart: 50 });

    expect(range.items[0]?.start).toBe(50);
    expect(range.totalSize).toBe(110);
  });

  it("is empty on an empty collection", () => {
    expect(getVirtualRange({ ...base, count: 0, scrollOffset: 0 })).toEqual({
      startIndex: 0,
      endIndex: -1,
      totalSize: 0,
      items: [],
    });
  });

  it("scrolls only when the row is out of view", () => {
    expect(getScrollToIndex(5, { ...base, scrollOffset: 0 })).toBeNull();
    expect(getScrollToIndex(20, { ...base, scrollOffset: 0 })).toBe(220);
    expect(getScrollToIndex(0, { ...base, scrollOffset: 400 })).toBe(0);
    expect(getScrollToIndex(-1, { ...base, scrollOffset: 0 })).toBeNull();
  });

  it("aligns on demand", () => {
    expect(getScrollToIndex(10, { ...base, scrollOffset: 0, align: "start" })).toBe(200);
    expect(getScrollToIndex(10, { ...base, scrollOffset: 0, align: "end" })).toBe(20);
    expect(getScrollToIndex(10, { ...base, scrollOffset: 0, align: "center" })).toBe(110);
  });
});
