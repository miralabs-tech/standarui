import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * No `root`. The annexe lists one, but an anatomy is the list of *elements*, and
 * a dialog has none to put it on: the trigger stays where the author wrote it and
 * the surface is portalled elsewhere, so the two are siblings with nothing above
 * them. What the annexe called `root` is the machine context, which belongs to
 * the adapter's provider (spec §8, divergence 1).
 *
 * `alert-dialog` extends this rather than forking it — same parts, plus the two
 * action buttons, and `role="alertdialog"` through the machine's `role` prop. The
 * two live here rather than in an anatomy of their own so that they keep
 * `data-scope="dialog"`: an alert dialog's surface, scrim, positioner and touch
 * sheet are the dialog's, to the pixel, and a second scope would have meant a
 * second copy of every one of those rules.
 */
export type DialogPart =
  | "trigger"
  | "backdrop"
  | "positioner"
  | "content"
  | "title"
  | "description"
  | "closeTrigger"
  | "actions"
  | "cancelTrigger"
  | "actionTrigger";

export const anatomy: Anatomy<DialogPart> = createAnatomy("dialog").parts(
  "trigger",
  "backdrop",
  "positioner",
  "content",
  "title",
  "description",
  "closeTrigger",
  "actions",
  "cancelTrigger",
  "actionTrigger",
);

export const parts: Record<DialogPart, AnatomyPart> = anatomy.build();

export interface DialogCssVars {
  // --- written ---
  /** Width of the page scrollbar the scroll lock hides, published on the root. */
  "--sui-scrollbar-width": "<length>";
}
