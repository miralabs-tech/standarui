/**
 * The calendar through React, against a real engine.
 *
 * The machine itself is proved in `packages/core/src/components/calendar`, where
 * the collection is arithmetic and needs no page. What only an adapter can get
 * right is here, and one thing above all: **the focus surviving a month change.**
 * A new page is a new set of cells, so the element the focus was on is destroyed
 * during the commit — and the engines disagree about whether that even fires a
 * blur. The machine captures "the grid held the focus" before the page moves and
 * spends it after, and this file is where that is a fact rather than a claim.
 *
 * The three fixtures ROADMAP.md:173 requires are all here: the minimal form (a
 * root, a grid and its cells, nothing else), a declined date in the first
 * position, and a gamepad intent arriving through a real provider.
 */

import { type DateValue, toISO } from "@standarui/core/calendar";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputSystem } from "../../nav";
import { NavProvider, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import {
  CalendarCaption,
  CalendarCell,
  CalendarGrid,
  CalendarHeader,
  CalendarLabel,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarRoot,
  type CalendarRootProps,
  CalendarViewTrigger,
  CalendarWeekday,
  CalendarWeekdayRow,
  CalendarWeekNumber,
  CalendarWeekRow,
  useCalendarContext,
} from "./calendar";

const APRIL: DateValue = { year: 2026, month: 4, day: 15 };

function date(year: number, month: number, day: number): DateValue {
  return { year, month, day };
}

/** The grid, written the way a consumer writes it. */
function Grid({ weekNumbers }: { weekNumbers?: boolean | undefined }): React.ReactNode {
  const api = useCalendarContext();
  return (
    <CalendarGrid>
      <CalendarWeekdayRow>
        {api.weekdays.map((weekday, index) => (
          <CalendarWeekday key={weekday.long} index={index} />
        ))}
      </CalendarWeekdayRow>
      {api.weeks.map((week, row) => (
        <CalendarWeekRow key={toISO(week[0] as DateValue)} index={row}>
          {weekNumbers === true ? <CalendarWeekNumber index={row} /> : null}
          {week.map((day) => (
            <CalendarCell key={toISO(day)} value={day} />
          ))}
        </CalendarWeekRow>
      ))}
    </CalendarGrid>
  );
}

interface DatesProps extends CalendarRootProps {
  readonly label?: string;
  readonly weekNumbers?: boolean;
}

function Dates(props: DatesProps): React.ReactNode {
  const { label = "Trip dates", weekNumbers, ...root } = props;
  return (
    <CalendarRoot
      defaultFocusedValue={APRIL}
      firstDayOfWeek={1}
      weekNumbers={weekNumbers}
      {...root}
    >
      <CalendarLabel>{label}</CalendarLabel>
      <CalendarHeader>
        <CalendarPrevTrigger aria-label="Previous month" />
        <CalendarViewTrigger>
          <CalendarCaption />
        </CalendarViewTrigger>
        <CalendarNextTrigger aria-label="Next month" />
      </CalendarHeader>
      <Grid weekNumbers={weekNumbers} />
    </CalendarRoot>
  );
}

/** The shape with none of the optional parts — no header, no weekday row. */
function Bare(props: CalendarRootProps): React.ReactNode {
  return (
    <CalendarRoot defaultFocusedValue={APRIL} firstDayOfWeek={1} {...props}>
      <BareGrid />
    </CalendarRoot>
  );
}

function BareGrid(): React.ReactNode {
  const api = useCalendarContext();
  return (
    <CalendarGrid>
      {api.weeks.map((week, row) => (
        <CalendarWeekRow key={toISO(week[0] as DateValue)} index={row}>
          {week.map((day) => (
            <CalendarCell key={toISO(day)} value={day} />
          ))}
        </CalendarWeekRow>
      ))}
    </CalendarGrid>
  );
}

function cell(container: ParentNode, value: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(
    `[data-part~="calendar:cell"][data-value="${value}"]`,
  );
  if (node === null) throw new Error(`no cell "${value}"`);
  return node;
}

function part(container: ParentNode, name: string): HTMLElement {
  const node = queryPart(container, name);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

/** The cell that currently carries the grid's single tab stop. */
function tabStop(container: ParentNode): HTMLElement {
  const node = queryParts(container, "cell").find((candidate) => candidate.tabIndex === 0);
  if (node === undefined) throw new Error("the grid has no tab stop");
  return node;
}

function press(node: Element, key: string, init: KeyboardEventInit = {}): void {
  fire(() => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

function release(node: Element, key: string): void {
  fire(() => {
    node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  unmountAll();
});

describe("calendar — the grid on a page", () => {
  it("renders a month as one row group, with the roles the table already implies", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const grid = part(container, "grid");
    expect(grid.tagName).toBe("TABLE");
    expect(grid.getAttribute("role")).toBe("grid");
    // The adapter owns the row group; a `<tr>` may not be a child of a `<table>`.
    expect(grid.querySelector("tbody")).not.toBeNull();
    expect(queryParts(container, "week-row")[0]?.tagName).toBe("TR");
    expect(queryParts(container, "weekday")[0]?.tagName).toBe("TH");
    expect(queryParts(container, "cell")).toHaveLength(35);
    // No `role` written by hand except the one the APG spells out.
    expect(queryParts(container, "week-row")[0]?.hasAttribute("role")).toBe(false);
    expect(cell(container, "2026-04-15").getAttribute("role")).toBe("gridcell");
  });

  it("names the grid with the month, and moves the name when the month does", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const grid = part(container, "grid");
    expect(grid.getAttribute("aria-label")).toContain("April");

    fire(() => part(container, "next-trigger").click());
    await settle();
    expect(grid.getAttribute("aria-label")).toContain("May");
  });
});

describe("calendar — the focus follows the page", () => {
  it("moves the real focus with the arrow keys", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const start = tabStop(container);
    fire(() => start.focus());
    expect(document.activeElement).toBe(start);

    press(start, "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-04-16"));

    press(document.activeElement as Element, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-04-23"));
  });

  it("crosses the month boundary and keeps the focus on the day it aimed at", async () => {
    // The cell the focus was on is destroyed by the commit that renders March.
    const { container } = mount(<Dates defaultFocusedValue={date(2026, 4, 1)} />);
    await settle();

    const first = cell(container, "2026-04-01");
    fire(() => first.focus());
    press(first, "ArrowLeft");
    await settle();

    expect(part(container, "caption").textContent).toContain("March");
    expect(document.activeElement).toBe(cell(container, "2026-03-31"));
    expect(part(container, "grid").getAttribute("data-direction")).toBe("backward");
  });

  it("does not take the focus when a header button paged the month", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const next = part(container, "next-trigger");
    fire(() => next.focus());
    fire(() => next.click());
    await settle();

    expect(part(container, "caption").textContent).toContain("May");
    // The button the reader is holding keeps the focus — a page change is not a
    // reason to be dropped into the grid.
    expect(document.activeElement).toBe(next);
  });

  it("pages with PageUp and PageDown, by a year under Shift", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const start = tabStop(container);
    fire(() => start.focus());

    press(start, "PageDown");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-05-15"));

    press(document.activeElement as Element, "PageUp", { shiftKey: true });
    await settle();
    expect(document.activeElement).toBe(cell(container, "2025-05-15"));
  });

  it("mirrors the horizontal arrows in RTL", async () => {
    const { container } = mount(<Dates dir="rtl" />);
    await settle();

    const start = tabStop(container);
    fire(() => start.focus());
    press(start, "ArrowRight");
    await settle();

    expect(document.activeElement).toBe(cell(container, "2026-04-14"));
  });

  it("opens the coarser view, and a cell there drills back down", async () => {
    const { container } = mount(<Dates />);
    await settle();

    // Focused first, the way a pointer press really leaves it: the trigger holds
    // the focus, so the view change has no reason to drag it into the grid.
    const trigger = part(container, "view-trigger");
    fire(() => trigger.focus());
    fire(() => trigger.click());
    await settle();

    expect(part(container, "grid").getAttribute("data-view")).toBe("month");
    expect(queryParts(container, "cell")).toHaveLength(12);
    expect(document.activeElement).toBe(trigger);
    expect(tabStop(container).getAttribute("data-value")).toBe("2026-04");
    // Four columns of months, so no seven day names over them — and no empty
    // header row left behind either (audit of 2026-09-05: this very fixture
    // capped a body of four with seven `<th scope="col">`).
    expect(queryParts(container, "weekday")).toHaveLength(0);
    expect(queryPart(container, "weekday-row")).toBeNull();

    fire(() => cell(container, "2026-07").click());
    await settle();
    expect(part(container, "grid").getAttribute("data-view")).toBe("day");
    expect(part(container, "caption").textContent).toContain("July");
    // Drilling down is navigation, not a choice: nothing is selected by it.
    expect(queryParts(container, "cell").some((node) => node.hasAttribute("data-selected"))).toBe(
      false,
    );
  });

  it("carries the focus into the coarser view when the grid had it", async () => {
    const { container } = mount(<Dates />);
    await settle();

    fire(() => tabStop(container).focus());
    fire(() => part(container, "view-trigger").click());
    await settle();

    expect(document.activeElement).toBe(cell(container, "2026-04"));
  });
});

describe("calendar — choosing", () => {
  it("selects on a click, on Enter down and on Space up", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Dates onValueChange={onValueChange} />);
    await settle();

    fire(() => cell(container, "2026-04-20").click());
    await settle();
    expect(cell(container, "2026-04-20").getAttribute("data-selected")).toBe("");
    expect(onValueChange).toHaveBeenLastCalledWith({ value: date(2026, 4, 20) });

    // Enter is asserted on a *different* day than the click just chose. The roving
    // tab stop follows the selection, so pressing Enter on it re-chose 2026-04-20
    // and the assertion passed on the click's own call — it would have stayed green
    // with Enter doing nothing at all.
    const focused = tabStop(container);
    fire(() => focused.focus());
    press(focused, "ArrowLeft");
    await settle();
    press(document.activeElement as Element, "Enter");
    await settle();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: date(2026, 4, 19) });

    press(document.activeElement as Element, "ArrowRight");
    await settle();
    press(document.activeElement as Element, "ArrowRight");
    await settle();
    const next = document.activeElement as HTMLElement;
    press(next, " ");
    expect(next.getAttribute("data-selected")).toBeNull();
    release(next, " ");
    await settle();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: date(2026, 4, 21) });
  });

  it("marks today with aria-current once the client has said which day it is", async () => {
    const { container } = mount(<Dates today={date(2026, 4, 9)} />);
    await settle();

    expect(cell(container, "2026-04-09").getAttribute("aria-current")).toBe("date");
    expect(cell(container, "2026-04-10").hasAttribute("aria-current")).toBe(false);
  });

  it("disables the header button that would leave the range", async () => {
    const { container } = mount(<Dates min={date(2026, 4, 1)} max={date(2026, 4, 30)} />);
    await settle();

    expect((part(container, "prev-trigger") as HTMLButtonElement).disabled).toBe(true);
    expect((part(container, "next-trigger") as HTMLButtonElement).disabled).toBe(true);
  });

  it("carries a focus ring only for the modalities that deserve one", async () => {
    const { container } = mount(<Dates />);
    await settle();

    const start = tabStop(container);
    fire(() => start.focus());
    press(start, "ArrowRight");
    await settle();

    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("data-focus-source")).toBe("keyboard");
    expect(focused.hasAttribute("data-focus-visible")).toBe(true);
  });
});

describe("calendar — the minimal form", () => {
  it("is operable with a root, a grid and its cells and nothing else", async () => {
    const { container } = mount(<Bare />);
    await settle();

    expect(queryPart(container, "header")).toBeNull();
    expect(queryPart(container, "weekday-row")).toBeNull();
    expect(queryPart(container, "caption")).toBeNull();

    const start = tabStop(container);
    fire(() => start.focus());
    press(start, "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-04-16"));

    fire(() => (document.activeElement as HTMLElement).click());
    await settle();
    expect(cell(container, "2026-04-16").getAttribute("data-selected")).toBe("");

    // The name is a string, not a pointer at a caption nobody rendered.
    expect(part(container, "grid").getAttribute("aria-label")).toContain("April");
    expect(part(container, "grid").hasAttribute("aria-labelledby")).toBe(false);
    await expectNoAxeViolations(container);
  });

  it("puts the tab stop somewhere reachable when the first cell is declined", async () => {
    const { container } = mount(
      <Bare
        defaultFocusedValue={date(2026, 4, 1)}
        isDateUnavailable={(value) => value.month === 4 && value.day < 10}
      />,
    );
    await settle();

    expect(tabStop(container).getAttribute("data-value")).toBe("2026-04-10");
    expect(cell(container, "2026-04-01").tabIndex).toBe(-1);
    expect(cell(container, "2026-04-01").getAttribute("aria-disabled")).toBe("true");

    // And the declined dates are stepped over rather than swallowing the key.
    const start = tabStop(container);
    fire(() => start.focus());
    press(start, "ArrowLeft");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-03-31"));
  });
});

describe("calendar — the pad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "select" | "pageUp" | "pageDown" | "moveRight"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  it("pages the month on the triggers and chooses on A", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Dates onValueChange={onValueChange} />
      </NavProvider>,
    );
    await settle();

    const start = tabStop(container);
    fire(() => start.focus());
    await waitFor(() => expect(document.activeElement).toBe(start));

    // LT and RT, not LB/RB: the keyboard already produces `pageUp` for "previous
    // month", and the shoulder buttons are the walk between composites.
    pad("pageUp");
    await settle();
    expect(part(container, "caption").textContent).toContain("March");

    pad("moveRight");
    await settle();
    expect(document.activeElement).toBe(cell(container, "2026-03-16"));

    pad("select");
    await settle();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: date(2026, 3, 16) });
  });

  /** R17: the grid's scope opens at mount, under the trap of the dialog around it. */
  it("still moves the focused day on the d-pad inside a modal dialog that traps", async () => {
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Pick a date</DialogTitle>
                <Dates />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the cell before the pad is pressed.
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const start = cell(document.body, "2026-04-15");
    fire(() => start.focus());
    await settle();
    expect(document.activeElement).toBe(start);

    pad("moveRight");
    await settle();

    expect(document.activeElement).toBe(cell(document.body, "2026-04-16"));
  });

  it("answers no pad at all when the consumer opts out", async () => {
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Dates intents={null} />
      </NavProvider>,
    );
    await settle();

    fire(() => tabStop(container).focus());
    pad("pageUp");
    await settle();

    expect(part(container, "caption").textContent).toContain("April");
  });
});

describe("calendar — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  it("passes over the theme × density matrix, in both views", async () => {
    const handle = mount(
      <main>
        {THEMES.flatMap((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <Dates id={`c-${theme}-${density}`} />
              <Dates id={`m-${theme}-${density}`} defaultView="month" />
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });

  it("passes with week numbers, which add a column the header has to match", async () => {
    // A row of week numbers adds a body column and not a header one, so without
    // the corner spacer the last weekday header would describe no cells — which
    // axe reports as `th-has-data-cells`, correctly.
    const { container } = mount(<Dates weekNumbers />);
    await settle();

    expect(queryParts(container, "week-number")).toHaveLength(5);
    await expectNoAxeViolations(container);
  });

  it("passes in RTL and with a range that declines most of the month", async () => {
    const { container } = mount(
      <div dir="rtl">
        <Dates
          dir="rtl"
          locale="ar-EG"
          min={date(2026, 4, 10)}
          max={date(2026, 4, 20)}
          isDateUnavailable={(value) => value.day === 15}
        />
      </div>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });
});
