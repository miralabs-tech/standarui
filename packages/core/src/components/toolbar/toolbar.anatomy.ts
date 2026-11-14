import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ToolbarPart = "root" | "group" | "separator" | "spacer" | "item" | "title";

export const anatomy: Anatomy<ToolbarPart> = createAnatomy("toolbar").parts(
  "root",
  "group",
  "separator",
  "spacer",
  "item",
  "title",
);

export const parts: Record<ToolbarPart, AnatomyPart> = anatomy.build();
