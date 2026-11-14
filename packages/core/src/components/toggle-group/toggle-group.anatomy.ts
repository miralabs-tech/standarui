import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ToggleGroupPart =
  | "frame"
  | "root"
  | "label"
  | "item"
  | "indicator"
  | "scrollbar"
  | "thumb";

export const anatomy: Anatomy<ToggleGroupPart> = createAnatomy("toggle-group").parts(
  "frame",
  "root",
  "label",
  "item",
  "indicator",
  "scrollbar",
  "thumb",
);

export const parts: Record<ToggleGroupPart, AnatomyPart> = anatomy.build();
