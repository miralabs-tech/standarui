/**
 * A civil date — a year, a month and a day — and the arithmetic that goes with
 * it. No hour, no zone, no `Date` in the value: `calendar`, `date-field` and
 * `date-picker` all hold this shape, and it is structurally a subset of
 * `Temporal.PlainDate` (same keys, same 1-based month), so `PlainDate.from(value)`
 * accepts it the day Safari ships Temporal and we can drop the polyfill question
 * entirely.
 *
 * It sits outside `components/` for the same reason `utils/range` does, and with
 * three consumers on day one rather than one — per the CDC §5.1 amendment of
 * 2026-08-28 it therefore carries its own budget line.
 *
 * **Every conversion goes through UTC, and only through UTC.** A local `Date` is
 * the one thing this module refuses: `new Date(2026, 2, 29)` in a zone that skips
 * an hour that night is a different day than the one asked for, and the bug
 * surfaces twice a year in one hemisphere. `getUTC*` cannot drift.
 *
 * **The two-digit-year shim is still in the language.** `Date.UTC(50, 3, 1)` is
 * 1950, not the year 50, and so is every constructor that takes a year argument.
 * `toUTCDate` sets the fields on an epoch date instead, which is the only
 * construction that means what it says across the whole domain.
 *
 * **The bounds are enforced where a value enters, not on every step.** `fromParts`
 * clamps and `fromISO` refuses, because those are the props and the form field;
 * `addDays` and `addMonths` answer faithfully, because arithmetic that silently
 * clamped would make a month grid repeat a cell rather than overflow.
 */

/** Month is 1-based — the way a human writes it, and the way `Temporal` does. */
export interface DateValue {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** ISO-8601 numbering: 1 is Monday, 7 is Sunday. What `getWeekInfo` reports. */
export type FirstDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MonthGridOptions {
  readonly firstDayOfWeek?: FirstDayOfWeek | undefined;
  /**
   * Six rows whatever the month. Without it a surface changes height between
   * February and August, and no stylesheet can reserve for a row it cannot count.
   */
  readonly fixedWeeks?: boolean | undefined;
}

/**
 * `toISO` writes `YYYY-MM-DD` and defines no extended `±YYYYYY` form; ICU picks
 * an era of its own for year 0 and below, and a form field is read by servers
 * that parse four digits. Three reasons, one domain.
 *
 * Exported because a year segment is a `spinbutton` and has to declare its
 * `aria-valuemin`/`aria-valuemax` — the alternative is the same two literals
 * written again somewhere that cannot see this file.
 */
export const MIN_DATE_YEAR = 1;
export const MAX_DATE_YEAR = 9999;

const MONTH_LENGTHS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toOrdinal(value: DateValue): number {
  return value.year * 10000 + value.month * 100 + value.day;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const index = clampInt(month, 1, 12);
  if (index === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[index - 1] ?? 31;
}

/** The way a prop becomes a value: out of range is clamped, never thrown. */
export function fromParts(year: number, month: number, day: number): DateValue {
  const y = clampInt(year, MIN_DATE_YEAR, MAX_DATE_YEAR);
  const m = clampInt(month, 1, 12);
  return { year: y, month: m, day: clampInt(day, 1, daysInMonth(y, m)) };
}

/** Midnight UTC on that day — the bridge to `Intl` and to any `Date` API. */
export function toUTCDate(value: DateValue): Date {
  const date = new Date(0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  return date;
}

/** Reads what the `Date` says, bounds included: it is arithmetic, not a prop. */
export function fromUTCDate(date: Date): DateValue {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function addDays(value: DateValue, days: number): DateValue {
  const date = toUTCDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTCDate(date);
}

/**
 * The clamp is the whole point: 31 January plus one month is the 28th or the
 * 29th of February, never the 2nd or 3rd of March.
 */
export function addMonths(value: DateValue, months: number): DateValue {
  const total = value.year * 12 + (value.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(value.day, daysInMonth(year, month)) };
}

/** Through the months, so 29 February plus a year lands on the 28th. */
export function addYears(value: DateValue, years: number): DateValue {
  return addMonths(value, years * 12);
}

/** Negative, zero or positive — on the ordinal, so no `Date` is allocated. */
export function compareDates(a: DateValue, b: DateValue): number {
  return toOrdinal(a) - toOrdinal(b);
}

export function clampDate(
  value: DateValue,
  min?: DateValue | null,
  max?: DateValue | null,
): DateValue {
  if (min !== null && min !== undefined && compareDates(value, min) < 0) return min;
  if (max !== null && max !== undefined && compareDates(value, max) > 0) return max;
  return value;
}

export function startOfMonth(value: DateValue): DateValue {
  return { year: value.year, month: value.month, day: 1 };
}

export function endOfMonth(value: DateValue): DateValue {
  return { year: value.year, month: value.month, day: daysInMonth(value.year, value.month) };
}

/** 0 is Sunday — the numbering `Date.prototype.getUTCDay` already speaks. */
export function getDayOfWeek(value: DateValue): number {
  return toUTCDate(value).getUTCDay();
}

/**
 * The column a date lands in, 0…6. `firstDayOfWeek` is ISO and `% 7` is what
 * turns it into the Sunday-zero numbering above — 7 (Sunday) becomes 0.
 */
export function getWeekdayIndex(value: DateValue, firstDayOfWeek: FirstDayOfWeek = 1): number {
  return (getDayOfWeek(value) - (firstDayOfWeek % 7) + 7) % 7;
}

/**
 * A month, flattened into whole weeks: the days before the 1st and after the
 * last are the real neighbouring dates, not holes. A cell with no date is
 * unaddressable and breaks the APG grid count — `outsideDays: "hidden"` is the
 * stylesheet's business.
 *
 * Four rows, five or six depending on where the month starts; six always under
 * `fixedWeeks`.
 */
export function getMonthGrid(
  year: number,
  month: number,
  options: MonthGridOptions = {},
): DateValue[] {
  const first = fromParts(year, month, 1);
  const lead = getWeekdayIndex(first, options.firstDayOfWeek ?? 1);
  const weeks =
    options.fixedWeeks === true ? 6 : Math.ceil((lead + daysInMonth(first.year, first.month)) / 7);
  const cells: DateValue[] = [];
  // One `Date` walked forward rather than one per cell: this runs on every month
  // change, and the memo above it keys on four values that all change together.
  const cursor = toUTCDate(first);
  cursor.setUTCDate(cursor.getUTCDate() - lead);
  for (let index = 0; index < weeks * 7; index++) {
    cells.push(fromUTCDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}

/**
 * The ISO-8601 week of the year, 1…53 — the number a calendar puts in its
 * `weekNumber` column.
 *
 * ISO numbers a week by the year its **Thursday** falls in, which is why the walk
 * below goes to that Thursday first: the last days of December belong to week 1
 * of the year after about three times a decade, and a naive "days since 1 January
 * divided by seven" reports 53 for them. `firstDayOfWeek` deliberately plays no
 * part — the number is ISO's whatever day the grid starts on, and a locale that
 * lays its week out from Sunday still calls that week the same one.
 */
export function getWeekNumber(value: DateValue): number {
  const thursday = toUTCDate(addDays(value, 3 - ((getDayOfWeek(value) + 6) % 7)));
  // 4 January is in week 1 by definition, so its own Thursday anchors the count.
  const fourth: DateValue = { year: thursday.getUTCFullYear(), month: 1, day: 4 };
  const anchor = toUTCDate(addDays(fourth, 3 - ((getDayOfWeek(fourth) + 6) % 7)));
  return 1 + Math.round((thursday.getTime() - anchor.getTime()) / (7 * 86_400_000));
}

export function toISO(value: DateValue): string {
  const year = String(value.year).padStart(4, "0");
  const month = String(value.month).padStart(2, "0");
  return `${year}-${month}-${String(value.day).padStart(2, "0")}`;
}

/**
 * Strict, and `null` rather than a clamp: a form or a prop that carries
 * `2026-02-30` is a bug in the consumer, and inventing the 28th for them would
 * hide it. Only the four-digit form is accepted — the extended `±YYYYYY` form is
 * outside the domain, not merely unsupported.
 */
export function fromISO(input: string | null | undefined): DateValue | null {
  const match = typeof input === "string" ? ISO_DATE.exec(input) : null;
  if (match === null) return null;
  const year = Number(match[1] ?? "");
  const month = Number(match[2] ?? "");
  const day = Number(match[3] ?? "");
  if (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
