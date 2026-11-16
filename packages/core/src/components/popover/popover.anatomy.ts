import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * No `root`, same divergence as `dialog`: the trigger stays where the author wrote
 * it and the surface is portalled, so the two are siblings with nothing above
 * them. What the annexe calls `root` is the machine context.
 *
 * `arrow` is a **sibling of `content`, inside `positioner`** — never a child of the
 * surface. Two reasons, and both are load-bearing: `contain: layout paint` on a
 * glass surface (CDC §5.1) would clip the arrow away, and `--sui-arrow-x/y` is
 * computed relative to the floating element's own origin, which is the positioner.
 *
 * `arrow` and `arrowTip` are two elements because they answer to two different
 * writers: the effect writes the placement onto `arrow`, and the sheet draws the
 * silhouette onto `arrowTip`. Collapsing them would put a `clip-path` on the node
 * whose `--sui-arrow-x` moves it, and a clip is applied in the clipped element's
 * own box.
 */
export type PopoverPart =
  | "trigger"
  | "anchor"
  | "backdrop"
  | "positioner"
  | "content"
  | "arrow"
  | "arrowTip"
  | "title"
  | "description"
  | "closeTrigger";

export const anatomy: Anatomy<PopoverPart> = createAnatomy("popover").parts(
  "trigger",
  "anchor",
  "backdrop",
  "positioner",
  "content",
  "arrow",
  "arrowTip",
  "title",
  "description",
  "closeTrigger",
);

export const parts: Record<PopoverPart, AnatomyPart> = anatomy.build();

export interface PopoverCssVars {
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
  /** Inline offset of the arrow within the surface. */
  "--sui-arrow-x": "<length>";
  /** Block offset of the arrow within the surface. */
  "--sui-arrow-y": "<length>";
  /** Width of the page scrollbar the scroll lock hides, published on the root. */
  "--sui-scrollbar-width": "<length>";
}
