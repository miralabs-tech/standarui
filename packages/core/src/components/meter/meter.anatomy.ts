import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type MeterPart = "root" | "label" | "track" | "range" | "valueText";

export const anatomy: Anatomy<MeterPart> = createAnatomy("meter").parts(
  "root",
  "label",
  "track",
  "range",
  "valueText",
);

export const parts: Record<MeterPart, AnatomyPart> = anatomy.build();

export interface MeterCssVars {
  // --- written ---
  /** Where the value sits between the minimum and the maximum. */
  "--sui-meter-percent": "<percentage>";
}
