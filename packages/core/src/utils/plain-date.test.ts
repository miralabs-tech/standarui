/**
 * The date arithmetic, without a calendar.
 *
 * Three of the assertions below are traps rather than features, and each one has
 * shipped in somebody's date picker: the two-digit-year shim that turns the year
 * 50 into 1950, the end-of-month clamp that turns 31 January into 3 March, and
 * the century rule that makes 1900 an ordinary year and 2000 a leap one. A
 * browser test can show a wrong day on screen; only this file can say which of
 * the three put it there.
 */

import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  clampDate,
  compareDates,
  type DateValue,
  daysInMonth,
  endOfMonth,
  type FirstDayOfWeek,
  fromISO,
  fromParts,
  fromUTCDate,
  getDayOfWeek,
  getMonthGrid,
  getWeekdayIndex,
  getWeekNumber,
  isLeapYear,
  MAX_DATE_YEAR,
  MIN_DATE_YEAR,
  startOfMonth,
  toISO,
  toUTCDate,
} from "./plain-date";

const FIRST_DAYS: readonly FirstDayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

function date(year: number, month: number, day: number): DateValue {
  return { year, month, day };
}

describe("daysInMonth / isLeapYear", () => {
  it("counts the twelve months of an ordinary year", () => {
    const lengths = Array.from({ length: 12 }, (_, index) => daysInMonth(2026, index + 1));

    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it("applies the century rule, which is the half everyone forgets", () => {
    // Divisible by four is not enough and divisible by a hundred is not
    // disqualifying: 1900 is ordinary, 2000 is leap, 2100 is ordinary again.
    expect([2024, 2026, 1900, 2000, 2100].map((year) => isLeapYear(year))).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    expect([2024, 2026, 1900, 2000, 2100].map((year) => daysInMonth(year, 2))).toEqual([
      29, 28, 28, 29, 28,
    ]);
  });

  it("keeps the other eleven months the same length in a leap year", () => {
    for (let month = 1; month <= 12; month++) {
      if (month === 2) continue;
      expect(daysInMonth(2024, month)).toBe(daysInMonth(2026, month));
    }
  });

  it("clamps a month outside 1…12 rather than reading past the table", () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 13)).toBe(31);
  });
});

describe("fromParts — the props boundary", () => {
  it("clamps the year to the four-digit domain", () => {
    // The same two numbers a year `spinbutton` declares as its bounds, which is
    // why they are exported rather than written twice.
    expect([MIN_DATE_YEAR, MAX_DATE_YEAR]).toEqual([1, 9999]);
    expect(fromParts(0, 1, 1).year).toBe(MIN_DATE_YEAR);
    expect(fromParts(-1, 1, 1).year).toBe(MIN_DATE_YEAR);
    expect(fromParts(10000, 1, 1).year).toBe(MAX_DATE_YEAR);
    expect(fromParts(9999, 12, 31)).toEqual(date(9999, 12, 31));
  });

  it("keeps a two-digit year as itself, never as 19xx", () => {
    // `Date.UTC(50, 2, 1)` is 1950. Nothing in this module may go through it.
    expect(fromParts(50, 3, 1)).toEqual(date(50, 3, 1));
    expect(toUTCDate(date(50, 3, 1)).getUTCFullYear()).toBe(50);
    expect(addDays(date(50, 3, 1), 1)).toEqual(date(50, 3, 2));
    expect(toISO(date(50, 3, 1))).toBe("0050-03-01");
  });

  it("clamps the month and the day into the month it landed in", () => {
    expect(fromParts(2026, 0, 15).month).toBe(1);
    expect(fromParts(2026, 13, 15).month).toBe(12);
    expect(fromParts(2026, 2, 31)).toEqual(date(2026, 2, 28));
    expect(fromParts(2024, 2, 31)).toEqual(date(2024, 2, 29));
    expect(fromParts(2026, 4, 0)).toEqual(date(2026, 4, 1));
  });

  it("answers the floor of the domain rather than NaN", () => {
    expect(fromParts(Number.NaN, Number.NaN, Number.NaN)).toEqual(date(1, 1, 1));
    expect(fromParts(2026.9, 4.9, 3.9)).toEqual(date(2026, 4, 3));
  });
});

describe("addDays / addMonths / addYears", () => {
  it("walks across a month and a year boundary", () => {
    expect(addDays(date(2026, 1, 31), 1)).toEqual(date(2026, 2, 1));
    expect(addDays(date(2026, 12, 31), 1)).toEqual(date(2027, 1, 1));
    expect(addDays(date(2026, 1, 1), -1)).toEqual(date(2025, 12, 31));
    expect(addDays(date(2024, 2, 28), 1)).toEqual(date(2024, 2, 29));
    expect(addDays(date(2026, 2, 28), 1)).toEqual(date(2026, 3, 1));
    expect(addDays(date(2026, 4, 15), 0)).toEqual(date(2026, 4, 15));
  });

  it("clamps to the end of the month it lands in, never overflowing into the next", () => {
    expect(addMonths(date(2026, 1, 31), 1)).toEqual(date(2026, 2, 28));
    expect(addMonths(date(2024, 1, 31), 1)).toEqual(date(2024, 2, 29));
    expect(addMonths(date(2026, 3, 31), -1)).toEqual(date(2026, 2, 28));
    expect(addMonths(date(2026, 5, 31), 1)).toEqual(date(2026, 6, 30));
  });

  it("carries the year in both directions", () => {
    expect(addMonths(date(2026, 12, 15), 1)).toEqual(date(2027, 1, 15));
    expect(addMonths(date(2026, 1, 15), -1)).toEqual(date(2025, 12, 15));
    expect(addMonths(date(2026, 4, 15), 25)).toEqual(date(2028, 5, 15));
    expect(addMonths(date(2026, 4, 15), -25)).toEqual(date(2024, 3, 15));
    expect(addMonths(date(2026, 4, 15), 0)).toEqual(date(2026, 4, 15));
  });

  it("takes 29 February to the 28th a year later, through the same clamp", () => {
    expect(addYears(date(2024, 2, 29), 1)).toEqual(date(2025, 2, 28));
    expect(addYears(date(2024, 2, 29), 4)).toEqual(date(2028, 2, 29));
    expect(addYears(date(2026, 4, 15), -1)).toEqual(date(2025, 4, 15));
  });

  it("answers faithfully outside the domain instead of clamping mid-walk", () => {
    // Arithmetic that clamped would make a month grid repeat a cell rather than
    // overflow. The bounds belong to `fromParts` and `fromISO`, which is where a
    // prop and a form field come in.
    expect(addDays(date(1, 1, 1), -1)).toEqual(date(0, 12, 31));
    expect(addMonths(date(9999, 12, 1), 1)).toEqual(date(10000, 1, 1));
  });
});

describe("compareDates / clampDate", () => {
  it("orders on the ordinal, sign only", () => {
    expect(compareDates(date(2026, 4, 1), date(2026, 4, 2))).toBeLessThan(0);
    expect(compareDates(date(2026, 5, 1), date(2026, 4, 30))).toBeGreaterThan(0);
    expect(compareDates(date(2027, 1, 1), date(2026, 12, 31))).toBeGreaterThan(0);
    expect(compareDates(date(2026, 4, 1), date(2026, 4, 1))).toBe(0);
  });

  it("sorts a shuffled month", () => {
    const shuffled = [date(2026, 4, 10), date(2026, 3, 31), date(2026, 4, 2), date(2025, 12, 1)];

    expect([...shuffled].sort(compareDates)).toEqual([
      date(2025, 12, 1),
      date(2026, 3, 31),
      date(2026, 4, 2),
      date(2026, 4, 10),
    ]);
  });

  it("returns the bound itself, and the value when it is inside", () => {
    const min = date(2026, 4, 1);
    const max = date(2026, 4, 30);

    expect(clampDate(date(2026, 3, 15), min, max)).toBe(min);
    expect(clampDate(date(2026, 5, 15), min, max)).toBe(max);
    expect(clampDate(date(2026, 4, 15), min, max)).toEqual(date(2026, 4, 15));
    expect(clampDate(date(2026, 3, 15), null, max)).toEqual(date(2026, 3, 15));
    expect(clampDate(date(2026, 5, 15), min)).toEqual(date(2026, 5, 15));
    expect(clampDate(date(2026, 5, 15))).toEqual(date(2026, 5, 15));
  });
});

describe("month edges and weekdays", () => {
  it("finds the first and last day of the month", () => {
    expect(startOfMonth(date(2026, 4, 17))).toEqual(date(2026, 4, 1));
    expect(endOfMonth(date(2026, 4, 17))).toEqual(date(2026, 4, 30));
    expect(endOfMonth(date(2026, 2, 17))).toEqual(date(2026, 2, 28));
    expect(endOfMonth(date(2024, 2, 17))).toEqual(date(2024, 2, 29));
  });

  it("numbers the weekday from Sunday, the way getUTCDay does", () => {
    expect(getDayOfWeek(date(2024, 1, 7))).toBe(0);
    expect(getDayOfWeek(date(2024, 1, 1))).toBe(1);
    expect(getDayOfWeek(date(2026, 1, 1))).toBe(4);
    expect(getDayOfWeek(date(2026, 2, 1))).toBe(0);
    expect(getDayOfWeek(date(2000, 2, 29))).toBe(2);
  });

  it("places a date in its column for all seven starts of week", () => {
    // 1 February 2026 is a Sunday: column 6 when the week starts on Monday,
    // column 0 when it starts on Sunday, and one step back for each start
    // between the two.
    const sunday = date(2026, 2, 1);

    expect(FIRST_DAYS.map((first) => getWeekdayIndex(sunday, first))).toEqual([
      6, 5, 4, 3, 2, 1, 0,
    ]);
    expect(getWeekdayIndex(sunday)).toBe(6);
  });
});

describe("getMonthGrid", () => {
  function rows(grid: readonly DateValue[]): number {
    return grid.length / 7;
  }

  it("keeps the month whole and the weeks whole", () => {
    for (const first of FIRST_DAYS) {
      for (let month = 1; month <= 12; month++) {
        const grid = getMonthGrid(2026, month, { firstDayOfWeek: first });

        expect(grid.length % 7).toBe(0);
        expect(getWeekdayIndex(grid[0] as DateValue, first)).toBe(0);
        expect(grid.filter((cell) => cell.month === month)).toHaveLength(daysInMonth(2026, month));
      }
    }
  });

  it("is a run of consecutive days, overflow included", () => {
    const grid = getMonthGrid(2026, 3, { firstDayOfWeek: 1 });

    for (let index = 1; index < grid.length; index++) {
      expect(grid[index]).toEqual(addDays(grid[index - 1] as DateValue, 1));
    }
    // March 2026 starts on a Sunday, so a Monday-first grid opens on 23 February
    // and the last row runs into April — real dates, not holes.
    expect(grid[0]).toEqual(date(2026, 2, 23));
    expect(grid.at(-1)).toEqual(date(2026, 4, 5));
  });

  it("fits February 2026 in four rows, and only under a Sunday start", () => {
    // 28 days beginning on a Sunday is exactly four weeks — the shortest month a
    // Gregorian calendar can produce, and the row count the surface must not
    // assume away.
    expect(rows(getMonthGrid(2026, 2, { firstDayOfWeek: 7 }))).toBe(4);
    expect(rows(getMonthGrid(2026, 2, { firstDayOfWeek: 1 }))).toBe(5);
  });

  it("needs six rows when a 31-day month starts late in the week", () => {
    // 1 August 2026 is a Saturday: five days of lead plus 31 spills into a sixth
    // row. A calendar grid draws six.
    expect(rows(getMonthGrid(2026, 8, { firstDayOfWeek: 1 }))).toBe(6);
    expect(rows(getMonthGrid(2026, 8, { firstDayOfWeek: 7 }))).toBe(6);
  });

  it("pads to six rows under fixedWeeks, whatever the month", () => {
    for (const first of FIRST_DAYS) {
      expect(rows(getMonthGrid(2026, 2, { firstDayOfWeek: first, fixedWeeks: true }))).toBe(6);
      expect(rows(getMonthGrid(2026, 8, { firstDayOfWeek: first, fixedWeeks: true }))).toBe(6);
    }
    expect(getMonthGrid(2026, 2, { fixedWeeks: true })).toHaveLength(42);
  });

  it("defaults to a Monday start and clamps an out-of-range month", () => {
    expect(getMonthGrid(2026, 2)).toEqual(getMonthGrid(2026, 2, { firstDayOfWeek: 1 }));
    expect(getMonthGrid(2026, 13)).toEqual(getMonthGrid(2026, 12));
  });

  it("counts a leap February as 29 cells of its own month", () => {
    const grid = getMonthGrid(2024, 2, { firstDayOfWeek: 1 });

    expect(grid.filter((cell) => cell.month === 2)).toHaveLength(29);
    expect(grid).toContainEqual(date(2024, 2, 29));
  });
});

describe("toISO / fromISO", () => {
  it("round-trips, padded to four and two digits", () => {
    expect(toISO(date(2026, 4, 1))).toBe("2026-04-01");
    expect(toISO(date(9999, 12, 31))).toBe("9999-12-31");
    expect(toISO(date(1, 1, 1))).toBe("0001-01-01");
    expect(fromISO(toISO(date(2026, 4, 1)))).toEqual(date(2026, 4, 1));
  });

  it("accepts only the four-digit form", () => {
    expect(fromISO("2026-04-01")).toEqual(date(2026, 4, 1));
    expect(fromISO("2026-4-1")).toBeNull();
    expect(fromISO("+010000-01-01")).toBeNull();
    expect(fromISO("2026-04-01T00:00:00Z")).toBeNull();
    expect(fromISO(" 2026-04-01")).toBeNull();
    expect(fromISO("")).toBeNull();
    expect(fromISO(null)).toBeNull();
    expect(fromISO(undefined)).toBeNull();
  });

  it("refuses a date outside the domain rather than clamping it", () => {
    // A form that carries `2026-02-30` is a bug in the consumer; inventing the
    // 28th for them would hide it.
    expect(fromISO("0000-01-01")).toBeNull();
    expect(fromISO("2026-00-01")).toBeNull();
    expect(fromISO("2026-13-01")).toBeNull();
    expect(fromISO("2026-04-00")).toBeNull();
    expect(fromISO("2026-02-30")).toBeNull();
    expect(fromISO("2026-02-29")).toBeNull();
    expect(fromISO("2024-02-29")).toEqual(date(2024, 2, 29));
    expect(fromISO("2026-04-31")).toBeNull();
  });
});

describe("getWeekNumber", () => {
  it("numbers a week by the year its Thursday is in", () => {
    // 2026 opens on a Thursday, so 1 January is already week 1 and the three
    // days before it belong to week 53 of 2025 rather than to week 1 of 2026.
    expect(getWeekNumber(date(2025, 12, 29))).toBe(1);
    expect(getWeekNumber(date(2026, 1, 1))).toBe(1);
    expect(getWeekNumber(date(2026, 1, 4))).toBe(1);
    expect(getWeekNumber(date(2026, 1, 5))).toBe(2);
  });

  it("gives the same number to every day of one ISO week", () => {
    const monday = date(2026, 4, 13);
    const numbers = Array.from({ length: 7 }, (_, index) => getWeekNumber(addDays(monday, index)));

    expect(new Set(numbers).size).toBe(1);
    expect(getWeekNumber(addDays(monday, 7))).toBe((numbers[0] ?? 0) + 1);
  });

  it("reports 53 for the long years and 52 for the rest", () => {
    // 2020 started on a Wednesday and 2026 on a Thursday: both are 53-week years,
    // and 2025 — a Wednesday start in a non-leap year — is not.
    expect(getWeekNumber(date(2020, 12, 31))).toBe(53);
    expect(getWeekNumber(date(2026, 12, 31))).toBe(53);
    expect(getWeekNumber(date(2025, 12, 28))).toBe(52);
  });

  it("ignores the day the grid happens to start on", () => {
    // The number is ISO's, not the locale's: a Sunday-first grid draws the same
    // week in a different order and still calls it the same week.
    expect(getWeekNumber(date(2026, 4, 12))).toBe(15);
    expect(getWeekNumber(date(2026, 4, 13))).toBe(16);
  });
});

describe("the UTC bridge", () => {
  it("builds midnight UTC and reads it back unchanged", () => {
    const value = date(2026, 4, 1);
    const utc = toUTCDate(value);

    expect(utc.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(fromUTCDate(utc)).toEqual(value);
  });

  it("never lets a local zone move the day", () => {
    // The reason no local `Date` appears anywhere above: a zone that skips an
    // hour that night would answer with the day before or after.
    for (const value of [date(2026, 3, 29), date(2026, 10, 25), date(2026, 11, 1)]) {
      expect(fromUTCDate(toUTCDate(value))).toEqual(value);
      expect(toUTCDate(value).getUTCHours()).toBe(0);
    }
  });
});
