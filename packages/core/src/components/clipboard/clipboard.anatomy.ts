import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ClipboardPart = "root" | "label" | "control" | "input" | "trigger" | "indicator";

export const anatomy: Anatomy<ClipboardPart> = createAnatomy("clipboard").parts(
  "root",
  "label",
  "control",
  "input",
  "trigger",
  "indicator",
);

export const parts: Record<ClipboardPart, AnatomyPart> = anatomy.build();
