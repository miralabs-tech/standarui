import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type CheckboxPart = "root" | "label" | "control" | "indicator" | "hiddenInput";

export const anatomy: Anatomy<CheckboxPart> = createAnatomy("checkbox").parts(
  "root",
  "label",
  "control",
  "indicator",
  "hiddenInput",
);

export const parts: Record<CheckboxPart, AnatomyPart> = anatomy.build();
