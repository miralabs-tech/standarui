import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CONFIG_FILE, defaultConfig, readConfig, serializeConfig } from "./config";

const directory = mkdtempSync(path.join(tmpdir(), "standarui-config-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function write(dirs: Record<string, string>): void {
  writeFileSync(
    path.join(directory, CONFIG_FILE),
    JSON.stringify({ dirs, aliases: { core: "@/c", react: "@/r" } }),
  );
}

describe("styles dir", () => {
  it("falls back to the default when the file has no dirs.styles", () => {
    write({ core: "a", react: "b" });
    expect(readConfig(directory).dirs.styles).toBe("src/standarui/styles");
  });

  it("reads dirs.styles when present", () => {
    write({ core: "a", react: "b", styles: "css" });
    expect(readConfig(directory).dirs.styles).toBe("css");
  });

  it("honours the stylesDir override and writes it", () => {
    const config = defaultConfig({ stylesDir: "assets/ui" });
    expect(config.dirs.styles).toBe("assets/ui");
    expect(serializeConfig(config)).toContain('"styles": "assets/ui"');
  });

  it("has no styles alias", () => {
    expect(Object.keys(defaultConfig().aliases)).toEqual(["core", "react"]);
  });
});
