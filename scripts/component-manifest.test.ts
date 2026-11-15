import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectManifest, MANIFEST_FILE, renderManifest } from "./component-manifest";

const root = path.resolve(import.meta.dirname, "..");
const manifest = await collectManifest();
const component = (name: string): (typeof manifest.components)[string] => {
  const found = manifest.components[name];
  if (found === undefined) throw new Error(`${name} is not in the manifest`);
  return found;
};

describe("the committed component manifest", () => {
  it("matches the source it was generated from — rerun `bun run docs:api`", () => {
    expect(
      readFileSync(MANIFEST_FILE, "utf8") === renderManifest(manifest),
      "packages/react/api/manifest.json is out of date: run `bun run docs:api`",
    ).toBe(true);
  });

  it("carries the react package version", () => {
    const { version } = JSON.parse(
      readFileSync(path.join(root, "packages/react/package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.schema).toBe(1);
    expect(manifest.version).toBe(version);
  });
});

describe("what it records", () => {
  it("lists the ten parts of the dialog in anatomy order", () => {
    const parts = component("dialog").parts;
    expect(parts).toHaveLength(10);
    expect(parts.map((entry) => entry.key)).toEqual([
      "trigger",
      "backdrop",
      "positioner",
      "content",
      "title",
      "description",
      "closeTrigger",
      "actions",
      "cancelTrigger",
      "actionTrigger",
    ]);
    expect(parts).toContainEqual({ key: "closeTrigger", part: "dialog:close-trigger" });
  });

  it("reads the anatomy of a component without a machine", () => {
    for (const name of ["badge", "card", "empty-state", "list", "separator", "sidebar"]) {
      expect(manifest.components[name], name).toBeDefined();
    }
    expect(component("empty-state").parts).toContainEqual({
      key: "title",
      part: "empty-state:title",
    });
  });

  it("scopes every part to its anatomy", () => {
    const offenders = Object.entries(manifest.components).flatMap(([name, entry]) =>
      entry.parts
        .filter((part) => !part.part.startsWith(`${entry.scope}:`))
        .map((part) => `${name}: ${part.part}`),
    );
    expect(Object.values(manifest.components).some((entry) => entry.parts.length > 0)).toBe(true);
    expect(offenders).toEqual([]);
  });

  it("has one entry per react component folder", () => {
    const folders = readdirSync(path.join(root, "packages/react/src/components"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders).toContain("alert-dialog");
    expect(Object.keys(manifest.components).sort()).toEqual(folders);
  });

  it("records a component with no anatomy of its own, props kept", () => {
    const alert = component("alert-dialog");
    expect(alert.scope).toBeNull();
    expect(alert.parts).toEqual([]);
    expect(alert.imports).toEqual(["dialog"]);
    expect(alert.api).toBe("alert-dialog.json");
    expect(Object.keys(alert.props).length).toBeGreaterThan(0);
  });

  it("tells which api tables the library hands to the consumer", () => {
    const flows = Object.values(manifest.components).flatMap((entry) =>
      Object.entries(entry.flows),
    );
    const outputs = Object.values(manifest.components).flatMap((entry) =>
      Object.keys(entry.props).filter((table) => table.endsWith("Details")),
    );
    expect(outputs.length).toBeGreaterThan(50);
    expect(
      flows.filter(([table, flow]) => table.endsWith("Details") && flow === "out"),
    ).toHaveLength(outputs.length);
    expect(component("checkbox").flows.CheckedState).toBe("both");
    expect(component("avatar").flows.AvatarStatus).toBe("out");
    expect(component("button").flows.ButtonVariant).toBeUndefined();
    expect(component("button").flows.ButtonMachineProps).toBeUndefined();
  });

  it("reads composed from the adapter folder, true and false", () => {
    expect(component("tabs").composed).toBe(true);
    expect(component("drawer").composed).toBe(false);
  });

  it("reads the components an adapter reaches into", () => {
    expect(component("drawer").imports).toContain("dialog");
    expect(component("date-picker").imports).toEqual(["calendar", "date-field"]);
    expect(component("drawer").imports).not.toContain("drawer");
  });

  it("names the api table of a component", () => {
    expect(component("button").api).toBe("button.json");
  });

  it("lists the sorted row names of each api table", () => {
    const props = component("button").props;
    expect(props.ButtonMachineProps).toContain("variant?");
    expect(props.ButtonMachineProps).toEqual([...(props.ButtonMachineProps ?? [])].sort());
    expect(props.ButtonVariant).toEqual([]);
  });

  it("keeps the definition of an alias table, whitespace folded", () => {
    expect(component("button").aliases.ButtonVariant).toBe(
      '"filled" | "tinted" | "gray" | "plain" | "glass"',
    );
    expect(component("button").aliases.ButtonMachineProps).toBeUndefined();
  });
});
