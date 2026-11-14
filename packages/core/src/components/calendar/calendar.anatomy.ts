import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Thirteen parts and no `cellTrigger`, which is the decision worth stating: APG
 * puts the roving `tabindex` on the `<td role="gridcell">` itself, and a button
 * inside every cell would double the DOM of the densest component in the library
 * — 42 of them on a day view. The principle is `radio-group`'s, take the minimal
 * element rather than rebuild one.
 *
 * There is one `grid` for the three views, not three. `data-view` switches
 * `--sui-calendar-columns` from 7 to 4 and changes what `data-value` means
 * (`2026-04-15` → `2026-04` → `2026`); two grids would be two collections, which
 * is the factor of two measured on `tabs` (CDC §5.1, amendment of 2026-09-01).
 */
export type CalendarPart =
  | "root"
  | "label"
  | "header"
  | "prevTrigger"
  | "nextTrigger"
  | "viewTrigger"
  | "caption"
  | "grid"
  | "weekdayRow"
  | "weekday"
  | "weekRow"
  | "weekNumber"
  | "cell";

export const anatomy: Anatomy<CalendarPart> = createAnatomy("calendar").parts(
  "root",
  "label",
  "header",
  "prevTrigger",
  "nextTrigger",
  "viewTrigger",
  "caption",
  "grid",
  "weekdayRow",
  "weekday",
  "weekRow",
  "weekNumber",
  "cell",
);

export const parts: Record<CalendarPart, AnatomyPart> = anatomy.build();
