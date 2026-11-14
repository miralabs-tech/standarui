/**
 * The composed layer's grammar, held where the filesystem belongs.
 *
 * States the rules a composed module has to
 * keep, and five of them are mechanical enough to be tested rather than reviewed:
 *
 *  1. **A composed module is a pure function of its props.** No React hook in it —
 *     not a `useState`, not a `useMemo` over the collection, not a `useId()` that
 *     would mint what the consumer has to pin. The parts it renders run their own
 *     hooks; the module that places them runs none.
 *  2. **At most five `ReactNode` slots per `<X>ComposedProps`.** The closed
 *     vocabulary bounds the set of names across the library; the count bounds the
 *     slope inside one name.
 *  3. **A `composed.tsx` is public through its folder barrel and proven in the
 *     markup-parity table** — the day the module exists, the folder has to carry a
 *     `composed.parity.tsx` beside it, the way the SSR guards have to name a new
 *     folder (`component-coverage.test.ts`).
 *
 *     Read on the **directory**, not on a table of names. Until 2026-09-05 the
 *     rows all lived in `packages/react/src/composed.test.tsx` and this looked for
 *     `name: "<x>"` in that file; the rows moved out — one file per component, so
 *     three waves can be written in parallel without meeting in a merge — and a
 *     string reader over a file that no longer holds them would have been green on
 *     nothing. The two halves of the proof are split on purpose and neither is
 *     sufficient: **this** read proves the file exists, and the glob in
 *     `composed.test.tsx` proves it is loaded, played, and not empty.
 *  4. **`packages/react/src/composed.ts` holds no value.** It is the shared
 *     vocabulary, types only; the day it holds one it becomes a runtime module
 *     every composed layer pays for, and it needs a budget line of its own.
 *  5. **No shipped module imports a test file.** `composed.harness.tsx` and
 *     `composed.parity.tsx` are test-side: a `composed.tsx` or a component barrel
 *     importing either would drag every fixture into the emit — and into the
 *     component's budget line, which `scripts/size-budget.ts` measures on
 *     `components/<x>/composed.js` and `components/<x>/index.js`. Same reasoning
 *     as rule 4, one directory down.
 *
 * The read lives at the root for the reason `component-coverage.test.ts` gives:
 * `tsconfig.base.json` keeps `"types": []` in the packages on purpose.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const componentsDir = path.join(root, "packages/react/src/components");
const parityLoop = path.join(root, "packages/react/src/composed.test.tsx");
const harness = path.join(root, "packages/react/src/composed.harness.tsx");
const vocabulary = path.join(root, "packages/react/src/composed.ts");

/** The rows of one component, `export const parity: readonly ParityCase[]`. */
const PARITY_FILE = "composed.parity.tsx";

function componentFolders(): string[] {
  return readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every component folder that carries a composed layer, read from the source tree. */
function composedComponents(): string[] {
  return componentFolders().filter((name) =>
    existsSync(path.join(componentsDir, name, "composed.tsx")),
  );
}

/**
 * The folders with no `file` in them. The file name is a parameter so the reader
 * can be aimed at a name that is known present and a name that is known absent —
 * a detector that reads the disk cannot be self-tested on a string, and one that
 * always returned `[]` would make the rule vacuous.
 */
function foldersMissing(dir: string, file: string, names: readonly string[]): string[] {
  return names.filter((name) => !existsSync(path.join(dir, name, file)));
}

/** `use` followed by a capital, called — a hook, whatever library it comes from. */
const HOOK_CALL = /\buse[A-Z]\w*\s*\(/g;

function hookCallsIn(source: string): string[] {
  return [...source.matchAll(HOOK_CALL)].map((match) => match[0].replace(/\s*\($/, ""));
}

/**
 * The `ReactNode`-typed props declared on every `<X>ComposedProps` interface in a
 * module. Render props (`(entry, defaults: ReactNode) => ReactNode`) are not
 * slots and are not counted; a slot is a prop whose whole type is `ReactNode`,
 * optionally `| undefined`. Props inherited through `extends` are not counted
 * either — a composed interface that wants `children` re-declares it, which is
 * the only way it can document what the slot means for that component.
 */
function reactNodeSlotsIn(source: string): Record<string, string[]> {
  const slots: Record<string, string[]> = {};
  const interfaces = source.matchAll(/export interface (\w+ComposedProps)\b[^{]*\{([\s\S]*?)\n\}/g);
  for (const match of interfaces) {
    const name = match[1] ?? "";
    const body = match[2] ?? "";
    slots[name] = [...body.matchAll(/^\s*readonly (\w+)\??: ReactNode(?: \| undefined)?;/gm)].map(
      (prop) => prop[1] ?? "",
    );
  }
  return slots;
}

/**
 * A module specifier naming one of the two test-side files, however it is written
 * — `import`, `export … from`, or a dynamic `import(…)`. Matched inside quotes on
 * purpose: these files name each other in prose constantly, and a bare substring
 * would fail on a line of JSDoc. Prose in this repo uses backticks.
 */
const TEST_ONLY_MODULE = /["'][^"']*composed\.(?:harness|parity)(?:\.tsx?)?["']/;

/** What the emit would keep: a runtime export, or an import that is not erased. */
const VALUE_EXPORT = /^export\s+(?:const|let|var|function|class|default|\*)\b/m;
const VALUE_IMPORT = /^import\s+(?!type\b)/m;

const MAX_SLOTS = 5;

describe("the composed layer keeps its grammar", () => {
  const folders = componentFolders();
  const composed = composedComponents();

  it("reads the component folders", () => {
    // The read itself: an unreadable directory would make every loop below empty
    // and every rule vacuously kept.
    expect(folders.length).toBeGreaterThan(10);
    expect(composed.length).toBeGreaterThan(0);
    expect(existsSync(parityLoop)).toBe(true);
    expect(existsSync(harness)).toBe(true);
  });

  for (const name of composed) {
    const file = path.join(componentsDir, name, "composed.tsx");
    const source = readFileSync(file, "utf8");

    describe(`${name}/composed.tsx`, () => {
      it("calls no hook — it is a function of its props and nothing else", () => {
        expect(hookCallsIn(source)).toEqual([]);
      });

      it("exports its props as `<X>ComposedProps`", () => {
        expect(source).toMatch(/export (?:interface|type) \w+ComposedProps\b/);
      });

      it(`declares at most ${MAX_SLOTS} ReactNode slots per composed interface`, () => {
        const slots = reactNodeSlotsIn(source);
        expect(Object.keys(slots).length).toBeGreaterThan(0);
        for (const [iface, names] of Object.entries(slots)) {
          expect(names.length, `${iface}: ${names.join(", ")}`).toBeLessThanOrEqual(MAX_SLOTS);
        }
      });

      it("is re-exported by the folder barrel, the only barrel there is", () => {
        const barrel = readFileSync(path.join(componentsDir, name, "index.ts"), "utf8");
        expect(barrel).toMatch(/from "\.\/composed"/);
      });

      it("imports neither the harness nor the parity rows — both are test files", () => {
        expect(TEST_ONLY_MODULE.test(source), `${file} imports a test-only module`).toBe(false);
      });
    });
  }

  it("has a `composed.parity.tsx` beside every `composed.tsx`", () => {
    expect(
      foldersMissing(componentsDir, PARITY_FILE, composed),
      `add a ${PARITY_FILE} exporting \`parity\` to these folders`,
    ).toEqual([]);
  });

  it("keeps every component barrel clear of the test files beside it", () => {
    const offenders = folders.filter((name) => {
      const barrel = path.join(componentsDir, name, "index.ts");
      return existsSync(barrel) && TEST_ONLY_MODULE.test(readFileSync(barrel, "utf8"));
    });

    // A barrel that re-exported one of them would put every fixture in the emit,
    // and `scripts/size-budget.ts` measures `components/<x>/index.js`.
    expect(offenders, "a component barrel re-exports a test file").toEqual([]);
  });

  it("keeps the shared vocabulary free of values, so it stays off the budget", () => {
    const source = readFileSync(vocabulary, "utf8");

    expect(VALUE_EXPORT.test(source), `${vocabulary} exports a value`).toBe(false);
    // `import type` is erased; a bare `import` is not, and it would make this
    // module a runtime dependency of every composed layer at once — which
    // `scripts/size-budget.ts` charges to no line, because it externalises
    // `*/<name>.js` and nothing else.
    expect(VALUE_IMPORT.test(source), `${vocabulary} imports a value`).toBe(false);
  });
});

describe("the detectors would notice", () => {
  it("finds a hook call and ignores a hook-looking identifier that is not called", () => {
    expect(hookCallsIn("const api = useSelect(props); const x = useMemo(() => 1, []);")).toEqual([
      "useSelect",
      "useMemo",
    ]);
    expect(hookCallsIn("import { useSelect } from './select'; type T = typeof useSelect;")).toEqual(
      [],
    );
    expect(hookCallsIn("<SelectRoot {...props} />")).toEqual([]);
  });

  it("counts ReactNode slots and not render props or inherited ones", () => {
    const source = `
export interface SelectComposedProps<V extends string = string> extends UseSelectProps {
  readonly options: readonly SelectEntry<V>[];
  readonly placeholder?: string | undefined;
  readonly cancelLabel?: ReactNode;
  readonly children?: ReactNode | undefined;
  readonly renderOption?: ((option: SelectOption<V>, defaults: ReactNode) => ReactNode) | undefined;
}
export interface OtherComposedProps {
  readonly title: ReactNode;
}
`;
    expect(reactNodeSlotsIn(source)).toEqual({
      SelectComposedProps: ["cancelLabel", "children"],
      OtherComposedProps: ["title"],
    });
  });

  it("wants the file, and is not paid off by the name existing", () => {
    // The half the string reader it replaces could never do. `button` carries the
    // file and comes back clean; a folder nobody wrote comes back named, which is
    // what makes the rule fail on the day a `composed.tsx` lands alone.
    expect(foldersMissing(componentsDir, PARITY_FILE, ["button", "select"])).toEqual([]);
    expect(foldersMissing(componentsDir, PARITY_FILE, ["a-component-nobody-wrote"])).toEqual([
      "a-component-nobody-wrote",
    ]);
  });

  it("reads the exact file name, so a near miss is a miss", () => {
    // `button/composed.parity.tsx` exists and `button/composed.parity.ts` does
    // not: a reader matching on a stem would call the second one present, which is
    // the directory-read form of the prefix trap `component-coverage.test.ts`
    // documents (`toggle` satisfied by `toggle-group`).
    expect(foldersMissing(componentsDir, "composed.parity.ts", ["button"])).toEqual(["button"]);
    // And it is not a function that always answers "missing": every composed
    // folder really does have the barrel rule 3 asks for.
    expect(foldersMissing(componentsDir, "index.ts", composedComponents())).toEqual([]);
  });

  it("tells a test-only import from a specifier that merely reads like one", () => {
    expect(TEST_ONLY_MODULE.test('import { glyph } from "../../composed.harness";')).toBe(true);
    expect(TEST_ONLY_MODULE.test('export { parity } from "./composed.parity";')).toBe(true);
    expect(TEST_ONLY_MODULE.test('const m = await import("./composed.parity.tsx");')).toBe(true);
    // Prose, which every one of these files is full of, and the real neighbours.
    expect(TEST_ONLY_MODULE.test("// the rows live in `composed.parity.tsx`")).toBe(false);
    expect(TEST_ONLY_MODULE.test('export * from "./composed";')).toBe(false);
    expect(TEST_ONLY_MODULE.test('import type { ParityCase } from "../../composed";')).toBe(false);
  });

  it("tells an erased import from one the emit keeps", () => {
    expect(VALUE_IMPORT.test('import type { ReactNode } from "react";')).toBe(false);
    expect(VALUE_IMPORT.test('import { useId } from "react";')).toBe(true);
    expect(VALUE_EXPORT.test("export interface ComposedGroup<Entry> {")).toBe(false);
    expect(VALUE_EXPORT.test("export type ComposedTrigger = ReactElement;")).toBe(false);
    expect(VALUE_EXPORT.test("export const EMPTY = [];")).toBe(true);
    expect(VALUE_EXPORT.test("export function composed(): void {}")).toBe(true);
  });
});
