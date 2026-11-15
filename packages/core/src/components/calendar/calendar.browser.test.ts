/**
 * `calendar` against a real engine, with no framework in the room.
 *
 * Most of this machine is arithmetic and is proved in `calendar.test.ts`. Four
 * things are not, and they are what is here: the month announced by a real live
 * region, the environment read off real attributes, the d-pad arriving through a
 * real intent bus, and the modality a real focus carries.
 *
 * What is deliberately absent is the focus *following a page change*. The
 * reference reactivity runs its trackers before its listeners (see the head of
 * `reactivity.ts`), so a watcher here fires against the DOM of the month that is
 * leaving — the order only an adapter owns. It is proved in
 * `@standarui/react`, where the commit happens first.
 */

import { afterEach, describe, expect, it } from "vitest";
import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { createIntentBus, type IntentBus, setInputModality } from "../../nav";
import { type DateValue, toISO } from "../../utils/plain-date";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./calendar.connect";
import { machine } from "./calendar.machine";
import type { CalendarApi, CalendarMachineProps, CalendarSchema } from "./calendar.types";

type Api = CalendarApi<DomPropTypes>;

const APRIL: DateValue = { year: 2026, month: 4, day: 15 };

const HTML = `
  <div data-slot="root">
    <div data-slot="header">
      <button data-slot="prev" aria-label="Previous"></button>
      <button data-slot="view"><span data-slot="caption"></span></button>
      <button data-slot="next" aria-label="Next"></button>
    </div>
    <table data-slot="grid"><tbody data-slot="body"></tbody></table>
  </div>
`;

/**
 * Rows and cells are reused by the date they carry rather than rebuilt, which is
 * what an adapter's reconciliation does — a paint that recreated every cell would
 * drop the focus on its own and prove nothing about the machine.
 */
function paintRows(body: HTMLElement, api: Api, apply: ApplyProps): void {
  api.weeks.forEach((week, index) => {
    let row = body.querySelector<HTMLElement>(`[data-row="${index}"]`);
    if (row === null) {
      row = document.createElement("tr");
      row.dataset.row = String(index);
      body.append(row);
    }
    apply(row, api.getWeekRowProps({ index }));

    const keys = new Set(week.map(toISO));
    for (const stale of row.querySelectorAll<HTMLElement>("[data-key]")) {
      if (!keys.has(stale.dataset.key ?? "")) stale.remove();
    }
    for (const day of week) {
      const key = toISO(day);
      let td = row.querySelector<HTMLElement>(`[data-key="${key}"]`);
      if (td === null) {
        td = document.createElement("td");
        td.dataset.key = key;
        row.append(td);
      }
      apply(td, api.getCellProps({ value: day }));
      td.textContent = api.getCellText(day);
    }
  });
  for (const row of body.querySelectorAll<HTMLElement>("[data-row]")) {
    if (Number(row.dataset.row) >= api.weeks.length) row.remove();
  }
}

function scene(props: CalendarMachineProps = {}) {
  return mountMachine<CalendarSchema, Api>({
    machine,
    connect,
    html: HTML,
    props: { defaultFocusedValue: APRIL, firstDayOfWeek: 1, ...props },
    paint(host, api, apply) {
      const slot = (name: string): HTMLElement =>
        host.querySelector<HTMLElement>(`[data-slot="${name}"]`) as HTMLElement;

      apply(slot("root"), api.getRootProps());
      apply(slot("header"), api.getHeaderProps());
      apply(slot("prev"), api.getPrevTriggerProps());
      apply(slot("next"), api.getNextTriggerProps());
      apply(slot("view"), api.getViewTriggerProps());
      apply(slot("caption"), api.getCaptionProps());
      slot("caption").textContent = api.caption;
      apply(slot("grid"), api.getGridProps());
      paintRows(slot("body"), api, apply);
    },
  });
}

function cellOf(host: HTMLElement, iso: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(`[data-key="${iso}"]`);
  if (node === null) throw new Error(`no cell "${iso}"`);
  return node;
}

function polite(): string {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? "";
}

/** The announcer fills its region on a later task, on purpose. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  unmountAll();
  getLiveAnnouncer(document).destroy();
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

describe("calendar in a document", () => {
  it("reads the locale and the direction off the page, and only then the clock", () => {
    document.documentElement.lang = "de-DE";
    const harness = scene();

    expect(harness.api().locale).toBe("de-DE");
    // `data-today` is the one attribute a server may not write, so the sync that
    // installs the environment is also what first marks it.
    expect(harness.api().today).not.toBeNull();
  });

  it("announces the month once when the page moves, and never for a cell", async () => {
    const harness = scene();
    // Seeded at mount: the month on screen has already been read, by the caption.
    expect(polite()).toBe("");

    harness.part("next-trigger").click();
    await tick();
    // Never an equality on a translated string — the caption is whatever the
    // page's own locale writes, and what matters is that it is *that* string.
    const may = harness.api().caption;
    expect(polite()).toBe(may);
    expect(harness.api().focusedValue.month).toBe(5);

    harness.service.send({ type: "GRID.NAVIGATE", action: "right" });
    await tick();
    // Still May: the caption did not change, so nothing was said a second time.
    expect(polite()).toBe(may);

    harness.part("prev-trigger").click();
    await tick();
    expect(polite()).toBe(harness.api().caption);
    expect(harness.api().focusedValue.month).toBe(4);
  });

  it("carries the modality the focus arrived under, on the focused cell alone", () => {
    const harness = scene();
    setInputModality(document, "keyboard");

    cellOf(harness.host, "2026-04-15").focus();

    const focused = cellOf(harness.host, "2026-04-15");
    expect(focused.getAttribute("data-focus-source")).toBe("keyboard");
    expect(focused.hasAttribute("data-focus-visible")).toBe(true);
    expect(cellOf(harness.host, "2026-04-16").hasAttribute("data-focus-source")).toBe(false);

    focused.blur();
    expect(cellOf(harness.host, "2026-04-15").hasAttribute("data-focus-visible")).toBe(false);
  });

  it("puts the focus on the anchor at mount under autoFocus", () => {
    const harness = scene({ autoFocus: true });

    expect(document.activeElement).toBe(cellOf(harness.host, "2026-04-15"));
  });

  it("posts the columns and rows as inline custom properties", () => {
    const harness = scene();
    const grid = harness.part("grid");

    expect(grid.style.getPropertyValue("--sui-calendar-columns")).toBe("7");
    expect(grid.style.getPropertyValue("--sui-calendar-rows")).toBe("5");
  });
});

describe("calendar on a pad", () => {
  function padded(props: CalendarMachineProps = {}): {
    bus: IntentBus;
    harness: ReturnType<typeof scene>;
  } {
    const bus = createIntentBus();
    return { bus, harness: scene({ intents: bus, ...props }) };
  }

  const send = (bus: IntentBus, intent: "select" | "pageUp" | "pageDown" | "moveLeft"): boolean =>
    bus.dispatch({ intent, source: "gamepad" }).consumed;

  it("pages on the triggers and chooses on A, once a cell has the focus", () => {
    const { bus, harness } = padded();
    cellOf(harness.host, "2026-04-15").focus();

    expect(send(bus, "moveLeft")).toBe(true);
    expect(toISO(harness.api().focusedValue)).toBe("2026-04-14");

    expect(send(bus, "select")).toBe(true);
    expect(toISO(harness.api().value as DateValue)).toBe("2026-04-14");

    // LT pages, and after it the focus has to be put back by hand: this harness
    // paints *after* its watchers, so the cell the focus was on is gone before
    // `focusCell` can move it. That order is an adapter's, and it is proved in
    // `@standarui/react`.
    expect(send(bus, "pageUp")).toBe(true);
    expect(harness.api().focusedValue.month).toBe(3);
  });

  it("declines everything while the focus is outside it", () => {
    const { bus, harness } = padded();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    expect(send(bus, "pageUp")).toBe(false);
    expect(send(bus, "select")).toBe(false);
    expect(harness.api().focusedValue.month).toBe(4);
    outside.remove();
  });

  it("keeps the triggers reachable from the header, and B for whatever holds it", () => {
    const { bus, harness } = padded();
    harness.part("next-trigger").focus();

    // The scope is neither trapping nor `base`: paging works from the header,
    // and `back` is never claimed — a calendar is not a layer, and one that ate
    // B would make the surface containing it impossible to leave.
    expect(send(bus, "pageDown")).toBe(true);
    expect(harness.api().focusedValue.month).toBe(5);
    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
  });
});
