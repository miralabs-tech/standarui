import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * One scope, one anatomy. "toast-group" is not a second component: it is the
 * `group` part and the machine that owns it, which is why the region and the card
 * share `data-scope="toast"` — a second scope would have meant a second copy of
 * every rule that positions one against the other.
 *
 * No `root` above the group, on the dialog's reading: the region is portalled and
 * has nothing above it. `indicator` is a slot rather than a drawn glyph — the app
 * puts its own inline SVG in it, because a text glyph stands on its baseline and
 * paints its ink below the centre of the box that reserves it.
 */
export type ToastPart =
  | "group"
  | "root"
  | "indicator"
  | "title"
  | "description"
  | "actionTrigger"
  | "closeTrigger";

export const anatomy: Anatomy<ToastPart> = createAnatomy("toast").parts(
  "group",
  "root",
  "indicator",
  "title",
  "description",
  "actionTrigger",
  "closeTrigger",
);

export const parts: Record<ToastPart, AnatomyPart> = anatomy.build();
