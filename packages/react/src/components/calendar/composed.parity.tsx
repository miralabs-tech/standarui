/**
 * The calendar's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id` and `today`. The id keeps the machine from minting two
 * different sets for the two forms; `today` keeps the page itself stable, since a
 * calendar with no `today` reads the environment and a render on either side of
 * midnight would differ by a month.
 *
 * The parts side spells out what the two plural placers render, rather than using
 * them — that is the point of the table. If `CalendarWeeks` ever stopped emitting
 * the week number ahead of the cells, or emitted rows in another order, these
 * rows would part company.
 */

import { type DateValue, toISO } from "@standarui/core/calendar";
import type { ReactNode } from "react";
import type { ParityCase } from "../../composed.harness";
import {
  CalendarCaption,
  CalendarCell,
  CalendarGrid,
  CalendarHeader,
  CalendarLabel,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarRoot,
  CalendarViewTrigger,
  CalendarWeekday,
  CalendarWeekdayRow,
  CalendarWeekNumber,
  CalendarWeekRow,
  useCalendarContext,
} from "./calendar";
import { Calendar } from "./composed";

const TODAY: DateValue = { year: 2026, month: 4, day: 9 };

/**
 * The hand-written half of the grid — what the two placers do, written out. It is
 * a component rather than an element because it reads the api the root provides,
 * which is exactly the passage the placers exist to spare a consumer.
 */
function Body(): ReactNode {
  const api = useCalendarContext();

  return (
    <CalendarGrid>
      <CalendarWeekdayRow>
        {api.weekdays.map((weekday, index) => (
          <CalendarWeekday key={weekday.long} index={index} />
        ))}
      </CalendarWeekdayRow>
      {api.weeks.map((week, row) => {
        const first = week[0];

        return (
          <CalendarWeekRow key={first === undefined ? `week-${row}` : toISO(first)} index={row}>
            {api.weekNumbers ? <CalendarWeekNumber index={row} /> : null}
            {week.map((day) => (
              <CalendarCell key={toISO(day)} value={day} />
            ))}
          </CalendarWeekRow>
        );
      })}
    </CalendarGrid>
  );
}

export const parity: readonly ParityCase[] = [
  {
    name: "calendar",
    composed: (
      <Calendar id="trip" today={TODAY} prevLabel="Previous month" nextLabel="Next month" />
    ),
    parts: (
      <CalendarRoot id="trip" today={TODAY}>
        <CalendarHeader>
          <CalendarPrevTrigger aria-label="Previous month" />
          <CalendarViewTrigger>
            <CalendarCaption />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next month" />
        </CalendarHeader>
        <Body />
      </CalendarRoot>
    ),
  },
  /**
   * `label` placed. It is one of the two things this layer decides rather than
   * always rendering, and the label names the grid — so this row is also what
   * proves the pair is wired rather than merely present.
   */
  {
    name: "calendar",
    composed: (
      <Calendar
        id="renewal"
        today={TODAY}
        label="Renewal date"
        prevLabel="Previous month"
        nextLabel="Next month"
      />
    ),
    parts: (
      <CalendarRoot id="renewal" today={TODAY}>
        <CalendarLabel>Renewal date</CalendarLabel>
        <CalendarHeader>
          <CalendarPrevTrigger aria-label="Previous month" />
          <CalendarViewTrigger>
            <CalendarCaption />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next month" />
        </CalendarHeader>
        <Body />
      </CalendarRoot>
    ),
  },
  /**
   * `weekNumbers` on, which is the branch inside `CalendarWeeks` — a seventh cell
   * ahead of the seven days, and the spacer the weekday row adds to match it. The
   * placer decides it from the machine, so nothing in the composed form says so.
   */
  {
    name: "calendar",
    composed: (
      <Calendar
        id="weeks"
        today={TODAY}
        weekNumbers
        prevLabel="Previous month"
        nextLabel="Next month"
      />
    ),
    parts: (
      <CalendarRoot id="weeks" today={TODAY} weekNumbers>
        <CalendarHeader>
          <CalendarPrevTrigger aria-label="Previous month" />
          <CalendarViewTrigger>
            <CalendarCaption />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next month" />
        </CalendarHeader>
        <Body />
      </CalendarRoot>
    ),
  },
  /**
   * The month view, where `api.weekdays` is empty: the weekday row removes itself
   * whole, and the cells are months rather than days. The composed form places the
   * row unconditionally and the part is what drops it — so this row proves the
   * layer did not need a branch the part already owns.
   */
  {
    name: "calendar",
    composed: (
      <Calendar
        id="month"
        today={TODAY}
        defaultView="month"
        prevLabel="Previous year"
        nextLabel="Next year"
      />
    ),
    parts: (
      <CalendarRoot id="month" today={TODAY} defaultView="month">
        <CalendarHeader>
          <CalendarPrevTrigger aria-label="Previous year" />
          <CalendarViewTrigger>
            <CalendarCaption />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next year" />
        </CalendarHeader>
        <Body />
      </CalendarRoot>
    ),
  },
  /**
   * `parts` is applied last, so it wins over what the layer placed. The entry on
   * the weekday row reaches a part that renders here and would not in the month
   * view above — which is why the two rows are separate.
   */
  {
    name: "calendar",
    composed: (
      <Calendar
        id="styled"
        today={TODAY}
        label="Delivery"
        prevLabel="Previous month"
        nextLabel="Next month"
        parts={{
          label: { className: "lbl" },
          header: { className: "hdr" },
          prevTrigger: { className: "prev" },
          viewTrigger: { className: "view" },
          caption: { className: "cap" },
          nextTrigger: { className: "next" },
          grid: { className: "grid" },
          weekdayRow: { className: "wdr" },
        }}
      />
    ),
    parts: (
      <CalendarRoot id="styled" today={TODAY}>
        <CalendarLabel className="lbl">Delivery</CalendarLabel>
        <CalendarHeader className="hdr">
          <CalendarPrevTrigger aria-label="Previous month" className="prev" />
          <CalendarViewTrigger className="view">
            <CalendarCaption className="cap" />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next month" className="next" />
        </CalendarHeader>
        <StyledBody />
      </CalendarRoot>
    ),
  },
];

/** The same body, with the two class names `parts` puts on the grid and the row. */
function StyledBody(): ReactNode {
  const api = useCalendarContext();

  return (
    <CalendarGrid className="grid">
      <CalendarWeekdayRow className="wdr">
        {api.weekdays.map((weekday, index) => (
          <CalendarWeekday key={weekday.long} index={index} />
        ))}
      </CalendarWeekdayRow>
      {api.weeks.map((week, row) => {
        const first = week[0];

        return (
          <CalendarWeekRow key={first === undefined ? `week-${row}` : toISO(first)} index={row}>
            {api.weekNumbers ? <CalendarWeekNumber index={row} /> : null}
            {week.map((day) => (
              <CalendarCell key={toISO(day)} value={day} />
            ))}
          </CalendarWeekRow>
        );
      })}
    </CalendarGrid>
  );
}
