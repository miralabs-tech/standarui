/**
 * A repo-level rule, tested where the filesystem belongs.
 *
 * Two files guard the CDC's SSR promise — `packages/core/src/components/ssr.test.ts`
 * without a framework, and `packages/react/src/ssr.test.tsx` through
 * `renderToString`. Both hold an explicit table, because both need real props and
 * a real component tree. An explicit table is also the kind of thing that quietly
 * stops being complete.
 *
 * So the folder list is compared against them here. A new component fails this
 * test the day its folder appears, which is the only reason the promise will
 * still hold for `menu`, `select` and `combobox`.
 *
 * The read lives at the root rather than in the core because `tsconfig.base.json`
 * sets `"types": []` on purpose: the core is `platform: "neutral"` with zero
 * runtime dependencies, and handing it node types so one test can list a
 * directory is how a `node:fs` import eventually lands in a published module.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Bounded on both sides by something that is neither a word character nor a
 * hyphen. Quoting is not usable as the boundary — the formatter strips quotes
 * from object keys that do not need them — and a bare substring would let
 * `toggle-group` satisfy `toggle`, which is exactly the pair most likely to be
 * half-covered.
 */
function namesMissingFrom(source: string, names: readonly string[]): string[] {
  return names.filter((name) => {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(source);
  });
}

const root = path.resolve(import.meta.dirname, "..");

/**
 * Dot-directories are not components. This list is read from the filesystem
 * rather than from git, so anything a tool drops beside the components is
 * counted as one: `.standardoc` (the MCP index) appears in whichever folder was
 * last queried, is gitignored, and would otherwise be demanded of every SSR
 * guard — a gate that fails on one machine and passes in CI, which is worse than
 * one that fails everywhere.
 */
function foldersIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

const components = foldersIn(path.join(root, "packages/core/src/components"));
const reactComponents = foldersIn(path.join(root, "packages/react/src/components"));

/**
 * Each guard is checked against the folders it can actually cover. A core lands
 * ahead of its adapter within a phase — `dialog`'s machine ships before
 * `packages/react/src/components/dialog` exists — and pinning the React guard to
 * the *core* folder list would make that intermediate state unrepresentable, so
 * the only way through would be a comment naming the component. Read against its
 * own package the rule keeps its teeth: the day the adapter folder appears, the
 * React guard has to name it.
 */
const GUARDS = [
  { file: "packages/core/src/components/ssr.test.ts", names: components },
  { file: "packages/react/src/ssr.test.tsx", names: reactComponents },
] as const;

/**
 * The adapters that have no core folder of their own, and the machine each one
 * composes instead. `alert-dialog` is the dialog with `role` pinned and two more
 * parts; a core folder for it would be a barrel over `dialog` and nothing else.
 *
 * Written down rather than inferred. "Every adapter has a machine behind it" is a
 * rule worth keeping — it is what stops logic drifting into the adapter layer —
 * so an exception to it should cost a line here and a name for what it composes,
 * and that name is asserted below so the exception cannot hide a missing machine.
 */
const COMPOSED_OVER: Record<string, string> = { "alert-dialog": "dialog" };

describe("SSR guards cover every component", () => {
  it("finds the component folders", () => {
    // A sanity check on the read itself: an empty list would make every
    // assertion below vacuously true, which is the failure mode of this shape of
    // test.
    expect(components.length).toBeGreaterThan(10);
    expect(components).toContain("checkbox-group");
    expect(reactComponents.length).toBeGreaterThan(10);
    expect(components).toEqual(
      expect.arrayContaining(reactComponents.filter((name) => !(name in COMPOSED_OVER))),
    );
  });

  it("holds every adapter-only component to a machine that exists", () => {
    for (const [adapter, machine] of Object.entries(COMPOSED_OVER)) {
      // Both halves matter: an entry for a folder nobody wrote is dead weight,
      // and one naming a machine nobody wrote is the hole this list could become.
      expect(reactComponents).toContain(adapter);
      expect(components).toContain(machine);
    }
  });

  it("would notice a component that is missing, and not be fooled by a prefix", () => {
    // The detector, checked against a source that covers `toggle-group` only.
    // Without the boundary this returns `[]` and the whole file passes on
    // nothing.
    const source = 'const t = { "toggle-group": 1 }; import x from "./toggle-group";';

    expect(namesMissingFrom(source, ["toggle-group"])).toEqual([]);
    expect(namesMissingFrom(source, ["toggle"])).toEqual(["toggle"]);
    expect(namesMissingFrom(source, ["menu", "select"])).toEqual(["menu", "select"]);
    // Unquoted keys have to count: the formatter writes them that way.
    expect(namesMissingFrom("const t = { toggle: 1 };", ["toggle"])).toEqual([]);
  });

  for (const guard of GUARDS) {
    it(`${guard.file} names all ${guard.names.length} of them`, () => {
      const source = readFileSync(path.join(root, guard.file), "utf8");

      expect(
        namesMissingFrom(source, guard.names),
        `add these components to ${guard.file}`,
      ).toEqual([]);
    });
  }
});

/**
 * Two clauses of the Definition of Done (CDC §5.4), held by a gate for the first
 * time.
 *
 * The `browser` job has always run whatever browser tests exist, across
 * chromium, firefox and webkit. What nothing checked is whether a component has
 * any — a suite that runs three engines over a component it never mounts is
 * green for the same reason an empty one is. `field`'s React adapter shipped
 * with no browser test at all (the core has one, so a search for the name found
 * something), and `separator` had three cases and no axe run.
 *
 * Read from the folder list rather than from a written-down number, for the
 * reason `api-reference.test.ts` had to learn: a floor of 38 said nothing while
 * 39 components rendered, and the library could have lost one and stayed green.
 */
describe("every component is exercised in a browser, and audited there", () => {
  /** The browser tests in a component's own folder, with their sources. */
  function browserTests(component: string): { file: string; source: string }[] {
    const dir = path.join(root, "packages/react/src/components", component);
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.includes(".browser.test."))
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return { file, source: readFileSync(file, "utf8") };
      });
  }

  it("finds the adapter folders it is about to hold to this", () => {
    // The read itself, because every assertion below is a filter over this list
    // and an empty one would make all of them pass.
    expect(reactComponents.length).toBeGreaterThan(10);
    expect(reactComponents).toContain("separator");
  });

  it("mounts every component in a real browser somewhere in its own folder", () => {
    const without = reactComponents.filter((name) => browserTests(name).length === 0);

    expect(
      without,
      `\nthese adapters have no *.browser.test.* of their own:\n${without.join("\n")}\n`,
    ).toEqual([]);
  });

  it("runs axe over every component, in the folder that owns it", () => {
    // `expectNoAxeViolations` is the harness's single door to axe, so finding a
    // call to it is the whole check. A component that reaches axe only through a
    // neighbour's test is not audited: the neighbour is free to stop rendering
    // it, and nothing would say so.
    const without = reactComponents.filter((name) => !browserTests(name).some(callsAxe));

    expect(
      without,
      `\nthese adapters never reach axe in their own folder:\n${without.join("\n")}\n`,
    ).toEqual([]);
  });

  it("is not satisfied by the import line alone", () => {
    // Written as a test because it was written wrong first. Searching the source
    // for the helper's *name* passes on a file that imports it and never calls
    // it — measured: deleting the only call from `separator` left this whole
    // describe green, because `import { expectNoAxeViolations, … }` still
    // carried the string. The trailing `(` is what separates the two, and no
    // import can produce one.
    expect(callsAxe({ source: 'import { expectNoAxeViolations } from "../../x";' })).toBe(false);
    expect(callsAxe({ source: 'import { expectNoAxeViolations, mount } from "../../x";' })).toBe(
      false,
    );
    expect(callsAxe({ source: "await expectNoAxeViolations(handle.container);" })).toBe(true);
  });
});

/** A call and not a mention — see the test directly below the use of this. */
function callsAxe({ source }: { readonly source: string }): boolean {
  return source.includes("expectNoAxeViolations(");
}
