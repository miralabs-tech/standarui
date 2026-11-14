import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * No `root`, the same divergence as `dialog`, `popover` and `tooltip`: the trigger
 * stays where the author wrote it and the surface is portalled, so the two are
 * siblings with nothing above them.
 *
 * **No `arrow` either, and that one is the menu's own economy.** Neither a desktop
 * menu nor a touch one has a tang — the ergot is the popover's geometry, not this
 * one's — so there is no silhouette to draw, no node to measure and no
 * `--sui-arrow-x/y` to publish.
 *
 * **`triggerItem` is a part of its own, which is a deliberate divergence from
 * Zag and Ark**, who fuse `item` and `trigger` onto a single node. Here that
 * fusion would emit `data-part="menu:item menu:trigger"` — that is, a space — and
 * `architecture.md` reads a space in `data-part` as "this element is a
 * composition": every rule behind `:not([data-part*=" "])` would silently drop off
 * the item that opens a submenu. One token settles it, and the sheet shares the
 * shape with `:is([data-part~="menu:item"], [data-part~="menu:trigger-item"])`.
 */
export type MenuPart =
  | "trigger"
  | "contextTrigger"
  | "indicator"
  | "backdrop"
  | "positioner"
  | "content"
  | "itemGroup"
  | "itemGroupLabel"
  | "item"
  | "triggerItem"
  | "itemSymbol"
  | "itemText"
  | "itemDescription"
  | "itemIndicator"
  | "itemShortcut"
  | "separator"
  | "cancelTrigger";

export const anatomy: Anatomy<MenuPart> = createAnatomy("menu").parts(
  "trigger",
  "contextTrigger",
  "indicator",
  "backdrop",
  "positioner",
  "content",
  "itemGroup",
  "itemGroupLabel",
  "item",
  "triggerItem",
  "itemSymbol",
  "itemText",
  "itemDescription",
  "itemIndicator",
  "itemShortcut",
  "separator",
  "cancelTrigger",
);

export const parts: Record<MenuPart, AnatomyPart> = anatomy.build();
