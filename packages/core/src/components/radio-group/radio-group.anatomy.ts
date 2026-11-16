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

export interface RadioGroupCssVars {
  // --- written ---
  /** Measured offset of the indicator, absent until it has been measured. */
  "--sui-indicator-offset": "<length>";
  /** Measured size of the indicator, absent until it has been measured. */
  "--sui-indicator-size": "<length>";
}
