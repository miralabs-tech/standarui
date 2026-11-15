/**
 * A month grid with one state, and that single `idle` is the whole argument for
 * `calendar` being its own component: an inline calendar has no surface, so it
 * pays none of the eight effects a `date-picker` installs on `open`.
 * The picker will hold one of these; it will not
 * be one of these.
 *
 * **`focusedValue` is the page.** Nothing stores which month is on screen — the
 * grid is derived from the anchor, so an arrow key that lands on a day of the
 * next month *is* the pagination, and the APG's "move by day across the month
 * boundary" falls out instead of being coded. It also means one clamp, in
 * `commitFocus`, covers every way the focus can move.
 *
 * **The collection is computed, not read from the DOM** — the one composite here
 * that is. `dom-collection` exists for lists whose items a consumer renders
 * conditionally; a month has exactly the days it has, and reading them back off
 * the page would be asking the DOM to confirm arithmetic.
 *
 * **The clock is read once and marked twice.** `focusedValue` falls back to the
 * month of *a* today because a page has to be chosen before anything is
 * rendered; `data-today` waits for `ENVIRONMENT.SYNC`, which only ever runs on a
 * client. A server in UTC and a reader in `Pacific/Auckland` disagree about the
 * day, and that disagreement is a hydration warning on every page (§4.2).
 */

import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { getGridKeyAction, getGridNextIndex } from "../../collection/grid-collection";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement, getInputModality, trackInputModality } from "../../nav";
import type { Direction, InputModality, NavigationIntent } from "../../types";
import { getToday, resolveFirstDayOfWeek } from "../../utils/date-format";
import { shallowEqual } from "../../utils/equality";
import {
  clampDate,
  compareDates,
  type DateValue,
  endOfMonth,
  startOfMonth,
} from "../../utils/plain-date";
import { getCellEl, getRootEl, isFocusInGrid, ownsFocus } from "./calendar.dom";
import {
  type CalendarCellReach,
  findTabStop,
  focusFromCell,
  formatPageCaption,
  getColumns,
  getFocusedCell,
  getPageBounds,
  getPageCells,
  isCellDisabled,
  isCellUnreachable,
  isOutsidePage,
  isSameCell,
  pageCell,
  stepCell,
} from "./calendar.page";
import type { CalendarSchema, CalendarView } from "./calendar.types";

type Params = MachineParams<CalendarSchema>;

/** The d-pad arrives physical, so it borrows the arrow keys' own RTL mirror. */
const INTENT_KEYS: Partial<Record<NavigationIntent, string>> = {
  moveUp: "ArrowUp",
  moveDown: "ArrowDown",
  moveLeft: "ArrowLeft",
  moveRight: "ArrowRight",
};

/**
 * Whether a date can hold the focus. Deliberately not the same question as
 * whether it can be chosen: `readOnly` stops a value from changing and has no
 * business stopping a reader from walking the month.
 */
function isFocusable(params: Params, anchor: DateValue): boolean {
  return !isCellDisabled(reachOf(params), anchor);
}

/** The grid's own predicate: a cell nobody can see is a cell nobody can reach. */
function isGridCellDisabled(params: Params, cell: DateValue): boolean {
  return isCellUnreachable(reachOf(params), cell);
}

/** The premises both predicates read, gathered once — see `calendar.page.ts`. */
function reachOf({ context, prop }: Params): CalendarCellReach {
  return {
    view: context.get("view"),
    focused: context.get("focusedValue"),
    outsideDays: prop("outsideDays"),
    disabled: prop("disabled") === true,
    min: prop("min"),
    max: prop("max"),
    isDateUnavailable: prop("isDateUnavailable"),
  };
}

/**
 * The one writer of `focusedValue`, so the motion hint and the bounds cannot
 * disagree with it. `direction` is set only when the *page* changed — a step
 * from Tuesday to Wednesday is not a journey, and a sheet that animated it would
 * slide the whole month under the reader's finger.
 */
function commitFocus(params: Params, next: DateValue): void {
  const { context, prop, refs, scope } = params;
  const view = context.get("view");
  const previous = context.get("focusedValue");
  const clamped = clampDate(next, prop("min"), prop("max"));
  const [start] = getPageBounds(view, previous);
  const [nextStart] = getPageBounds(view, clamped);
  const paged = compareDates(start, nextStart) !== 0;

  context.set(
    "direction",
    paged ? (compareDates(clamped, previous) > 0 ? "forward" : "backward") : null,
  );
  // Captured here and spent after the commit. A new month is a new set of cells,
  // so the adapter destroys the element the focus was on — and the engines
  // disagree about whether removing a focused node fires a blur at all. Asking
  // the DOM from the watcher would therefore be asking after the answer had been
  // erased; asking now, while the old cell is still in the document, is the same
  // arrangement the dialog's `captureFinalFocus` makes.
  if (!shallowEqual(clamped, previous)) refs.set("pendingFocus", isFocusInGrid(scope));
  context.set("focusedValue", clamped);
}

function setView(params: Params, view: CalendarView): void {
  const { context, refs, scope } = params;
  if (context.get("view") !== view) refs.set("pendingFocus", isFocusInGrid(scope));
  context.set("view", view);
}

/** How far one arrow travels off the edge of the page, in the view's own unit. */
function stepOffPage(params: Params, action: string, columns: number): DateValue | undefined {
  const amounts: Readonly<Record<string, number>> = {
    left: -1,
    right: 1,
    up: -columns,
    down: columns,
  };
  const amount = amounts[action];
  if (amount === undefined) return undefined;
  return stepCell(params.context.get("view"), params.context.get("focusedValue"), amount);
}

export const machine: Machine<CalendarSchema> = createMachine<CalendarSchema>({
  props({ props }) {
    return {
      defaultView: "day",
      views: ["day", "month", "year"],
      outsideDays: "visible",
      fixedWeeks: false,
      weekNumbers: false,
      readOnly: false,
      disabled: false,
      autoFocus: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    // Read once for the life of the service: `context` runs once, while every
    // `init` below is re-invoked on each read, so an `Intl` call placed inside
    // one would be paid on every property access. `startOfMonth` is what narrows
    // the SSR divergence to a month boundary — the markup depends on the page,
    // not on the day.
    const fallbackFocus = startOfMonth(prop("today") ?? getToday());

    return {
      value: bindable<DateValue | null>(() => ({
        defaultValue: prop("defaultValue") ?? null,
        value: prop("value"),
        // Without it a value that round-trips back structurally identical is a
        // fresh object, so every recomputation would notify and the adapter
        // would render 42 cells for nothing.
        isEqual: shallowEqual,
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "calendar value",
      })),
      focusedValue: bindable<DateValue>(() => ({
        defaultValue: clampDate(
          prop("defaultFocusedValue") ?? prop("value") ?? prop("defaultValue") ?? fallbackFocus,
          prop("min"),
          prop("max"),
        ),
        value: prop("focusedValue"),
        isEqual: shallowEqual,
        onChange: (value) => prop("onFocusChange")?.({ value }),
        debugLabel: "calendar focusedValue",
      })),
      view: bindable<CalendarView>(() => ({
        defaultValue: prop("defaultView"),
        value: prop("view"),
        onChange: (view) => prop("onViewChange")?.({ view }),
        debugLabel: "calendar view",
      })),
      today: bindable<DateValue | null>(() => ({
        defaultValue: null,
        value: prop("today"),
        isEqual: shallowEqual,
      })),
      direction: bindable<"forward" | "backward" | null>(() => ({ defaultValue: null })),
      locale: bindable<string | null>(() => ({ defaultValue: null })),
      dir: bindable<Direction | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  refs() {
    return { announcer: null, lastCaption: null, pendingFocus: false };
  },

  computed: {
    locale: ({ prop, context }) => prop("locale") ?? context.get("locale") ?? "en-US",
    dir: ({ prop, context }) => prop("dir") ?? context.get("dir") ?? "ltr",
    firstDayOfWeek: ({ prop, computed }) =>
      prop("firstDayOfWeek") ?? resolveFirstDayOfWeek(computed("locale")),
    columns: ({ context }) => getColumns(context.get("view")),
    cells: ({ prop, context, computed }) =>
      getPageCells(context.get("view"), context.get("focusedValue"), {
        firstDayOfWeek: computed("firstDayOfWeek"),
        fixedWeeks: prop("fixedWeeks"),
      }),
    caption: ({ context, computed }) =>
      formatPageCaption(context.get("view"), context.get("focusedValue"), computed("locale")),
  },

  initialState() {
    return "idle";
  },

  effects: ["trackEnvironment", "trackModality", "mountAnnouncer", "captureIntents"],

  entry: ["settleFocus", "autoFocusCell"],

  watch({ context, track, action }) {
    // The focus is moved from a watcher and not from the action that caused it,
    // because the cell it has to land on may not exist yet: paging renders a new
    // month, and an adapter commits the DOM before it plays its watchers
    // (architecture.md). `focusCell` declines unless the grid already holds the
    // focus, so a controlled page change never steals it.
    track(
      () => [context.get("focusedValue"), context.get("view")],
      () => action(["focusCell"]),
    );
  },

  on: {
    "CELL.CLICK": { guard: "isEnabled", actions: ["selectCell", "announceCaption"] },
    "CELL.FOCUS": { actions: ["setFocusedValue"] },
    "GRID.NAVIGATE": { guard: "isEnabled", actions: ["moveFocus", "announceCaption"] },
    "GRID.PAGE": { guard: "isEnabled", actions: ["pageFocus", "announceCaption"] },
    "GRID.BLUR": { actions: ["clearFocusSource"] },
    "PREV.CLICK": {
      guard: "canPageBackward",
      actions: ["pageFocus", "announceCaption"],
    },
    "NEXT.CLICK": { guard: "canPageForward", actions: ["pageFocus", "announceCaption"] },
    "VIEW.TOGGLE": { guard: "isEnabled", actions: ["cycleView", "announceCaption"] },
    "VIEW.SET": { actions: ["setView", "announceCaption"] },
    "VALUE.SET": { actions: ["setValue"] },
    "FOCUS.SET": { actions: ["setFocusedValue", "announceCaption"] },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),

      canPageBackward(params) {
        const { context, prop } = params;
        if (prop("disabled")) return false;
        const min = prop("min");
        if (min === null || min === undefined) return true;
        return (
          compareDates(min, getPageBounds(context.get("view"), context.get("focusedValue"))[0]) < 0
        );
      },

      canPageForward(params) {
        const { context, prop } = params;
        if (prop("disabled")) return false;
        const max = prop("max");
        if (max === null || max === undefined) return true;
        return (
          compareDates(max, getPageBounds(context.get("view"), context.get("focusedValue"))[1]) > 0
        );
      },
    },

    actions: {
      /**
       * One event, two meanings, and the view is what tells them apart. In the
       * month and year views a click is *navigation* — it moves the anchor and
       * opens the finer view — so `readOnly` does not decline it: nothing about
       * the value changes.
       */
      selectCell(params) {
        const { context, prop, event } = params;
        if (event.type !== "CELL.CLICK") return;
        const view = context.get("view");
        const anchor = focusFromCell(view, context.get("focusedValue"), event.value);
        if (!isFocusable(params, anchor)) return;

        if (view !== "day") {
          commitFocus(params, anchor);
          setView(params, view === "year" ? "month" : "day");
          return;
        }
        if (prop("readOnly")) return;
        commitFocus(params, anchor);
        context.set("value", anchor);
      },

      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },

      setFocusedValue(params) {
        const { context, event, scope } = params;
        if (event.type === "FOCUS.SET") {
          commitFocus(params, event.value);
          return;
        }
        if (event.type !== "CELL.FOCUS") return;
        // Read where the focus landed and held until it leaves: the modality of
        // *now* flips to pointer after 300 ms of mouse movement whether or not
        // the focus moved.
        if (scope.getRootNode() !== null) {
          context.set("focusSource", getInputModality(scope.getDoc()));
        }
        const focused = context.get("focusedValue");
        const anchor = focusFromCell(context.get("view"), focused, event.value);
        // A focus landing on the cell that is already the anchor is this
        // machine's own doing — `focusCell` just put it there — and committing it
        // again would clear `data-direction` on the very frame the new month is
        // meant to slide in on.
        if (!shallowEqual(anchor, focused)) commitFocus(params, anchor);
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      /**
       * The grid answers first, so a disabled date is stepped over rather than
       * swallowing the key (`getGridNextIndex` and its anti-loop `seen` set). It
       * stops at its own edges, though, and a month does not: when the grid says
       * "nowhere to go", the same arrow is spent as arithmetic instead, which is
       * how ArrowLeft on the 1st reaches the last day of the month before.
       */
      moveFocus(params) {
        const { context, computed, event } = params;
        if (event.type !== "GRID.NAVIGATE") return;
        const view = context.get("view");
        const focused = context.get("focusedValue");
        // Ctrl+Home and Ctrl+End mean the first and last day of the *month*, not
        // the first and last cell of the grid: those two belong to the
        // neighbouring months, and landing on one would page away from the very
        // month being bounded. A bound is a destination and not a direction, so
        // there is nothing to step over here — `commitFocus`'s clamp is what
        // answers for `min` and `max`.
        if (view === "day" && (event.action === "gridStart" || event.action === "gridEnd")) {
          commitFocus(
            params,
            event.action === "gridStart" ? startOfMonth(focused) : endOfMonth(focused),
          );
          return;
        }

        const cells = computed("cells");
        const columns = computed("columns");
        const index = cells.findIndex((cell) => isSameCell(view, cell, focused));

        const next = getGridNextIndex(index, event.action, {
          count: cells.length,
          columns,
          isDisabled: (position) => {
            const cell = cells[position];
            return cell === undefined || isGridCellDisabled(params, cell);
          },
        });

        const cell = next === index ? undefined : cells[next];
        const anchor =
          cell === undefined
            ? stepOffPage(params, event.action, columns)
            : focusFromCell(view, focused, cell);
        if (anchor === undefined || !isFocusable(params, anchor)) return;
        commitFocus(params, anchor);
      },

      pageFocus(params) {
        const { context, event } = params;
        const step = event.type === "GRID.PAGE" ? event.step : event.type === "PREV.CLICK" ? -1 : 1;
        const big = event.type === "GRID.PAGE" && event.big;
        commitFocus(params, pageCell(context.get("view"), context.get("focusedValue"), step, big));
      },

      /**
       * The chevron in the header is a disclosure, so it
       * opens one step coarser and closes all the way back — never a three-way
       * rotation the reader has to count through.
       */
      cycleView(params) {
        const { context, prop } = params;
        const views = prop("views");
        const current = context.get("view");
        if (current !== "day") {
          setView(params, "day");
          return;
        }
        const next = views[views.indexOf(current) + 1];
        if (next !== undefined) setView(params, next);
      },

      setView(params) {
        if (params.event.type === "VIEW.SET") setView(params, params.event.view);
      },

      focusCell({ context, refs, scope }) {
        // Only when the grid held the focus at the moment the anchor moved: a
        // controlled page change, or a click on the header's own button, must
        // not drag the caret into the grid. The flag is spent on use.
        if (!refs.get("pendingFocus")) return;
        refs.set("pendingFocus", false);
        focusElement(
          getCellEl(scope, getFocusedCell(context.get("view"), context.get("focusedValue"))),
        );
      },

      /**
       * The anchor a consumer handed down may be a date nobody can choose, and
       * the arrows start from wherever the anchor is — so it is settled once, at
       * mount, onto the same cell `connect` already gave the tab stop to. The two
       * agree by construction: both ask `findTabStop`.
       */
      settleFocus(params) {
        const { computed, context } = params;
        const focused = context.get("focusedValue");
        if (isFocusable(params, focused)) return;
        const view = context.get("view");
        const target = findTabStop(
          computed("cells"),
          (cell) => isGridCellDisabled(params, cell),
          (cell) => isOutsidePage(view, focused, cell),
        );
        if (target === undefined) return;
        commitFocus(params, focusFromCell(view, focused, target));
      },

      autoFocusCell({ context, prop, scope }) {
        if (!prop("autoFocus")) return;
        focusElement(
          getCellEl(scope, getFocusedCell(context.get("view"), context.get("focusedValue"))),
        );
      },

      /**
       * Once per page, and by the announcer rather than by an `aria-live` on the
       * caption: the caption is already the grid's accessible name, so a live
       * region on it would make a screen reader say the month twice.
       */
      announceCaption({ refs, computed }) {
        const caption = computed("caption");
        if (refs.get("lastCaption") === caption) return;
        refs.set("lastCaption", caption);
        refs.get("announcer")?.announce(caption);
      },

      syncEnvironment({ context, event, prop }) {
        if (event.type !== "ENVIRONMENT.SYNC") return;
        context.set("locale", event.locale);
        context.set("dir", event.dir);
        // The clock, read on a client and only on a client: `today` is `null`
        // through the server render, so no cell carries `data-today` until the
        // reader's own zone has answered for it.
        context.set("today", prop("today") ?? getToday());
      },
    },

    effects: {
      // No document, no environment — and no clock either: `syncEnvironment` is
      // what first marks a cell as today, so a machine started without a root
      // node stays as honest about the day as the server render was.
      trackEnvironment({ scope, send }) {
        if (scope.getRootNode() === null) return;
        const node = getRootEl(scope);
        const emit = ({ locale, dir }: { locale: string; dir: Direction }): void =>
          send({ type: "ENVIRONMENT.SYNC", locale, dir });
        emit(resolveEnvironment(node));
        return watchEnvironment(node, { onChange: emit });
      },

      // No listener of its own: the source is read when the focus lands. Holding
      // the handle is the whole job — the tracker has to be running before it.
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      mountAnnouncer({ refs, computed, scope }) {
        if (scope.getRootNode() === null) return;
        refs.set("announcer", getLiveAnnouncer(scope.getDoc()));
        // Seeded, so the first arrow key inside the month on screen says nothing:
        // that month has already been read, by the caption itself.
        refs.set("lastCaption", computed("caption"));
        // The two regions are one pair per document, shared with everything else
        // that speaks, so the disposer lets go of the handle and destroys nothing.
        return () => {
          refs.set("announcer", null);
        };
      },

      /**
       * Neither `trapped` nor `base`. A trapping scope answers `consumed` to
       * everything it declines and silences every non-`base` scope under it
       * outside its surface; a calendar is not a surface, and the spatial engine,
       * a `base` scope, would move the focus out of it anyway. `back` is not
       * claimed either: a calendar is not a layer, and one that swallowed B would
       * make the surface holding it impossible to leave.
       *
       * LT/RT and not LB/RB. The keyboard already produces `pageUp`/`pageDown`
       * for "previous month", CDC §4.4 requires the pad to produce the same
       * intent, and LB/RB is the walk *between* composites — a calendar in a tab
       * panel that ate `tabNext` would kill the app's own section switcher.
       */
      captureIntents({ context, computed, prop, scope, send }) {
        const host = prop("intents");
        if (host === null || host === undefined) return;

        return host.pushScope(
          (event) => {
            if (prop("disabled") || !ownsFocus(scope)) return false;

            if (event.intent === "pageUp" || event.intent === "pageDown") {
              send({ type: "GRID.PAGE", step: event.intent === "pageUp" ? -1 : 1, big: false });
              return true;
            }
            if (!isFocusInGrid(scope)) return false;
            if (event.intent === "select") {
              send({ type: "CELL.CLICK", value: context.get("focusedValue") });
              return true;
            }
            const key = INTENT_KEYS[event.intent];
            if (key === undefined) return false;
            const action = getGridKeyAction(key, { dir: computed("dir") });
            if (action === null) return false;
            send({ type: "GRID.NAVIGATE", action });
            return true;
          },
          { within: () => getRootEl(scope) },
        );
      },
    },
  },
});
