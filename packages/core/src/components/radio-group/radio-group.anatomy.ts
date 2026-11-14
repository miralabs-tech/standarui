import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type RadioGroupPart =
  | "root"
  | "label"
  | "item"
  | "itemControl"
  | "itemText"
  | "itemHiddenInput"
  | "indicator";

export const anatomy: Anatomy<RadioGroupPart> = createAnatomy("radio-group").parts(
  "root",
  "label",
  "item",
  "itemControl",
  "itemText",
  "itemHiddenInput",
  "indicator",
);

export const parts: Record<RadioGroupPart, AnatomyPart> = anatomy.build();
