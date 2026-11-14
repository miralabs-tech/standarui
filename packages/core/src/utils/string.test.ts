import { describe, expect, it } from "vitest";
import { toKebabCase } from "./string";

describe("toKebabCase", () => {
  it("splits at a lowercase-or-digit to uppercase boundary", () => {
    expect(toKebabCase("triggerSwatch")).toBe("trigger-swatch");
    expect(toKebabCase("row2Cell")).toBe("row2-cell");
  });

  it("splits an acronym run from the capitalized word that follows it", () => {
    // The color-picker's own axis inputs (`color-picker.anatomy.ts`): two
    // consecutive capitals is the boundary the single-pass regex could not see.
    expect(toKebabCase("areaXInput")).toBe("area-x-input");
    expect(toKebabCase("areaYInput")).toBe("area-y-input");
  });

  it("leaves an already-lowercase string alone", () => {
    expect(toKebabCase("trigger")).toBe("trigger");
  });
});
