/**
 * The generator is read twice here, and the two reads answer different questions.
 *
 * The fixtures pin the mechanics that have no other witness: which comment
 * belongs to which member, what happens to `| undefined`, and which line a member
 * was declared on — oxc reports byte offsets and no lines at all.
 *
 * The last read is a drift guard. The tables under `packages/react/api` are
 * committed so an API change shows up in review, and a committed generated file
 * is stale the moment someone edits a type without rerunning the generator.
 * Nothing else would notice: the site builds fine from a stale table, and it is
 * wrong in exactly the way a docs site is worst at being wrong — confidently.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ApiTable,
  collect,
  findTypeAlias,
  isDeclaredInRepo,
  JSON_OUTPUT_DIR,
  jsonName,
  readInterface,
  renderJson,
  SHARED_VOCABULARY,
  toTables,
} from "./api-reference";

const root = path.resolve(import.meta.dirname, "..");

const FIXTURE = `
export interface WidgetMachineProps {
  readonly plain?: string | undefined;
  /** Attached to the member below it. */
  readonly documented?: number | undefined;
  readonly required: boolean;
  readonly union?: "a" | "b" | undefined;
  readonly callback?: ((details: Details) => void) | undefined;
}

export type WidgetComposedProps = WidgetMachineProps & { readonly extra: string };
`;

describe("reading an interface out of source", () => {
  const api = readInterface(FIXTURE, "fixture.ts", "WidgetMachineProps");

  it("finds every property signature", () => {
    expect(api?.members.map((member) => member.name)).toEqual([
      "plain",
      "documented",
      "required",
      "union",
      "callback",
    ]);
  });

  it("claims a comment only for the member directly below it", () => {
    const docs = Object.fromEntries(api?.members.map((m) => [m.name, m.doc]) ?? []);
    expect(docs.documented).toBe("Attached to the member below it.");
    // The member after a documented one is the trap: a naive "last comment
    // before this position" attaches the same JSDoc to every member that follows.
    expect(docs.required).toBeUndefined();
    expect(docs.plain).toBeUndefined();
  });

  it("drops `| undefined` from an optional member and keeps it nowhere else", () => {
    const types = Object.fromEntries(api?.members.map((m) => [m.name, m.type]) ?? []);
    expect(types.plain).toBe("string");
    expect(types.union).toBe('"a" | "b"');
    expect(types.callback).toBe("((details: Details) => void)");
    expect(types.required).toBe("boolean");
  });

  it("records optionality rather than inferring it from the type", () => {
    const optional = Object.fromEntries(api?.members.map((m) => [m.name, m.optional]) ?? []);
    expect(optional.required).toBe(false);
    expect(optional.plain).toBe(true);
  });

  it("returns undefined for a name that is not there, and does not throw", () => {
    expect(readInterface(FIXTURE, "fixture.ts", "Absent")).toBeUndefined();
  });

  it("reads a type alias, which is what `InputComposedProps` is", () => {
    const alias = findTypeAlias(FIXTURE, "fixture.ts", (name) => name.endsWith("ComposedProps"));
    expect(alias?.name).toBe("WidgetComposedProps");
    expect(alias?.text).toBe("WidgetMachineProps & { readonly extra: string }");
  });
});

/**
 * An interface written in methods, which is how `ColorPickerEyedropper` avoids
 * naming the machine's schema (decision 65): a method's parameters are bivariant,
 * a property's are not. The reader used to take only property signatures, so such
 * a table reached the site as a caption over an empty body.
 */
const METHODS = `
export interface Probe {
  /** Starts watching. */
  detect(params: object): EffectCleanup;
  open?(params: object): void;
  pick<T extends string>(value: T, ...rest: number[]): readonly T[];
  idle(): void;
  readonly label: string;
  get hidden(): boolean;
}
`;

describe("reading an interface written in methods", () => {
  const api = readInterface(METHODS, "fixture.ts", "Probe");
  const byName = Object.fromEntries(api?.members.map((member) => [member.name, member]) ?? []);

  it("gives a method signature a row, beside the properties, in source order", () => {
    expect(api?.members.map((member) => member.name)).toEqual([
      "detect",
      "open",
      "pick",
      "idle",
      "label",
    ]);
  });

  it("keeps the signature as the author wrote it, parameters and return type", () => {
    expect(byName.detect?.type).toBe("(params: object): EffectCleanup");
    expect(byName.pick?.type).toBe("<T extends string>(value: T, ...rest: number[]): readonly T[]");
    expect(byName.idle?.type).toBe("(): void");
  });

  it("records an optional method as optional, and keeps the `?` out of its type", () => {
    expect(byName.open?.optional).toBe(true);
    expect(byName.open?.type).toBe("(params: object): void");
    expect(byName.detect?.optional).toBe(false);
  });

  it("claims the JSDoc above a method and the line it is declared on", () => {
    expect(byName.detect?.doc).toBe("Starts watching.");
    expect(byName.open?.doc).toBeUndefined();
    expect(byName.detect?.source.line).toBe(4);
    expect(byName.open?.source.line).toBe(5);
  });

  it("leaves an accessor out rather than minting a row with a wrong type", () => {
    expect(byName.hidden).toBeUndefined();
  });

  it("tables the real eyedropper with a row per method", () => {
    const picker = collect().find((entry) => entry.component === "color-picker");
    const eyedropper = picker?.tables.find((table) => table.name === "ColorPickerEyedropper");
    expect(eyedropper?.rows.map((row) => row.name)).toEqual(["detect", "open"]);
    expect(eyedropper?.rows.map((row) => row.type)).toEqual([
      "(params: object): EffectCleanup",
      "(params: object): void",
    ]);
  });
});

/**
 * The banner a member sits under — the one thing in these tables the generator
 * reads rather than derives, and the reason a forty-nine row table can be read.
 *
 * Every case here is a way the feature could quietly take something away: a
 * heading claimed by a type it does not describe, a run of rows silently
 * annexed by the group above it, or a member's JSDoc lost to the banner that
 * was meant only to group it.
 */
const BANNERED = `
// --- prop-getter inputs -----------------------------------------------------

export interface WidgetItemProps {
  readonly value: string;
}

export interface WidgetMachineProps {
  readonly open?: boolean | undefined;

  // --- positioning, handed straight to the positioner ------------------------
  readonly placement?: string | undefined;
  /** Air between the anchor and the surface. */
  readonly gap?: number | undefined;

  // ---------------------------------------------------------------------------
  readonly afterABareRule?: boolean | undefined;

  /** Survives the banner standing between this note and its member. */
  // --- naming ----------------------------------------------------------------
  readonly label?: string | undefined;
}
`;

describe("the banner a member sits under", () => {
  const groups = Object.fromEntries(
    readInterface(BANNERED, "fixture.ts", "WidgetMachineProps")?.members.map((member) => [
      member.name,
      member.group,
    ]) ?? [],
  );

  it("names every member below it, and says nothing about those above", () => {
    // `open` is declared before the first banner. Six of the library's real
    // interfaces open this way, and the honest answer for those rows is that
    // their author named no group — never that they belong to the one below.
    expect(groups.open).toBeUndefined();
    expect(groups.placement).toBe("positioning, handed straight to the positioner");
    expect(groups.gap).toBe("positioning, handed straight to the positioner");
  });

  it("does not reach into an interface from outside it", () => {
    // The hazard that decides the whole design. The same `// ---` convention
    // divides top-level declarations — `// --- prop-getter inputs` sits above
    // `SelectItemProps`, `MenuItemProps` and one more in the real sources — so a
    // search for the nearest banner above a member, unbounded, would stamp that
    // heading onto every member of seven types it says nothing about.
    const item = readInterface(BANNERED, "fixture.ts", "WidgetItemProps");
    expect(item?.members.map((member) => member.group)).toEqual([undefined]);
  });

  it("treats a rule with no words as a divider, and not as a heading", () => {
    // It names no group, and it does not end the one in force: only a labelled
    // banner ever changes the answer. Pinned because the alternative reading —
    // a bare rule closes the group — is equally arguable and nothing in the
    // library writes one, so the choice had to be made somewhere it can be seen.
    expect(groups.afterABareRule).toBe("positioning, handed straight to the positioner");
  });

  it("never costs a member its JSDoc", () => {
    // A banner between a note and its member is the one shape where the two
    // features fight: it is the nearest comment, it is not a block, and the note
    // would be dropped. Both have to survive, and the note is the one that would
    // have gone missing without a word.
    const label = readInterface(BANNERED, "fixture.ts", "WidgetMachineProps")?.members.find(
      (member) => member.name === "label",
    );
    expect(label?.doc).toBe("Survives the banner standing between this note and its member.");
    expect(label?.group).toBe("naming");
  });

  it("reads the real sources the same way, and leaks into none of their neighbours", () => {
    // The fixture proves the rule; this proves it is the rule the library meets.
    // `select.types.ts` carries both shapes: a machine interface its author
    // divided, and a run of prop-getter types under a file-level banner.
    const collected = collect();
    const select = collected.find((entry) => entry.component === "select");
    const machine = select?.tables.find((table) => table.name === "SelectMachineProps");
    expect([...new Set(machine?.rows.map((row) => row.group))]).toEqual([
      "value",
      "openness",
      "positioning, handed straight to the positioner",
      "collection",
      "dismissal (the menu's defaults)",
      "focus",
      "form",
      "misc",
    ]);

    const neighbours =
      select?.tables.filter(
        (table) => table.name !== "SelectMachineProps" && table !== select.cssVars,
      ) ?? [];
    expect(neighbours.length).toBeGreaterThan(0);
    const stamped = neighbours.filter((table) => table.rows.some((row) => row.group !== undefined));
    expect(stamped.map((table) => table.name)).toEqual([]);
  });
});

/**
 * The output escapes nothing, which is a claim about `JSON.stringify` and not
 * about this repository — so it is asserted rather than trusted. Every character
 * a markup form would have had to escape goes in, and comes back out identical.
 */
describe("rendering the JSON form", () => {
  it("carries a union, an MDX metacharacter and a quote through untouched", () => {
    const tables = toTables([
      {
        name: "WidgetMachineProps",
        extendsNames: [],
        members: [
          {
            name: "union",
            optional: true,
            type: '"a" | "b"',
            doc: 'cannot name a `div[role="slider"]` when x < y {or z}',
            group: undefined,
            source: { file: "widget.types.ts", line: 12 },
          },
        ],
      },
    ]);
    const [row] = JSON.parse(JSON.stringify(tables))[0].rows;
    expect(row.type).toBe('"a" | "b"');
    expect(row.notes).toBe('cannot name a `div[role="slider"]` when x < y {or z}');
    expect(row.name).toBe("union?");
    expect(row.source).toBe("widget.types.ts:12");
  });

  it("joins two extends rather than reporting the first as the whole story", () => {
    const [table] = toTables([
      { name: "Widget", extendsNames: ["A", 'Omit<B, "c">'], members: [] },
    ]);
    expect(table?.extends).toBe('A, Omit<B, "c">');
  });

  it("says nothing rather than an empty string when it extends nothing", () => {
    const [table] = toTables([{ name: "Widget", extendsNames: [], members: [] }]);
    expect(table?.extends).toBeUndefined();
  });

  it("never gives an interface a definition, which is the alias's field", () => {
    // The two fields are what lets a site write `extends A` for one and `= A` for
    // the other. An interface that picked up a definition would be rendered as an
    // alias, and this reader only ever walks interfaces.
    const [inherits] = toTables([{ name: "Widget", extendsNames: ["A"], members: [] }]);
    const [bare] = toTables([{ name: "Widget", extendsNames: [], members: [] }]);
    expect(inherits?.definition).toBeUndefined();
    expect(bare?.definition).toBeUndefined();
  });
});

/**
 * oxc reports byte offsets and no lines at all, so the line is counted here —
 * and a counter is exactly the thing that lands one off without anyone noticing.
 * The fixture's own lines are the witness: it opens on a newline, so the
 * interface is line 2 and its first member is line 3.
 */
describe("the line a member was declared on", () => {
  const api = readInterface(FIXTURE, "fixture.ts", "WidgetMachineProps");
  const lines = Object.fromEntries(api?.members.map((m) => [m.name, m.source.line]) ?? []);

  it("counts the member's own line, not the file's first", () => {
    expect(lines.plain).toBe(3);
  });

  it("counts the declaration and not the JSDoc above it", () => {
    // `documented` sits on line 5 with its comment on line 4 — the off-by-one
    // that would go unnoticed everywhere else, because both lines read alike.
    expect(lines.documented).toBe(5);
    expect(lines.required).toBe(6);
  });

  it("reports the file by base name, so the value does not change with the OS", () => {
    expect(api?.members.every((member) => member.source.file === "fixture.ts")).toBe(true);
  });
});

describe("the real source it is pointed at", () => {
  const file = path.join(root, "packages/core/src/components/button/button.types.ts");
  const api = readInterface(readFileSync(file, "utf8"), file, "ButtonMachineProps");

  it("reads the button's props with their JSDoc intact through no build", () => {
    const loadingText = api?.members.find((member) => member.name === "loadingText");
    expect(loadingText?.type).toBe("string");
    expect(loadingText?.doc).toBe(
      "Announced politely when `loading` turns on. Without it nothing is announced — a spinner appearing is not news a screen reader has to interrupt for.",
    );
  });

  it("keeps the author's own text for a union rather than reconstructing one", () => {
    const type = api?.members.find((member) => member.name === "type");
    expect(type?.type).toBe('"button" | "submit" | "reset"');
  });
});

describe("what the generator walks", () => {
  const collected = collect();

  it("finds an interface for every component it walks", () => {
    const missing = collected.flatMap((entry) =>
      entry.missing.map((name) => `${entry.component}: ${name}`),
    );
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("covers the whole library, so a new component cannot be quietly skipped", () => {
    // The directories are read again here rather than taken from `collected`,
    // because a floor compared against the generator's own walk cannot fail: a
    // component that stops being walked leaves both sides of the comparison at
    // once. A written-down number cannot fail either — this one said 38 while 39
    // components rendered, so the library could lose one and stay green.
    const documented = new Set(
      collected.filter((entry) => entry.interfaces.length > 0).map((entry) => entry.component),
    );
    const onDisk = new Set(
      ["packages/core/src/components", "packages/react/src/components"].flatMap((dir) =>
        readdirSync(path.join(root, dir), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
      ),
    );
    const undocumented = [...onDisk].sort().filter((name) => !documented.has(name));
    expect(undocumented, `\n${undocumented.join("\n")}\n`).toEqual([]);
  });

  it("tables the alias a component is actually typed as", () => {
    // `<Input/>` takes `InputComposedProps`, an intersection over the interface
    // beside it. While this was collected and not rendered, the page documented
    // `InputBaseComposedProps` — the wrong type, convincingly — and narrowing the
    // alias left every committed file byte-identical.
    const input = collected.find((entry) => entry.component === "input");
    expect(input?.aliases.map((alias) => alias.name)).toContain("InputComposedProps");
    expect(input?.tables.map((table) => table.name)).toContain("InputComposedProps");
  });
});

/**
 * The property that makes the drift guard below worth anything: a table may not
 * name a type this repository declares and leave the reader with the name.
 *
 * Without it the artifact was a list of 158 capitalised tokens and no
 * definitions, so `DrawerDetent` could go from `number` to `0 | 0.5 | 1` — a
 * narrowing of the public API — with every committed file unchanged and this
 * file green.
 */
describe("the artifact defines what it cites", () => {
  const collected = collect();

  /**
   * Capitalised identifiers, matched exactly as the generator matches them —
   * both fields included, for the same reason `expand` reads both: an alias
   * carries every name it reaches in `definition` and nothing in `extends`, so a
   * scan over `extends` alone would report a clean bill on the 55 tables that
   * have only the other field.
   */
  function citedIn(table: ApiTable): string[] {
    return [
      table.extends ?? "",
      table.definition ?? "",
      ...table.rows.map((row) => row.type),
    ].flatMap((text) => [...text.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)].map((match) => match[0]));
  }

  it("leaves no cited name of this library undefined and unnamed", () => {
    const shared = new Set(SHARED_VOCABULARY);
    const offenders: string[] = [];
    for (const entry of collected) {
      const defined = new Set(entry.tables.map((table) => table.name));
      for (const table of entry.tables) {
        for (const name of citedIn(table)) {
          if (defined.has(name) || shared.has(name)) continue;
          // Foreign names — `ReactNode`, `Omit`, a generic's `E` — are not this
          // repository's to define. Asked of the index rather than of the
          // generator's own `shared` list, so this reads the tables and the
          // source and agrees with the generator only when it is right.
          if (!isDeclaredInRepo(name)) continue;
          offenders.push(`${entry.component}: ${table.name} cites ${name}`);
        }
      }
    }
    expect(offenders, `\nadd these to SHARED_VOCABULARY:\n${offenders.join("\n")}\n`).toEqual([]);
  });

  it("would notice a citation that nothing defines", () => {
    // The detector against a table built to fail it, because the assertion above
    // is a list that came back empty, and an empty list proves nothing about
    // whether the scan ran at all.
    const table: ApiTable = {
      name: "Widget",
      extends: 'Omit<PartProps<"div">, "children">',
      definition: undefined,
      rows: [
        {
          name: "detent?",
          type: "readonly DrawerDetent[]",
          notes: undefined,
          source: "w.ts:1",
          group: undefined,
        },
      ],
    };
    expect(citedIn(table)).toContain("DrawerDetent");
    expect(citedIn(table)).toContain("PartProps");

    // The other field, and it is not symmetry for its own sake: an alias has no
    // rows and no heritage, so a scan that skipped `definition` would walk the
    // table this repository has 55 of and come back with nothing to report.
    const alias: ApiTable = {
      name: "WidgetEntry",
      extends: undefined,
      definition: "DrawerDetent | ComposedSeparator",
      rows: [],
    };
    expect(citedIn(alias)).toContain("DrawerDetent");
    expect(citedIn(alias)).toContain("ComposedSeparator");

    // And the half that decides whether a cited name is owed anything. Both
    // answers matter: if everything were foreign the guard would pass on an
    // empty library, and if nothing were, `ReactNode` would be demanded of it.
    expect(isDeclaredInRepo("DrawerDetent")).toBe(true);
    expect(isDeclaredInRepo("ReactNode")).toBe(false);
    expect(isDeclaredInRepo("Omit")).toBe(false);
  });

  it("keeps no shared name that nothing cites any more", () => {
    // The other half. A list only ever added to becomes a list that excuses
    // whatever used to be on it, and the entry nobody removed is the one
    // covering a type that quietly stopped being shared.
    const cited = new Set(collected.flatMap((entry) => entry.shared));
    const dead = SHARED_VOCABULARY.filter((name) => !cited.has(name));
    expect(dead, `\nremove these from SHARED_VOCABULARY:\n${dead.join("\n")}\n`).toEqual([]);
  });

  it("defines the type a row names, and not just the name", () => {
    // The concrete case the whole change is about, pinned so a refactor that
    // reverts to naming-without-defining fails here and not on a consumer's site.
    const drawer = collected.find((entry) => entry.component === "drawer");
    const detent = drawer?.tables.find((table) => table.name === "DrawerDetent");
    expect(detent, "drawer.json must carry DrawerDetent, not merely cite it").toBeDefined();
    // `definition` and not `extends`: `DrawerDetent` is `type DrawerDetent =
    // number`, and the site renders the two with different verbs.
    expect(detent?.definition).toBe("number");
    expect(detent?.extends).toBeUndefined();
  });
});

/**
 * This output is shipped inside the `react` tarball, so a stale file here is
 * wrong on a consumer's site rather than on ours, one version behind and with no
 * way for them to tell.
 */
describe("the committed JSON tables", () => {
  const collected = collect();

  it("match the source they were generated from — rerun `bun run docs:api`", () => {
    const stale: string[] = [];
    for (const entry of collected) {
      if (entry.tables.length === 0) continue;
      const file = path.join(JSON_OUTPUT_DIR, jsonName(entry.component));
      if (!existsSync(file)) {
        stale.push(`${entry.component}: no json written`);
        continue;
      }
      if (readFileSync(file, "utf8") !== renderJson(entry.tables)) {
        stale.push(`${entry.component}: out of date`);
      }
    }
    expect(stale, `\n${stale.join("\n")}\n`).toEqual([]);
  });

  it("leaves no orphan behind when a component goes away", () => {
    const expected = new Set(
      collected
        .filter((entry) => entry.tables.length > 0)
        .map((entry) => jsonName(entry.component)),
    );
    const onDisk = readdirSync(JSON_OUTPUT_DIR).filter(
      (name) => name.endsWith(".json") && name !== "manifest.json" && name !== "renames.json",
    );
    expect(onDisk.filter((name) => !expected.has(name))).toEqual([]);
  });

  it("points every row at a line that really declares it", () => {
    // The guard the line counter needs and the fixture cannot give: a real file,
    // read back off disk, with the row's own name found on the line it names.
    const offenders: string[] = [];
    for (const entry of collected) {
      for (const table of entry.tables) {
        for (const row of table.rows) {
          const [file, line] = row.source.split(":");
          const bare = row.name.replace(/\?$/, "");
          const found = collectedFiles(entry.component).find(
            (candidate) => path.basename(candidate) === file,
          );
          if (found === undefined || line === undefined) {
            offenders.push(`${entry.component}: ${row.source} names no file`);
            continue;
          }
          const text = readFileSync(found, "utf8").split("\n")[Number(line) - 1] ?? "";
          if (!text.includes(bare)) offenders.push(`${entry.component}: ${row.source} ≠ ${bare}`);
        }
      }
    }
    expect(offenders.slice(0, 10), `\n${offenders.join("\n")}\n`).toEqual([]);
  });
});

/**
 * Every file a component's tables can now come from: its two folders in full,
 * and not the three entry points `collect()` seeds from. A row of
 * `UseSelectProps` is declared in `select.tsx`, which was never on the short
 * list — pinned to it, the check above would report the component's own
 * supporting types as naming no file.
 */
function collectedFiles(component: string): string[] {
  const folders = [
    path.join(root, "packages/core/src/components", component),
    path.join(root, "packages/react/src/components", component),
  ].filter((folder) => existsSync(folder));

  return folders.flatMap((folder) =>
    readdirSync(folder, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)),
  );
}
