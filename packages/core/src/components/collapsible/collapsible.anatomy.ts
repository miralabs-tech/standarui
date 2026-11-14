import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type CollapsiblePart = "root" | "trigger" | "indicator" | "content";

export const anatomy: Anatomy<CollapsiblePart> = createAnatomy("collapsible").parts(
  "root",
  "trigger",
  "indicator",
  "content",
);

export const parts: Record<CollapsiblePart, AnatomyPart> = anatomy.build();
