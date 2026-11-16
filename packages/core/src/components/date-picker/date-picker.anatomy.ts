import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Ten parts, and neither the calendar nor the field is one of them. They are
 * machines of their own, and `connect` hands them **props** — `getCalendarProps`,
 * `getFieldProps` — rather than merging attributes onto their roots: a merge is
 * what would let this picker's `disabled: false` talk over a child that disabled
 * itself, the rule `field` imposed on the whole library.
 *
 * A `root` here, unlike `select`, `menu` and `popover`: the field is not portalled
 * and has to sit beside the trigger. A native combo box is the
 * precedent — it has two *separate* click zones, the field and the
 * button, so the box and the chevron really are two targets and not one
 * button wrapped around a field.
 *
 * No `arrow`: no tang is drawn on a pop-up (`select.anatomy.ts`).
 */
export type DatePickerPart =
  | "root"
  | "label"
  | "trigger"
  | "clearTrigger"
  | "backdrop"
  | "positioner"
  | "content"
  | "title"
  | "cancelTrigger"
  | "closeTrigger";

export const anatomy: Anatomy<DatePickerPart> = createAnatomy("date-picker").parts(
  "root",
  "label",
  "trigger",
  "clearTrigger",
  "backdrop",
  "positioner",
  "content",
  "title",
  "cancelTrigger",
  "closeTrigger",
);

export const parts: Record<DatePickerPart, AnatomyPart> = anatomy.build();

export interface DatePickerCssVars {
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
