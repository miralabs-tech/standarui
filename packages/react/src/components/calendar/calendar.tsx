/**
 * The calendar through React: one machine in the root, thirteen parts, and two
 * structural nodes the adapter owns because HTML has no way for a consumer to
 * skip them.
 *
 * **The `<tbody>` inside `CalendarGrid`.** A `<tr>` may not be a direct child of
 * a `<table>` — React refuses the nesting, and a server render of it would be
 * re-parsed by the browser with a `<tbody>` inserted where React did not put one,
 * which is a hydration mismatch on every page. So the grid renders the row group
 * itself, and every row — the weekday row included — is a row of that one group.
 * `role="grid"` requires a `row` or a `rowgroup`, and this is the latter.
 *
 * **The corner cell of the weekday row, under `weekNumbers`.** A row of week
 * numbers adds a column to the body but not to the header, and without a spacer
 * the header for the last weekday would sit over the second-to-last column —
 * which axe reports, correctly, as a header describing no cells. It is a `<td>`
 * and not an empty `<th>` because an empty header is its own violation, and
 * `aria-hidden` because there is nothing there to announce.
 *
 * Every part defaults its own text — the day number, the month name, the caption
 * — because that text is locale data the machine already holds and a consumer
 * cannot compute without reaching for `Intl` themselves. Pass children to
 * override it.
 */

import type { Service } from "@standarui/core";
import * as calendar from "@standarui/core/calendar";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type CalendarApi = calendar.CalendarApi<ReactPropTypes>;

export interface UseCalendarProps extends calendar.CalendarMachineProps, MachineRuntimeProps {}

const CalendarContext = createPartContext<CalendarApi>("Calendar");

function useCalendarService(props: UseCalendarProps): Service<calendar.CalendarSchema> {
  const host = useIntentScopeHost();

  return useMachine(calendar.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this calendar answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
  });
}

export function useCalendar(props: UseCalendarProps): CalendarApi {
  return calendar.connect(useCalendarService(props), normalizeProps);
}

/** The api of the calendar a subtree sits in — a consumer's own chrome reads it. */
export function useCalendarContext(): CalendarApi {
  return CalendarContext.usePart("CalendarContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "locale",
  "value",
  "defaultValue",
  "focusedValue",
  "defaultFocusedValue",
  "today",
  "min",
  "max",
  "isDateUnavailable",
  "firstDayOfWeek",
  "fixedWeeks",
  "weekNumbers",
  "outsideDays",
  "view",
  "defaultView",
  "views",
  "readOnly",
  "disabled",
  "invalid",
  "labelledBy",
  "describedBy",
  "autoFocus",
  "intents",
  "onValueChange",
  "onFocusChange",
  "onViewChange",
] as const;

export interface CalendarRootProps extends UseCalendarProps, PartProps<"div", UseCalendarProps> {}

export function CalendarRoot(props: CalendarRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useCalendar(inheritFromField(machineProps, field));

  return (
    <CalendarContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </CalendarContext.Provider>
  );
}

export const CalendarLabel: (props: PartProps<"span">) => ReactNode = createPart(CalendarContext, {
  name: "CalendarLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

export const CalendarHeader: (props: PartProps<"div">) => ReactNode = createPart(CalendarContext, {
  name: "CalendarHeader",
  element: "div",
  props: (api) => api.getHeaderProps(),
});

export const CalendarPrevTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  CalendarContext,
  { name: "CalendarPrevTrigger", element: "button", props: (api) => api.getPrevTriggerProps() },
);

export const CalendarNextTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  CalendarContext,
  { name: "CalendarNextTrigger", element: "button", props: (api) => api.getNextTriggerProps() },
);

export const CalendarViewTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  CalendarContext,
  { name: "CalendarViewTrigger", element: "button", props: (api) => api.getViewTriggerProps() },
);

export function CalendarCaption(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = CalendarContext.usePart("CalendarCaption");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getCaptionProps(),
    elementProps,
    children: children === undefined ? api.caption : children,
  });
}

export function CalendarGrid(props: PartProps<"table">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = CalendarContext.usePart("CalendarGrid");

  return useRender({
    render,
    asChild,
    element: "table",
    props: api.getGridProps(),
    elementProps,
    children: <tbody>{children}</tbody>,
  });
}

export function CalendarWeekdayRow(props: PartProps<"tr">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = CalendarContext.usePart("CalendarWeekdayRow");

  const row = useRender({
    render,
    asChild,
    element: "tr",
    props: api.getWeekdayRowProps(),
    elementProps,
    children: (
      <>
        {api.weekNumbers ? <td aria-hidden="true" /> : null}
        {children}
      </>
    ),
  });

  // The month and year views have no day names (`api.weekdays` is empty there),
  // and a header row with no cells is a row that heads nothing: it goes away
  // whole rather than shipping an empty `<tr>` every consumer would have to
  // branch around. Rendered first and dropped after — `useRender` is a hook, and
  // the view changes under the same mounted part.
  return api.weekdays.length === 0 ? null : row;
}

export interface CalendarWeekdayProps
  extends calendar.CalendarWeekdayProps,
    PartProps<"th", calendar.CalendarWeekdayProps> {}

export function CalendarWeekday(props: CalendarWeekdayProps): ReactNode {
  const [weekdayProps, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = CalendarContext.usePart("CalendarWeekday");

  return useRender({
    render,
    asChild,
    element: "th",
    props: api.getWeekdayProps(weekdayProps),
    elementProps: { scope: "col", ...elementProps },
    children: children === undefined ? api.weekdays[weekdayProps.index]?.narrow : children,
  });
}

/**
 * The whole strip of day names, in the locale's own order — what all but a
 * handful of consumers want, on `DateFieldSegments`' pattern: the collection is
 * computed by the machine rather than passed in, so a composed layer, which may
 * call no hook, cannot loop over it. A placer can.
 *
 * It renders no node of its own, so the row around it stays the consumer's to
 * place and to give props to. In the month and year views `api.weekdays` is
 * empty and this renders nothing — `CalendarWeekdayRow` then removes itself,
 * which is why neither this nor a caller needs to branch on the view.
 */
export function CalendarWeekdays(): ReactNode {
  const api = CalendarContext.usePart("CalendarWeekdays");

  return api.weekdays.map((weekday, index) => <CalendarWeekday key={weekday.long} index={index} />);
}

export interface CalendarWeekRowProps
  extends calendar.CalendarWeekRowProps,
    PartProps<"tr", calendar.CalendarWeekRowProps> {}

export function CalendarWeekRow(props: CalendarWeekRowProps): ReactNode {
  const [rowProps, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = CalendarContext.usePart("CalendarWeekRow");

  return useRender({
    render,
    asChild,
    element: "tr",
    props: api.getWeekRowProps(rowProps),
    elementProps,
    children,
  });
}

export interface CalendarWeekNumberProps
  extends calendar.CalendarWeekNumberProps,
    PartProps<"th", calendar.CalendarWeekNumberProps> {}

/**
 * The number is the text and there is no `aria-label`: the library holds no
 * translation table, and a hard-coded "Week" would be shipped into every locale.
 * A consumer who wants one passes their own.
 */
export function CalendarWeekNumber(props: CalendarWeekNumberProps): ReactNode {
  const [numberProps, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = CalendarContext.usePart("CalendarWeekNumber");

  return useRender({
    render,
    asChild,
    element: "th",
    props: api.getWeekNumberProps(numberProps),
    elementProps: { scope: "row", ...elementProps },
    children: children === undefined ? api.getWeekNumber(numberProps.index) : children,
  });
}

export interface CalendarCellProps
  extends calendar.CalendarCellProps,
    PartProps<"td", calendar.CalendarCellProps> {}

/**
 * A date is identified by its value and nothing else. There is no cell trigger
 * inside it: the APG puts the roving `tabindex` on the `gridcell` itself, and 42
 * nested buttons would double the DOM of the densest component in the library.
 */
export function CalendarCell(props: CalendarCellProps): ReactNode {
  const [cellProps, rest] = splitProps(props, ["value", "disabled"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = CalendarContext.usePart("CalendarCell");

  return useRender({
    render,
    asChild,
    element: "td",
    props: api.getCellProps(cellProps),
    elementProps,
    children: children === undefined ? api.getCellText(cellProps.value) : children,
  });
}

/**
 * The body of the grid — every visible week, each as a row of cells, with the
 * week number ahead of them when the calendar shows one. Same reason as
 * `CalendarWeekdays`: `api.weeks` is cut by the machine from the page it
 * computed, so it exists only inside the root and a composed layer cannot loop
 * over it without a hook.
 *
 * This is what `calendar-basic.tsx` and `calendar.browser.test.tsx` each wrote
 * for themselves, down to the `weekNumbers` branch — one placer instead of two
 * copies that could drift.
 *
 * Both keys are dates, which is what the two hand-written copies already did —
 * the row takes its first day rather than its position, so a page change
 * remounts rows and cells together rather than reusing a `<tr>` whose seven
 * children all changed underneath it. The copies reach the first day through a
 * cast; the fallback here is what removes it, and it is unreachable in practice
 * since the machine cuts the page into full weeks.
 */
export function CalendarWeeks(): ReactNode {
  const api = CalendarContext.usePart("CalendarWeeks");

  return api.weeks.map((week, row) => {
    const first = week[0];

    return (
      <CalendarWeekRow
        key={first === undefined ? `week-${row}` : calendar.toISO(first)}
        index={row}
      >
        {api.weekNumbers ? <CalendarWeekNumber index={row} /> : null}
        {week.map((day) => (
          <CalendarCell key={calendar.toISO(day)} value={day} />
        ))}
      </CalendarWeekRow>
    );
  });
}
