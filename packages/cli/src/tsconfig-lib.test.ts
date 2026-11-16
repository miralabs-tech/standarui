import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { libBelowEs2023 } from "./tsconfig-paths";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "standarui-lib-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(content: string): void {
  writeFileSync(path.join(dir, "tsconfig.json"), content);
}

function options(compilerOptions: Record<string, unknown>): void {
  write(JSON.stringify({ compilerOptions }));
}

describe("libBelowEs2023", () => {
  it("returns the highest level below es2023", () => {
    options({ lib: ["es2022", "dom"] });
    expect(libBelowEs2023(dir)).toBe("es2022");
  });

  it("accepts es2023 in any case", () => {
    options({ lib: ["ES2023", "DOM"] });
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("counts es2023 sub-libs", () => {
    options({ lib: ["es2022", "es2023.array"] });
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("accepts esnext", () => {
    options({ lib: ["esnext"] });
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("cannot tell without an es entry", () => {
    options({ lib: ["dom"] });
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("falls back to target without lib", () => {
    options({ target: "es2022" });
    expect(libBelowEs2023(dir)).toBe("es2022");
    options({ target: "ESNext" });
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("does not warn with extends and no lib or target", () => {
    write(JSON.stringify({ extends: "./base.json", compilerOptions: {} }));
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("does not warn without a tsconfig", () => {
    expect(libBelowEs2023(dir)).toBeUndefined();
  });

  it("parses JSONC with comments and trailing commas", () => {
    write(`{
  // comment
  "compilerOptions": {
    /* block */
    "lib": ["es2022", "dom",],
  },
}`);
    expect(libBelowEs2023(dir)).toBe("es2022");
  });
});
