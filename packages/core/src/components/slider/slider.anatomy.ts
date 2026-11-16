import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type SliderPart =
  | "root"
  | "label"
  | "valueText"
  | "control"
  | "track"
  | "range"
  | "thumb"
  | "hiddenInput"
  | "markerGroup"
  | "marker";

export const anatomy: Anatomy<SliderPart> = createAnatomy("slider").parts(
  "root",
  "label",
  "valueText",
  "control",
  "track",
  "range",
  "thumb",
  "hiddenInput",
  "markerGroup",
  "marker",
);

export const parts: Record<SliderPart, AnatomyPart> = anatomy.build();

export interface SliderCssVars {
  // --- written ---
  /** Position of the value on the track. */
  "--sui-slider-percent": "<percentage>";
  /** Where the filled range starts. */
  "--sui-slider-range-start": "<percentage>";
  /** Where the filled range ends. */
  "--sui-slider-range-end": "<percentage>";
  /** Position of one thumb on the track. */
  "--sui-slider-thumb-percent": "<percentage>";
  /** Position of one marker on the track. */
  "--sui-marker-percent": "<percentage>";
}
