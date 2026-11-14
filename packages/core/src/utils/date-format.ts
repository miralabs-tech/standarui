/**
 * The `Intl` half of the date family: every string a calendar or a segmented
 * field shows, plus the one piece of locale *data* they need — which day the week
 * starts on.
 *
 * Split from `plain-date` rather than folded into it because `date-field` needs
 * the formatter without the grid, and because the two have opposite costs: the
 * arithmetic is free and an `Intl.DateTimeFormat` is the allocation. Hence the
 * module-level cache, which holds no DOM and so cannot leak a document.
 *
 * **`calendar: "gregory"` and `numberingSystem: "latn"` are forced everywhere.**
 * Without them `th-TH` formats 2026 as 2569, `ja-JP-u-ca-japanese` in an imperial
 * era and `ar-EG` in Arabic-Indic digits, while `DateValue.year` stays Gregorian
 * — the display, and worse the segment order `formatToParts` reports, would
 * silently describe a different calendar than the one the machine is counting in.
 * Multi-calendar is out of scope for the v1.
 *
 * **`timeZone: "UTC"` is the default for the same reason `plain-date` builds its
 * dates that way**: the day formatted must be the day stored. `getToday` is the
 * one caller that overrides it, because reading a clock is exactly the operation
 * that has to name its zone.
 *
 * **No weekday table, ever.** The names come off seven known dates. A hand-typed
 * header once read `SUN MON WED THU FRI SAT SUN` — a transcription bug — and anyone transcribing those seven strings would ship a week with
 * no Tuesday.
 */

import { type DateValue, type FirstDayOfWeek, fromParts, toUTCDate } from "./plain-date";

/** The subset of `Intl.DateTimeFormatPart` a segment order is read from. */
export type DateFormatPart = Intl.DateTimeFormatPart;

/** `Intl.Locale.prototype.getWeekInfo` and its historical getter both return this. */
export interface WeekInfo {
  readonly firstDay?: number | undefined;
}

/**
 * The two spellings of week info an `Intl.Locale` may carry. Neither is in the
 * TypeScript lib — one is a normative addition, the other predates it — so the
 * shape is declared here rather than asserted at each call.
 */
export interface WeekInfoLocale {
  readonly getWeekInfo?: (() => WeekInfo) | undefined;
  readonly weekInfo?: WeekInfo | undefined;
}

export type WeekInfoResolver = (locale: string | undefined) => WeekInfoLocale | null;

export interface FirstDayOfWeekOptions {
  /** The last rung: what a runtime carrying neither spelling answers. ISO Monday. */
  readonly fallback?: FirstDayOfWeek | undefined;
  /**
   * Injected by the tests. The CI matrix runs current Chromium, Firefox and
   * WebKit, all three of which have `getWeekInfo`, so the two lower rungs cannot
   * be reached by asserting against an engine — the same arbitration the gamepad
   * loop made when it took an injected runtime instead of a real pad.
   */
  readonly resolve?: WeekInfoResolver | undefined;
}

/** Anything wider than this is a table of locale data, which is what we refuse. */
export type DateLabelWidth = "narrow" | "short" | "long";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** 7 January 2024 is a Sunday, which makes it index 0 of the Sunday-zero week. */
const REFERENCE_SUNDAY = Date.UTC(2024, 0, 7);
const DAY_MS = 86_400_000;

function defaultResolve(locale: string | undefined): WeekInfoLocale | null {
  try {
    return new Intl.Locale(
      locale ?? new Intl.DateTimeFormat().resolvedOptions().locale,
    ) as unknown as WeekInfoLocale;
  } catch {
    return null;
  }
}

export function getDateFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const resolved: Intl.DateTimeFormatOptions = {
    ...options,
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: options.timeZone ?? "UTC",
  };
  const key = `${locale ?? ""}|${JSON.stringify(resolved)}`;
  const cached = formatters.get(key);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat(locale, resolved);
  formatters.set(key, formatter);
  return formatter;
}

export function formatDate(
  value: DateValue,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return getDateFormatter(locale, options).format(toUTCDate(value));
}

/**
 * The only honest source of segment order. `en-US` is month/day/year, `de-DE` is
 * day.month.year and `ja-JP` is year/month/day, and the literals between them are
 * part of the answer — a table of patterns would be a fourth calendar to maintain.
 */
export function formatDateToParts(
  value: DateValue,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): DateFormatPart[] {
  return getDateFormatter(locale, options).formatToParts(toUTCDate(value));
}

/** Seven labels in display order, starting on `firstDayOfWeek`. */
export function getWeekdayLabels(
  locale: string | undefined,
  firstDayOfWeek: FirstDayOfWeek = 1,
  width: DateLabelWidth = "short",
): string[] {
  const formatter = getDateFormatter(locale, { weekday: width });
  const offset = firstDayOfWeek % 7;
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(REFERENCE_SUNDAY + ((offset + index) % 7) * DAY_MS),
  );
}

/** Twelve labels, January first — the order a month view lays them out in. */
export function getMonthLabels(
  locale: string | undefined,
  width: DateLabelWidth = "long",
): string[] {
  const formatter = getDateFormatter(locale, { month: width });
  return Array.from({ length: 12 }, (_, index) => formatter.format(Date.UTC(2024, index, 1)));
}

function readFirstDay(locale: WeekInfoLocale | null): number | null {
  if (locale === null) return null;
  const info = typeof locale.getWeekInfo === "function" ? locale.getWeekInfo() : locale.weekInfo;
  const firstDay = info?.firstDay;
  return typeof firstDay === "number" ? firstDay : null;
}

/**
 * Three rungs, in this order: the normative `getWeekInfo()`, the historical
 * `weekInfo` getter, then a fallback the consumer injects — Monday by default,
 * which is ISO-8601's answer.
 *
 * Deliberately **not** a region → first-day table. That blob is exactly what the
 * one-dependency rule invites and it rots; all three engines carry the API in
 * 2026, and the residue is covered by the `firstDayOfWeek` prop.
 */
export function resolveFirstDayOfWeek(
  locale: string | undefined,
  options: FirstDayOfWeekOptions = {},
): FirstDayOfWeek {
  const firstDay = readFirstDay((options.resolve ?? defaultResolve)(locale));
  if (firstDay !== null && firstDay >= 1 && firstDay <= 7) return firstDay as FirstDayOfWeek;
  return options.fallback ?? 1;
}

/**
 * The clock, read once and in a zone that is named rather than assumed.
 *
 * A server in UTC and a client in `Pacific/Auckland` are not on the same day, and
 * that is a real hydration divergence, not a theoretical one — which is why the
 * machines freeze this in a ref at init and reconcile on the first client
 * `ENVIRONMENT.SYNC` instead of marking a cell as today during the server render.
 */
export function getToday(timeZone?: string): DateValue {
  const parts = getDateFormatter(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).formatToParts(new Date());
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "");
  return fromParts(read("year"), read("month"), read("day"));
}
