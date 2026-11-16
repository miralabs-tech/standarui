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

export interface ColorPickerCssVars {
  // --- written ---
  /** The current colour with its alpha. */
  "--sui-color-picker-value": "<color>";
  /** The current colour without its alpha. */
  "--sui-color-picker-opaque": "<color>";
  /** Hue in degrees, for arithmetic. */
  "--sui-color-picker-hue": "<number>";
  /** The hue at full saturation and mid lightness. */
  "--sui-color-picker-hue-color": "<color>";
  /** Alpha from 0 to 1. */
  "--sui-color-picker-alpha": "<number>";
  /** Saturation, as the horizontal position of the area thumb. */
  "--sui-color-picker-area-x": "<percentage>";
  /** Value, as the vertical position of the area thumb. */
  "--sui-color-picker-area-y": "<percentage>";
  /** Position of a channel's thumb along its track. */
  "--sui-color-picker-channel-percent": "<percentage>";
  /** Columns of the swatch grid. */
  "--sui-color-picker-columns": "<integer>";
  /** The colour of one swatch. */
  "--sui-color-picker-swatch-color": "<color>";
  /** Where the surface grows from, so a scale-in starts at the anchor. */
  "--sui-transform-origin": "<position>";
  /** Width of the anchor the surface is placed against. */
  "--sui-anchor-width": "<length>";
  /** Height of the anchor the surface is placed against. */
  "--sui-anchor-height": "<length>";
  /** Room left for the surface's width inside the boundary. */
  "--sui-available-width": "<length>";
  /** Room left for the surface's height inside the boundary. */
  "--sui-available-height": "<length>";
  /** Width of the page scrollbar the scroll lock hides, published on the root. */
  "--sui-scrollbar-width": "<length>";
}
