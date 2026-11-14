import { describe, expect, it } from "vitest";
import { resolveSettleBucket, settleTo } from "./settle";

describe("resolveSettleBucket", () => {
  it("calls a resting finger slow", () => {
    expect(resolveSettleBucket(0)).toBe("slow");
  });

  it("puts every speed in exactly one bucket at the two boundaries", () => {
    // The comparisons are asymmetric on purpose: 0.2 is already medium and 0.5 is
    // already a flick, so no speed falls between two recipes.
    expect(resolveSettleBucket(0.199)).toBe("slow");
    expect(resolveSettleBucket(0.2)).toBe("medium");
    expect(resolveSettleBucket(0.499)).toBe("medium");
    expect(resolveSettleBucket(0.5)).toBe("flick");
    expect(resolveSettleBucket(4)).toBe("flick");
  });

  it("reads the magnitude, never the direction", () => {
    expect(resolveSettleBucket(-0.199)).toBe("slow");
    expect(resolveSettleBucket(-0.2)).toBe("medium");
    expect(resolveSettleBucket(-0.5)).toBe("flick");
    expect(resolveSettleBucket(-4)).toBe("flick");
  });
});

describe("settleTo without a DOM", () => {
  it("answers null rather than throwing, so a machine can call it from anywhere", () => {
    const options = { from: "0 120px", to: "0 0px", velocity: 1 };
    expect(settleTo(null, options)).toBeNull();
    expect(settleTo(undefined, options)).toBeNull();
  });
});
