import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Three parts, where the popover has ten, and the two it does not have are the
 * point rather than an omission.
 *
 * **No `arrow`.** A native desktop tooltip is a 49x18 rectangle
 * with two drop shadows and no spur at all, and touch platforms have no tooltip whatsoever —
 * so there is no geometry to read for one. Drawing an arrow here would mean
 * inventing a silhouette that was never published, and hanging it off a surface
 * eighteen pixels tall. A surface that needs to point at its anchor is a popover.
 *
 * **No `anchor`.** A tooltip describes the control it is attached to; there is no
 * case where it points at something else, and `aria-describedby` runs between
 * exactly those two nodes.
 *
 * Like the dialog and the popover, no `root`: the trigger stays where the author
 * wrote it and the surface is portalled, so the two are siblings.
 */
export type TooltipPart = "trigger" | "positioner" | "content";

export const anatomy: Anatomy<TooltipPart> = createAnatomy("tooltip").parts(
  "trigger",
  "positioner",
  "content",
);

export const parts: Record<TooltipPart, AnatomyPart> = anatomy.build();

export interface TooltipCssVars {
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
}
