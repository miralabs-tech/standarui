import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRegistry,
  collectRegistry,
  isExcludedByName,
  outdatedRegistryMessage,
  readCommittedRegistry,
} from "./registry-build";

const root = path.resolve(import.meta.dirname, "..");

describe("outdatedRegistryMessage", () => {
  it("accepts an identical registry", () => {
    expect(outdatedRegistryMessage(new Map([["a", "1"]]), new Map([["a", "1"]]))).toBeNull();
  });

  it("names the drifted files and says how to fix it", () => {
    const message = outdatedRegistryMessage(
      new Map([["registry/items/a.json", "1"]]),
      new Map([["registry/items/a.json", "2"]]),
    );
    expect(message).toContain("registry/items/a.json");
    expect(message).toContain("bun run registry:build");
  });

  it("flags a file that is no longer produced", () => {
    expect(outdatedRegistryMessage(new Map([["old", "1"]]), new Map())).toContain("old");
  });
});

describe("the committed registry", () => {
  it("matches what the generator produces from the source", () => {
    expect(outdatedRegistryMessage(readCommittedRegistry(root), buildRegistry(root))).toBeNull();
  });
});

describe("the registry items", () => {
  const { items, sources, excluded } = collectRegistry(root);

  it("holds no excluded file", () => {
    const copied = items.flatMap((entry) =>
      entry.files.map((file) => `${file.layer}:${file.path}`),
    );
    for (const key of copied) {
      const [layer, ...rest] = key.split(":");
      expect(isExcludedByName(layer as "core" | "react", rest.join(":")), key).toBe(false);
      expect(excluded.has(key), key).toBe(false);
    }
  });

  it("only depends on items that exist", () => {
    const names = new Set(items.map((entry) => entry.name));
    for (const entry of items) {
      for (const dependency of entry.registryDependencies) {
        expect(names.has(dependency), `${entry.name} -> ${dependency}`).toBe(true);
      }
    }
  });

  it("puts every non-excluded source file in exactly one item", () => {
    const owners = new Map<string, string[]>();
    for (const entry of items) {
      for (const file of entry.files) {
        const key = `${file.layer}:${file.path}`;
        owners.set(key, [...(owners.get(key) ?? []), entry.name]);
      }
    }
    for (const file of sources.filter((source) => !excluded.has(source.key))) {
      expect(owners.get(file.key), file.key).toHaveLength(1);
    }
    expect(owners.size).toBe(sources.filter((source) => !excluded.has(source.key)).length);
  });

  it("keeps every base file free of component imports", () => {
    expect(collectRegistry(root).baseImportsOfComponents).toEqual([]);
  });

  it("moves a base file that only components import into the component it imports", () => {
    const { movedIntoComponents } = collectRegistry(root);
    expect(movedIntoComponents.get("react:checkbox-group-context.tsx")).toBe("checkbox");
    const checkbox = items.find((entry) => entry.name === "checkbox");
    expect(checkbox?.files.map((file) => file.path)).toContain("checkbox-group-context.tsx");
    const reactBase = items.find((entry) => entry.name === "react-base");
    expect(reactBase?.files.map((file) => file.path)).not.toContain("checkbox-group-context.tsx");
  });

  it("leaves checkbox-group depending on checkbox through the component graph", () => {
    const group = items.find((entry) => entry.name === "checkbox-group");
    expect(group?.registryDependencies).toContain("checkbox");
  });
});
