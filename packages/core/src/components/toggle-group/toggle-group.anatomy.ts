import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ToggleGroupPart =
  | "frame"
  | "root"
  | "label"
  | "item"
  | "indicator"
  | "scrollbar"
  | "thumb";

export const anatomy: Anatomy<ToggleGroupPart> = createAnatomy("toggle-group").parts(
  "frame",
  "root",
  "label",
  "item",
  "indicator",
  "scrollbar",
  "thumb",
);

export const parts: Record<ToggleGroupPart, AnatomyPart> = anatomy.build();

export interface ToggleGroupCssVars {
  // --- written ---
  /** Number of segments, at least 1. */
  "--sui-segment-count": "<integer>";
  /** Measured offset of the indicator, absent until it has been measured. */
  "--sui-indicator-offset": "<length>";
  /** Measured size of the indicator, absent until it has been measured. */
  "--sui-indicator-size": "<length>";
  /** Length of the inline scrollbar thumb. */
  "--sui-scroll-thumb-length": "<length>";
  /** Offset of the inline scrollbar thumb along its track. */
  "--sui-scroll-thumb-offset": "<length>";
}
