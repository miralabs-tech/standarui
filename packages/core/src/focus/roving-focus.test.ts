import { describe, expect, it } from "vitest";
import {
  getInitialIndex,
  getNextIndex,
  getRemovalIndex,
  getRovingIntentAction,
  getRovingKeyAction,
  getRovingTabIndex,
} from "./roving-focus";

describe("getRovingKeyAction", () => {
  it("moves along the declared orientation only", () => {
    expect(getRovingKeyAction("ArrowDown", { orientation: "vertical" })).toBe("next");
    expect(getRovingKeyAction("ArrowRight", { orientation: "vertical" })).toBeNull();
    expect(getRovingKeyAction("ArrowRight", { orientation: "horizontal" })).toBe("next");
    expect(getRovingKeyAction("ArrowDown", { orientation: "horizontal" })).toBeNull();
  });

  it("inverts left and right in RTL, and leaves up and down alone", () => {
    expect(getRovingKeyAction("ArrowRight", { orientation: "horizontal", dir: "rtl" })).toBe(
      "prev",
    );
    expect(getRovingKeyAction("ArrowLeft", { orientation: "horizontal", dir: "rtl" })).toBe("next");
    expect(getRovingKeyAction("ArrowDown", { orientation: "vertical", dir: "rtl" })).toBe("next");
  });

  it("moves on both axes when asked — grids, and the d-pad", () => {
    expect(getRovingKeyAction("ArrowRight", { orientation: "vertical", bothAxes: true })).toBe(
      "next",
    );
    expect(getRovingKeyAction("ArrowUp", { orientation: "horizontal", bothAxes: true })).toBe(
      "prev",
    );
  });

  it("always maps Home and End, and ignores everything else", () => {
    expect(getRovingKeyAction("Home", { orientation: "horizontal" })).toBe("first");
    expect(getRovingKeyAction("End")).toBe("last");
    expect(getRovingKeyAction("Enter")).toBeNull();
    expect(getRovingKeyAction("a")).toBeNull();
  });
});

describe("getRovingIntentAction", () => {
  it("answers a pad exactly as the key it is the twin of", () => {
    // Stated against the keyboard rather than against expected values: what the
    // mirror promises is that the two entries cannot drift apart, and a table
    // written twice here would be the third copy of the thing.
    const axes = [
      { orientation: "vertical" },
      { orientation: "horizontal" },
      { orientation: "horizontal", dir: "rtl" },
    ] as const;
    const pairs = [
      ["moveUp", "ArrowUp"],
      ["moveDown", "ArrowDown"],
      ["moveLeft", "ArrowLeft"],
      ["moveRight", "ArrowRight"],
      ["home", "Home"],
      ["end", "End"],
    ] as const;

    for (const options of axes) {
      for (const [intent, key] of pairs) {
        expect(getRovingIntentAction(intent, options)).toBe(getRovingKeyAction(key, options));
      }
    }
  });

  it("answers nothing for the intents that move no highlight", () => {
    for (const intent of ["select", "back", "tabNext", "pageUp", "scrollY"] as const) {
      expect(getRovingIntentAction(intent)).toBeNull();
    }
  });
});

describe("getNextIndex", () => {
  const count = 4;

  it("steps forward and back", () => {
    expect(getNextIndex(0, "next", { count })).toBe(1);
    expect(getNextIndex(2, "prev", { count })).toBe(1);
  });

  it("wraps by default and clamps when looping is off", () => {
    expect(getNextIndex(3, "next", { count })).toBe(0);
    expect(getNextIndex(0, "prev", { count })).toBe(3);
    expect(getNextIndex(3, "next", { count, loop: false })).toBe(3);
    expect(getNextIndex(0, "prev", { count, loop: false })).toBe(0);
  });

  it("steps over disabled items", () => {
    const isDisabled = (index: number): boolean => index === 1 || index === 2;

    expect(getNextIndex(0, "next", { count, isDisabled })).toBe(3);
    expect(getNextIndex(3, "prev", { count, isDisabled })).toBe(0);
  });

  it("lands on the first and last enabled item", () => {
    const isDisabled = (index: number): boolean => index === 0 || index === 3;

    expect(getNextIndex(2, "first", { count, isDisabled })).toBe(1);
    expect(getNextIndex(1, "last", { count, isDisabled })).toBe(2);
    expect(getNextIndex(2, "first", { count })).toBe(0);
    expect(getNextIndex(1, "last", { count })).toBe(3);
  });

  it("enters the collection from nowhere", () => {
    expect(getNextIndex(-1, "next", { count })).toBe(0);
    expect(getNextIndex(-1, "prev", { count })).toBe(3);
  });

  it("gives up rather than spin when nothing is selectable", () => {
    expect(getNextIndex(0, "next", { count, isDisabled: () => true })).toBe(0);
    expect(getNextIndex(0, "next", { count: 0 })).toBe(-1);
  });
});

describe("tab order helpers", () => {
  it("leaves exactly one item in the tab order", () => {
    expect(getRovingTabIndex(1, 1)).toBe(0);
    expect(getRovingTabIndex(0, 1)).toBe(-1);
  });

  it("starts on the first enabled item", () => {
    expect(getInitialIndex({ count: 3, isDisabled: (index) => index < 2 })).toBe(2);
    expect(getInitialIndex({ count: 3 })).toBe(0);
    expect(getInitialIndex({ count: 3, isDisabled: () => true })).toBe(-1);
  });
});

describe("getRemovalIndex", () => {
  const count = 4;

  it("hands the focus to the next item, and to the previous one at the end", () => {
    // APG's rule for a closed tab, and the reason it is not simply "next": the
    // last item has no next, and leaving the focus on the body is the one place
    // a keyboard user cannot come back from.
    expect(getRemovalIndex(0, { count })).toBe(1);
    expect(getRemovalIndex(2, { count })).toBe(3);
    expect(getRemovalIndex(3, { count })).toBe(2);
  });

  it("never wraps, whatever the collection was configured with", () => {
    // Read against the list as it stands *before* the removal, so wrapping from
    // the last item would land on the first — which is not where the item that
    // is disappearing was.
    expect(getRemovalIndex(3, { count, loop: true })).toBe(2);
    expect(getRemovalIndex(0, { count, loop: true })).toBe(1);
  });

  it("steps over disabled neighbours in both directions", () => {
    expect(getRemovalIndex(0, { count, isDisabled: (index) => index === 1 })).toBe(2);
    expect(getRemovalIndex(3, { count, isDisabled: (index) => index === 2 })).toBe(1);
  });

  it("answers nowhere when the item removed was the only one there was", () => {
    expect(getRemovalIndex(0, { count: 1 })).toBe(-1);
    expect(getRemovalIndex(0, { count: 2, isDisabled: (index) => index === 1 })).toBe(-1);
  });
});
