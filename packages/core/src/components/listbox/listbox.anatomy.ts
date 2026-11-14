import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * A collection with no surface: the listbox lives in the page, so it keeps the
 * `root` a menu does without — there is nothing portalled here and nothing to be
 * a sibling of.
 *
 * **No `itemSymbol`, and that is a deliberate divergence from `menu`.** The menu
 * reserves a leading track for the whole surface because its rows align against
 * each other; a list row's glyph is consumer content, and inventing a second
 * gutter mechanism for it would be a mechanism to keep in step with the first. If
 * inter-row alignment turns out to be a real need, the menu's `hasSymbolGutter` is
 * the thing to reuse.
 *
 * The scroll affordance is not here either — two `[data-scroll-edge]` bands the
 * adapter renders inside the scroller, `aria-hidden`, outside the collection.
 * Nothing composes into them and nothing renders inside them, which is exactly
 * what keeps them out of an anatomy (architecture.md).
 */
export type ListboxPart =
  | "root"
  | "label"
  | "content"
  | "itemGroup"
  | "itemGroupLabel"
  | "item"
  | "itemText"
  | "itemIndicator";

export const anatomy: Anatomy<ListboxPart> = createAnatomy("listbox").parts(
  "root",
  "label",
  "content",
  "itemGroup",
  "itemGroupLabel",
  "item",
  "itemText",
  "itemIndicator",
);

export const parts: Record<ListboxPart, AnatomyPart> = anatomy.build();
