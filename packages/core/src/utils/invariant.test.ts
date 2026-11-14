import { describe, expect, it } from "vitest";
import { invariant } from "./invariant";

describe("invariant", () => {
  it("passes when the condition holds", () => {
    expect(() => invariant(true, "never")).not.toThrow();
  });

  it("throws a prefixed error when the condition fails", () => {
    expect(() => invariant(false, "broken")).toThrow("[standarui] broken");
  });
});
