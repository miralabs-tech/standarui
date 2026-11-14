/**
 * `<Calendar prevLabel="…" nextLabel="…"/>` — the header that pages the view,
 * and the grid under it.
 *
 * Thirteen parts in the anatomy and eight keys in `parts`; `root` is not one, for
 * the reason it never is — the root's props *are* this component's props. The
 * five that are missing are the ones no caller places: the weekdays, the week
 * rows, the week numbers and the cells all come from the machine's own page, and
 * the two plural placers below are what put them there.
 *
 * **The two placers are the whole reason this layer can exist.** `api.weeks` and
 * `api.weekdays` are cut by the machine from the page it computed, so they exist
 * only inside the root — a composed layer, which may call no hook, cannot loop
 * over either. `CalendarWeekdays` and `CalendarWeeks` do the looping and render
 * nothing but parts, exactly as `DateFieldSegments` does for the locale's strip;
 * this file places them as single elements and calls nothing.
 *
 * **`prevLabel` and `nextLabel` are required, and that is this layer's exigence.**
 * `getPrevTriggerProps` and `getNextTriggerProps` write no `aria-label` at all,
 * and the machine holds no translation table — a defaulted "Previous month" would
 * be English shipped into every locale, which is the same reason
 * `CalendarWeekNumber` has no label of its own. In the parts form that is
 * survivable: a consumer who puts a word inside the button has named it the
 * ordinary way. This layer cannot, because `_calendar.scss` now fills both
 * buttons with a chevron drawn under `:empty` and a pseudo-element is not text.
 * `clipboard`'s `copyLabel` is the precedent, in duplicate.
 *
 * The view trigger takes no label of its own: it *holds* the caption, so the
 * month's name is its accessible name. That is also why its own chevron is drawn
 * unguarded — it is never empty.
 */

import { isDev, warn } from "@standarui/core";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  CalendarCaption,
  CalendarGrid,
  CalendarHeader,
  CalendarLabel,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarRoot,
  CalendarViewTrigger,
  CalendarWeekdayRow,
  CalendarWeekdays,
  CalendarWeeks,
  type UseCalendarProps,
} from "./calendar";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface CalendarParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly header?: PartProps<"div"> | undefined;
  readonly prevTrigger?: PartProps<"button"> | undefined;
  readonly viewTrigger?: PartProps<"button"> | undefined;
  readonly caption?: PartProps<"div"> | undefined;
  readonly nextTrigger?: PartProps<"button"> | undefined;
  readonly grid?: PartProps<"table"> | undefined;
  /**
   * The row of day names. It removes itself in the month and year views, where
   * the machine reports no weekdays, so an entry here reaches a row that is not
   * always rendered — the same contract the part itself carries.
   */
  readonly weekdayRow?: PartProps<"tr"> | undefined;
}

export interface CalendarComposedProps
  extends UseCalendarProps,
    Omit<PartProps<"div", UseCalendarProps>, "children"> {
  /** Names the button that pages backwards, and it is required: see the header. */
  readonly prevLabel: string;
  /** Names the button that pages forwards, and it is required: see the header. */
  readonly nextLabel: string;
  /** The calendar's visible label. Omitted, no label part is placed. */
  readonly label?: ReactNode;
  readonly parts?: CalendarParts | undefined;
}

export function Calendar(props: CalendarComposedProps): ReactNode {
  const { label, parts, prevLabel, nextLabel, ...root } = props;

  // The half the signature cannot state: an empty string is a `string`, and a
  // caller with no type checker never met the signature at all. Both buttons are
  // reported in one line — a consumer who forgot one usually forgot both.
  warn(
    isDev() &&
      (prevLabel === undefined || prevLabel === "" || nextLabel === undefined || nextLabel === ""),
    'Calendar: `prevLabel` and `nextLabel` name the two paging buttons and are required — the sheet fills both with a chevron drawn in CSS, so nothing else can name them. Pass the words, or they ship as buttons called "button".',
  );

  return (
    <CalendarRoot {...root}>
      {label == null ? null : <CalendarLabel {...parts?.label}>{label}</CalendarLabel>}
      <CalendarHeader {...parts?.header}>
        <CalendarPrevTrigger aria-label={prevLabel} {...parts?.prevTrigger} />
        <CalendarViewTrigger {...parts?.viewTrigger}>
          <CalendarCaption {...parts?.caption} />
        </CalendarViewTrigger>
        <CalendarNextTrigger aria-label={nextLabel} {...parts?.nextTrigger} />
      </CalendarHeader>
      <CalendarGrid {...parts?.grid}>
        <CalendarWeekdayRow {...parts?.weekdayRow}>
          <CalendarWeekdays />
        </CalendarWeekdayRow>
        <CalendarWeeks />
      </CalendarGrid>
    </CalendarRoot>
  );
}
