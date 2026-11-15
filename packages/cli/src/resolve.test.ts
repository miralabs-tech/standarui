import { describe, expect, it } from "vitest";
import type { RegistryItem } from "./registry-types";
import { type ItemRef, resolveItems } from "./resolve";

const DEFAULT = "@standarui";

function item(name: string, registryDependencies: string[]): RegistryItem {
  return {
    $schema: "",
    name,
    type: "registry:component",
    version: "0.0.0",
    registryDependencies,
    files: [],
  };
}

const items: Record<string, RegistryItem> = {
  "core-base": item("core-base", []),
  "react-base": item("react-base", ["core-base"]),
  dialog: item("dialog", ["core-base", "react-base", "alert-dialog"]),
  "alert-dialog": item("alert-dialog", ["core-base", "react-base", "dialog"]),
  select: item("select", ["core-base", "react-base"]),
  "acme/card": item("acme/card", ["@standarui/core-base", "@standarui/select"]),
};

function options(installed: string[] = [], overwrite = false): Parameters<typeof resolveItems>[1] {
  return {
    installed: new Set(installed),
    overwrite,
    defaultRegistry: DEFAULT,
    load: async (ref: ItemRef) => {
      const found = items[ref.registry === DEFAULT ? ref.name : `acme/${ref.name}`];
      if (found === undefined) throw new Error(`missing ${ref.name}`);
      return found;
    },
  };
}

const names = (resolved: Awaited<ReturnType<typeof resolveItems>>): string[] =>
  resolved.map((entry) => entry.key);

describe("resolveItems", () => {
  it("puts dependencies before the item", async () => {
    expect(names(await resolveItems(["select"], options()))).toEqual([
      "core-base",
      "react-base",
      "select",
    ]);
  });

  it("terminates on a cycle and lists each item once", async () => {
    const resolved = names(await resolveItems(["dialog"], options()));
    expect(resolved.toSorted()).toEqual(["alert-dialog", "core-base", "dialog", "react-base"]);
    expect(new Set(resolved).size).toBe(resolved.length);
  });

  it("skips items already installed and their dependencies", async () => {
    expect(names(await resolveItems(["select"], options(["core-base", "react-base"])))).toEqual([
      "select",
    ]);
    expect(await resolveItems(["select"], options(["select"]))).toEqual([]);
  });

  it("reinstalls installed items with overwrite", async () => {
    expect(names(await resolveItems(["select"], options(["select", "core-base"], true)))).toEqual([
      "core-base",
      "react-base",
      "select",
    ]);
  });

  it("follows a namespaced item and its qualified dependencies", async () => {
    expect(names(await resolveItems(["@acme/card"], options()))).toEqual([
      "core-base",
      "react-base",
      "select",
      "@acme/card",
    ]);
  });
});
