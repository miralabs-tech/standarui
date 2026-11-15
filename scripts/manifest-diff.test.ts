import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ComponentManifest,
  collectManifest,
  type Flow,
  type SheetNames,
} from "./component-manifest";
import { diffManifests, type Rename, renameProblems, renderDiff, runCli } from "./manifest-diff";

const root = path.resolve(import.meta.dirname, "..");

function manifestOf(overrides: {
  parts?: string[];
  tokens?: string[];
  reads?: string[];
  hooks?: string[];
  channels?: string[];
  flows?: Record<string, Flow>;
  sheets?: Record<string, Partial<SheetNames>>;
  globalTokens?: string[];
  props?: Record<string, string[]>;
  aliases?: Record<string, string>;
  composed?: boolean;
  extra?: string[];
  others?: Record<string, string[]>;
}): ComponentManifest {
  const base = {
    scope: "dialog",
    parts: (overrides.parts ?? ["dialog:trigger", "dialog:close-trigger"]).map((part) => ({
      key: part.split(":")[1] as string,
      part,
    })),
    tokens: overrides.tokens ?? ["--sui-dialog-width"],
    reads: overrides.reads ?? ["--sui-color-label"],
    hooks: overrides.hooks ?? ["--sui-dialog-padding"],
    channels: overrides.channels ?? [],
    imports: [],
    composed: overrides.composed ?? false,
    api: "dialog.json",
    props: overrides.props ?? { DialogMachineProps: ["open?", "onOpenChange?"] },
    aliases: overrides.aliases ?? {},
    flows: overrides.flows ?? {},
  };
  return {
    schema: 1,
    version: "1.0.0-test",
    tokens: overrides.globalTokens ?? ["--sui-color-label", "--sui-color-tint"],
    sheets: Object.fromEntries(
      Object.entries(overrides.sheets ?? { ambient: { tokens: ["--sui-ambient-strength"] } }).map(
        ([name, sheet]) => [name, { tokens: [], reads: [], hooks: [], channels: [], ...sheet }],
      ),
    ),
    components: {
      dialog: base,
      ...Object.fromEntries(
        (overrides.extra ?? []).map((name) => [name, { ...base, scope: name }]),
      ),
      ...Object.fromEntries(
        Object.entries(overrides.others ?? {}).map(([name, parts]) => [
          name,
          {
            ...base,
            scope: name,
            parts: parts.map((part) => ({ key: part.split(":")[1] as string, part })),
          },
        ]),
      ),
    },
  };
}

const closeToDismiss: Rename = {
  since: "1.0.0-test",
  kind: "part",
  component: "dialog",
  from: "dialog:close-trigger",
  to: "dialog:dismiss-trigger",
};

describe("diffManifests", () => {
  it("reports nothing for identical manifests", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({}), []);
    expect(diff.breaking).toBe(false);
    expect(diff.changed).toEqual({});
    expect(diff.components).toEqual({ added: [], removed: [], renamed: [] });
    expect(renderDiff(diff)).toBe("Aucun changement.\n");
  });

  it("reports nothing for the real current manifest against itself", async () => {
    const manifest = await collectManifest();
    const diff = diffManifests(manifest, manifest, []);
    expect(Object.keys(manifest.components).length).toBeGreaterThan(0);
    expect(diff.breaking).toBe(false);
    expect(diff.changed).toEqual({});
    expect(renderDiff(diff)).toBe("Aucun changement.\n");
  });

  it("flags a removed part as breaking", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({ parts: ["dialog:trigger"] }), []);
    expect(diff.changed.dialog?.parts.removed).toEqual(["dialog:close-trigger"]);
    expect(diff.breaking).toBe(true);
    const text = renderDiff(diff);
    expect(text.startsWith("**Rupture**\n")).toBe(true);
    expect(text).toContain("## dialog");
    expect(text).toContain("- part retirée : `dialog:close-trigger`");
  });

  it("reports an added token without calling it breaking", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ tokens: ["--sui-dialog-height", "--sui-dialog-width"] }),
      [],
    );
    expect(diff.changed.dialog?.tokens.added).toEqual(["--sui-dialog-height"]);
    expect(diff.breaking).toBe(false);
    expect(renderDiff(diff)).toBe("## dialog\n\n- token ajouté : `--sui-dialog-height`\n");
  });

  it("flags a global the component starts to declare as breaking", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ tokens: ["--sui-color-tint", "--sui-dialog-width"] }),
      [],
    );
    expect(diff.changed.dialog?.shadowed).toEqual(["--sui-color-tint"]);
    expect(diff.changed.dialog?.tokens.added).toEqual([]);
    expect(diff.breaking).toBe(true);
    expect(renderDiff(diff)).toBe(
      "**Rupture**\n\n## dialog\n\n- token global redéclaré : `--sui-color-tint` (sa valeur sur `:root` n'atteint plus le composant)\n",
    );
  });

  it("flags a global the component read and now declares as breaking", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ tokens: ["--sui-color-label", "--sui-dialog-width"], reads: [] }),
      [],
    );
    expect(diff.changed.dialog?.shadowed).toEqual(["--sui-color-label"]);
    expect(diff.changed.dialog?.reclassified).toEqual([]);
    expect(diff.breaking).toBe(true);
  });

  it("does not flag a global the component already declared", () => {
    const tokens = ["--sui-color-tint", "--sui-dialog-width"];
    const diff = diffManifests(manifestOf({ tokens }), manifestOf({ tokens }), []);
    expect(diff.changed).toEqual({});
    expect(diff.breaking).toBe(false);
  });

  it("does not flag a global added to the layer that the component already declared", () => {
    const tokens = ["--sui-dialog-width", "--sui-safe-top"];
    const diff = diffManifests(
      manifestOf({ tokens }),
      manifestOf({
        tokens,
        globalTokens: ["--sui-color-label", "--sui-color-tint", "--sui-safe-top"],
      }),
      [],
    );
    expect(diff.changed).toEqual({});
    expect(diff.breaking).toBe(false);
  });

  it("reports a dropped redeclaration the component still reads without calling it breaking", () => {
    const diff = diffManifests(
      manifestOf({ tokens: ["--sui-color-label", "--sui-dialog-width"], reads: [] }),
      manifestOf({}),
      [],
    );
    expect(diff.changed.dialog?.shadowed).toEqual([]);
    expect(diff.changed.dialog?.reclassified).toEqual([
      { name: "--sui-color-label", from: "token", to: "read" },
    ]);
    expect(diff.breaking).toBe(false);
  });

  it("reports a prop removed from one table", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ props: { DialogMachineProps: ["open?"] } }),
      [],
    );
    expect(diff.changed.dialog?.props).toEqual({
      DialogMachineProps: {
        added: [],
        removed: ["onOpenChange"],
        renamed: [],
        table: null,
        direction: "in",
        addedRequired: [],
        optional: [],
        required: [],
        definition: null,
      },
    });
    expect(diff.breaking).toBe(true);
    expect(renderDiff(diff)).toContain("- prop retirée dans `DialogMachineProps` : `onOpenChange`");
  });

  it("reports a flipped composed without calling it breaking", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({ composed: true }), []);
    expect(diff.changed.dialog?.composed).toEqual({ from: false, to: true });
    expect(diff.breaking).toBe(false);
    expect(renderDiff(diff)).toContain("- composé changé : `false` → `true`");
  });

  it("reports a component added and a component removed", () => {
    const added = diffManifests(manifestOf({}), manifestOf({ extra: ["popover"] }), []);
    expect(added.components.added).toEqual(["popover"]);
    expect(added.breaking).toBe(false);
    expect(renderDiff(added)).toBe("## popover\n\n- composant ajouté\n");
    const removed = diffManifests(manifestOf({ extra: ["popover"] }), manifestOf({}), []);
    expect(removed.components.removed).toEqual(["popover"]);
    expect(removed.breaking).toBe(true);
    expect(renderDiff(removed)).toContain("- composant retiré");
  });

  it("renames a component only when the table says so", () => {
    const rename: Rename = {
      since: "1.0.0-test",
      kind: "component",
      component: "popover",
      from: "popover",
      to: "flyout",
    };
    const before = manifestOf({ extra: ["popover"] });
    const after = manifestOf({ extra: ["flyout"] });
    const guessed = diffManifests(before, after, []);
    expect(guessed.components).toEqual({ added: ["flyout"], removed: ["popover"], renamed: [] });
    const declared = diffManifests(before, after, [rename]);
    expect(declared.components).toEqual({
      added: [],
      removed: [],
      renamed: [{ from: "popover", to: "flyout" }],
    });
    expect(declared.breaking).toBe(true);
  });

  it("never guesses a rename: without an entry it is one removal and one addition", () => {
    const before = manifestOf({});
    const after = manifestOf({ parts: ["dialog:trigger", "dialog:dismiss-trigger"] });
    const diff = diffManifests(before, after, []);
    expect(diff.changed.dialog?.parts).toEqual({
      added: ["dialog:dismiss-trigger"],
      removed: ["dialog:close-trigger"],
      renamed: [],
    });
    expect(diff.breaking).toBe(true);
  });

  it("with the entry, the same pair is one rename and nothing else", () => {
    const before = manifestOf({});
    const after = manifestOf({ parts: ["dialog:trigger", "dialog:dismiss-trigger"] });
    const diff = diffManifests(before, after, [closeToDismiss]);
    expect(diff.changed.dialog?.parts).toEqual({
      added: [],
      removed: [],
      renamed: [{ from: "dialog:close-trigger", to: "dialog:dismiss-trigger" }],
    });
    expect(diff.breaking).toBe(true);
    expect(renderDiff(diff)).toContain(
      "- part renommée : `dialog:close-trigger` → `dialog:dismiss-trigger`",
    );
  });

  it("ignores an entry whose pair is not a removal plus an addition", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({}), [closeToDismiss]);
    expect(diff.changed).toEqual({});
  });

  it("renames a token and a prop through their own entries", () => {
    const before = manifestOf({});
    const after = manifestOf({
      tokens: ["--sui-dialog-size"],
      props: { DialogMachineProps: ["open?", "onToggle?"] },
    });
    const diff = diffManifests(before, after, [
      {
        since: "1.0.0-test",
        kind: "token",
        component: "dialog",
        from: "--sui-dialog-width",
        to: "--sui-dialog-size",
      },
      {
        since: "1.0.0-test",
        kind: "prop",
        component: "dialog",
        table: "DialogMachineProps",
        from: "onOpenChange?",
        to: "onToggle?",
      },
    ]);
    expect(diff.changed.dialog?.tokens.renamed).toEqual([
      { from: "--sui-dialog-width", to: "--sui-dialog-size" },
    ]);
    expect(diff.changed.dialog?.props.DialogMachineProps?.renamed).toEqual([
      { from: "onOpenChange", to: "onToggle" },
    ]);
    const text = renderDiff(diff);
    expect(text).toContain("- token renommé : `--sui-dialog-width` → `--sui-dialog-size`");
    expect(text).toContain(
      "- prop renommée dans `DialogMachineProps` : `onOpenChange` → `onToggle`",
    );
  });

  it("does not apply a prop rename to another table", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ props: { DialogMachineProps: ["open?", "onToggle?"] } }),
      [
        {
          since: "1.0.0-test",
          kind: "prop",
          component: "dialog",
          table: "OtherProps",
          from: "onOpenChange?",
          to: "onToggle?",
        },
      ],
    );
    expect(diff.changed.dialog?.props.DialogMachineProps?.renamed).toEqual([]);
  });

  it("skips the props of a side that predates them", () => {
    const before = manifestOf({});
    const component = before.components.dialog as ComponentManifest["components"][string];
    const { props: _dropped, ...legacy } = component;
    const old = { ...before, components: { dialog: legacy } } as unknown as ComponentManifest;
    expect(diffManifests(old, manifestOf({}), []).changed).toEqual({});
  });
});

describe("what a sheet reads and what it leaves to the consumer", () => {
  const hookRename: Rename = {
    since: "1.0.0-test",
    kind: "hook",
    component: "dialog",
    from: "--sui-dialog-padding",
    to: "--sui-dialog-inset",
  };

  it("reports a hook renamed as one removal and one addition, and as a rename with its entry", () => {
    const before = manifestOf({});
    const after = manifestOf({ hooks: ["--sui-dialog-inset"] });
    const guessed = diffManifests(before, after, []);
    expect(guessed.changed.dialog?.hooks).toEqual({
      added: ["--sui-dialog-inset"],
      removed: ["--sui-dialog-padding"],
      renamed: [],
    });
    expect(guessed.breaking).toBe(true);
    const declared = diffManifests(before, after, [hookRename]);
    expect(declared.changed.dialog?.hooks.renamed).toEqual([
      { from: "--sui-dialog-padding", to: "--sui-dialog-inset" },
    ]);
    expect(declared.breaking).toBe(true);
    expect(renderDiff(declared)).toContain(
      "- hook renommé : `--sui-dialog-padding` → `--sui-dialog-inset`",
    );
  });

  it("calls a hook removed breaking and a hook added harmless", () => {
    const removed = diffManifests(manifestOf({}), manifestOf({ hooks: [] }), []);
    expect(removed.changed.dialog?.hooks.removed).toEqual(["--sui-dialog-padding"]);
    expect(removed.breaking).toBe(true);
    const added = diffManifests(
      manifestOf({}),
      manifestOf({ hooks: ["--sui-dialog-gap", "--sui-dialog-padding"] }),
      [],
    );
    expect(added.changed.dialog?.hooks.added).toEqual(["--sui-dialog-gap"]);
    expect(added.breaking).toBe(false);
  });

  it("reports a read that stopped, a read that appeared, and renames it through a token entry", () => {
    const withStray = manifestOf({ reads: ["--sui-color-label", "--sui-stray"] });
    const removed = diffManifests(withStray, manifestOf({}), []);
    expect(removed.changed.dialog?.reads.removed).toEqual(["--sui-stray"]);
    expect(removed.breaking).toBe(true);
    expect(renderDiff(removed)).toContain("- lecture retirée : `--sui-stray`");
    const added = diffManifests(
      manifestOf({}),
      manifestOf({ reads: ["--sui-color-label", "--sui-color-tint"] }),
      [],
    );
    expect(added.changed.dialog?.reads.added).toEqual(["--sui-color-tint"]);
    expect(added.breaking).toBe(false);
    const renamed = diffManifests(manifestOf({}), manifestOf({ reads: ["--sui-color-ink"] }), [
      {
        since: "1.0.0-test",
        kind: "token",
        from: "--sui-color-label",
        to: "--sui-color-ink",
      },
    ]);
    expect(renamed.changed.dialog?.reads.renamed).toEqual([
      { from: "--sui-color-label", to: "--sui-color-ink" },
    ]);
  });

  it("calls a global token removed breaking, added harmless, renamed only by an entry", () => {
    const removed = diffManifests(
      manifestOf({}),
      manifestOf({ globalTokens: ["--sui-color-label"] }),
      [],
    );
    expect(removed.tokens.removed).toEqual(["--sui-color-tint"]);
    expect(removed.changed).toEqual({});
    expect(removed.breaking).toBe(true);
    expect(renderDiff(removed)).toBe(
      "**Rupture**\n\n## Tokens globaux\n\n- token retiré : `--sui-color-tint`\n",
    );
    const added = diffManifests(
      manifestOf({}),
      manifestOf({ globalTokens: ["--sui-color-label", "--sui-color-tint", "--sui-color-ink"] }),
      [],
    );
    expect(added.tokens.added).toEqual(["--sui-color-ink"]);
    expect(added.breaking).toBe(false);
    const entry: Rename = {
      since: "1.0.0-test",
      kind: "token",
      from: "--sui-color-tint",
      to: "--sui-color-accent",
    };
    const after = manifestOf({ globalTokens: ["--sui-color-label", "--sui-color-accent"] });
    expect(diffManifests(manifestOf({}), after, []).tokens.renamed).toEqual([]);
    const declared = diffManifests(manifestOf({}), after, [entry]);
    expect(declared.tokens.renamed).toEqual([
      { from: "--sui-color-tint", to: "--sui-color-accent" },
    ]);
    expect(declared.breaking).toBe(true);
  });

  it("does not take a token entry of one component for a global rename", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ globalTokens: ["--sui-color-label", "--sui-color-accent"] }),
      [
        {
          since: "1.0.0-test",
          kind: "token",
          component: "dialog",
          from: "--sui-color-tint",
          to: "--sui-color-accent",
        },
      ],
    );
    expect(diff.tokens.renamed).toEqual([]);
    expect(diff.tokens.removed).toEqual(["--sui-color-tint"]);
  });

  it("does not take a hook entry for a declared token", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({ tokens: ["--sui-dialog-inset"] }), [
      { ...hookRename, kind: "hook", from: "--sui-dialog-width", to: "--sui-dialog-inset" },
    ]);
    expect(diff.changed.dialog?.tokens.renamed).toEqual([]);
  });
});

describe("parts that move between components", () => {
  const move: Rename = {
    since: "1.0.0-test",
    kind: "part",
    component: "dialog",
    from: "dialog:close-trigger",
    to: "alert:close-trigger",
  };
  const before = manifestOf({ others: { alert: ["alert:trigger"] } });
  const after = manifestOf({
    parts: ["dialog:trigger"],
    others: { alert: ["alert:trigger", "alert:close-trigger"] },
  });

  it("without an entry, is a removal here and an addition there", () => {
    const diff = diffManifests(before, after, []);
    expect(diff.changed.dialog?.parts.removed).toEqual(["dialog:close-trigger"]);
    expect(diff.changed.alert?.parts.added).toEqual(["alert:close-trigger"]);
    expect(diff.breaking).toBe(true);
  });

  it("with an entry, is one rename, listed once, where the part used to be", () => {
    const diff = diffManifests(before, after, [move]);
    expect(diff.changed.dialog?.parts).toEqual({
      added: [],
      removed: [],
      renamed: [{ from: "dialog:close-trigger", to: "alert:close-trigger" }],
    });
    expect(diff.changed.alert).toBeUndefined();
    expect(diff.breaking).toBe(true);
    expect(renderDiff(diff)).toContain(
      "- part renommée : `dialog:close-trigger` → `alert:close-trigger`",
    );
  });

  it("matches a rename inside one component the same way", () => {
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ parts: ["dialog:trigger", "dialog:dismiss"] }),
      [{ ...closeToDismiss, to: "dialog:dismiss" }],
    );
    expect(diff.changed.dialog?.parts.renamed).toEqual([
      { from: "dialog:close-trigger", to: "dialog:dismiss" },
    ]);
  });

  it("emits the rename on the destination when the component the part left is gone", () => {
    const gone = diffManifests(
      manifestOf({ others: { alert: ["alert:trigger"], legacy: ["legacy:close-trigger"] } }),
      manifestOf({ others: { alert: ["alert:trigger", "alert:close-trigger"] } }),
      [{ ...move, component: "legacy", from: "legacy:close-trigger" }],
    );
    expect(gone.changed.alert?.parts).toEqual({
      added: [],
      removed: [],
      renamed: [{ from: "legacy:close-trigger", to: "alert:close-trigger" }],
    });
    expect(gone.components.removed).toEqual(["legacy"]);
    expect(gone.breaking).toBe(true);
  });

  it("keeps the addition when no entry says where the part came from", () => {
    const gone = diffManifests(
      manifestOf({ others: { alert: ["alert:trigger"], legacy: ["legacy:close-trigger"] } }),
      manifestOf({ others: { alert: ["alert:trigger", "alert:close-trigger"] } }),
      [],
    );
    expect(gone.changed.alert?.parts.added).toEqual(["alert:close-trigger"]);
    expect(gone.changed.alert?.parts.renamed).toEqual([]);
  });
});

describe("props tables", () => {
  it("reads a question mark as optionality and never as part of the name", () => {
    const diff = diffManifests(
      manifestOf({ props: { T: ["open?", "label"] } }),
      manifestOf({ props: { T: ["open", "label?"] } }),
      [],
    );
    expect(diff.changed.dialog?.props.T).toEqual({
      added: [],
      removed: [],
      renamed: [],
      table: null,
      direction: "in",
      addedRequired: [],
      optional: ["label"],
      required: ["open"],
      definition: null,
    });
    const text = renderDiff(diff);
    expect(text).toContain("- prop devenue optionnelle dans `T` : `label`");
    expect(text).toContain("- prop devenue obligatoire dans `T` : `open`");
  });

  it("calls required to optional harmless and optional to required breaking", () => {
    const loosened = diffManifests(
      manifestOf({ props: { T: ["open"] } }),
      manifestOf({ props: { T: ["open?"] } }),
      [],
    );
    expect(loosened.changed.dialog?.props.T?.optional).toEqual(["open"]);
    expect(loosened.breaking).toBe(false);
    const tightened = diffManifests(
      manifestOf({ props: { T: ["open?"] } }),
      manifestOf({ props: { T: ["open"] } }),
      [],
    );
    expect(tightened.changed.dialog?.props.T?.required).toEqual(["open"]);
    expect(tightened.breaking).toBe(true);
  });

  it("reports a table that appeared or vanished, breaking only when it held something", () => {
    const empty = diffManifests(manifestOf({ props: { T: [] } }), manifestOf({ props: {} }), []);
    expect(empty.changed.dialog?.props.T?.table).toBe("removed");
    expect(empty.breaking).toBe(false);
    expect(renderDiff(empty)).toContain("- table retirée : `T`");
    const full = diffManifests(
      manifestOf({ props: { T: ["open?"] } }),
      manifestOf({ props: {} }),
      [],
    );
    expect(full.breaking).toBe(true);
    const appeared = diffManifests(
      manifestOf({ props: {} }),
      manifestOf({ props: { T: ["open?"] } }),
      [],
    );
    expect(appeared.changed.dialog?.props.T?.table).toBe("added");
    expect(appeared.breaking).toBe(false);
    expect(renderDiff(appeared)).toContain("- table ajoutée : `T`");
  });

  it("reports an alias table that vanished as breaking, through its members", () => {
    const diff = diffManifests(
      manifestOf({ props: { V: [] }, aliases: { V: '"a" | "b"' } }),
      manifestOf({ props: {}, aliases: {} }),
      [],
    );
    expect(diff.changed.dialog?.props.V?.table).toBe("removed");
    expect(diff.changed.dialog?.props.V?.definition?.removed).toEqual(['"a"', '"b"']);
    expect(diff.breaking).toBe(true);
  });

  it("calls a union member removed breaking and a member added harmless", () => {
    const before = manifestOf({ props: { V: [] }, aliases: { V: '"a" | "b"' } });
    const widened = diffManifests(
      before,
      manifestOf({ props: { V: [] }, aliases: { V: '"a" | "b" | "c"' } }),
      [],
    );
    expect(widened.changed.dialog?.props.V?.definition).toEqual({
      from: '"a" | "b"',
      to: '"a" | "b" | "c"',
      added: ['"c"'],
      removed: [],
    });
    expect(widened.breaking).toBe(false);
    const narrowed = diffManifests(
      before,
      manifestOf({ props: { V: [] }, aliases: { V: '"a"' } }),
      [],
    );
    expect(narrowed.changed.dialog?.props.V?.definition?.removed).toEqual(['"b"']);
    expect(narrowed.breaking).toBe(true);
    const text = renderDiff(narrowed);
    expect(text).toContain('- définition changée dans `V` : `"a" | "b"` → `"a"`');
    expect(text).toContain('- membre retiré dans `V` : `"b"`');
  });

  it("splits a definition on its top-level bars only", () => {
    const diff = diffManifests(
      manifestOf({
        props: { V: [] },
        aliases: { V: '"a|b" | ((x: 1 | 2) => void) | Array<1 | 2>' },
      }),
      manifestOf({ props: { V: [] }, aliases: { V: '"a|b" | ((x: 1 | 2) => void)' } }),
      [],
    );
    expect(diff.changed.dialog?.props.V?.definition?.removed).toEqual(["Array<1 | 2>"]);
    expect(diff.changed.dialog?.props.V?.definition?.added).toEqual([]);
  });

  it("reports a reordered union without calling it breaking", () => {
    const diff = diffManifests(
      manifestOf({ props: { V: [] }, aliases: { V: '"a" | "b"' } }),
      manifestOf({ props: { V: [] }, aliases: { V: '"b" | "a"' } }),
      [],
    );
    expect(diff.changed.dialog?.props.V?.definition).toEqual({
      from: '"a" | "b"',
      to: '"b" | "a"',
      added: [],
      removed: [],
    });
    expect(diff.breaking).toBe(false);
  });
});

describe("packages/react/api/renames.json", () => {
  const file = JSON.parse(
    readFileSync(path.join(root, "packages/react/api/renames.json"), "utf8"),
  ) as { schema: unknown; renames: unknown };

  it("has schema 1 and a valid list, every target present in the current manifest", async () => {
    expect(file.schema).toBe(1);
    expect(renameProblems(file.renames, { manifest: await collectManifest() })).toEqual([]);
  });

  it("the validator catches each way an entry can be wrong", () => {
    const good = { since: "1", kind: "prop", component: "a", table: "T", from: "x", to: "y" };
    expect(renameProblems([good])).toEqual([]);
    expect(renameProblems([good, good])).toEqual(["#1: duplicate"]);
    expect(renameProblems([{ ...good, to: "x" }])).toEqual(["#0: from equals to"]);
    expect(renameProblems([{ ...good, table: undefined }])).toEqual([
      "#0: a prop rename needs its table",
    ]);
    expect(renameProblems([{ ...good, kind: "part" }])).toEqual(["#0: only a prop has a table"]);
    expect(renameProblems([{ ...good, since: undefined }])).toEqual(["#0: since is missing"]);
    expect(renameProblems([{ ...good, kind: "slot", table: undefined }])).toEqual([
      "#0: unknown kind",
    ]);
    expect(renameProblems([{ ...good, kind: "hook", table: undefined }])).toEqual([]);
    expect(
      renameProblems([{ ...good, kind: "token", table: undefined, component: undefined }]),
    ).toEqual([]);
    expect(
      renameProblems([{ ...good, kind: "hook", table: undefined, component: undefined }]),
    ).toEqual(["#0: component is missing"]);
  });

  it("the validator checks components and targets against a manifest", () => {
    const manifest = manifestOf({ props: { T: ["open?"] }, globalTokens: ["--sui-color-tint"] });
    const since = manifest.version;
    const context = { manifest };
    const part = { since, kind: "part", component: "dialog" };
    expect(
      renameProblems([{ ...part, from: "dialog:old", to: "dialog:trigger" }], context),
    ).toEqual([]);
    expect(renameProblems([{ ...part, from: "dialog:old", to: "dialog:typo" }], context)).toEqual([
      "#0: dialog:typo does not exist in the current manifest",
    ]);
    expect(
      renameProblems(
        [{ ...part, component: "ghost", from: "ghost:a", to: "dialog:trigger" }],
        context,
      ),
    ).toEqual(["#0: component ghost is neither in the manifest nor renamed"]);
    expect(
      renameProblems([{ ...part, since: "0.0.1", from: "dialog:old", to: "dialog:typo" }], context),
    ).toEqual([]);
    expect(
      renameProblems([{ since, kind: "token", from: "--sui-x", to: "--sui-color-tint" }], context),
    ).toEqual([]);
    expect(
      renameProblems([{ since, kind: "token", from: "--sui-x", to: "--sui-typo" }], context),
    ).toEqual(["#0: --sui-typo does not exist in the current manifest"]);
    const hook = { since, kind: "hook", component: "dialog", from: "--sui-x" };
    expect(renameProblems([{ ...hook, to: "--sui-dialog-padding" }], context)).toEqual([]);
    expect(renameProblems([{ ...hook, to: "--sui-typo" }], context)).toEqual([
      "#0: --sui-typo does not exist in the current manifest",
    ]);
    const prop = { since, kind: "prop", component: "dialog", table: "T", from: "a" };
    expect(renameProblems([{ ...prop, to: "open?" }], context)).toEqual([]);
    expect(renameProblems([{ ...prop, to: "typo" }], context)).toEqual([
      "#0: typo does not exist in the current manifest",
    ]);
  });

  it("the validator accepts a published sheet as the owner of a token", () => {
    const manifest = manifestOf({});
    const since = manifest.version;
    const token = { since, kind: "token", component: "ambient", from: "--sui-x" };
    expect(renameProblems([{ ...token, to: "--sui-ambient-strength" }], { manifest })).toEqual([]);
    expect(renameProblems([{ ...token, to: "--sui-typo" }], { manifest })).toEqual([
      "#0: --sui-typo does not exist in the current manifest",
    ]);
    expect(
      renameProblems([{ ...token, component: "ghost", to: "--sui-color-tint" }], { manifest }),
    ).toEqual(["#0: component ghost is neither in the manifest nor renamed"]);
  });

  it("the validator reports an entry that is not an object instead of throwing", () => {
    expect(renameProblems([null])).toContain("#0: since is missing");
  });

  it("the validator follows a component rename in both directions", () => {
    const manifest = manifestOf({ extra: ["flyout"] });
    const since = manifest.version;
    const rename = {
      since,
      kind: "component",
      component: "popover",
      from: "popover",
      to: "flyout",
    };
    const token = {
      since,
      kind: "token",
      component: "popover",
      from: "--sui-popover-gap",
      to: "--sui-dialog-width",
    };
    expect(renameProblems([rename, token], { manifest })).toEqual([]);
    expect(renameProblems([{ ...rename, to: "typo" }], { manifest })).toEqual([
      "#0: typo does not exist in the current manifest",
    ]);
  });
});

describe("input and output tables", () => {
  const appended = (rows: string[], flows?: Record<string, Flow>): ComponentManifest =>
    manifestOf({ props: { T: rows }, ...(flows === undefined ? {} : { flows }) });

  it("calls a required row added to an existing input table breaking", () => {
    const required = diffManifests(appended(["open?"]), appended(["open?", "intent"]), []);
    expect(required.changed.dialog?.props.T?.addedRequired).toEqual(["intent"]);
    expect(required.breaking).toBe(true);
    expect(renderDiff(required)).toContain("- prop obligatoire ajoutée dans `T` : `intent`");
    const optional = diffManifests(appended(["open?"]), appended(["open?", "intent?"]), []);
    expect(optional.changed.dialog?.props.T?.addedRequired).toEqual([]);
    expect(optional.breaking).toBe(false);
  });

  it("does not call a required row of a brand new table breaking", () => {
    const diff = diffManifests(manifestOf({ props: {} }), appended(["open"]), []);
    expect(diff.changed.dialog?.props.T?.table).toBe("added");
    expect(diff.breaking).toBe(false);
  });

  it("inverts the rules for an output table, told by its flow or by a Details name", () => {
    const flows: Record<string, Flow> = { T: "out" };
    const loosened = diffManifests(appended(["open"], flows), appended(["open?"], flows), []);
    expect(loosened.breaking).toBe(true);
    const tightened = diffManifests(appended(["open?"], flows), appended(["open"], flows), []);
    expect(tightened.breaking).toBe(false);
    const added = diffManifests(appended(["open"], flows), appended(["open", "extra"], flows), []);
    expect(added.breaking).toBe(false);
    const removed = diffManifests(
      appended(["open", "extra"], flows),
      appended(["open"], flows),
      [],
    );
    expect(removed.breaking).toBe(true);
    const byName = (rows: string[]): ComponentManifest =>
      manifestOf({ props: { OpenChangeDetails: rows } });
    expect(diffManifests(byName(["open"]), byName(["open?"]), []).breaking).toBe(true);
    expect(diffManifests(byName(["open?"]), byName(["open"]), []).breaking).toBe(false);
  });

  it("calls a union member added to an output alias breaking and one removed harmless", () => {
    const alias = (definition: string, flow: Flow): ComponentManifest =>
      manifestOf({ props: { V: [] }, aliases: { V: definition }, flows: { V: flow } });
    expect(diffManifests(alias('"a"', "out"), alias('"a" | "b"', "out"), []).breaking).toBe(true);
    expect(diffManifests(alias('"a" | "b"', "out"), alias('"a"', "out"), []).breaking).toBe(false);
  });

  it("calls any member change of a union used both ways breaking", () => {
    const alias = (definition: string): ComponentManifest =>
      manifestOf({ props: { V: [] }, aliases: { V: definition }, flows: { V: "both" } });
    expect(diffManifests(alias('"a"'), alias('"a" | "b"'), []).breaking).toBe(true);
    expect(diffManifests(alias('"a" | "b"'), alias('"a"'), []).breaking).toBe(true);
  });

  it("applies them to the real manifest: a required prop, an optional open, a new CheckedState member", async () => {
    const real = await collectManifest();
    interface Editable {
      components: Record<
        string,
        { props: Record<string, string[]>; aliases: Record<string, string> }
      >;
    }
    const edited = (change: (copy: Editable) => void): ComponentManifest => {
      const copy = structuredClone(real) as unknown as Editable;
      change(copy);
      return copy as unknown as ComponentManifest;
    };
    const dialog = real.components.dialog;
    expect(Object.keys(dialog?.props ?? {})).toContain("DialogComposedProps");
    expect(dialog?.flows.DialogOpenChangeDetails).toBe("out");
    expect(real.components.checkbox?.flows.CheckedState).toBe("both");

    const required = edited((copy) => {
      const props = copy.components.dialog?.props as Record<string, string[]>;
      props.DialogComposedProps = [...(props.DialogComposedProps ?? []), "intent"];
    });
    expect(diffManifests(real, required, []).breaking).toBe(true);

    expect(dialog?.props.DialogOpenChangeDetails).toContain("open");
    const optional = edited((copy) => {
      const props = copy.components.dialog?.props as Record<string, string[]>;
      props.DialogOpenChangeDetails = (props.DialogOpenChangeDetails ?? []).map((row) =>
        row === "open" ? "open?" : row,
      );
    });
    expect(diffManifests(real, optional, []).breaking).toBe(true);

    const mixed = edited((copy) => {
      const aliases = copy.components.checkbox?.aliases as Record<string, string>;
      aliases.CheckedState = `${aliases.CheckedState} | "mixed"`;
    });
    expect(diffManifests(real, mixed, []).breaking).toBe(true);
  });
});

describe("a name that only changes category", () => {
  it("reports a hook that became a read as reclassified, not breaking", () => {
    const diff = diffManifests(
      manifestOf({ hooks: ["--sui-dialog-padding", "--sui-card-gap"] }),
      manifestOf({
        hooks: ["--sui-dialog-padding"],
        reads: ["--sui-color-label", "--sui-card-gap"],
        globalTokens: ["--sui-color-label", "--sui-color-tint", "--sui-card-gap"],
      }),
      [],
    );
    expect(diff.changed.dialog?.reclassified).toEqual([
      { name: "--sui-card-gap", from: "hook", to: "read" },
    ]);
    expect(diff.changed.dialog?.hooks.removed).toEqual([]);
    expect(diff.changed.dialog?.reads.added).toEqual([]);
    expect(diff.breaking).toBe(false);
    expect(renderDiff(diff)).toContain("- reclassé : `--sui-card-gap` (hook → lecture)");
  });

  it("reports a read that became a hook, and a hook that became a token", () => {
    const readToHook = diffManifests(
      manifestOf({ reads: ["--sui-color-label", "--sui-card-gap"], hooks: [] }),
      manifestOf({ reads: ["--sui-color-label"], hooks: ["--sui-card-gap"] }),
      [],
    );
    expect(readToHook.changed.dialog?.reclassified).toEqual([
      { name: "--sui-card-gap", from: "read", to: "hook" },
    ]);
    expect(readToHook.breaking).toBe(false);
    const hookToToken = diffManifests(
      manifestOf({ hooks: ["--sui-dialog-padding"] }),
      manifestOf({ hooks: [], tokens: ["--sui-dialog-width", "--sui-dialog-padding"] }),
      [],
    );
    expect(hookToToken.changed.dialog?.reclassified).toEqual([
      { name: "--sui-dialog-padding", from: "hook", to: "token" },
    ]);
    expect(hookToToken.breaking).toBe(false);
  });

  it("does not call a token breaking when the sheet stops redeclaring a name it still reads", () => {
    const diff = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-width", "--sui-color-tint"] }),
      manifestOf({ reads: ["--sui-color-label", "--sui-color-tint"] }),
      [],
    );
    expect(diff.changed.dialog?.tokens.removed).toEqual([]);
    expect(diff.changed.dialog?.reclassified).toEqual([
      { name: "--sui-color-tint", from: "token", to: "read" },
    ]);
    expect(diff.breaking).toBe(false);
  });

  it("calls it breaking when the component stops reading, or declaring, a name that stays global", () => {
    const read = diffManifests(
      manifestOf({ reads: ["--sui-color-label", "--sui-color-tint"] }),
      manifestOf({}),
      [],
    );
    expect(read.changed.dialog?.reads.removed).toEqual(["--sui-color-tint"]);
    expect(read.changed.dialog?.reclassified).toEqual([]);
    expect(read.breaking).toBe(true);
    const declared = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-width", "--sui-color-tint"] }),
      manifestOf({}),
      [],
    );
    expect(declared.changed.dialog?.tokens.removed).toEqual(["--sui-color-tint"]);
    expect(declared.breaking).toBe(true);
  });

  it("calls a name breaking when it leaves every category and the global set", () => {
    const hook = diffManifests(manifestOf({}), manifestOf({ hooks: [] }), []);
    expect(hook.changed.dialog?.hooks.removed).toEqual(["--sui-dialog-padding"]);
    expect(hook.breaking).toBe(true);
    const token = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-width", "--sui-dialog-gap"] }),
      manifestOf({}),
      [],
    );
    expect(token.breaking).toBe(true);
  });

  it("calls a global token breaking when a component now declares it on its own scope", () => {
    const diff = diffManifests(
      manifestOf({ reads: ["--sui-color-label", "--sui-color-tint"] }),
      manifestOf({
        globalTokens: ["--sui-color-label"],
        reads: ["--sui-color-label"],
        tokens: ["--sui-dialog-width", "--sui-color-tint"],
      }),
      [],
    );
    expect(diff.tokens.removed).toEqual([]);
    expect(diff.reclassified).toEqual([{ name: "--sui-color-tint", from: "global", to: "token" }]);
    expect(diff.breaking).toBe(true);
    expect(renderDiff(diff)).toContain("- reclassé : `--sui-color-tint` (token global → token)");
  });

  it("keeps a token that leaves the global layer but stays a hook non-breaking", () => {
    const diff = diffManifests(
      manifestOf({ reads: ["--sui-color-label", "--sui-color-tint"] }),
      manifestOf({
        globalTokens: ["--sui-color-label"],
        reads: ["--sui-color-label"],
        hooks: ["--sui-dialog-padding", "--sui-color-tint"],
      }),
      [],
    );
    expect(diff.reclassified).toEqual([{ name: "--sui-color-tint", from: "global", to: "hook" }]);
    expect(diff.breaking).toBe(false);
  });

  it("calls a name that becomes a channel breaking, from a hook, a read, a token or the global layer", () => {
    const into = (before: Parameters<typeof manifestOf>[0], name: string): void => {
      const diff = diffManifests(manifestOf(before), manifestOf({ channels: [name] }), []);
      expect(diff.breaking, name).toBe(true);
      expect(diff.changed.dialog?.reclassified.map((entry) => entry.to)).toEqual(["channel"]);
    };
    into({ hooks: ["--sui-dialog-padding", "--sui-card-padding"] }, "--sui-card-padding");
    into(
      { hooks: [], reads: ["--sui-color-label", "--sui-border-width-thin"] },
      "--sui-border-width-thin",
    );
    into({ hooks: [], tokens: ["--sui-dialog-width", "--sui-drag-offset"] }, "--sui-drag-offset");
    const global = diffManifests(
      manifestOf({ globalTokens: ["--sui-color-label", "--sui-drag-offset"] }),
      manifestOf({ globalTokens: ["--sui-color-label"], channels: ["--sui-drag-offset"] }),
      [],
    );
    expect(global.reclassified).toEqual([
      { name: "--sui-drag-offset", from: "global", to: "channel" },
    ]);
    expect(global.breaking).toBe(true);
  });

  it("never calls a channel that goes away, or that becomes a lever, breaking", () => {
    const gone = diffManifests(manifestOf({ channels: ["--sui-drag-offset"] }), manifestOf({}), []);
    expect(gone.changed.dialog?.channels.removed).toEqual(["--sui-drag-offset"]);
    expect(gone.breaking).toBe(false);
    expect(renderDiff(gone)).toContain("- canal retiré : `--sui-drag-offset`");
    const lever = diffManifests(
      manifestOf({ channels: ["--sui-collapse-height"] }),
      manifestOf({ hooks: ["--sui-dialog-padding", "--sui-collapse-height"] }),
      [],
    );
    expect(lever.changed.dialog?.reclassified).toEqual([
      { name: "--sui-collapse-height", from: "channel", to: "hook" },
    ]);
    expect(lever.breaking).toBe(false);
  });

  it("skips the channels of a side that predates them", () => {
    const before = manifestOf({});
    const component = before.components.dialog as ComponentManifest["components"][string];
    const { channels: _channels, ...legacy } = component;
    const old = { ...before, components: { dialog: legacy } } as unknown as ComponentManifest;
    expect(diffManifests(old, manifestOf({}), []).changed).toEqual({});
  });
});

describe("the published sheets", () => {
  it("reports a token removed from an opt-in sheet as breaking", () => {
    const diff = diffManifests(manifestOf({}), manifestOf({ sheets: { ambient: {} } }), []);
    expect(diff.sheetChanged.ambient?.tokens.removed).toEqual(["--sui-ambient-strength"]);
    expect(diff.breaking).toBe(true);
    const text = renderDiff(diff);
    expect(text).toContain("## Feuille ambient");
    expect(text).toContain("- token retiré : `--sui-ambient-strength`");
  });

  it("reports a token added to a sheet, a hook removed and a sheet gone", () => {
    const added = diffManifests(
      manifestOf({}),
      manifestOf({
        sheets: { ambient: { tokens: ["--sui-ambient-strength", "--sui-ambient-x"] } },
      }),
      [],
    );
    expect(added.sheetChanged.ambient?.tokens.added).toEqual(["--sui-ambient-x"]);
    expect(added.breaking).toBe(false);
    const hooks = diffManifests(
      manifestOf({ sheets: { ambient: { hooks: ["--sui-ambient-1"] } } }),
      manifestOf({ sheets: { ambient: {} } }),
      [],
    );
    expect(hooks.sheetChanged.ambient?.hooks.removed).toEqual(["--sui-ambient-1"]);
    expect(hooks.breaking).toBe(true);
    const gone = diffManifests(manifestOf({}), manifestOf({ sheets: {} }), []);
    expect(gone.sheets.removed).toEqual(["ambient"]);
    expect(gone.breaking).toBe(true);
    expect(renderDiff(gone)).toContain("- feuille retirée");
    const appeared = diffManifests(manifestOf({ sheets: {} }), manifestOf({}), []);
    expect(appeared.sheets.added).toEqual(["ambient"]);
    expect(appeared.breaking).toBe(false);
  });

  it("does not compare sheets against a manifest that predates them", () => {
    const old = { ...manifestOf({}), sheets: undefined } as unknown as ComponentManifest;
    const diff = diffManifests(old, manifestOf({}), []);
    expect(diff.sheets).toEqual({ added: [], removed: [], renamed: [] });
    expect(diff.sheetChanged).toEqual({});
    expect(diff.breaking).toBe(false);
  });
});

describe("rename chains", () => {
  const link = (from: string, to: string, since: string): Rename => ({
    since,
    kind: "token",
    component: "dialog",
    from,
    to,
  });

  it("resolves A to B then B to C in one cut", () => {
    const diff = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-a"] }),
      manifestOf({ tokens: ["--sui-dialog-c"] }),
      [
        link("--sui-dialog-a", "--sui-dialog-b", "1"),
        link("--sui-dialog-b", "--sui-dialog-c", "2"),
      ],
    );
    expect(diff.changed.dialog?.tokens).toEqual({
      added: [],
      removed: [],
      renamed: [{ from: "--sui-dialog-a", to: "--sui-dialog-c" }],
    });
  });

  it("still pairs the last link when only that one is in play", () => {
    const diff = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-b"] }),
      manifestOf({ tokens: ["--sui-dialog-c"] }),
      [
        link("--sui-dialog-a", "--sui-dialog-b", "1"),
        link("--sui-dialog-b", "--sui-dialog-c", "2"),
      ],
    );
    expect(diff.changed.dialog?.tokens.renamed).toEqual([
      { from: "--sui-dialog-b", to: "--sui-dialog-c" },
    ]);
  });

  it("resolves a chain of part moves", () => {
    const part = (from: string, to: string): Rename => ({
      since: "1",
      kind: "part",
      component: "dialog",
      from,
      to,
    });
    const diff = diffManifests(
      manifestOf({}),
      manifestOf({ parts: ["dialog:trigger", "dialog:z"] }),
      [part("dialog:close-trigger", "dialog:y"), part("dialog:y", "dialog:z")],
    );
    expect(diff.changed.dialog?.parts.renamed).toEqual([
      { from: "dialog:close-trigger", to: "dialog:z" },
    ]);
    expect(diff.changed.dialog?.parts.removed).toEqual([]);
  });

  it("does not loop on a cycle", () => {
    const diff = diffManifests(
      manifestOf({ tokens: ["--sui-dialog-a"] }),
      manifestOf({ tokens: ["--sui-dialog-b"] }),
      [
        link("--sui-dialog-a", "--sui-dialog-b", "1"),
        link("--sui-dialog-b", "--sui-dialog-a", "2"),
      ],
    );
    expect(diff.changed.dialog?.tokens.renamed).toEqual([
      { from: "--sui-dialog-a", to: "--sui-dialog-b" },
    ]);
  });
});

describe("the command line", () => {
  it("exits 2 on a missing path and names the side", () => {
    const result = runCli(["does-not-exist.json", "packages/react/api/manifest.json"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("old side");
    const other = runCli(["packages/react/api/manifest.json", "does-not-exist.tgz"]);
    expect(other.code).toBe(2);
    expect(other.stderr).toContain("new side");
  });

  it("exits 2 with the problems listed when the renames of a side are invalid", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "manifest-diff-"));
    try {
      const committed = path.join(root, "packages/react/api/manifest.json");
      const manifest = path.join(dir, "manifest.json");
      copyFileSync(committed, manifest);
      const bad = {
        since: "1",
        kind: "part",
        component: "dialog",
        from: "dialog:a",
        to: "dialog:a",
      };
      writeFileSync(
        path.join(dir, "renames.json"),
        JSON.stringify({ schema: 1, renames: [bad, bad] }),
      );
      const result = runCli([committed, manifest]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("new side");
      expect(result.stderr).toContain("#0: from equals to");
      expect(result.stderr).toContain("#1: duplicate");
      const old = runCli([manifest, committed]);
      expect(old.code).toBe(2);
      expect(old.stderr).toContain("old side");
      writeFileSync(path.join(dir, "renames.json"), JSON.stringify({ schema: 1, renames: [] }));
      expect(runCli([committed, manifest]).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 on the wrong number of arguments", () => {
    expect(runCli(["only-one.json"]).code).toBe(2);
  });

  it("exits 0 and prints no change for the committed manifest against itself", () => {
    const file = path.join(root, "packages/react/api/manifest.json");
    const result = runCli([file, file]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Aucun changement.\n");
    const json = JSON.parse(runCli([file, file, "--json"]).stdout) as { breaking: boolean };
    expect(json.breaking).toBe(false);
  });
});
