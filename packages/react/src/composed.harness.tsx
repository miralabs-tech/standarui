/**
 * What every suite of the composed layer shares: the readers that turn a string
 * of markup back into something assertable, the `ParityCase` shape a row is
 * written in, and the fixtures both forms of a row hand to a slot.
 *
 * It sits beside the suites rather than inside one because the suites are plural
 * now. `composed.test.tsx` holds the discovery and the loop; every component holds
 * its own rows in `components/<x>/composed.parity.tsx` and its own behaviour in
 * `components/<x>/composed.test.tsx`. Three waves of the composed layer are
 * written in parallel, and a single file carrying every table and every `describe`
 * is one merge conflict per wave — which is the whole reason for the split.
 *
 * Deliberately not named with a `.test.` segment: the `unit` project collects
 * every `.test.ts` and `.test.tsx` under a package's `src`, and a module with no
 * `it` in it would be collected as a suite with no test. `render-harness.tsx` is
 * the same shape for the same reason. Return types are annotated as everywhere —
 * nothing here is emitted, and `isolatedDeclarations` is the repo's habit rather
 * than a build step that would force it.
 */

import type { ReactElement } from "react";

/**
 * React's server ids, whichever delimiters this major uses — the `_R_…_` of Fizz
 * in 19 and the `«r…»` of the client since 19.1 — replaced by one placeholder so
 * a stray `useId()` on one side cannot be what the two forms differ by.
 *
 * The `:r…:` of React 18 **was here and is removed** (2026-09-05). The library is
 * React 19 only (CDC §3), and that alternative was not inert: `data-part` and
 * every pinned id in these files are colon-delimited, so `:[Rr][0-9a-z]*:` matched
 * the middle of any id a fixture pinned beginning with `r` — `dialog:rename:title`
 * normalised to `dialog_id_title` on both sides and the row failed on two forms
 * that were identical to the character. A consumer writing `<Select id="results">`
 * would have hit the same thing. The wave that found it worked around it by
 * renaming the fixture; the pattern is fixed here instead, and the self-test in
 * `composed.test.tsx` now pins an id starting with `r` so it cannot come back.
 */
const REACT_ID_SOURCE = "(?:_R_[0-9a-z]*_|«[Rr][0-9a-z]*»)";

/**
 * Exported **without** the `g` flag, and that is not a detail. `expect(…).toMatch`
 * calls `.test()`, and a global regex carries `lastIndex` from one call to the
 * next: two assertions on the same string, and the second starts reading past the
 * first match and fails on markup that does contain an id. It was harmless only by
 * ordering — every `toMatch` in the suites happens to sit after a `replaceAll`,
 * which resets the cursor. Ordering is not a guarantee, so the two uses get two
 * objects.
 */
export const REACT_ID: RegExp = new RegExp(REACT_ID_SOURCE);

/** The global twin, private: `replaceAll` refuses a non-global regex. */
const REACT_ID_ALL = new RegExp(REACT_ID_SOURCE, "g");

export function normalizeReactIds(html: string): string {
  return html.replaceAll(REACT_ID_ALL, "_id_");
}

/**
 * The token list of the element carrying `token`, not of the first element in
 * the markup — the reader `composed-parts.test.tsx` uses, kept in the same shape.
 */
export function tokensAround(html: string, attribute: string, token: string): string[] {
  const lists = [...html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, "g"))].map((match) =>
    (match[1] ?? "").split(" ").filter((entry) => entry !== ""),
  );
  return lists.find((list) => list.includes(token)) ?? [];
}

export function partsOf(html: string, token: string): string[] {
  return tokensAround(html, "data-part", token);
}

/**
 * The markup of the element carrying `token`, from its opening tag to the close
 * that matches it. Depth is counted on that element's own tag name, which is all
 * these subtrees need — a decorative cell holds an inline SVG and nothing that
 * repeats its own tag. The token is matched whole (`data-part="…"`), so a part
 * whose name merely starts the same way is not what gets sliced.
 */
export function subtreeOf(html: string, token: string): string {
  const found = new RegExp(`<([a-z]+)[^>]*\\sdata-part="${token}"[^>]*>`).exec(html);
  if (found === null) return "";
  const tag = found[1] ?? "";
  const rest = html.slice(found.index + found[0].length);
  let depth = 1;
  for (const edge of rest.matchAll(new RegExp(`<${tag}[\\s>]|</${tag}>`, "g"))) {
    depth += edge[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return rest.slice(0, edge.index);
  }
  return rest;
}

/**
 * The tags that can take the focus, as they appear. Not a tabbable calculation —
 * a string cannot run one — but the shapes `aria-hidden-focus` is about: an `<a>`
 * counts only with an `href`, which is the same line the platform draws.
 */
export function focusableIn(html: string): string[] {
  return [...html.matchAll(/<(a|button|input|select|textarea)(\s[^>]*)?>/g)]
    .filter((tag) => tag[1] !== "a" || /\shref=/.test(tag[2] ?? ""))
    .map((tag) => tag[1] ?? "");
}

/**
 * Every `id` the markup writes more than once. A repeated part whose id is minted
 * from the part name alone hands the same id to N elements, and nothing else in
 * this repository could see it: `danglingIdRefs` asks whether an id *exists*, axe
 * only reaches ids that something references, and every fixture happened to draw
 * the two answers the reference designs draw (audit of 2026-09-05, `dialog:action-trigger`).
 */
export function duplicateIds(html: string): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) {
    const id = match[1] ?? "";
    if (seen.has(id)) twice.add(id);
    seen.add(id);
  }
  return [...twice];
}

/** Every `aria-*` IDREF has to resolve inside the same markup (the `ssr.test.tsx` rule). */
export function danglingIdRefs(html: string): string[] {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? ""));
  const referenced = [...html.matchAll(/\saria-(?:labelledby|describedby|controls)="([^"]+)"/g)]
    .flatMap((match) => (match[1] ?? "").split(/\s+/))
    .filter((id) => id !== "");
  return [...new Set(referenced.filter((id) => !ids.has(id)))];
}

export interface ParityCase {
  /**
   * The component folder, exactly — the loop in `composed.test.tsx` asserts every
   * row of a `components/<x>/composed.parity.tsx` names `<x>` and nothing else, so
   * a row that drifts to another component's file cannot hide there.
   */
  readonly name: string;
  /** The composed form, ids pinned. */
  readonly composed: ReactElement;
  /** The same tree written in parts, the same ids pinned. */
  readonly parts: ReactElement;
}

/**
 * What the consumer puts in a slot, shared between the two forms of a row on
 * purpose: a slot's content belongs to the consumer, and what is compared here is
 * the parts the composed layer places around it.
 */
export function glyph(d: string): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden focusable="false">
      <path d={d} fill="none" stroke="currentColor" />
    </svg>
  );
}

export const SAVE: ReactElement = glyph("M3 3h10v10H3z");
export const BOLT: ReactElement = glyph("M8.8 2.2L4.2 9h3l-.9 4.8L11.8 7h-3z");
export const SUN: ReactElement = glyph("M8 4.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z");
export const SHORTCUT: ReactElement = <kbd>⌘S</kbd>;

/**
 * A handler the fixtures can share. Nothing it does reaches the markup — which is
 * the point of writing it on both sides anyway: `onPress` on a `ComposedAction`
 * and `onClick` on the part are the same wire, and the pair says so.
 */
export const NOOP = (): void => undefined;

/**
 * The portal is stood down on both select rows, and it is not a convenience.
 * `getTriggerProps` writes `aria-controls` unconditionally — the content is
 * mounted by default, so the IDREF is meant to always resolve — and a `Portal`
 * with no `document` renders nothing, which would leave every select row failing
 * `danglingIdRefs` on an id its own surface should have carried. `ssr.test.tsx`
 * stands its portals down for the same reason; here the escape hatch is what does
 * it, so the row proves `parts` reaches a part at the same time.
 */
export const OFF: { readonly portal: { readonly disabled: true } } = { portal: { disabled: true } };
