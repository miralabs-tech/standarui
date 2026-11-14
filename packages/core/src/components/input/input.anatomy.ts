import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type InputPart = "root" | "control" | "visibilityTrigger";

export const anatomy: Anatomy<InputPart> = createAnatomy("input").parts(
  "root",
  "control",
  "visibilityTrigger",
);

export const parts: Record<InputPart, AnatomyPart> = anatomy.build();
