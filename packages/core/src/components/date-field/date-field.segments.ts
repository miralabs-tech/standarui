/**
 * The segment arithmetic: what a locale's `formatToParts` lays out, what each unit
 * is allowed to hold, and how a digit, an arrow or a stepper turns one number into
 * the next. Pure — no DOM, no service, no `Date` in a value.
 *
 * It lives in the component and not in `utils/date-format` because that module and
 * `plain-date` both carry a civil *date*, and a field at `granularity: "minute"`
 * carries a time as well. Three of the helpers below are general enough that
 * `calendar` and `date-picker` will want them — `toUTCDateTime`, `getUnitLabel`
 * and `toISOValue` — and they are named in the hand-off so they can move up once
 * those two have landed and the shared module has one owner again.
 *
 * **The day period is derived, never stored.** The hour is held once, on the
 * 24-hour clock, and `h12` reads a segment pair out of it. Storing both would let
 * "13" and "PM" disagree, and no state would say which one is right.
 *
 * **Nothing rendered here reads a clock.** Unfilled units resolve to fixed
 * constants — a leap year and January, the pair that can hold any day a user is
 * entitled to type — so a server in UTC and a client thirteen hours ahead emit the
 * same `aria-valuemax` and the same dashes. A placeholder date, which may well be
 * today, is consulted in exactly one function: `adjustSegment`, where an arrow
 * steps an empty segment, and that only ever runs after a keypress on a client.
 */

import { getDateFormatter } from "../../utils/date-format";
import {
  compareDates,
  type DateValue,
  daysInMonth,
  fromParts,
  MAX_DATE_YEAR,
  MIN_DATE_YEAR,
  toISO,
  toUTCDate,
} from "../../utils/plain-date";
import type {
  DateFieldValue,
  DateGranularity,
  DateHourCycle,
  DateSegment,
  DateSegmentType,
  DateSegmentUnit,
  DateSegmentValues,
} from "./date-field.types";

/** Everything the layout of the field depends on, and nothing else. */
export interface SegmentContext {
  readonly locale: string;
  readonly granularity: DateGranularity;
  readonly hourCycle: DateHourCycle;
}

/** Every unit filled in — what the formatter is handed and what bounds read from. */
export interface ResolvedDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export interface SegmentBounds {
  readonly min: number;
  readonly max: number;
}

/** What a digit did to a segment, and whether the segment can hold another one. */
export interface DigitResult {
  readonly parts: DateSegmentValues;
  readonly buffer: string;
  /** No further digit could fit, so the focus moves on by itself. */
  readonly complete: boolean;
}

export const EMPTY_SEGMENT_VALUES: DateSegmentValues = {
  year: null,
  month: null,
  day: null,
  hour: null,
  minute: null,
  second: null,
};

/** Long enough to finish typing "2026", short enough that a pause starts over. */
export const TYPE_BUFFER_MS = 1000;

/** A leap year, so an unknown year never refuses the 29th of February. */
const SHAPE_YEAR = 2024;
/** January, so an unknown month holds any day from the 1st to the 31st. */
const SHAPE_MONTH = 1;

const SEGMENT_TYPES: ReadonlySet<string> = new Set<DateSegmentType>([
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "dayPeriod",
]);

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

const unitLabels = new Map<string, string>();

function formatOptionsFor(
  granularity: DateGranularity,
  hourCycle: DateHourCycle,
): Intl.DateTimeFormatOptions {
  if (granularity === "day") return DATE_OPTIONS;
  const withHour: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, hour: "2-digit", hourCycle };
  if (granularity === "hour") return withHour;
  const withMinute: Intl.DateTimeFormatOptions = { ...withHour, minute: "2-digit" };
  if (granularity === "minute") return withMinute;
  return { ...withMinute, second: "2-digit" };
}

function asSegmentType(type: string): DateSegmentType | null {
  return SEGMENT_TYPES.has(type) ? (type as DateSegmentType) : null;
}

/** The unit a segment reads and writes: the day period is the hour, seen twelve-wise. */
function unitOf(type: DateSegmentType): DateSegmentUnit {
  return type === "dayPeriod" ? "hour" : type;
}

export function isSegmentFilled(parts: DateSegmentValues, type: DateSegmentType): boolean {
  return parts[unitOf(type)] !== null;
}

export function toSegmentValues(value: DateFieldValue | null | undefined): DateSegmentValues {
  if (value === null || value === undefined) return EMPTY_SEGMENT_VALUES;
  return {
    year: value.year,
    month: value.month,
    day: value.day,
    hour: value.hour ?? null,
    minute: value.minute ?? null,
    second: value.second ?? null,
  };
}

export function segmentValuesEqual(a: DateSegmentValues, b: DateSegmentValues): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/** The rendered shape: what has been typed, and constants for what has not. */
export function resolveShape(parts: DateSegmentValues): ResolvedDateTime {
  const year = parts.year ?? SHAPE_YEAR;
  const month = parts.month ?? SHAPE_MONTH;
  return {
    year,
    month,
    day: Math.min(parts.day ?? 1, daysInMonth(year, month)),
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** The stepping shape: a placeholder fills what has not been typed. */
export function resolveFromPlaceholder(
  parts: DateSegmentValues,
  placeholder: DateFieldValue,
): ResolvedDateTime {
  const year = parts.year ?? placeholder.year;
  const month = parts.month ?? placeholder.month;
  return {
    year,
    month,
    day: Math.min(parts.day ?? placeholder.day, daysInMonth(year, month)),
    hour: parts.hour ?? placeholder.hour ?? 0,
    minute: parts.minute ?? placeholder.minute ?? 0,
    second: parts.second ?? placeholder.second ?? 0,
  };
}

/** Midnight-plus-a-time UTC: `plain-date` builds the day, this adds the clock. */
export function toUTCDateTime(value: DateFieldValue): Date {
  const date = toUTCDate(value);
  date.setUTCHours(value.hour ?? 0, value.minute ?? 0, value.second ?? 0, 0);
  return date;
}

/**
 * The value, or `null` while any unit the granularity asks for is still empty. A
 * half-typed date is not a date, and reporting one would have a form submit the
 * 1st of a month nobody chose.
 */
export function composeDateValue(
  parts: DateSegmentValues,
  granularity: DateGranularity,
): DateFieldValue | null {
  const { year, month, day, hour, minute, second } = parts;
  if (year === null || month === null || day === null) return null;
  const date = fromParts(year, month, day);
  if (granularity === "day") return date;
  if (hour === null) return null;
  if (granularity === "hour") return { ...date, hour };
  if (minute === null) return null;
  if (granularity === "minute") return { ...date, hour, minute };
  if (second === null) return null;
  return { ...date, hour, minute, second };
}

export function isWithinRange(
  value: DateFieldValue | null,
  min: DateValue | undefined,
  max: DateValue | undefined,
): boolean {
  if (value === null) return true;
  if (min !== undefined && compareDates(value, min) < 0) return false;
  return max === undefined || compareDates(value, max) <= 0;
}

/** What a form receives: `datetime-local`'s own spelling past `granularity: "day"`. */
export function toISOValue(value: DateFieldValue | null, granularity: DateGranularity): string {
  if (value === null) return "";
  const date = toISO(value);
  if (granularity === "day") return date;
  const pad = (input: number): string => String(input).padStart(2, "0");
  const time = `${pad(value.hour ?? 0)}:${pad(value.minute ?? 0)}`;
  return granularity === "second" ? `${date}T${time}:${pad(value.second ?? 0)}` : `${date}T${time}`;
}

export function getSegmentBounds(
  type: DateSegmentType,
  resolved: ResolvedDateTime,
  hourCycle: DateHourCycle,
): SegmentBounds {
  switch (type) {
    case "year":
      return { min: MIN_DATE_YEAR, max: MAX_DATE_YEAR };
    case "month":
      return { min: 1, max: 12 };
    case "day":
      return { min: 1, max: daysInMonth(resolved.year, resolved.month) };
    case "hour":
      return hourCycle === "h12" ? { min: 1, max: 12 } : { min: 0, max: 23 };
    case "dayPeriod":
      return { min: 0, max: 1 };
    default:
      return { min: 0, max: 59 };
  }
}

/** The number the segment shows — the hour twelve-wise, the period as 0 or 1. */
export function getSegmentDisplay(
  type: DateSegmentType,
  resolved: ResolvedDateTime,
  hourCycle: DateHourCycle,
): number {
  switch (type) {
    case "year":
      return resolved.year;
    case "month":
      return resolved.month;
    case "day":
      return resolved.day;
    case "hour":
      return hourCycle === "h12" ? resolved.hour % 12 || 12 : resolved.hour;
    case "minute":
      return resolved.minute;
    case "second":
      return resolved.second;
    default:
      return resolved.hour >= 12 ? 1 : 0;
  }
}

export function withSegment(
  parts: DateSegmentValues,
  type: DateSegmentType,
  next: number,
  hourCycle: DateHourCycle,
): DateSegmentValues {
  if (type === "dayPeriod") {
    const hour = (parts.hour ?? 0) % 12;
    return { ...parts, hour: next === 1 ? hour + 12 : hour };
  }
  if (type === "hour" && hourCycle === "h12") {
    const afternoon = (parts.hour ?? 0) >= 12;
    const base = next % 12;
    return { ...parts, hour: afternoon ? base + 12 : base };
  }
  const merged: DateSegmentValues = {
    year: type === "year" ? next : parts.year,
    month: type === "month" ? next : parts.month,
    day: type === "day" ? next : parts.day,
    hour: type === "hour" ? next : parts.hour,
    minute: type === "minute" ? next : parts.minute,
    second: type === "second" ? next : parts.second,
  };
  // A month or a year that shortens the month takes the day with it: the 31st of
  // March moved into February is the 28th, never a day that does not exist.
  if (merged.year !== null && merged.month !== null && merged.day !== null) {
    const last = daysInMonth(merged.year, merged.month);
    if (merged.day > last) return { ...merged, day: last };
  }
  return merged;
}

export function withoutSegment(parts: DateSegmentValues, type: DateSegmentType): DateSegmentValues {
  const unit = unitOf(type);
  return {
    year: unit === "year" ? null : parts.year,
    month: unit === "month" ? null : parts.month,
    day: unit === "day" ? null : parts.day,
    hour: unit === "hour" ? null : parts.hour,
    minute: unit === "minute" ? null : parts.minute,
    second: unit === "second" ? null : parts.second,
  };
}

export function adjustSegment(
  parts: DateSegmentValues,
  type: DateSegmentType,
  delta: number,
  hourCycle: DateHourCycle,
  placeholder: DateFieldValue,
): DateSegmentValues {
  const shape = resolveShape(parts);
  const { min, max } = getSegmentBounds(type, shape, hourCycle);
  // An empty segment lands on the placeholder rather than wrapping in from
  // nowhere: an arrow on a blank month means "this month", not January.
  if (!isSegmentFilled(parts, type)) {
    const start = getSegmentDisplay(type, resolveFromPlaceholder(parts, placeholder), hourCycle);
    return withSegment(parts, type, Math.min(Math.max(start, min), max), hourCycle);
  }
  const shown = getSegmentDisplay(type, shape, hourCycle);
  const span = max - min + 1;
  return withSegment(
    parts,
    type,
    min + ((((shown + delta - min) % span) + span) % span),
    hourCycle,
  );
}

/**
 * One digit into a segment, or `null` when the buffer cannot take it.
 *
 * `null` is not a refusal to type — it is the auto-advance: a month holding 1 that
 * is handed a 3 keeps January, and the 3 opens the next segment. That is what a
 * two-digit buffer owes, and it is why the caller decides what happens next
 * instead of this function inventing a month of 13.
 */
export function typeDigit(
  parts: DateSegmentValues,
  type: DateSegmentType,
  digit: number,
  buffer: string,
  hourCycle: DateHourCycle,
): DigitResult | null {
  // The period is a word, not a number. It has two values and the arrows reach
  // both, which is the whole of what a two-valued spinbutton owes.
  if (type === "dayPeriod") return null;
  const { min, max } = getSegmentBounds(type, resolveShape(parts), hourCycle);
  const next = buffer === "" ? digit : Number(`${buffer}${digit}`);
  if (next > max) return null;
  return {
    // Below the minimum is a prefix, not a value: the `0` of "09" on a 12-hour
    // clock is a segment the next digit is about to complete.
    parts: next < min ? parts : withSegment(parts, type, next, hourCycle),
    buffer: `${buffer}${digit}`,
    complete: next * 10 > max,
  };
}

/**
 * The unit's name in the field's own locale. `Intl.DisplayNames` already carries
 * this table — `type: "dateTimeField"` was added to ECMA-402 for exactly this — so
 * shipping our own would be the locale blob the one-dependency rule exists to
 * refuse. A runtime that has neither the constructor nor the code falls back to
 * the unit's own name, which is English and says so.
 */
export function getUnitLabel(locale: string, type: DateSegmentType): string {
  const key = `${locale}|${type}`;
  const cached = unitLabels.get(key);
  if (cached !== undefined) return cached;
  let label: string = type;
  try {
    label = new Intl.DisplayNames(locale, { type: "dateTimeField" }).of(type) ?? type;
  } catch {
    label = type;
  }
  unitLabels.set(key, label);
  return label;
}

/**
 * The field laid out the way the locale writes it — `en-US` month first, `de-DE`
 * day first, `ja-JP` year first — with the literals between them kept, because
 * they are as much of the answer as the numbers are.
 */
export function buildSegments(parts: DateSegmentValues, context: SegmentContext): DateSegment[] {
  const shape = resolveShape(parts);
  const formatter = getDateFormatter(
    context.locale,
    formatOptionsFor(context.granularity, context.hourCycle),
  );
  return formatter.formatToParts(toUTCDateTime(shape)).map((part): DateSegment => {
    const type = asSegmentType(part.type);
    if (type === null) {
      return {
        type: "literal",
        text: part.value,
        value: null,
        min: 0,
        max: 0,
        label: "",
        isPlaceholder: false,
      };
    }
    const bounds = getSegmentBounds(type, shape, context.hourCycle);
    const filled = isSegmentFilled(parts, type);
    return {
      type,
      // Dashes as wide as the number they stand in for, so a field does not
      // change width the moment it is typed into.
      text: filled ? part.value : "-".repeat(part.value.length),
      value: filled ? getSegmentDisplay(type, shape, context.hourCycle) : null,
      min: bounds.min,
      max: bounds.max,
      label: getUnitLabel(context.locale, type),
      isPlaceholder: !filled,
    };
  });
}

/** The editable types, in display order — what the arrows and Home/End walk. */
export function editableSegments(segments: readonly DateSegment[]): DateSegmentType[] {
  const types: DateSegmentType[] = [];
  for (const segment of segments) {
    if (segment.type !== "literal") types.push(segment.type);
  }
  return types;
}
