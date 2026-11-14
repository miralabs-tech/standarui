import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectManifest, MANIFEST_FILE, renderManifest } from "./component-manifest";
import { outdatedManifestMessage, staleManifestMessage } from "./manifest-version";

const root = path.resolve(import.meta.dirname, "..");

describe("staleManifestMessage", () => {
  it("accepts a manifest at the package version", () => {
    expect(staleManifestMessage("1.0.0-alpha.15", "1.0.0-alpha.15")).toBeNull();
  });

  it("refuses a manifest left at another version and says how to fix it", () => {
    const message = staleManifestMessage("1.0.0-alpha.14", "1.0.0-alpha.15");
    expect(message).toContain("1.0.0-alpha.14");
    expect(message).toContain("1.0.0-alpha.15");
    expect(message).toContain("bun run docs:api");
  });

  it("refuses a manifest with no version at all", () => {
    expect(staleManifestMessage(undefined, "1.0.0-alpha.15")).toContain("no version");
  });

  it("passes for the committed manifest and the react package", () => {
    const read = (file: string): string =>
      (JSON.parse(readFileSync(path.join(root, file), "utf8")) as { version: string }).version;
    expect(
      staleManifestMessage(
        read("packages/react/api/manifest.json"),
        read("packages/react/package.json"),
      ),
    ).toBeNull();
  });
});

describe("outdatedManifestMessage", () => {
  it("accepts a manifest equal to the generated one", () => {
    expect(outdatedManifestMessage("{}", "{}")).toBeNull();
  });

  it("refuses a manifest that differs at the same version and says how to fix it", () => {
    const message = outdatedManifestMessage('{"tokens":[]}', '{"tokens":["--sui-x"]}');
    expect(message).toContain("bun run docs:api");
    expect(message).toContain("before packing");
  });

  it("refuses a missing manifest", () => {
    expect(outdatedManifestMessage(undefined, "{}")).not.toBeNull();
  });

  it("passes for the committed manifest against a fresh collect", async () => {
    expect(
      outdatedManifestMessage(
        readFileSync(MANIFEST_FILE, "utf8"),
        renderManifest(await collectManifest()),
      ),
    ).toBeNull();
  });
});
