import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](@standarx\/nav[^"']*)["']/g;
const FACADES = new Set(["nav.ts", "nav.tsx"]);
const TEST_FILE = /\.test\./;
const SOURCE = /\.tsx?$/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(full);
    return SOURCE.test(entry.name) ? [full] : [];
  });
}

function offenders(): string[] {
  const found: string[] = [];
  for (const pkg of readdirSync(path.join(root, "packages"))) {
    const src = path.join(root, "packages", pkg, "src");
    let files: string[];
    try {
      files = sources(src);
    } catch {
      continue;
    }
    for (const file of files) {
      if (FACADES.has(path.basename(file)) || TEST_FILE.test(file)) continue;
      for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
        found.push(`${path.relative(root, file).replaceAll("\\", "/")} imports ${match[1]}`);
      }
    }
  }
  return found;
}

describe("nav facade", () => {
  it("is the only non-test place that imports @standarx/nav", () => {
    expect(offenders()).toEqual([]);
  });
});
