/**
 * The composed layer's one contract, asserted where it is cheapest to read: the
 * markup. `<Select options={…}/>` has to render exactly the parts a consumer would
 * place by hand — the same nodes, in the same order, with the same attributes —
 * and `renderToString` of the two forms compared to the character is the whole
 * proof. A node added, an order swapped, an `aria-*` lost, an attribute in excess
 * and an IDREF left dangling all fail the one assertion, and the composed form
 * gets its SSR entry from the same gesture.
 *
 * **The rows no longer live here.** Each component owns
 * `components/<x>/composed.parity.tsx` — `export const parity: readonly
 * ParityCase[]` — and this file discovers them with a glob and runs them. Three
 * waves of the composed layer are written in parallel, and one file holding every
 * table was one merge conflict per wave. What stays here is what belongs to no
 * component: the discovery, the loop, the self-tests of the readers, and the one
 * `describe` below that asserts two components in the same breath.
 *
 * The discovery is proved from **both ends**, and it takes both:
 *  - the glob proves a `composed.parity.tsx` is *loaded and played* — but a glob
 *    cannot see a file nobody wrote;
 *  - `scripts/composed-grammar.test.ts` reads the directory and fails the day a
 *    `composed.tsx` exists with no `composed.parity.tsx` beside it — but a file on
 *    disk is not a file that runs.
 * And the count alone would not be enough either: a `composed.parity.tsx` with an
 * empty array would pass for coverage, so the non-emptiness of every module is
 * asserted below. That is the lesson `component-coverage.test.ts` and
 * `composed-grammar.test.ts` both write in their opening paragraph.
 *
 * Both fixtures of a row pin their ids (`use-machine.ts`: "Pass one when the
 * markup has to match a server render"), and every part that calls `useId()` for
 * itself takes an `id`. The normalisation of React's own ids in
 * `composed.harness.tsx` is a guard rail behind that, not the mechanism — and its
 * self-test below proves it matches what *this* React emits, rather than the
 * format a previous major used.
 *
 * `packages/react/src/composed-parts.test.tsx` asserts the parts layer and is not
 * touched here: this file is the composed layer's.
 */

import { type ReactNode, useId } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ButtonRoot } from "./components/button/button";
import { Button } from "./components/button/composed";
import { Select } from "./components/select/composed";
import {
  danglingIdRefs,
  duplicateIds,
  focusableIn,
  normalizeReactIds,
  OFF,
  type ParityCase,
  partsOf,
  REACT_ID,
  SAVE,
  SHORTCUT,
  subtreeOf,
} from "./composed.harness";

declare global {
  interface ImportMeta {
    /**
     * Vite's compile-time glob, declared here rather than by adding `vite/client`
     * to the package: `tsconfig.base.json` keeps `"types": []` on purpose — the
     * packages are written with no ambient globals at all, `platform: "neutral"`,
     * a single runtime dependency (`@standarx/nav`) — and one test helper is not
     * a reason to hand `@standarui/react` a surface of types its published code
     * does not have.
     * Same reasoning as `component-coverage.test.ts`, which keeps its `node:fs`
     * read at the repo root for exactly this.
     *
     * Only the shape this file calls is declared. `eager` is required rather than
     * optional so the return type can be the modules themselves; the lazy form
     * returns thunks and is not what a synchronous `describe` can use.
     */
    glob<T>(pattern: string, options: { readonly eager: true }): Record<string, T>;
  }
}

interface ParityModule {
  readonly parity: readonly ParityCase[];
}

/**
 * Written as the literal `import.meta.glob(…)` call Vite's plugin recognises, and
 * never through a cast: the transform matches the syntax, so `(import.meta as X)
 * .glob(…)` would typecheck and then resolve nothing at runtime — an empty record,
 * a skipped loop and a green file.
 */
const MODULES: Record<string, ParityModule> = import.meta.glob<ParityModule>(
  "./components/*/composed.parity.tsx",
  { eager: true },
);

/** `./components/select/composed.parity.tsx` → `select`. */
function folderOf(file: string): string {
  return /\/components\/([^/]+)\/composed\.parity\.tsx$/.exec(file)?.[1] ?? file;
}

const DISCOVERED: readonly (readonly [string, readonly ParityCase[]])[] = Object.entries(MODULES)
  .map(([file, module]): readonly [string, readonly ParityCase[]] => [
    folderOf(file),
    module.parity ?? [],
  ])
  .sort(([a], [b]) => a.localeCompare(b));

const PARITY: readonly ParityCase[] = DISCOVERED.flatMap(([, rows]) => rows);

/**
 * The floor under the glob. A pattern that matched nothing returns `{}`, which
 * would skip the loop below and leave this file green on no rows at all — the
 * "a green line that weighs nothing reads as proof" failure, in test form.
 */
const ALWAYS_COMPOSED = ["alert-dialog", "button", "dialog", "menu", "pagination", "select"];

describe("the rows are discovered rather than listed", () => {
  it("finds a module per composed component, and never fewer", () => {
    expect(DISCOVERED.map(([name]) => name)).toEqual(expect.arrayContaining(ALWAYS_COMPOSED));
    expect(DISCOVERED.length).toBeGreaterThanOrEqual(ALWAYS_COMPOSED.length);
  });

  it("holds rows in every module it found — an empty file is not coverage", () => {
    for (const [name, rows] of DISCOVERED) {
      expect(rows.length, `${name}/composed.parity.tsx exports no row`).toBeGreaterThan(0);
    }
    expect(PARITY.length).toBeGreaterThanOrEqual(DISCOVERED.length);
  });

  it("names every row after the folder it was found in", () => {
    // `ParityCase.name` is what the loop's test titles are made of, so a row that
    // drifted into another component's file would report under the wrong name and
    // nothing would say so.
    for (const [name, rows] of DISCOVERED) {
      expect([...new Set(rows.map((row) => row.name))], name).toEqual([name]);
    }
  });
});

// Skipped, not failed, while nothing was discovered: the three assertions above
// are what fails in that case, and `scripts/composed-grammar.test.ts` is what
// fails when a composed module exists with no `composed.parity.tsx` beside it.
describe.skipIf(PARITY.length === 0)(
  "the composed layer renders the parts, and nothing else",
  () => {
    for (const { name, composed, parts } of PARITY) {
      it(`${name}: the composed form and the parts form are the same markup`, () => {
        const fromComposed = renderToString(composed);
        const fromParts = renderToString(parts);

        expect(normalizeReactIds(fromComposed)).toBe(normalizeReactIds(fromParts));
        expect(danglingIdRefs(fromComposed)).toEqual([]);
        expect(duplicateIds(fromComposed)).toEqual([]);
        // Pinned on both sides: if a React id survives here, a part minted one the
        // fixture did not pin, and the comparison above passed on the normaliser.
        expect(fromComposed).not.toMatch(REACT_ID);
      });
    }
  },
);

/**
 * The detectors, checked against what they are meant to catch — the shape of
 * `component-coverage.test.ts`: a helper that returns `[]` on everything makes
 * every assertion above vacuously true.
 */
describe("the detectors would notice", () => {
  function Minted(): ReactNode {
    const id = useId();
    return <section id={id} aria-labelledby={id} />;
  }

  it("matches the id format this React actually emits on the server", () => {
    const html = renderToString(<Minted />);

    expect(html).toMatch(REACT_ID);
    expect(normalizeReactIds(html)).toContain('id="_id_"');
    expect(normalizeReactIds(html)).not.toMatch(REACT_ID);
  });

  it("does not normalise an id the fixture pinned", () => {
    const html = renderToString(<section id="conditions" aria-labelledby="conditions" />);

    expect(normalizeReactIds(html)).toBe(html);
  });

  it("leaves a colon-delimited pinned id starting with `r` alone", () => {
    // The regression the React 18 alternative caused: ids in these files are
    // `scope:id:part`, so a pattern delimited by colons matched the middle of
    // `dialog:rename:title` and normalised away a name the fixture had pinned on
    // purpose. Both `rename` and a bare leading `r` are exercised — the second is
    // the shortest form that would match.
    const html = renderToString(
      <section id="dialog:rename:title" aria-labelledby="dialog:r:label" />,
    );

    expect(normalizeReactIds(html)).toBe(html);
  });

  it("tells a minted id apart from a pinned one on the same tree", () => {
    const minted = renderToString(<Minted />);
    const pinned = renderToString(<section id="x" aria-labelledby="x" />);

    expect(minted).not.toBe(pinned);
    expect(normalizeReactIds(minted)).toBe(pinned.replaceAll('"x"', '"_id_"'));
  });

  it("reads the token list of the element carrying the token, not the first one", () => {
    const html =
      '<div data-part="select:content"><span data-part="select:item-indicator select:x">a</span></div>';

    expect(partsOf(html, "select:item-indicator")).toEqual(["select:item-indicator", "select:x"]);
    expect(partsOf(html, "menu:item")).toEqual([]);
  });

  it("finds an id written twice, which no IDREF check can see", () => {
    // The `dialog:action-trigger` shape: three buttons, one id, every IDREF valid.
    expect(duplicateIds('<button id="a"></button><button id="a"></button>')).toEqual(["a"]);
    expect(duplicateIds('<button id="a:0"></button><button id="a:1"></button>')).toEqual([]);
  });

  it("finds an IDREF that points at nothing", () => {
    expect(danglingIdRefs('<div id="a" aria-labelledby="a b"></div>')).toEqual(["b"]);
    expect(danglingIdRefs('<div id="a" aria-labelledby="a"></div>')).toEqual([]);
  });

  it("slices a part's subtree at its own close tag, nesting included", () => {
    const html =
      '<span data-part="select:item-symbol"><span><a href="/x">go</a></span></span><button>after</button>';

    expect(subtreeOf(html, "select:item-symbol")).toBe('<span><a href="/x">go</a></span>');
    expect(subtreeOf(html, "select:content")).toBe("");
  });

  it("counts what can take the focus, and an anchor only with an href", () => {
    expect(focusableIn('<span><a href="/x">go</a><button>b</button></span>')).toEqual([
      "a",
      "button",
    ]);
    expect(focusableIn('<a name="anchor">not a link</a><svg><path/></svg>')).toEqual([]);
  });
});

/**
 * The three things markup equality alone would not say, because they are about
 * what a slot is allowed to be rather than about the tree the layer places.
 *
 * Kept at the root rather than filed under `select`, where four of its five tests
 * would go: the fourth asserts `<Select>` **and** `<Button>` in one breath, and
 * the claim it makes — "the parts this library hides from the a11y tree introduce
 * nothing focusable" — is one claim about the layer rather than two about two
 * components. Splitting the `describe` to place four tests would either cut that
 * argument in half or move a button assertion into a select's file. Neither is
 * worth it, and the three waves in flight own none of these two components.
 */
describe("what the slots may and may not do", () => {
  const OPTIONS = [
    { value: "name", label: "Name" },
    { value: "date", label: "Date" },
  ] as const;

  /**
   * The one door BUG-SCOPE-01 could come back through. `trigger` is a
   * `ReactElement` handed to the part's `render`, so the composition the repo
   * already asserts on the parts layer has to survive the composed one: both
   * identities on one element, or `_button.scss` stops matching a button the
   * library told everyone to write this way.
   */
  it("keeps both identities when a trigger is substituted", () => {
    const html = renderToString(
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        trigger={<ButtonRoot variant="gray" />}
        options={OPTIONS}
      />,
    );

    expect(partsOf(html, "button:root").sort()).toEqual(["button:root", "select:trigger"]);
  });

  /**
   * `renderOption` hands back the default subtree rather than a blank row, which
   * makes **decorating** the cheapest thing to write — and this is the shape that
   * decorates, as a sibling of `defaults` rather than a wrapper around it (an
   * item's children are its grid cells).
   *
   * Both rows are counted rather than read through `partsOf`, which names one
   * element: a layer that dropped `SelectItemText` on every row but the first
   * would pass that reading.
   */
  it("keeps the item's text when renderOption decorates the defaults", () => {
    const html = renderToString(
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        options={OPTIONS}
        renderOption={(option, defaults) => (
          <>
            {defaults}
            <span data-badge>{option.value}</span>
          </>
        )}
      />,
    );

    expect(html.match(/select:item-text/g)?.length).toBe(2);
    expect(html).toContain("data-badge");
  });

  /**
   * The other half, and the reason the sentence above is about *decorating* and
   * not about `renderOption`: a render prop that ignores `defaults` rebuilds the
   * row, and the layer neither can nor should stop it. What that costs is pinned
   * here so a future "renderOption cannot lose a part" cannot re-write itself —
   * the part that names the option goes, the checkmark goes with it, and the bare
   * `<span>` is auto-placed into the leading track (`_select.scss:382`).
   */
  it("gives the item's text up when renderOption replaces the defaults, which is the consumer's call", () => {
    const html = renderToString(
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        options={OPTIONS}
        renderOption={() => <span>x</span>}
      />,
    );

    expect(html).not.toContain("select:item-text");
    expect(html).not.toContain("select:item-indicator");
    // The item itself is untouched: `renderOption` replaces children, never the row.
    expect(partsOf(html, "select:item")).toEqual(["select:item"]);
  });

  /**
   * The decorative cells the layer places are hidden from the accessibility tree
   * by the machine — `getItemSymbolProps` and `getItemIndicatorProps` write
   * `aria-hidden` themselves (`select.connect.ts:466`, `:471`), as does
   * `getIndicatorProps` (`:350`). A focusable node under one of them is an
   * `aria-hidden-focus` violation, and a consumer who puts an `<a href>` in an
   * `icon` commits it: the subtree is theirs, and no type can refuse it.
   *
   * What the library guarantees is the half that is its own, and that is what is
   * asserted — the cells it places introduce nothing focusable, so a consumer
   * handing in an inert glyph gets an inert column. Same for `<Button>`: its three
   * slots and the loading indicator it adds under `loading` place no focusable
   * node beside the root.
   */
  it("introduces no focusable node inside the parts it hides from the a11y tree", () => {
    const html = renderToString(
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        options={[{ value: "name", label: "Name", icon: SAVE }]}
      />,
    );

    // The symbol cell really holds the glyph: an empty slice would make every
    // assertion in the loop below true for the wrong reason.
    expect(subtreeOf(html, "select:item-symbol")).toContain("<svg");

    for (const token of ["select:indicator", "select:item-indicator", "select:item-symbol"]) {
      expect(focusableIn(subtreeOf(html, token)), token).toEqual([]);
      expect(subtreeOf(html, token), token).not.toMatch(/\stabindex=/);
    }
    // The whole tree, so the claim is not about three cells only: the trigger, and
    // the form mirror the DoD requires — which is `tabindex="-1"` and `aria-hidden`.
    expect(focusableIn(html)).toEqual(["button", "select"]);

    const button = renderToString(
      <Button id="save" loading loadingText="Saving" icon={SAVE} accessory={SHORTCUT}>
        Save
      </Button>,
    );

    expect(focusableIn(button)).toEqual(["button"]);
  });

  /**
   * `{ id, label: "Conditions" }` is the text; the part's `label` is a boolean
   * flag whose `aria-labelledby` points at the label part. Passing the string
   * through would be truthy, so the attribute would be written and the part it
   * names would not exist — a dead IDREF and a nameless group at once.
   */
  it("translates a group's label into the flag and the label part", () => {
    const html = renderToString(
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        options={[{ id: "fields", label: "Fields", options: OPTIONS }]}
      />,
    );

    expect(partsOf(html, "select:item-group-label")).toEqual(["select:item-group-label"]);
    expect(html).toMatch(/<div[^>]*data-part="select:item-group"[^>]*aria-labelledby="/);
    expect(danglingIdRefs(html)).toEqual([]);
  });
});
