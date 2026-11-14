import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ButtonPart = "root" | "loadingIndicator";

export const anatomy: Anatomy<ButtonPart> = createAnatomy("button").parts(
  "root",
  "loadingIndicator",
);

export const parts: Record<ButtonPart, AnatomyPart> = anatomy.build();
