import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { createFilePlanner } from "./files";
import type { RegistryClient } from "./registry";
import type { RegistryItem } from "./registry-types";

const client: RegistryClient = {
  loadItem: async () => {
    throw new Error("unexpected");
  },
  loadIndex: async () => {
    throw new Error("unexpected");
  },
  loadApi: async () => {
    throw new Error("unexpected");
  },
};

describe("createFilePlanner", () => {
  it("copies a styles file byte for byte under dirs.styles", async () => {
    const scope = ["@standarui", "core", "thing"].join("/");
    const content = `/* import "${scope}" */\n.sui { color: red; }\n`;
    const item: RegistryItem = {
      $schema: "",
      name: "dialog",
      type: "registry:component",
      version: "1.0.0",
      registryDependencies: [],
      files: [{ layer: "styles", path: "acme/dialog.css", sha256: "", content }],
    };
    const cwd = path.resolve("app");
    const [file] = await createFilePlanner(cwd, defaultConfig(), client)("@acme/dialog", item);
    expect(file?.content).toBe(content);
    expect(file?.lockKey).toBe("styles/acme/dialog.css");
    expect(file?.target).toBe(path.join(cwd, "src/standarui/styles", "acme/dialog.css"));
  });
});
