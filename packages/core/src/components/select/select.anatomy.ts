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
