import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * No `separator` part, by decision (spec D-BC-2): the chevron between crumbs is
 * drawn by the sheet as a `::before` on adjacency — invisible to the
 * accessibility tree, automatic, RTL-flipped — never markup and never a text
 * glyph. A consumer who wants another separator overrides the pseudo-element in
 * their own layer; every selector here is `:where()`, so the override costs no
 * specificity fight.
 */
export type BreadcrumbPart = "root" | "list" | "item" | "link" | "ellipsis" | "ellipsisTrigger";

export const anatomy: Anatomy<BreadcrumbPart> = createAnatomy("breadcrumb").parts(
  "root",
  "list",
  "item",
  "link",
  "ellipsis",
  "ellipsisTrigger",
);

export const parts: Record<BreadcrumbPart, AnatomyPart> = anatomy.build();
