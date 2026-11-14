import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type FieldPart =
  | "root"
  | "label"
  | "requiredIndicator"
  | "control"
  | "helperText"
  | "errorText";

export const anatomy: Anatomy<FieldPart> = createAnatomy("field").parts(
  "root",
  "label",
  "requiredIndicator",
  "control",
  "helperText",
  "errorText",
);

export const parts: Record<FieldPart, AnatomyPart> = anatomy.build();
