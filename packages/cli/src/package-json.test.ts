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

  it("keeps a higher nav version when the range is a caret", () => {
    const original = { dependencies: { "@standarx/nav": "0.4.3" } };
    const { pkg, changed } = mergeDependencies(original, { "@standarx/nav": "^0.4.1" });
    expect(changed).toEqual([]);
    expect(pkg).toEqual(original);
  });

  it("raises a lower nav version to the caret range", () => {
    const { pkg, changed } = mergeDependencies(
      { dependencies: { "@standarx/nav": "0.4.0" } },
      { "@standarx/nav": "^0.4.1" },
    );
    expect(changed).toEqual(["@standarx/nav"]);
    expect((pkg.dependencies as Record<string, string>)["@standarx/nav"]).toBe("^0.4.1");
  });

  it("adds the caret range when nav is absent", () => {
    const { pkg, changed } = mergeDependencies({ dependencies: {} }, { "@standarx/nav": "^0.4.1" });
    expect(changed).toEqual(["@standarx/nav"]);
    expect((pkg.dependencies as Record<string, string>)["@standarx/nav"]).toBe("^0.4.1");
  });
});
