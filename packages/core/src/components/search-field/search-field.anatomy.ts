import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Six parts, in DOM order. `root` is the **row** and the `search` landmark;
 * `field` is the **capsule** — the box, the border, the radius, the ring — and
 * the three decorations of the search presentation live inside it. `root` was
 * the capsule until 2026-09-05; the split is what lets the cancel button stand
 * beside the capsule rather than inside it, which is the one arrangement in
 * practice: a growing field and a button that hugs its content in one
 * auto-layout.
 *
 * `indicator` is decorative — the landmark and the placeholder already say what
 * the field is for — and `clearTrigger` is out of the tab order, because it
 * disappears under the focus it would otherwise hold. `cancelTrigger` is the
 * opposite on both counts: it is a tab stop with no keyboard alternative, and
 * it earns one because it sits outside the capsule (see
 * `search-field.connect.ts` for both arguments).
 */
export type SearchFieldPart =
  | "root"
  | "field"
  | "indicator"
  | "control"
  | "clearTrigger"
  | "cancelTrigger";

export const anatomy: Anatomy<SearchFieldPart> = createAnatomy("search-field").parts(
  "root",
  "field",
  "indicator",
  "control",
  "clearTrigger",
  "cancelTrigger",
);

export const parts: Record<SearchFieldPart, AnatomyPart> = anatomy.build();
