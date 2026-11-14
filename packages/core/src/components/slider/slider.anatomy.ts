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
