import { getGridKeyAction, getRowCount } from "../../collection/grid-collection";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { formatDate, getWeekdayLabels } from "../../utils/date-format";
import { compareDates, type DateValue, getDayOfWeek, getWeekNumber } from "../../utils/plain-date";
import { parts } from "./calendar.anatomy";
import { getCaptionId, getCellId, getGridId, getLabelId, getRootId } from "./calendar.dom";
import {
  type CalendarCellReach,
  isCellDisabled as cellDisabled,
  isCellUnreachable as cellUnreachable,
  findTabStop,
  getFocusedCell,
  getPageBounds,
  isOutsidePage,
  isSameCell,
  toCellValue,
} from "./calendar.page";
import type {
  CalendarApi,
  CalendarCellProps,
  CalendarSchema,
  CalendarView,
  CalendarWeekdayLabels,
  CalendarWeekdayProps,
  CalendarWeekNumberProps,
  CalendarWeekRowProps,
} from "./calendar.types";

/** Saturday and Sunday, in the numbering `getUTCDay` already speaks. */
function isWeekend(value: DateValue): boolean {
  const day = getDayOfWeek(value);
  return day === 0 || day === 6;
}

/**
 * What the cell shows. The day number and the year go out as plain digits and
 * that is not a shortcut: every formatter in `date-format` is pinned to
 * `numberingSystem: "latn"`, so `Intl` would return exactly this string after
 * allocating a formatter to do it.
 */
function cellText(view: CalendarView, cell: DateValue, locale: string): string {
  if (view === "day") return String(cell.day);
  if (view === "year") return String(cell.year);
  return formatDate(cell, locale, { month: "short" });
}

function cellLabel(view: CalendarView, cell: DateValue, locale: string): string {
  if (view === "day") {
    return formatDate(cell, locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (view === "month") {
    const label = formatDate(cell, locale, { month: "long", year: "numeric" });
    const shown = cellText(view, cell, locale);
    // WCAG 2.5.3: a speech user says what they see, so the abbreviation leads the name.
    return label.split(/\s+/).includes(shown) ? label : `${shown}, ${label}`;
  }
  return formatDate(cell, locale, { year: "numeric" });
}

export function connect<T extends PropTypes>(
  service: Service<CalendarSchema>,
  normalize: NormalizeProps<T>,
): CalendarApi<T> {
  const { context, computed, prop, send, scope } = service;

  const view = context.get("view");
  const value = context.get("value");
  const focusedValue = context.get("focusedValue");
  const today = context.get("today");
  const direction = context.get("direction");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const weekNumbers = prop("weekNumbers");
  const outsideDays = prop("outsideDays");

  const locale = computed("locale");
  const dir = computed("dir");
  const firstDayOfWeek = computed("firstDayOfWeek");
  const cells = computed("cells");
  const columns = computed("columns");
  const caption = computed("caption");
  const rows = getRowCount(cells.length, columns);

  // Read once, when the focus landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const [pageStart, pageEnd] = getPageBounds(view, focusedValue);
  const min = prop("min");
  const max = prop("max");
  // The same two comparisons the guards make, published so the header's buttons
  // can carry `disabled` before anybody presses them.
  const canPagePrev =
    !disabled && (min === null || min === undefined || compareDates(min, pageStart) < 0);
  const canPageNext =
    !disabled && (max === null || max === undefined || compareDates(max, pageEnd) > 0);

  const isSelected = (cell: DateValue): boolean => value !== null && isSameCell(view, cell, value);
  const isToday = (cell: DateValue): boolean => today !== null && isSameCell(view, cell, today);
  const isOutsideMonth = (cell: DateValue): boolean => isOutsidePage(view, focusedValue, cell);
  const isUnavailable = (cell: DateValue): boolean =>
    view === "day" && prop("isDateUnavailable")?.(cell) === true;

  const weeks: DateValue[][] = Array.from({ length: rows }, (_, row) =>
    cells.slice(row * columns, row * columns + columns),
  );

  // Seven names, and only in the view that has seven columns. A month page is
  // four months across and a year page four years across, so the day names head
  // nothing there: a consumer mapping over this list would cap a four-column body
  // with seven `<th scope="col">`, which is a lie about the table (`th` with no
  // data cells) that no arrow key can reach. The grid already knows its view, so
  // the consumer does not have to branch on it.
  const weekdays: CalendarWeekdayLabels[] = (() => {
    if (view !== "day") return [];
    const narrow = getWeekdayLabels(locale, firstDayOfWeek, "narrow");
    const short = getWeekdayLabels(locale, firstDayOfWeek, "short");
    const long = getWeekdayLabels(locale, firstDayOfWeek, "long");
    return Array.from({ length: 7 }, (_, index) => ({
      narrow: narrow[index] ?? "",
      short: short[index] ?? "",
      long: long[index] ?? "",
    }));
  })();

  const reach: CalendarCellReach = {
    view,
    focused: focusedValue,
    outsideDays,
    disabled,
    min,
    max,
    isDateUnavailable: prop("isDateUnavailable"),
  };
  const isCellDisabled = (cell: DateValue): boolean => cellDisabled(reach, cell);
  const isCellUnreachable = (cell: DateValue): boolean => cellUnreachable(reach, cell);

  // The single tab stop. It rides on the anchor, which the page is derived from
  // and so can never be absent — unless the anchor is a date nobody can choose,
  // and a composite whose only `tabindex="0"` sits on a disabled cell has left
  // the tab order altogether. Scanned rather than settled by an effect, so a
  // server renders the stop the client will hydrate. `settleFocus` moves the
  // anchor onto this same cell at mount; both ask `findTabStop`.
  //
  // `isCellUnreachable` and not `isCellDisabled`: under `outsideDays: "hidden"`
  // the days spilling in from a neighbour are choosable but invisible, and the
  // scan would hand the only stop to one of them on a page whose own dates are
  // all declined.
  //
  // When nothing at all is reachable — a whole month declined, or the calendar
  // itself disabled — the stop stays on the anchor rather than disappearing.
  // These cells carry `aria-disabled` and not the attribute, so one of them is
  // still focusable, and a grid with no stop would leave the reader no way to
  // reach the header and page out of the month that declined them.
  const anchorCell = getFocusedCell(view, focusedValue);
  const tabStop = isCellUnreachable(anchorCell)
    ? (findTabStop(cells, isCellUnreachable, isOutsideMonth) ?? anchorCell)
    : anchorCell;

  const getWeekNumberOf = (index: number): number => {
    const week = weeks[index];
    const first = week?.[0];
    return first === undefined ? 0 : getWeekNumber(first);
  };

  return {
    value,
    focusedValue,
    view,
    today,
    disabled,
    readOnly,
    locale,
    weekNumbers,
    cells,
    weeks,
    weekdays,
    columns,
    rows,
    caption,
    canPagePrev,
    canPageNext,
    isSelected,
    isToday,
    isOutsideMonth,
    isUnavailable,
    getCellText: (cell: DateValue): string => cellText(view, cell, locale),
    getWeekNumber: getWeekNumberOf,

    setValue(next: DateValue | null): void {
      send({ type: "VALUE.SET", value: next });
    },

    setFocusedValue(next: DateValue): void {
      send({ type: "FOCUS.SET", value: next });
    },

    setView(next: CalendarView): void {
      send({ type: "VIEW.SET", view: next });
    },

    pagePrev(): void {
      send({ type: "PREV.CLICK" });
    },

    pageNext(): void {
      send({ type: "NEXT.CLICK" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "data-view": view,
        "data-disabled": dataAttr(disabled),
        "data-readonly": dataAttr(readOnly),
        "data-invalid": dataAttr(prop("invalid")),
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({
        ...parts.label.attrs,
        id: getLabelId(scope),
        "data-disabled": dataAttr(disabled),
      }),

    // Presentational: the header holds two buttons and a caption, and a role of
    // its own would only add a landmark nobody asked for.
    getHeaderProps: (): T["element"] => normalize.element({ ...parts.header.attrs }),

    getCaptionProps: (): T["element"] =>
      normalize.element({
        ...parts.caption.attrs,
        id: getCaptionId(scope),
        // No `aria-live`. The grid already carries this string as its accessible
        // name, and the month change is spoken once through `live-announcer`;
        // two mechanisms would say it twice.
        "data-view": view,
      }),

    getPrevTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.prevTrigger.attrs,
        type: "button",
        disabled: !canPagePrev,
        "data-disabled": dataAttr(!canPagePrev),
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "PREV.CLICK" });
        },
      }),

    getNextTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.nextTrigger.attrs,
        type: "button",
        disabled: !canPageNext,
        "data-disabled": dataAttr(!canPageNext),
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "NEXT.CLICK" });
        },
      }),

    getViewTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.viewTrigger.attrs,
        type: "button",
        disabled,
        "aria-expanded": boolAttr(view !== "day"),
        "data-view": view,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "VIEW.TOGGLE" });
        },
      }),

    getGridProps: (): T["element"] =>
      normalize.element({
        ...parts.grid.attrs,
        id: getGridId(scope),
        role: "grid",
        // The caption as a string rather than an IDREF at it: the minimal form of
        // this component is a root, a grid and its cells, and an
        // `aria-labelledby` naming a header nobody rendered is exactly the
        // dangling IDREF the SSR guard refuses. A consumer who owns the name
        // passes `labelledBy`, which wins over this by the ARIA spec's own rule.
        "aria-label": caption,
        "aria-labelledby": prop("labelledBy"),
        "aria-describedby": prop("describedBy"),
        "aria-readonly": ariaAttr(readOnly),
        "aria-disabled": ariaAttr(disabled),
        "aria-invalid": ariaAttr(prop("invalid")),
        "data-view": view,
        "data-direction": direction ?? undefined,
        "data-week-numbers": dataAttr(weekNumbers),
        "data-outside-days": outsideDays,
        "data-snav": "container",
        style: {
          "--sui-calendar-columns": String(columns),
          "--sui-calendar-rows": String(rows),
        },
      }),

    // No explicit `role` on the row: a `<tr>` inside a `role="grid"` table already
    // carries `row`. Two roles *are* written by hand, and both because an implicit
    // mapping is not decidable here: `gridcell`, which the APG spells out because
    // a `<td>`'s mapping depends on the table it is in, and `columnheader` on the
    // weekday below. This comment used to claim the weekday needed none because
    // `<th scope="col">` carries it — but nothing emits `scope`, here or in the
    // adapter, and a `<th>` with no scope in a grid that also has row headers
    // (the week numbers) is exactly the ambiguous case.
    getWeekdayRowProps: (): T["element"] => normalize.element({ ...parts.weekdayRow.attrs }),

    getWeekdayProps: (weekdayProps: CalendarWeekdayProps): T["element"] => {
      const day = weekdays[weekdayProps.index];
      return normalize.element({
        ...parts.weekday.attrs,
        role: "columnheader",
        // `scope` is what associates the column with its cells; `abbr` would be
        // the HTML way to carry the long name, but it is not part of the prop
        // surface and two screen readers honour it. The long name is the
        // accessible name instead, over the narrow letter that is drawn.
        "aria-label": day?.long,
        "data-index": String(weekdayProps.index),
      });
    },

    getWeekRowProps: (rowProps: CalendarWeekRowProps): T["element"] =>
      normalize.element({
        ...parts.weekRow.attrs,
        "data-week-index": String(rowProps.index),
      }),

    getWeekNumberProps: (numberProps: CalendarWeekNumberProps): T["element"] =>
      normalize.element({
        ...parts.weekNumber.attrs,
        // A row header, and deliberately outside the navigation collection:
        // `columns` stays 7 whatever `weekNumbers` says, so an arrow never lands
        // on a cell that is not a date.
        "data-week": String(getWeekNumberOf(numberProps.index)),
      }),

    getCellProps: (cellProps: CalendarCellProps): T["element"] => {
      const cell = cellProps.value;
      const outside = isOutsideMonth(cell);
      const unavailable = isUnavailable(cell);
      const cellDisabled = isCellDisabled(cell) || cellProps.disabled === true;
      const focused = isSameCell(view, cell, focusedValue);
      const selected = isSelected(cell);

      return normalize.element({
        ...parts.cell.attrs,
        id: getCellId(scope, cell),
        role: "gridcell",
        // Roving: one stop for the whole grid.
        tabIndex: tabStop !== undefined && isSameCell(view, cell, tabStop) ? 0 : -1,
        "aria-selected": boolAttr(selected),
        "aria-disabled": ariaAttr(cellDisabled),
        "aria-current": isToday(cell) ? "date" : undefined,
        "aria-label": cellLabel(view, cell, locale),
        "data-value": toCellValue(view, cell),
        "data-selected": dataAttr(selected),
        "data-today": dataAttr(isToday(cell)),
        "data-outside-month": dataAttr(outside),
        "data-unavailable": dataAttr(unavailable),
        "data-disabled": dataAttr(cellDisabled),
        "data-weekend": dataAttr(view === "day" && isWeekend(cell)),
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused cell only: the grid has one focus, and an attribute
        // claiming otherwise on 42 cells describes nothing.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        onClick(event) {
          if (event.defaultPrevented || cellDisabled) return;
          send({ type: "CELL.CLICK", value: cell });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey) return;
          const modified = event.ctrlKey || event.metaKey;

          if (event.key === "PageUp" || event.key === "PageDown") {
            event.preventDefault();
            send({
              type: "GRID.PAGE",
              step: event.key === "PageUp" ? -1 : 1,
              big: event.shiftKey,
            });
            return;
          }
          if (event.key === "Enter") {
            // Auto-repeat is a key held down, not a second press.
            if (modified || event.repeat || cellDisabled) return;
            event.preventDefault();
            send({ type: "CELL.CLICK", value: cell });
            return;
          }
          // Claimed here so the arrow lookup cannot see it, prevented so the page
          // does not scroll, and answered on keyup — the APG split `input.md` §1
          // makes a rule across the library.
          if (event.key === " ") {
            event.preventDefault();
            return;
          }
          // Shift+arrow is the range-selection gesture, and it belongs to the
          // components that have ranges.
          if (event.shiftKey) return;
          // `Ctrl`/`Cmd` qualifies Home and End and nothing else: Ctrl+Arrow is
          // the browser's, and a grid that swallowed it would break word-jumping
          // for everything around it.
          if (modified && event.key !== "Home" && event.key !== "End") return;

          const action = getGridKeyAction(event.key, { ctrlKey: modified, dir });
          if (action === null) return;
          event.preventDefault();
          send({ type: "GRID.NAVIGATE", action });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.shiftKey || event.key !== " " || cellDisabled) return;
          send({ type: "CELL.CLICK", value: cell });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "CELL.FOCUS", value: cell });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "GRID.BLUR" });
        },
      });
    },
  };
}
