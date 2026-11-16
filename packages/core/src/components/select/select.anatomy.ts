import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * No `root`, the same divergence as `dialog`, `popover` and `menu`: the trigger
 * stays where the author wrote it and the surface is portalled, so the two are
 * siblings with nothing above them. No `arrow` either — no tang is drawn
 * on a pop-up, exactly as with the menu.
 *
 * What the menu has and this one deliberately does not: `itemDescription`,
 * `itemShortcut`, `triggerItem` and `contextTrigger` are menu furniture. What
 * this one has and the menu does not: `valueText` (the trigger reflects the
 * selection) and `hiddenSelect` (the native form mirror, CDC §4.5).
 */
export type SelectPart =
  | "trigger"
  | "valueText"
  | "indicator"
  | "hiddenSelect"
  | "backdrop"
  | "positioner"
  | "content"
  | "itemGroup"
  | "itemGroupLabel"
  | "item"
  | "itemSymbol"
  | "itemText"
  | "itemIndicator"
  | "separator"
  | "cancelTrigger";

export const anatomy: Anatomy<SelectPart> = createAnatomy("select").parts(
  "trigger",
  "valueText",
  "indicator",
  "hiddenSelect",
  "backdrop",
  "positioner",
  "content",
  "itemGroup",
  "itemGroupLabel",
  "item",
  "itemSymbol",
  "itemText",
  "itemIndicator",
  "separator",
  "cancelTrigger",
);

export const parts: Record<SelectPart, AnatomyPart> = anatomy.build();

export interface SelectCssVars {
  // --- written ---
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
