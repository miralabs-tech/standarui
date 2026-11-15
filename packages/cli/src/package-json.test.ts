import { describe, expect, it } from "vitest";
import { mergeDependencies } from "./package-json";

describe("mergeDependencies", () => {
  it("adds missing dependencies in sorted order", () => {
    const { pkg, changed } = mergeDependencies(
      { name: "app", dependencies: { zod: "^3.0.0" } },
      { react: "^19.0.0", "@standarx/nav": "0.4.1" },
    );
    expect(changed).toEqual(["@standarx/nav", "react"]);
    expect(Object.keys(pkg.dependencies as object)).toEqual(["@standarx/nav", "react", "zod"]);
  });

  it("never lowers a version already present", () => {
    const original = { dependencies: { react: "^19.2.0" }, devDependencies: { vite: "7.0.0" } };
    const { pkg, changed } = mergeDependencies(original, { react: "^19.0.0", vite: "^6.0.0" });
    expect(changed).toEqual([]);
    expect(pkg).toEqual(original);
  });

  it("raises a lower version", () => {
    const { pkg, changed } = mergeDependencies(
      { dependencies: { react: "^18.3.0" } },
      {
        react: "^19.0.0",
      },
    );
    expect(changed).toEqual(["react"]);
    expect((pkg.dependencies as Record<string, string>).react).toBe("^19.0.0");
  });
});
