import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type SwitchPart = "root" | "label" | "control" | "thumb" | "hiddenInput";

export const anatomy: Anatomy<SwitchPart> = createAnatomy("switch").parts(
  "root",
  "label",
  "control",
  "thumb",
  "hiddenInput",
);

export const parts: Record<SwitchPart, AnatomyPart> = anatomy.build();
