import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Four parts, and **three of them are not new elements**. `positioner`, `backdrop`
 * and `content` are co-identities laid on top of the ones a `dialog` already
 * renders: the element comes out as `data-scope="dialog drawer"` /
 * `data-part="dialog:content drawer:content"`, both sheets match, and neither
 * erases the other since BUG-SCOPE-01 (`architecture.md:45`). A complete anatomy
 * of its own would have meant a second copy of every dialog rule — the trade
 * `alert-dialog` refused for the same reason.
 *
 * `grabber` is the only element the drawer brings, and the only one it names.
 *
 * No `trigger`, no `title`, no `closeTrigger`: the drawer decorates a surface's
 * *geometry*, and everything about being an overlay stays with the machine that
 * is one. That is also what lets the same decorator sit under a `menu` or a
 * `select` sheet later without either of them learning a word about gestures.
 */
export type DrawerPart = "positioner" | "backdrop" | "content" | "grabber";

export const anatomy: Anatomy<DrawerPart> = createAnatomy("drawer").parts(
  "positioner",
  "backdrop",
  "content",
  "grabber",
);

export const parts: Record<DrawerPart, AnatomyPart> = anatomy.build();

export interface DrawerCssVars {
  // --- written ---
  /** Signed distance the sheet has been dragged, positive toward closed. */
  "--sui-drag-offset": "<length>";
  /** The current detent, from 0 to 1. */
  "--sui-drawer-detent": "<number>";
  /** The highest detent the sheet can reach, from 0 to 1. */
  "--sui-drawer-detent-max": "<number>";
  /** How far the sheet is open while it is dragged, from 0 to 1. */
  "--sui-drawer-progress": "<number>";
  // --- read ---
  /** Duration of a slow release's settle. */
  "--sui-spring-smooth-duration": "<time>";
  /** Easing of a slow or medium release's settle. */
  "--sui-spring-smooth": "<easing-function>";
  /** Duration of a medium release's settle. */
  "--sui-duration-300": "<time>";
  /** Duration of a fast release's settle. */
  "--sui-duration-200": "<time>";
  /** Easing of a fast release's settle. */
  "--sui-ease-in": "<easing-function>";
}
