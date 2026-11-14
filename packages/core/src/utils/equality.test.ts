import { describe, expect, it } from "vitest";
import { arrayEquals, shallowEqual } from "./equality";

describe("arrayEquals", () => {
  it("compares by identity and element", () => {
    expect(arrayEquals([], [])).toBe(true);
    expect(arrayEquals([1, 2], [1, 2])).toBe(true);
    expect(arrayEquals([1, 2], [2, 1])).toBe(false);
    expect(arrayEquals([1], [1, 2])).toBe(false);
    expect(arrayEquals([Number.NaN], [Number.NaN])).toBe(true);
  });
});

describe("shallowEqual", () => {
  it("handles primitives and identity", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "b")).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
  });

  it("compares objects one level deep", () => {
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
  });

  it("compares arrays via arrayEquals", () => {
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });
});
