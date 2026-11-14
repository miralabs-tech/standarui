/**
 * What a page of the calendar is, in each of its three views — shared by the
 * machine, which navigates it, and by `connect`, which renders it. Pure, and no
 * `Intl` beyond the caption: everything here is arithmetic on `DateValue`.
 *
 * The three views differ in exactly four ways — how many columns, what a cell
 * stands for, how far a page moves, and what `data-value` says — so those four
 * are the functions below and nothing else branches on the view.
 *
 * **The year view is a decade of ten, not a page of twelve.** Four columns over
 * ten cells leaves the last row ragged, which `getGridNextIndex` already handles
 * (`lastInColumn`), and it is what keeps `PageUp` on the year view meaning "the
 * previous decade" rather than "the previous twelve years" — the unit the spec
 * asks for, and the only one whose pages tile the way a reader expects.
 */

import { formatDate } from "../../utils/date-format";
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  type DateValue,
  daysInMonth,
  endOfMonth,
  fromParts,
  getMonthGrid,
  type MonthGridOptions,
  startOfMonth,
  toISO,
} from "../../utils/plain-date";
import type { CalendarOutsideDays, CalendarView } from "./calendar.types";

export const DECADE_LENGTH = 10;

const MONTHS_IN_YEAR = 12;

/**
 * The month grid's own options, under the name this module's callers use. It was
 * a second declaration of the same two fields until 2026-09-06; one shape, one
 * place to change it.
 */
export type CalendarPageOptions = MonthGridOptions;

/** Seven days across, four months or years across. */
export function getColumns(view: CalendarView): number {
  return view === "day" ? 7 : 4;
}

export function getDecadeStart(year: number): number {
  return Math.floor(year / DECADE_LENGTH) * DECADE_LENGTH;
}

export function getPageCells(
  view: CalendarView,
  focused: DateValue,
  options: CalendarPageOptions = {},
): DateValue[] {
  if (view === "day") return getMonthGrid(focused.year, focused.month, options);
  if (view === "month") {
    return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => ({
      year: focused.year,
      month: index + 1,
      day: 1,
    }));
  }
  const start = getDecadeStart(focused.year);
  return Array.from({ length: DECADE_LENGTH }, (_, index) => ({
    year: start + index,
    month: 1,
    day: 1,
  }));
}

/**
 * Whether two dates are the same *cell*, which is not the same question as
 * whether they are the same date: a month cell answers for its whole month, and
 * a year cell for its whole year.
 */
export function isSameCell(view: CalendarView, a: DateValue, b: DateValue): boolean {
  if (a.year !== b.year) return false;
  if (view === "year") return true;
  if (a.month !== b.month) return false;
  return view === "month" || a.day === b.day;
}

/** The first and last date a cell stands for. */
export function getCellSpan(view: CalendarView, cell: DateValue): readonly [DateValue, DateValue] {
  if (view === "day") return [cell, cell];
  if (view === "month") return [startOfMonth(cell), endOfMonth(cell)];
  return [
    { year: cell.year, month: 1, day: 1 },
    { year: cell.year, month: MONTHS_IN_YEAR, day: 31 },
  ];
}

/** A cell is in range while any part of what it stands for is. */
export function isCellInRange(
  view: CalendarView,
  cell: DateValue,
  min?: DateValue | null | undefined,
  max?: DateValue | null | undefined,
): boolean {
  const [start, end] = getCellSpan(view, cell);
  if (min !== null && min !== undefined && compareDates(end, min) < 0) return false;
  if (max !== null && max !== undefined && compareDates(start, max) > 0) return false;
  return true;
}

/** One step in the view's own unit: a day, a month, a year. */
export function stepCell(view: CalendarView, value: DateValue, amount: number): DateValue {
  if (view === "day") return addDays(value, amount);
  if (view === "month") return addMonths(value, amount);
  return addYears(value, amount);
}

/**
 * A page: the month, the year, the decade — and one unit coarser under Shift,
 * which is where `Shift+PageUp` gets its year and the year view its century.
 */
export function pageCell(
  view: CalendarView,
  value: DateValue,
  step: number,
  big: boolean,
): DateValue {
  if (view === "day") return big ? addYears(value, step) : addMonths(value, step);
  const years = view === "month" ? 1 : DECADE_LENGTH;
  return addYears(value, step * years * (big ? DECADE_LENGTH : 1));
}

/** The span the header's two arrows step over — what `min`/`max` disable them on. */
export function getPageBounds(
  view: CalendarView,
  focused: DateValue,
): readonly [DateValue, DateValue] {
  if (view === "day") return [startOfMonth(focused), endOfMonth(focused)];
  if (view === "month") {
    return [
      { year: focused.year, month: 1, day: 1 },
      { year: focused.year, month: MONTHS_IN_YEAR, day: 31 },
    ];
  }
  const start = getDecadeStart(focused.year);
  return [
    { year: start, month: 1, day: 1 },
    { year: start + DECADE_LENGTH - 1, month: MONTHS_IN_YEAR, day: 31 },
  ];
}

/**
 * The anchor a cell moves the focus to. A month cell carries no day and a year
 * cell carries neither, so the parts the view does not own are kept from where
 * the focus already was — clamped, because 31 January is not a date in February.
 */
export function focusFromCell(view: CalendarView, current: DateValue, cell: DateValue): DateValue {
  if (view === "day") return cell;
  if (view === "month") return fromParts(current.year, cell.month, current.day);
  return fromParts(
    cell.year,
    current.month,
    Math.min(current.day, daysInMonth(cell.year, current.month)),
  );
}

/**
 * Everything the two reachability questions below need, gathered once so the
 * machine and `connect` cannot answer them from different premises.
 */
export interface CalendarCellReach {
  readonly view: CalendarView;
  readonly focused: DateValue;
  readonly outsideDays: CalendarOutsideDays;
  readonly disabled: boolean;
  readonly min?: DateValue | null | undefined;
  readonly max?: DateValue | null | undefined;
  readonly isDateUnavailable?: ((value: DateValue) => boolean) | null | undefined;
}

/**
 * Whether a cell can be chosen. Deliberately not the same question as whether it
 * can hold the focus: `readOnly` stops a value from changing and has no business
 * stopping a reader from walking the month.
 */
export function isCellDisabled(reach: CalendarCellReach, cell: DateValue): boolean {
  const { view, disabled, min, max, isDateUnavailable } = reach;
  if (disabled) return true;
  if (!isCellInRange(view, cell, min, max)) return true;
  return view === "day" && isDateUnavailable?.(cell) === true;
}

/**
 * A cell nobody can see is a cell nobody can reach. The grid's one predicate,
 * asked by the machine when it settles the anchor and by `connect` when it scans
 * for the tab stop — and it lives here because the two once disagreed: `connect`
 * did not carry the `outsideDays: "hidden"` term, so on a page whose own dates
 * were all declined the only `tabindex="0"` landed on a cell the sheet hides in
 * `visibility: hidden`, and the grid left the tab order (audit of 2026-09-05,
 * the same defect `toggle-group` was audited for on 2026-08-27).
 *
 * The anchor itself is never outside its own page, so this differs from
 * `isCellDisabled` on the scanned cells alone.
 */
export function isCellUnreachable(reach: CalendarCellReach, cell: DateValue): boolean {
  if (isCellDisabled(reach, cell)) return true;
  return reach.outsideDays === "hidden" && isOutsidePage(reach.view, reach.focused, cell);
}

/**
 * The cell that carries the grid's single tab stop when the anchor itself
 * cannot: the first reachable date of the page, and only then one of the days
 * spilling in from a neighbouring month.
 *
 * A composite whose only `tabindex="0"` sits on a disabled cell is a composite
 * that has left the tab order entirely — the defect the `toggle-group` audit of
 * 2026-08-27 found, and the reason this is a pure scan rather than something an
 * effect settles: a server has to render the same stop the client will hydrate.
 */
export function findTabStop(
  cells: readonly DateValue[],
  isDisabled: (cell: DateValue) => boolean,
  isOutside: (cell: DateValue) => boolean,
): DateValue | undefined {
  return (
    cells.find((cell) => !isOutside(cell) && !isDisabled(cell)) ??
    cells.find((cell) => !isDisabled(cell))
  );
}

/**
 * The cell the anchor sits in. `focusedValue` is always a whole date, so the
 * month and year views have to drop what they do not own before a lookup — the
 * element's id is built from the cell, not from the anchor.
 */
export function getFocusedCell(view: CalendarView, focused: DateValue): DateValue {
  if (view === "day") return focused;
  if (view === "month") return { year: focused.year, month: focused.month, day: 1 };
  return { year: focused.year, month: 1, day: 1 };
}

/** `2026-04-15` in the day view, `2026-04` in the month view, `2026` in the year. */
export function toCellValue(view: CalendarView, cell: DateValue): string {
  const iso = toISO(cell);
  if (view === "day") return iso;
  return view === "month" ? iso.slice(0, 7) : iso.slice(0, 4);
}

/** Only the day view has cells belonging to a month other than the visible one. */
export function isOutsidePage(view: CalendarView, focused: DateValue, cell: DateValue): boolean {
  return view === "day" && (cell.month !== focused.month || cell.year !== focused.year);
}

/**
 * The caption, and the one string in this file `Intl` writes. The year view
 * formats both ends rather than concatenating digits, so a locale that writes
 * its years differently still gets its own numerals on both sides of the dash.
 */
export function formatPageCaption(view: CalendarView, focused: DateValue, locale: string): string {
  if (view === "day") return formatDate(focused, locale, { month: "long", year: "numeric" });
  if (view === "month") return formatDate(focused, locale, { year: "numeric" });
  const start = getDecadeStart(focused.year);
  const year = (value: number): string =>
    formatDate({ year: value, month: 1, day: 1 }, locale, { year: "numeric" });
  return `${year(start)} – ${year(start + DECADE_LENGTH - 1)}`;
}
