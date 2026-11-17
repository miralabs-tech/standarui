import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

interface Schema {
  $defs: {
    name: { pattern: string };
    dependencyName: { pattern: string };
    item: { properties: { files: { minItems?: number } } };
    indexEntry: { properties: { files: { minimum: number } } };
  };
}

interface RegistryEntry {
  name: string;
  registryDependencies: string[];
}

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(root, file), "utf8")) as T;

const schema = readJson<Schema>("registry/schema.json");
const dependencyName = new RegExp(schema.$defs.dependencyName.pattern);
const name = new RegExp(schema.$defs.name.pattern);

describe("the dependencyName pattern", () => {
  it.each(["button", "@acme/other", "@mira/base"])("accepts %s", (value) => {
    expect(dependencyName.test(value)).toBe(true);
  });

  it.each(["Button", "@acme/", "acme/other", "@Acme/x", "@acme/other/x"])("rejects %s", (value) => {
    expect(dependencyName.test(value)).toBe(false);
  });
});

describe("the file-less alias", () => {
  it("lets an item carry no file", () => {
    expect(schema.$defs.item.properties.files.minItems).toBeUndefined();
  });

  it("lets an index entry count no file", () => {
    expect(schema.$defs.indexEntry.properties.files.minimum).toBe(0);
  });
});

describe("the committed registry against the schema patterns", () => {
  const items = readdirSync(path.join(root, "registry/items"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<RegistryEntry>(`registry/items/${file}`));
  const entries = readJson<{ items: RegistryEntry[] }>("registry/index.json").items;

  it.each([
    ["registry/items", items],
    ["registry/index.json", entries],
  ] as const)("names and dependencies of %s match", (_source, list) => {
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(name.test(entry.name), entry.name).toBe(true);
      for (const dependency of entry.registryDependencies) {
        expect(dependencyName.test(dependency), `${entry.name}: ${dependency}`).toBe(true);
      }
    }
  });
});
