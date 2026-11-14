import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Five parts and deliberately no `list`: the root is a named `navigation`
 * landmark and every item carries its own "page N" label, so `ul`/`li` add
 * nothing the accessibility tree needs. A consumer who wants list semantics
 * composes their own markup through `render` — recorded as divergence n°3 of
 * the spec, not an oversight.
 */
export type PaginationPart = "root" | "item" | "ellipsis" | "prevTrigger" | "nextTrigger";

export const anatomy: Anatomy<PaginationPart> = createAnatomy("pagination").parts(
  "root",
  "item",
  "ellipsis",
  "prevTrigger",
  "nextTrigger",
);

export const parts: Record<PaginationPart, AnatomyPart> = anatomy.build();
