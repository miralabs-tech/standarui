/**
 * The calendar without a document, which is most of it: the collection is
 * *computed*, so the month on screen, where an arrow lands, what a page change
 * costs and which cells can be reached are all arithmetic and belong here.
 *
 * What is deliberately not here is the focus. `focusCell` calls `.focus()` on an
 * element found by id, and a harness with no elements would prove that a null
 * lookup does nothing — which is true and worthless. It lives in
 * `calendar.browser.test.ts`, against a real engine.
 *
 * `service.start()` is called on purpose, unlike in most node harnesses: every
 * effect this machine installs already declines when `scope.getRootNode()` is
 * `null`, and without a start the events below would only queue.
 */

import { describe, expect, it, vi } from "vitest";
import type { EventHandler } from "../../machine/prop-types";
import { type DateValue, toISO } from "../../utils/plain-date";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./calendar.connect";
import { machine } from "./calendar.machine";
import { focusFromCell, getPageCells } from "./calendar.page";
import type { CalendarApi, CalendarMachineProps, CalendarSchema } from "./calendar.types";

type Api = CalendarApi<PlainPropTypes>;

const date = (year: number, month: number, day: number): DateValue => ({ year, month, day });

const APRIL = date(2026, 4, 15);

function build(props: CalendarMachineProps = {}) {
  const harness = connectWithoutDom<CalendarSchema, Api>({
    machine,
    connect,
    id: "c1",
    // Monday everywhere unless a test says otherwise: `resolveFirstDayOfWeek`
    // reads real ICU data, and a geometry assertion that depended on the
    // runtime's idea of `en-US` would be asserting ICU rather than the calendar.
    props: { defaultFocusedValue: APRIL, firstDayOfWeek: 1, ...props },
  });
  harness.service.start();
  return harness;
}

interface FakeKey {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly repeat?: boolean;
}

/**
 * A keyboard event with only the fields `connect` reads. There is no
 * `KeyboardEvent` in node, and building one would prove nothing extra: what is
 * under test is which keys are claimed and what they are turned into.
 */
function press(props: Record<string, unknown>, init: FakeKey, up = false): boolean {
  let prevented = false;
  const event = {
    key: init.key,
    shiftKey: init.shiftKey === true,
    ctrlKey: init.ctrlKey === true,
    metaKey: init.metaKey === true,
    altKey: init.altKey === true,
    repeat: init.repeat === true,
    defaultPrevented: false,
    preventDefault(): void {
      prevented = true;
    },
  } as unknown as KeyboardEvent;
  const handler = (up ? props.onKeyUp : props.onKeyDown) as EventHandler<KeyboardEvent>;
  handler(event);
  return prevented;
}

/** The prop getter of the cell holding the single tab stop. */
function focusedCell(api: Api): Record<string, unknown> {
  const cell = api.cells.find((candidate) => {
    const props = api.getCellProps({ value: candidate });
    return props.tabIndex === 0;
  });
  if (cell === undefined) throw new Error("the grid has no tab stop");
  return api.getCellProps({ value: cell });
}

describe("the page a calendar shows", () => {
  it("derives the month from the anchor, whole weeks and no holes", () => {
    const api = build().api();

    expect(api.columns).toBe(7);
    expect(api.rows).toBe(5);
    expect(api.cells).toHaveLength(35);
    expect(toISO(api.cells[0] as DateValue)).toBe("2026-03-30");
    expect(toISO(api.cells[34] as DateValue)).toBe("2026-05-03");
    expect(api.weeks).toHaveLength(5);
    expect(api.weeks[0]).toHaveLength(7);
  });

  it("fits February 2026 in four rows, and only under a Sunday start", () => {
    const sunday = build({ defaultFocusedValue: date(2026, 2, 10), firstDayOfWeek: 7 }).api();
    const monday = build({ defaultFocusedValue: date(2026, 2, 10), firstDayOfWeek: 1 }).api();
    const fixed = build({
      defaultFocusedValue: date(2026, 2, 10),
      firstDayOfWeek: 7,
      fixedWeeks: true,
    }).api();

    expect(sunday.rows).toBe(4);
    expect(monday.rows).toBe(5);
    expect(fixed.rows).toBe(6);
  });

  it("keeps seven columns whatever the week numbers say", () => {
    const bare = build().api();
    const numbered = build({ weekNumbers: true }).api();

    expect(bare.columns).toBe(7);
    expect(numbered.columns).toBe(7);
    expect(numbered.rows).toBe(5);
    // The row header is outside the navigation collection: an arrow can never
    // land on a cell that is not a date.
    expect(numbered.getWeekNumber(0)).toBe(14);
    expect(numbered.getWeekNumber(1)).toBe(15);
  });

  it("publishes the columns and rows the sheet cannot count", () => {
    const props = build().api().getGridProps();

    expect((props.style as Record<string, string>)["--sui-calendar-columns"]).toBe("7");
    expect((props.style as Record<string, string>)["--sui-calendar-rows"]).toBe("5");
  });

  it("marks the days that belong to the neighbouring months", () => {
    const api = build().api();

    expect(api.isOutsideMonth(date(2026, 3, 30))).toBe(true);
    expect(api.isOutsideMonth(date(2026, 4, 1))).toBe(false);
    expect(api.getCellProps({ value: date(2026, 3, 30) })["data-outside-month"]).toBe("");
    expect(api.getCellProps({ value: date(2026, 4, 1) })["data-outside-month"]).toBeUndefined();
  });
});

describe("the three views on one grid", () => {
  it("changes the columns, the cell count and what a value means", () => {
    const harness = build();

    expect(harness.api().getCellProps({ value: APRIL })["data-value"]).toBe("2026-04-15");

    harness.service.send({ type: "VIEW.SET", view: "month" });
    const months = harness.api();
    expect(months.columns).toBe(4);
    expect(months.cells).toHaveLength(12);
    expect(months.getCellProps({ value: date(2026, 4, 1) })["data-value"]).toBe("2026-04");

    harness.service.send({ type: "VIEW.SET", view: "year" });
    const years = harness.api();
    expect(years.columns).toBe(4);
    // A decade of ten over four columns, so the last row is ragged — which
    // `getGridNextIndex` handles, and which keeps a page meaning "ten years".
    expect(years.cells).toHaveLength(10);
    expect(years.rows).toBe(3);
    expect(toISO(years.cells[0] as DateValue)).toBe("2020-01-01");
    expect(years.getCellProps({ value: date(2026, 1, 1) })["data-value"]).toBe("2026");
  });

  it("drops the weekday names in the views that are four columns wide", () => {
    // Seven `<th scope="col">` over a body of four is a lie about the table, and
    // the audit of 2026-09-05 found it in the repository's own fixture: the list
    // is what a consumer maps, so it is the list that has to be empty.
    const harness = build();
    expect(harness.api().weekdays).toHaveLength(7);

    harness.service.send({ type: "VIEW.SET", view: "month" });
    expect(harness.api().weekdays).toEqual([]);

    harness.service.send({ type: "VIEW.SET", view: "year" });
    expect(harness.api().weekdays).toEqual([]);

    harness.service.send({ type: "VIEW.SET", view: "day" });
    expect(harness.api().weekdays).toHaveLength(7);
  });

  it("recomputes the tab stop from the anchor rather than carrying an index", () => {
    const harness = build();
    // Index 16 in the day view — well past the twelve a month view holds.
    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-15");

    harness.service.send({ type: "VIEW.SET", view: "month" });
    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04");

    harness.service.send({ type: "VIEW.SET", view: "year" });
    expect(focusedCell(harness.api())["data-value"]).toBe("2026");

    harness.service.send({ type: "VIEW.SET", view: "day" });
    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-15");
  });

  it("drills down on a click instead of choosing a value", () => {
    const onValueChange = vi.fn();
    const harness = build({ defaultView: "year", onValueChange });

    harness.service.send({ type: "CELL.CLICK", value: date(2024, 1, 1) });
    expect(harness.api().view).toBe("month");
    expect(toISO(harness.api().focusedValue)).toBe("2024-04-15");

    harness.service.send({ type: "CELL.CLICK", value: date(2024, 2, 1) });
    expect(harness.api().view).toBe("day");
    expect(toISO(harness.api().focusedValue)).toBe("2024-02-15");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("opens one step coarser and closes all the way back", () => {
    const harness = build();
    const trigger = (): void => harness.service.send({ type: "VIEW.TOGGLE" });

    expect(harness.api().getViewTriggerProps()["aria-expanded"]).toBe("false");
    trigger();
    expect(harness.api().view).toBe("month");
    expect(harness.api().getViewTriggerProps()["aria-expanded"]).toBe("true");
    trigger();
    expect(harness.api().view).toBe("day");
  });
});

describe("moving the focus", () => {
  const move = (harness: ReturnType<typeof build>, key: string, init: FakeKey = { key }): void => {
    press(focusedCell(harness.api()), { ...init, key });
  };

  it("walks the four directions in reading order", () => {
    const harness = build();

    move(harness, "ArrowRight");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-16");
    move(harness, "ArrowDown");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-23");
    move(harness, "ArrowLeft");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-22");
    move(harness, "ArrowUp");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
  });

  it("crosses the month boundary and takes the page with it", () => {
    const harness = build({ defaultFocusedValue: date(2026, 4, 1) });

    move(harness, "ArrowLeft");
    expect(toISO(harness.api().focusedValue)).toBe("2026-03-31");
    expect(harness.api().caption).toContain("March");
    // The anchor *is* the page, so nothing had to be paginated by hand.
    expect(toISO(harness.api().cells[0] as DateValue)).toBe("2026-02-23");
  });

  it("continues off the last cell of the grid, where the grid itself stops", () => {
    // The anchor *is* the page, so "the last cell of April's page" cannot be a day
    // in May — anchoring there renders May. Reaching `stepOffPage` needs a month
    // whose grid ends on its own last day, which means a last day that falls on the
    // last day of the week. May 2026 is one: the 31st is a Sunday, so the page is
    // five whole weeks with no spill at the end.
    //
    // The premise is asserted rather than trusted, and it earned that on the first
    // run: January 2026 was tried here and the grid ended on 1 February, because
    // the week starts on Monday. Anchored anywhere else the arrow is answered by
    // `getGridNextIndex` and `stepOffPage` is never reached — which is how this
    // test passed without exercising the branch it names.
    const harness = build({ defaultFocusedValue: date(2026, 5, 31) });
    const cells = harness.api().cells;
    expect(toISO(cells[cells.length - 1] as DateValue)).toBe("2026-05-31");

    move(harness, "ArrowRight");

    expect(toISO(harness.api().focusedValue)).toBe("2026-06-01");
  });

  it("mirrors left and right in RTL, and nothing else", () => {
    const harness = build({ dir: "rtl" });

    move(harness, "ArrowRight");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-14");
    move(harness, "ArrowDown");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-21");
  });

  it("bounds Home and End to the week, and Ctrl to the month", () => {
    const harness = build();

    move(harness, "Home");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-13");
    move(harness, "End");
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-19");

    // The month, not the grid: cell 0 of April's page is 30 March, and bounding
    // to it would page away from the month the key was meant to bound.
    press(focusedCell(harness.api()), { key: "Home", ctrlKey: true });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-01");
    press(focusedCell(harness.api()), { key: "End", ctrlKey: true });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-30");
    expect(harness.api().caption).toContain("April");
  });

  it("bounds Ctrl+Home and Ctrl+End to the page in the coarse views, not the month", () => {
    // The day view's guard (`view === "day" && …`) has a false arm that only the
    // month and year views exercise: there the key falls through to the generic
    // grid path instead of `startOfMonth`/`endOfMonth`, because the page there is
    // the year and the decade rather than a month with spill on either side.
    // Expected values come from `calendar.page`'s own helpers — the same ones
    // `moveFocus` calls on this branch — so the assertion tracks the production
    // formula rather than a copy of it.
    const monthHarness = build();
    monthHarness.service.send({ type: "VIEW.SET", view: "month" });
    const monthCells = getPageCells("month", APRIL);

    press(focusedCell(monthHarness.api()), { key: "Home", ctrlKey: true });
    expect(toISO(monthHarness.api().focusedValue)).toBe(
      toISO(focusFromCell("month", APRIL, monthCells[0] as DateValue)),
    );
    press(focusedCell(monthHarness.api()), { key: "End", ctrlKey: true });
    expect(toISO(monthHarness.api().focusedValue)).toBe(
      toISO(focusFromCell("month", APRIL, monthCells[monthCells.length - 1] as DateValue)),
    );

    const yearHarness = build();
    yearHarness.service.send({ type: "VIEW.SET", view: "year" });
    const yearCells = getPageCells("year", APRIL);

    press(focusedCell(yearHarness.api()), { key: "Home", ctrlKey: true });
    expect(toISO(yearHarness.api().focusedValue)).toBe(
      toISO(focusFromCell("year", APRIL, yearCells[0] as DateValue)),
    );
    press(focusedCell(yearHarness.api()), { key: "End", ctrlKey: true });
    expect(toISO(yearHarness.api().focusedValue)).toBe(
      toISO(focusFromCell("year", APRIL, yearCells[yearCells.length - 1] as DateValue)),
    );
  });

  it("leaves Ctrl+Arrow to the browser", () => {
    const harness = build();
    const claimed = press(focusedCell(harness.api()), { key: "ArrowRight", ctrlKey: true });

    expect(claimed).toBe(false);
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
  });

  it("pages by month, and by year under Shift", () => {
    const harness = build();

    expect(press(focusedCell(harness.api()), { key: "PageUp" })).toBe(true);
    expect(toISO(harness.api().focusedValue)).toBe("2026-03-15");
    press(focusedCell(harness.api()), { key: "PageDown" });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
    press(focusedCell(harness.api()), { key: "PageDown", shiftKey: true });
    expect(toISO(harness.api().focusedValue)).toBe("2027-04-15");
  });

  it("steps over an unavailable date rather than swallowing the key", () => {
    const harness = build({
      isDateUnavailable: (value) => value.day === 16 || value.day === 17,
    });

    press(focusedCell(harness.api()), { key: "ArrowRight" });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-18");
  });

  it("does not loop when every date in the page is unavailable", () => {
    // The whole grid disabled is what exercises `getGridNextIndex`'s anti-loop
    // set: it answers with the index it started from, and the arithmetic
    // fallback lands on a date that is unavailable too, so nothing moves.
    const harness = build({ isDateUnavailable: () => true });

    press(focusedCell(harness.api()), { key: "ArrowRight" });
    press(focusedCell(harness.api()), { key: "ArrowDown" });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
  });
});

describe("min and max", () => {
  it("clamps the anchor it is given", () => {
    const harness = build({
      defaultFocusedValue: date(2026, 1, 1),
      min: date(2026, 4, 10),
      max: date(2026, 4, 20),
    });

    expect(toISO(harness.api().focusedValue)).toBe("2026-04-10");
  });

  it("disables the header buttons at the bounds", () => {
    const harness = build({ min: date(2026, 4, 1), max: date(2026, 4, 30) });
    const api = harness.api();

    expect(api.canPagePrev).toBe(false);
    expect(api.canPageNext).toBe(false);
    expect(api.getPrevTriggerProps().disabled).toBe(true);
    expect(api.getNextTriggerProps()["data-disabled"]).toBe("");

    harness.service.send({ type: "PREV.CLICK" });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
  });

  it("marks a date outside the range disabled without disabling the calendar", () => {
    const api = build({ min: date(2026, 4, 10) }).api();

    expect(api.getCellProps({ value: date(2026, 4, 9) })["data-disabled"]).toBe("");
    expect(api.getCellProps({ value: date(2026, 4, 9) })["aria-disabled"]).toBe("true");
    expect(api.getCellProps({ value: date(2026, 4, 10) })["data-disabled"]).toBeUndefined();
    expect(api.getRootProps()["data-disabled"]).toBeUndefined();
  });

  it("keeps a whole month reachable while any day of it is in range", () => {
    const harness = build({ defaultView: "month", min: date(2026, 4, 20) });
    const api = harness.api();

    expect(api.getCellProps({ value: date(2026, 4, 1) })["data-disabled"]).toBeUndefined();
    expect(api.getCellProps({ value: date(2026, 3, 1) })["data-disabled"]).toBe("");
  });
});

describe("the single tab stop", () => {
  it("moves off an anchor nobody can choose, and settles the anchor with it", () => {
    // The `toggle-group` defect of 2026-08-27, on a grid: a composite whose only
    // `tabindex="0"` sits on a disabled cell has left the tab order.
    const harness = build({
      defaultFocusedValue: date(2026, 4, 1),
      isDateUnavailable: (value) => value.month === 4 && value.day < 10,
    });

    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-10");
    // And the arrows start from there rather than from the date they were given.
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-10");
  });

  it("prefers a day of the month on screen over one spilling in", () => {
    const harness = build({
      defaultFocusedValue: date(2026, 4, 1),
      // Everything except the two overflow days of March is declined.
      isDateUnavailable: (value) => value.month === 4 && value.day !== 20,
    });

    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-20");
  });

  it("never hands the stop to a day the sheet hides", () => {
    // `outsideDays: "hidden"` empties the spill-in cells with `visibility`, so a
    // stop on one of them is a stop nobody can see — the same defect as a stop on
    // a disabled cell, and the machine already counted it while `connect` did not
    // (audit of 2026-09-05). April is entirely declined here, which is what makes
    // the scan fall through to the days of March.
    const harness = build({
      outsideDays: "hidden",
      isDateUnavailable: (value) => value.month === 4,
    });

    expect(focusedCell(harness.api())["data-outside-month"]).toBeUndefined();
    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-15");
  });

  it("keeps the stop on the anchor when nothing at all is reachable", () => {
    // A grid with no stop would leave no way to reach the header and page out of
    // the month that declined everything.
    const harness = build({ isDateUnavailable: () => true });

    expect(focusedCell(harness.api())["data-value"]).toBe("2026-04-15");
    expect(focusedCell(harness.api())["aria-disabled"]).toBe("true");
  });
});

describe("choosing a date", () => {
  it("commits on a click, and reports it once", () => {
    const onValueChange = vi.fn();
    const harness = build({ onValueChange });

    harness.service.send({ type: "CELL.CLICK", value: date(2026, 4, 20) });

    expect(toISO(harness.api().value as DateValue)).toBe("2026-04-20");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(harness.api().getCellProps({ value: date(2026, 4, 20) })["aria-selected"]).toBe("true");
  });

  it("answers Enter on the way down and Space on the way up", () => {
    const harness = build();
    const cell = focusedCell(harness.api());

    expect(press(cell, { key: " " })).toBe(true);
    expect(harness.api().value).toBeNull();

    press(cell, { key: " " }, true);
    expect(toISO(harness.api().value as DateValue)).toBe("2026-04-15");
  });

  it("ignores an Enter that is only a key being held", () => {
    const harness = build();

    press(focusedCell(harness.api()), { key: "Enter", repeat: true });
    expect(harness.api().value).toBeNull();

    press(focusedCell(harness.api()), { key: "Enter" });
    expect(toISO(harness.api().value as DateValue)).toBe("2026-04-15");
  });

  it("declines the value under readOnly and still walks the month", () => {
    const harness = build({ readOnly: true });

    harness.service.send({ type: "CELL.CLICK", value: date(2026, 4, 20) });
    expect(harness.api().value).toBeNull();

    press(focusedCell(harness.api()), { key: "ArrowRight" });
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-16");
    expect(harness.api().getRootProps()["data-readonly"]).toBe("");
    expect(harness.api().getGridProps()["aria-readonly"]).toBe("true");
  });

  it("declines everything under disabled", () => {
    const harness = build({ disabled: true });

    harness.service.send({ type: "CELL.CLICK", value: date(2026, 4, 20) });
    press(focusedCell(harness.api()), { key: "ArrowRight" });

    expect(harness.api().value).toBeNull();
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-15");
    expect(harness.api().canPagePrev).toBe(false);
  });

  it("reports a controlled value without writing it", () => {
    const onValueChange = vi.fn();
    const harness = build({ value: null, onValueChange });

    harness.service.send({ type: "CELL.CLICK", value: date(2026, 4, 20) });

    expect(harness.api().value).toBeNull();
    expect(onValueChange).toHaveBeenCalledWith({ value: date(2026, 4, 20) });
  });

  it("does not report a value it was already holding", () => {
    const onValueChange = vi.fn();
    const harness = build({ defaultValue: date(2026, 4, 20), onValueChange });

    // A fresh object every time, structurally identical: without `isEqual` on
    // the bindable this would notify, and the adapter would repaint 35 cells.
    harness.service.send({ type: "CELL.CLICK", value: date(2026, 4, 20) });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("what a server renders", () => {
  it("connects with no document at all", () => {
    const harness = connectWithoutDom<CalendarSchema, Api>({
      machine,
      connect,
      id: "ssr",
      props: { defaultFocusedValue: APRIL, firstDayOfWeek: 1 },
    });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps()["data-part"]).toBe("calendar:root");
    expect(api.cells).toHaveLength(35);
  });

  it("marks no cell as today until a client has said which day it is", () => {
    const harness = build();

    expect(harness.api().today).toBeNull();
    for (const cell of harness.api().cells) {
      expect(harness.api().getCellProps({ value: cell })["data-today"]).toBeUndefined();
    }

    harness.service.send({ type: "ENVIRONMENT.SYNC", locale: "en-GB", dir: "ltr" });
    expect(harness.api().today).not.toBeNull();
  });

  it("takes an injected today and never reads a clock for it", () => {
    const api = build({ today: date(2026, 4, 9) }).api();

    expect(api.getCellProps({ value: date(2026, 4, 9) })["data-today"]).toBe("");
    expect(api.getCellProps({ value: date(2026, 4, 9) })["aria-current"]).toBe("date");
    expect(api.getCellProps({ value: date(2026, 4, 10) })["aria-current"]).toBeUndefined();
  });

  it("names the grid with a string rather than an IDREF it cannot prove", () => {
    const api = build().api();

    expect(api.getGridProps()["aria-label"]).toBe(api.caption);
    expect(api.getGridProps()["aria-labelledby"]).toBeUndefined();
    expect(build({ labelledBy: "outside" }).api().getGridProps()["aria-labelledby"]).toBe(
      "outside",
    );
  });
});

describe("locale", () => {
  it("rotates the weekday labels to the day the week starts on", () => {
    const monday = build({ locale: "fr-FR", firstDayOfWeek: 1 }).api();
    const sunday = build({ locale: "fr-FR", firstDayOfWeek: 7 }).api();

    // Never an equality on a translated string — ICU data diverges between
    // engines. What is asserted is the rotation, which is ours.
    expect(sunday.weekdays[1]).toEqual(monday.weekdays[0]);
    expect(sunday.weekdays[0]).toEqual(monday.weekdays[6]);
    expect(monday.weekdays).toHaveLength(7);
  });

  it("stays Gregorian where the locale is not", () => {
    const thai = build({ locale: "th-TH" }).api();

    // 2569 is the same year in the Buddhist calendar; the machine counts in
    // Gregorian, so the caption has to as well or the two describe different days.
    expect(thai.caption).toContain("2026");
    expect(thai.caption).not.toContain("2569");
  });

  it("carries the environment's locale when no prop names one", () => {
    const harness = build();
    harness.service.send({ type: "ENVIRONMENT.SYNC", locale: "de-DE", dir: "rtl" });

    expect(harness.api().locale).toBe("de-DE");
    // The prop still wins: an app that names a locale means it.
    expect(build({ locale: "en-GB" }).api().locale).toBe("en-GB");
  });
});
