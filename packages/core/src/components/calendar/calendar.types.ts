import type { IntentScopeHost } from "@standarx/nav";
import type { LiveAnnouncer } from "../../a11y/live-announcer";
import type { GridAction } from "../../collection/grid-collection";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";
import type { DateValue, FirstDayOfWeek } from "../../utils/plain-date";

/**
 * Three views on one grid. The names are the unit a cell stands for, which is
 * also what `data-value` carries: `2026-04-15`, `2026-04`, `2026`.
 */
export type CalendarView = "day" | "month" | "year";

/** Whether the days spilling in from the neighbouring months are drawn. */
export type CalendarOutsideDays = "visible" | "hidden";

/** Which way the page travelled — a motion hint, not a state. */
export type CalendarPageDirection = "forward" | "backward";

export interface CalendarValueChangeDetails {
  readonly value: DateValue | null;
}

export interface CalendarFocusChangeDetails {
  readonly value: DateValue;
}

export interface CalendarViewChangeDetails {
  readonly view: CalendarView;
}

export interface CalendarCellProps {
  readonly value: DateValue;
  /** The consumer's own veto, on top of `min`/`max`/`isDateUnavailable`. */
  readonly disabled?: boolean | undefined;
}

export interface CalendarWeekdayProps {
  /** 0…6 in display order — the column, not the ISO weekday. */
  readonly index: number;
}

export interface CalendarWeekRowProps {
  /** 0-based row of the visible page. */
  readonly index: number;
}

export interface CalendarWeekNumberProps {
  readonly index: number;
}

/** The three widths `Intl` gives a weekday, so a sheet can pick without a table. */
export interface CalendarWeekdayLabels {
  readonly narrow: string;
  readonly short: string;
  readonly long: string;
}

export interface CalendarMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Falls back to the environment, then to `en-US`. Never a hard-coded table. */
  readonly locale?: string | undefined;
  /** Controlled. `null` is a value — it means no date is chosen. */
  readonly value?: DateValue | null | undefined;
  readonly defaultValue?: DateValue | null | undefined;
  /** The roving anchor, and what decides which page is on screen. */
  readonly focusedValue?: DateValue | undefined;
  readonly defaultFocusedValue?: DateValue | undefined;
  /**
   * Today, injected. A server in UTC and a client in `Pacific/Auckland` are not
   * on the same day, so the machine reads no clock for `data-today` until the
   * first client `ENVIRONMENT.SYNC` — pass this to make the render deterministic.
   */
  readonly today?: DateValue | undefined;
  readonly min?: DateValue | null | undefined;
  readonly max?: DateValue | null | undefined;
  /** Consulted in the day view only: it is a predicate over a date. */
  readonly isDateUnavailable?: ((value: DateValue) => boolean) | undefined;
  /** ISO numbering, 1 is Monday. Falls back to `Intl.Locale`'s week info. */
  readonly firstDayOfWeek?: FirstDayOfWeek | undefined;
  /** Six rows whatever the month, so the surface stops changing height. */
  readonly fixedWeeks?: boolean | undefined;
  readonly weekNumbers?: boolean | undefined;
  readonly outsideDays?: CalendarOutsideDays | undefined;
  readonly view?: CalendarView | undefined;
  readonly defaultView?: CalendarView | undefined;
  /**
   * The views the `viewTrigger` can open, coarsest last — and it opens **one** of
   * them. The trigger is a disclosure and not a rotation: from the day grid it
   * opens `views[1]`, and from any other view it closes all the way back to
   * `views[0]`. A third entry is therefore never reached by the trigger, which is
   * also what makes `["day", "year"]` the way to put the decade grid one click
   * away.
   *
   * Drilling is a separate gesture and this list does not filter it: clicking a
   * year in the decade grid opens the month grid whether or not `"month"` is here.
   */
  readonly views?: readonly CalendarView[] | undefined;
  readonly readOnly?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Styling and `aria-invalid` only — a calendar cannot itself be wrong. */
  readonly invalid?: boolean | undefined;
  /**
   * Ids naming the grid. Wins over the caption the grid names itself with — a
   * consumer who supplies this owns the whole accessible name.
   */
  readonly labelledBy?: string | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /** Puts the focus on the focused cell once the grid is mounted. */
  readonly autoFocus?: boolean | undefined;
  /** Where the d-pad arrives from. `null` when the app runs no input system. */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onValueChange?: ((details: CalendarValueChangeDetails) => void) | undefined;
  readonly onFocusChange?: ((details: CalendarFocusChangeDetails) => void) | undefined;
  readonly onViewChange?: ((details: CalendarViewChangeDetails) => void) | undefined;
}

export interface ResolvedCalendarMachineProps extends CalendarMachineProps {
  readonly defaultView: CalendarView;
  readonly views: readonly CalendarView[];
  readonly outsideDays: CalendarOutsideDays;
  readonly fixedWeeks: boolean;
  readonly weekNumbers: boolean;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly autoFocus: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface CalendarSchema extends MachineSchema {
  state: "idle";
  props: ResolvedCalendarMachineProps;
  context: {
    value: DateValue | null;
    /**
     * Always a whole date, in every view: the month grid is derived from it, and
     * so is the month a year cell drills down into. A view never truncates it.
     */
    focusedValue: DateValue;
    view: CalendarView;
    /** `null` until the first client sync, which is what keeps SSR honest. */
    today: DateValue | null;
    direction: CalendarPageDirection | null;
    locale: string | null;
    dir: Direction | null;
    /** Read once, when the focus lands on a cell, and held until it leaves. */
    focusSource: InputModality | null;
  };
  refs: {
    announcer: LiveAnnouncer | null;
    /** The last caption spoken, so a re-render never says the month twice. */
    lastCaption: string | null;
    /**
     * Whether the grid held the focus when the anchor last moved. Read before
     * the page changes and spent after the commit — the element the focus was
     * on does not survive a new month.
     */
    pendingFocus: boolean;
  };
  computed: {
    locale: string;
    dir: Direction;
    firstDayOfWeek: FirstDayOfWeek;
    /** The visible page, flattened in reading order. */
    cells: readonly DateValue[];
    columns: number;
    caption: string;
  };
  event:
    | { type: "CELL.CLICK"; value: DateValue }
    | { type: "CELL.FOCUS"; value: DateValue }
    | { type: "GRID.NAVIGATE"; action: GridAction }
    | { type: "GRID.PAGE"; step: -1 | 1; big: boolean }
    | { type: "GRID.BLUR" }
    | { type: "PREV.CLICK" }
    | { type: "NEXT.CLICK" }
    | { type: "VIEW.TOGGLE" }
    | { type: "VIEW.SET"; view: CalendarView }
    | { type: "VALUE.SET"; value: DateValue | null }
    | { type: "FOCUS.SET"; value: DateValue }
    | { type: "ENVIRONMENT.SYNC"; locale: string; dir: Direction };
  action:
    | "selectCell"
    | "setValue"
    | "setFocusedValue"
    | "moveFocus"
    | "pageFocus"
    | "cycleView"
    | "setView"
    | "clearFocusSource"
    | "focusCell"
    | "settleFocus"
    | "autoFocusCell"
    | "announceCaption"
    | "syncEnvironment";
  guard: "isEnabled" | "canPageBackward" | "canPageForward";
  effect: "trackEnvironment" | "trackModality" | "mountAnnouncer" | "captureIntents";
}

export interface CalendarApi<T extends PropTypes = PropTypes> {
  readonly value: DateValue | null;
  readonly focusedValue: DateValue;
  readonly view: CalendarView;
  /** `null` on a server, and until the first environment sync on the client. */
  readonly today: DateValue | null;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly locale: string;
  readonly weekNumbers: boolean;
  /** The visible page, flattened in reading order — `columns × rows` of it. */
  readonly cells: readonly DateValue[];
  /** The same cells cut into rows: seven-day weeks in the day view. */
  readonly weeks: readonly (readonly DateValue[])[];
  readonly weekdays: readonly CalendarWeekdayLabels[];
  readonly columns: number;
  readonly rows: number;
  readonly caption: string;
  readonly canPagePrev: boolean;
  readonly canPageNext: boolean;
  isSelected(value: DateValue): boolean;
  isToday(value: DateValue): boolean;
  isOutsideMonth(value: DateValue): boolean;
  isUnavailable(value: DateValue): boolean;
  /** What the cell shows: the day number, the month name, the year. */
  getCellText(value: DateValue): string;
  getWeekNumber(index: number): number;
  setValue(value: DateValue | null): void;
  setFocusedValue(value: DateValue): void;
  setView(view: CalendarView): void;
  pagePrev(): void;
  pageNext(): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getHeaderProps(): T["element"];
  getPrevTriggerProps(): T["button"];
  getNextTriggerProps(): T["button"];
  getViewTriggerProps(): T["button"];
  getCaptionProps(): T["element"];
  getGridProps(): T["element"];
  getWeekdayRowProps(): T["element"];
  getWeekdayProps(props: CalendarWeekdayProps): T["element"];
  getWeekRowProps(props: CalendarWeekRowProps): T["element"];
  getWeekNumberProps(props: CalendarWeekNumberProps): T["element"];
  getCellProps(props: CalendarCellProps): T["element"];
}
