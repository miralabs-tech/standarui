import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Thirty-two parts, and a `root` — unlike `menu` and `select`, whose triggers and
 * surfaces are siblings with nothing above them. This component has one because
 * `presentation="inline"` renders no trigger and no portal at all: there has to be
 * an element that is the colour picker in every presentation, and it is what the
 * custom properties are published on.
 *
 * Two of them are the review's additions and neither is decoration.
 * `channelLabel` is the text drawn above each track, and it
 * names the thumb *and* the field beside it — one text, two controls, which is
 * why it is a part with an id rather than a `<label>` the consumer writes.
 * `swatchRow` carries `role="row"`: the swatch panel is a `grid`, and a grid whose
 * cells have no rows is an `aria-required-parent` violation.
 */
export type ColorPickerPart =
  | "root"
  | "label"
  | "trigger"
  | "triggerSwatch"
  | "valueText"
  | "hiddenInput"
  | "backdrop"
  | "positioner"
  | "content"
  | "arrow"
  | "title"
  | "cancelTrigger"
  | "closeTrigger"
  | "area"
  | "areaBackground"
  | "areaThumb"
  | "areaXInput"
  | "areaYInput"
  | "channelSlider"
  | "channelLabel"
  | "channelSliderTrack"
  | "channelSliderRange"
  | "channelSliderThumb"
  | "channelInput"
  | "formatSelect"
  | "swatchGroup"
  | "swatchRow"
  | "swatch"
  | "swatchIndicator"
  | "swatchTrigger"
  | "eyedropperTrigger"
  | "transparencyGrid";

export const anatomy: Anatomy<ColorPickerPart> = createAnatomy("color-picker").parts(
  "root",
  "label",
  "trigger",
  "triggerSwatch",
  "valueText",
  "hiddenInput",
  "backdrop",
  "positioner",
  "content",
  "arrow",
  "title",
  "cancelTrigger",
  "closeTrigger",
  "area",
  "areaBackground",
  "areaThumb",
  "areaXInput",
  "areaYInput",
  "channelSlider",
  "channelLabel",
  "channelSliderTrack",
  "channelSliderRange",
  "channelSliderThumb",
  "channelInput",
  "formatSelect",
  "swatchGroup",
  "swatchRow",
  "swatch",
  "swatchIndicator",
  "swatchTrigger",
  "eyedropperTrigger",
  "transparencyGrid",
);

export const parts: Record<ColorPickerPart, AnatomyPart> = anatomy.build();
