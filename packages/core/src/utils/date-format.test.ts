/**
 * The `Intl` layer, asserted on its *shape* rather than on its strings.
 *
 * CLDR data moves between ICU versions and between engines, so a test that
 * compared a translated month name would be a test of whichever runtime happened
 * to run it. What is asserted here is what the module actually promises: that the
 * seven weekday labels are a rotation of one another, that the segment order
 * comes from the locale and not from a table, that a Buddhist or an imperial
 * calendar cannot leak into a Gregorian `DateValue`, and that the first-day-of-week
 * fallback has three rungs and takes them in order.
 *
 * The three rungs are exercised by **injection**, never by feature-detecting the
 * runtime: the CI matrix is current Chromium, Firefox and WebKit, all three of
 * which answer on the first rung, so an engine assertion could only ever prove
 * one third of the chain. (Node 22, which runs this file, happens to carry the
 * historical getter and not the normative method — which is why the default
 * resolver gets an assertion of its own below, and why it is not the one that
 * proves the chain.)
 */

import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateToParts,
  getDateFormatter,
  getMonthLabels,
  getToday,
  getWeekdayLabels,
  resolveFirstDayOfWeek,
  type WeekInfoResolver,
} from "./date-format";
import { addDays, compareDates, type DateValue, type FirstDayOfWeek } from "./plain-date";

const APRIL_FIRST: DateValue = { year: 2026, month: 4, day: 1 };
/** 7 January 2024, a Sunday — the same anchor `getWeekdayLabels` walks from. */
const SUNDAY: DateValue = { year: 2024, month: 1, day: 7 };

function types(parts: readonly Intl.DateTimeFormatPart[]): string[] {
  return parts.filter((part) => part.type !== "literal").map((part) => part.type);
}

describe("getDateFormatter", () => {
  it("hands back the same formatter for the same request", () => {
    // The formatter is the allocation this module exists to avoid repeating; the
    // arithmetic next door is free.
    expect(getDateFormatter("en-US", { month: "long" })).toBe(
      getDateFormatter("en-US", { month: "long" }),
    );
    expect(getDateFormatter("en-US", { month: "long" })).not.toBe(
      getDateFormatter("de-DE", { month: "long" }),
    );
    expect(getDateFormatter("en-US", { month: "long" })).not.toBe(
      getDateFormatter("en-US", { month: "short" }),
    );
  });

  it("forces UTC, and lets a caller that names a zone through", () => {
    const resolved = getDateFormatter("en-US", { day: "numeric" }).resolvedOptions();

    expect(resolved.timeZone).toBe("UTC");
    expect(resolved.calendar).toBe("gregory");
    expect(resolved.numberingSystem).toBe("latn");
    expect(
      getDateFormatter("en-US", { day: "numeric", timeZone: "Pacific/Auckland" }).resolvedOptions()
        .timeZone,
    ).toBe("Pacific/Auckland");
  });
});

describe("formatDate", () => {
  it("shows the day that was stored, whatever zone the process is in", () => {
    // The whole reason `timeZone: "UTC"` is not optional: a local formatter would
    // render 31 March for a value of 1 April anywhere west of Greenwich.
    expect(formatDate(APRIL_FIRST, "en-US", { day: "numeric" })).toBe("1");
    expect(formatDate(APRIL_FIRST, "en-US", { year: "numeric" })).toBe("2026");
  });

  it("stays Gregorian in a locale whose default calendar is not", () => {
    // th-TH counts Buddhist years — 2569 for our 2026 — and `DateValue.year`
    // would go on saying 2026 while the caption said otherwise.
    const thai = formatDate(APRIL_FIRST, "th-TH", { year: "numeric" });
    expect(thai).toContain("2026");
    expect(thai).not.toContain("2569");

    // An explicit calendar in the tag loses to the option, which is the point.
    expect(formatDate(APRIL_FIRST, "ja-JP-u-ca-japanese", { year: "numeric" })).toContain("2026");
  });

  it("stays in Latin digits in a locale whose default numbering is not", () => {
    const arabic = formatDate(APRIL_FIRST, "ar-EG", { year: "numeric" });

    expect(arabic).toContain("2026");
    expect(arabic).not.toContain("٢٠٢٦");
  });
});

describe("formatDateToParts — the segment order", () => {
  it("reads the order off the locale rather than a table of patterns", () => {
    const numeric: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    };

    expect(types(formatDateToParts(APRIL_FIRST, "en-US", numeric))).toEqual([
      "month",
      "day",
      "year",
    ]);
    expect(types(formatDateToParts(APRIL_FIRST, "de-DE", numeric))).toEqual([
      "day",
      "month",
      "year",
    ]);
    expect(types(formatDateToParts(APRIL_FIRST, "ja-JP", numeric))).toEqual([
      "year",
      "month",
      "day",
    ]);
  });

  it("keeps the literals between the segments, because they are rendered too", () => {
    const parts = formatDateToParts(APRIL_FIRST, "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    expect(parts.filter((part) => part.type === "literal")).toHaveLength(2);
    expect(parts.map((part) => part.value).join("")).toBe(
      formatDate(APRIL_FIRST, "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }),
    );
  });

  it("does not smuggle an era into the order of a Gregorian date", () => {
    // A non-Gregorian default would add one, and a field would grow a segment
    // nobody asked for.
    for (const locale of ["th-TH", "ja-JP-u-ca-japanese", "ar-SA-u-ca-islamic"]) {
      expect(
        types(formatDateToParts(APRIL_FIRST, locale, { year: "numeric", month: "2-digit" })),
      ).not.toContain("era");
    }
  });
});

describe("getWeekdayLabels", () => {
  it("rotates the same seven names to whichever day the week starts on", () => {
    const sundayFirst = getWeekdayLabels("en-US", 7, "long");

    expect(sundayFirst).toHaveLength(7);
    expect(sundayFirst[0]).toBe(formatDate(SUNDAY, "en-US", { weekday: "long" }));
    expect(new Set(sundayFirst).size).toBe(7);

    // Monday-first is the same list rotated by one; Saturday-first by six. No
    // string is compared to a translation — only to itself, moved.
    expect(getWeekdayLabels("en-US", 1, "long")).toEqual([
      ...sundayFirst.slice(1),
      ...sundayFirst.slice(0, 1),
    ]);
    expect(getWeekdayLabels("en-US", 6, "long")).toEqual([
      ...sundayFirst.slice(6),
      ...sundayFirst.slice(0, 6),
    ]);
  });

  it("walks the real week, day by day, for every start", () => {
    const firsts: readonly FirstDayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

    for (const first of firsts) {
      const labels = getWeekdayLabels("en-US", first, "long");
      // ISO `first` counts Monday as 1, so `% 7` lands it on the Sunday-zero
      // anchor the module walks from.
      let cursor = addDays(SUNDAY, first % 7);
      for (const label of labels) {
        expect(label).toBe(formatDate(cursor, "en-US", { weekday: "long" }));
        cursor = addDays(cursor, 1);
      }
    }
  });

  it("defaults to Monday and to the short width", () => {
    expect(getWeekdayLabels("en-US")).toEqual(getWeekdayLabels("en-US", 1, "short"));
    expect(getWeekdayLabels("en-US", 7, "narrow").every((label) => label.length > 0)).toBe(true);
  });
});

describe("getMonthLabels", () => {
  it("gives twelve names, January first", () => {
    const months = getMonthLabels("en-US");

    expect(months).toHaveLength(12);
    expect(new Set(months).size).toBe(12);
    expect(months[0]).toBe(
      formatDate({ year: 2024, month: 1, day: 1 }, "en-US", { month: "long" }),
    );
    expect(months[11]).toBe(
      formatDate({ year: 2024, month: 12, day: 1 }, "en-US", { month: "long" }),
    );
  });

  it("is Gregorian even where the locale is not", () => {
    expect(getMonthLabels("th-TH")).toHaveLength(12);
    expect(getMonthLabels("ja-JP-u-ca-japanese", "short")).toHaveLength(12);
  });
});

describe("resolveFirstDayOfWeek — the three rungs", () => {
  const normative: WeekInfoResolver = () => ({ getWeekInfo: () => ({ firstDay: 7 }) });
  const legacy: WeekInfoResolver = () => ({ weekInfo: { firstDay: 6 } });
  const both: WeekInfoResolver = () => ({
    getWeekInfo: () => ({ firstDay: 7 }),
    weekInfo: { firstDay: 6 },
  });
  const neither: WeekInfoResolver = () => ({});
  const absent: WeekInfoResolver = () => null;

  it("takes the normative method first", () => {
    expect(resolveFirstDayOfWeek("en-US", { resolve: normative })).toBe(7);
    expect(resolveFirstDayOfWeek("en-US", { resolve: both })).toBe(7);
  });

  it("falls to the historical getter when the method is gone", () => {
    expect(resolveFirstDayOfWeek("ar-EG", { resolve: legacy })).toBe(6);
  });

  it("falls to Monday when neither spelling is there", () => {
    expect(resolveFirstDayOfWeek("en-US", { resolve: neither })).toBe(1);
    expect(resolveFirstDayOfWeek("en-US", { resolve: absent })).toBe(1);
  });

  it("takes the consumer's fallback on that last rung, and only there", () => {
    expect(resolveFirstDayOfWeek("en-US", { resolve: neither, fallback: 7 })).toBe(7);
    expect(resolveFirstDayOfWeek("en-US", { resolve: absent, fallback: 6 })).toBe(6);
    expect(resolveFirstDayOfWeek("en-US", { resolve: normative, fallback: 6 })).toBe(7);
  });

  it("refuses a firstDay that is not an ISO weekday", () => {
    const rubbish: readonly unknown[] = [0, 8, -1, Number.NaN, "1", null, undefined];

    for (const firstDay of rubbish) {
      const resolve: WeekInfoResolver = () => ({ weekInfo: { firstDay } as { firstDay?: number } });
      expect(resolveFirstDayOfWeek("en-US", { resolve, fallback: 3 })).toBe(3);
    }
  });

  it("reads real locale data through the default resolver", () => {
    // Data, not a promise: this asserts the plumbing reaches CLDR at all, and
    // node 22 reaches it through the historical getter — the second rung. The
    // engines in CI reach it through the first.
    expect(resolveFirstDayOfWeek("fr-FR")).toBe(1);
    expect(resolveFirstDayOfWeek("en-US")).toBe(7);
    expect(resolveFirstDayOfWeek("ar-EG")).toBe(6);
  });

  it("answers rather than throwing on a tag no runtime accepts", () => {
    expect(resolveFirstDayOfWeek("not a locale!!")).toBe(1);
    expect(resolveFirstDayOfWeek("not a locale!!", { fallback: 7 })).toBe(7);
  });
});

describe("getToday", () => {
  it("reads the clock in the zone it was given", () => {
    const now = new Date();

    expect(getToday("UTC")).toEqual({
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    });
  });

  it("is a different day at the two ends of the date line", () => {
    // Kiritimati is UTC+14 and Midway UTC−11: twenty-five hours apart, so the
    // first is never behind the second. This is the hydration divergence the
    // machines freeze a `today` ref to avoid.
    //
    // **At most TWO calendar days ahead, not one**, and the difference is a whole
    // hour of every day rather than an edge case. Twenty-five hours spans two
    // midnights, so between 10:00 and 11:00 UTC Kiritimati has already crossed
    // into the day after tomorrow while Midway has not yet reached yesterday's
    // end: measured across the 24 UTC hours of 2026-09-10, the gap is one day for
    // twenty-three of them and two days for the hour at 10:30. This assertion said
    // `1` and was therefore wrong for 4 % of the clock — it failed on a CI run that
    // happened to land in that hour, having passed every run that did not.
    const ahead = getToday("Pacific/Kiritimati");
    const behind = getToday("Pacific/Midway");

    expect(compareDates(ahead, behind)).toBeGreaterThanOrEqual(0);
    expect(compareDates(ahead, addDays(behind, 2))).toBeLessThanOrEqual(0);
  });

  it("falls back to the runtime zone when none is named", () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(getToday()).toEqual(getToday(zone));
  });
});
