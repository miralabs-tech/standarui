import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Two parts, and that is the whole component. The boxes are `checkbox`es — a
 * checkbox exists on its own, unlike a radio, so there is nothing here to
 * re-implement as `item*` parts.
 */
export type CheckboxGroupPart = "root" | "label";

export const anatomy: Anatomy<CheckboxGroupPart> = createAnatomy("checkbox-group").parts(
  "root",
  "label",
);

export const parts: Record<CheckboxGroupPart, AnatomyPart> = anatomy.build();
