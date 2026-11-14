import { describe, expect, it } from "vitest";
import { createTypeaheadState, getByTypeahead, isTypeaheadKey, resetTypeahead } from "./typeahead";

const items = ["Apple", "Apricot", "Banana", "Blueberry", "Cherry"];
const itemToString = (item: string): string => item;

describe("getByTypeahead", () => {
  it("matches on the first character", () => {
    const state = createTypeaheadState();

    expect(getByTypeahead(state, "b", { items, itemToString, now: 0 })).toBe("Banana");
  });

  it("narrows as the query grows", () => {
    const state = createTypeaheadState();

    expect(getByTypeahead(state, "a", { items, itemToString, now: 0 })).toBe("Apple");
    expect(getByTypeahead(state, "p", { items, itemToString, now: 10 })).toBe("Apple");
    expect(getByTypeahead(state, "r", { items, itemToString, now: 20 })).toBe("Apricot");
  });

  it("cycles through matches when the same character repeats", () => {
    const state = createTypeaheadState();

    expect(getByTypeahead(state, "b", { items, itemToString, now: 0, activeIndex: -1 })).toBe(
      "Banana",
    );
    expect(getByTypeahead(state, "b", { items, itemToString, now: 10, activeIndex: 2 })).toBe(
      "Blueberry",
    );
    expect(getByTypeahead(state, "b", { items, itemToString, now: 20, activeIndex: 3 })).toBe(
      "Banana",
    );
  });

  it("starts a new query once the buffer has expired", () => {
    const state = createTypeaheadState();

    getByTypeahead(state, "a", { items, itemToString, now: 0 });
    expect(getByTypeahead(state, "b", { items, itemToString, now: 5000 })).toBe("Banana");
    expect(state.query).toBe("b");
  });

  it("is case insensitive", () => {
    const state = createTypeaheadState();

    expect(getByTypeahead(state, "C", { items, itemToString, now: 0 })).toBe("Cherry");
  });

  it("skips disabled items", () => {
    const state = createTypeaheadState();

    expect(
      getByTypeahead(state, "b", {
        items,
        itemToString,
        now: 0,
        isItemDisabled: (item) => item === "Banana",
      }),
    ).toBe("Blueberry");
  });

  it("returns null when nothing matches, and on an empty collection", () => {
    const state = createTypeaheadState();

    expect(getByTypeahead(state, "z", { items, itemToString, now: 0 })).toBeNull();
    expect(
      getByTypeahead(createTypeaheadState(), "a", { items: [], itemToString, now: 0 }),
    ).toBeNull();
  });

  it("resets on demand", () => {
    const state = createTypeaheadState();
    getByTypeahead(state, "a", { items, itemToString, now: 0 });

    resetTypeahead(state);

    expect(state.query).toBe("");
    expect(getByTypeahead(state, "b", { items, itemToString, now: 10 })).toBe("Banana");
  });
});

describe("isTypeaheadKey", () => {
  it("accepts printable characters only", () => {
    expect(isTypeaheadKey("a")).toBe(true);
    expect(isTypeaheadKey("7")).toBe(true);
    expect(isTypeaheadKey(" ")).toBe(false);
    expect(isTypeaheadKey("ArrowDown")).toBe(false);
    expect(isTypeaheadKey("Enter")).toBe(false);
  });
});
