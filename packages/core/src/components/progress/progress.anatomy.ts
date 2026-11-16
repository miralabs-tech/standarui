import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ProgressPart =
  | "root"
  | "label"
  | "track"
  | "range"
  | "valueText"
  | "circle"
  | "circleTrack"
  | "circleRange";

export const anatomy: Anatomy<ProgressPart> = createAnatomy("progress").parts(
  "root",
  "label",
  "track",
  "range",
  "valueText",
  "circle",
  "circleTrack",
  "circleRange",
);

export const parts: Record<ProgressPart, AnatomyPart> = anatomy.build();

export interface ProgressCssVars {
  // --- written ---
  /** Completion, 0% while it is indeterminate. */
  "--sui-progress-percent": "<percentage>";
}
