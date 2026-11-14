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
