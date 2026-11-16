import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type CollapsiblePart = "root" | "trigger" | "indicator" | "content";

export const anatomy: Anatomy<CollapsiblePart> = createAnatomy("collapsible").parts(
  "root",
  "trigger",
  "indicator",
  "content",
);

export const parts: Record<CollapsiblePart, AnatomyPart> = anatomy.build();

export interface CollapsibleCssVars {
  // --- written ---
  /** Height of the content, measured while it opens and closes. */
  "--sui-collapsible-height": "<length>";
  /** Width of the content, measured while it opens and closes. */
  "--sui-collapsible-width": "<length>";
}
