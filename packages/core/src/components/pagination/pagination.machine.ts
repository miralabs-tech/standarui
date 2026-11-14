/**
 * A pagination has no lifecycle — one state, everything on the root `on:`, the
 * same shape as `toggle-group` and `tabs`. Three decisions are worth stating.
 *
 * **The clamped page is a computed, never a write.** A controlled consumer may
 * hold `page` out of bounds; `computed.page` is what every reader sees, and the
 * watch below only *asks* for the correction (`onPageChange`) the way
 * `tabs.syncTriggers` re-settles a dangling value.
 *
 * **The focus never moves on a page step.** Whoever clicked `nextTrigger` is
 * already on it, and whoever pulled RT from an item keeps their focus where it
 * is — the `tabs.stepValue` doctrine, simpler here because there is no follow.
 *
 * **LT/RT, not LB/RB.** The shoulder pair is `tabNext`/`tabPrev` and `tabs`
 * already captures it from anywhere in its root; a pagination inside a tab
 * panel that took the same pair would steal the tab change. The triggers that
 * are literally named `pageUp`/`pageDown` are the ones consumed here, and only
 * while the focus is inside the nav (`ownsFocus`) — outside it, PageUp/PageDown
 * keep their first meaning, scrolling the page.
 */

import { focusElement, getInputModality, trackInputModality } from "@standarx/nav";
import { getNextIndex } from "../../focus/roving-focus";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import type { InputModality } from "../../types";
import { getControlEls, getRootEl, ownsFocus } from "./pagination.dom";
import type { PaginationPageItem, PaginationSchema } from "./pagination.types";

type Params = MachineParams<PaginationSchema>;

function pageRange(from: number, to: number): PaginationPageItem[] {
  const items: PaginationPageItem[] = [];
  for (let value = from; value <= to; value++) items.push({ type: "page", value });
  return items;
}

/**
 * The truncation model (spec §5, normative — the MUI shape with `boundaryCount`
 * added). Its guaranteed property, tested exhaustively: past the threshold the
 * model's length is constant (`2b + 2s + 3`) whatever the page — the bar never
 * changes its number of cells while navigating, only what the cells hold, which
 * with `tabular-nums` is what keeps the sheet stable without a measurement.
 *
 * Private on purpose: one consumer, and the 2026-08-28 rule only applies to
 * modules that are *split out* — extracting this would cost a budget line and a
 * second gzip dictionary for nothing (the `utils/range` lesson).
 */
function getPageItems(
  page: number,
  totalPages: number,
  siblingCount: number,
  boundaryCount: number,
): PaginationPageItem[] {
  const s = Math.max(0, Math.floor(siblingCount));
  const b = Math.max(0, Math.floor(boundaryCount));

  if (totalPages <= 2 * b + 2 * s + 3) return pageRange(1, totalPages);

  const siblingsStart = Math.max(Math.min(page - s, totalPages - b - 2 * s - 1), b + 2);
  const siblingsEnd = Math.min(Math.max(page + s, b + 2 * s + 2), totalPages - b - 1);

  return [
    ...pageRange(1, b),
    siblingsStart > b + 2
      ? ({ type: "ellipsis" } as const)
      : ({ type: "page", value: b + 1 } as const),
    ...pageRange(siblingsStart, siblingsEnd),
    siblingsEnd < totalPages - b - 1
      ? ({ type: "ellipsis" } as const)
      : ({ type: "page", value: totalPages - b } as const),
    ...pageRange(totalPages - b + 1, totalPages),
  ];
}

/**
 * The one place `page` is written. Clamps to `[1, totalPages]`, returns early
 * when nothing changes — the bindable resolves controlled/uncontrolled and
 * emits `onPageChange` itself. `totalPages` can be handed in for the one caller
 * (`setPageSize`) whose ceiling is not yet readable from context: a controlled
 * `pageSize` does not move on `context.set`, and clamping the reflowed page
 * against the stale ceiling would throw away the "first visible item stays
 * visible" promise exactly when the size shrinks.
 */
function commitPage(params: Params, page: number, totalPages?: number): void {
  const { context, computed } = params;
  const total = totalPages ?? computed("totalPages");
  const clamped = Math.min(Math.max(page, 1), total);
  if (clamped === context.get("page")) return;
  context.set("page", clamped);
}

export const machine: Machine<PaginationSchema> = createMachine<PaginationSchema>({
  props({ props }) {
    return {
      count: 0,
      defaultPage: 1,
      defaultPageSize: 10,
      siblingCount: 1,
      boundaryCount: 1,
      type: "button",
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable, getContext }) {
    return {
      page: bindable<number>(() => ({
        defaultValue: prop("defaultPage"),
        value: prop("page"),
        onChange: (page) =>
          prop("onPageChange")?.({ page, pageSize: getContext().get("pageSize") }),
        debugLabel: "pagination page",
      })),
      pageSize: bindable<number>(() => ({
        defaultValue: prop("defaultPageSize"),
        value: prop("pageSize"),
        onChange: (pageSize) => prop("onPageSizeChange")?.({ pageSize }),
        debugLabel: "pagination pageSize",
      })),
      focusedValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      pressedValue: bindable<string | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    totalPages: ({ prop, context }) =>
      Math.max(1, Math.ceil(prop("count") / Math.max(1, context.get("pageSize")))),
    page: ({ context, computed }) =>
      Math.min(Math.max(context.get("page"), 1), computed("totalPages")),
    pages: ({ prop, computed }) =>
      getPageItems(
        computed("page"),
        computed("totalPages"),
        prop("siblingCount"),
        prop("boundaryCount"),
      ),
    pageRange: ({ prop, context, computed }) => {
      const size = context.get("pageSize");
      const page = computed("page");
      return { start: (page - 1) * size, end: Math.min(page * size, prop("count")) };
    },
    canPrev: ({ prop, computed }) => !prop("disabled") && computed("page") > 1,
    canNext: ({ prop, computed }) => !prop("disabled") && computed("page") < computed("totalPages"),
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "captureIntents"],

  watch({ prop, context, track, action }) {
    // A page left dangling by a shrinking `count` or a changed `pageSize` is
    // re-clamped; for a controlled consumer this emits a corrective
    // `onPageChange` — the same re-settle policy as `tabs.syncTriggers`.
    track(
      () => [prop("count"), context.get("pageSize")],
      () => action(["clampPage"]),
    );
  },

  on: {
    "ITEM.CLICK": { guard: "isInteractive", actions: ["setPage"] },
    "PREV.CLICK": { guard: "canPrev", actions: ["stepPrev"] },
    "PAGE.PREV": { guard: "canPrev", actions: ["stepPrev"] },
    "NEXT.CLICK": { guard: "canNext", actions: ["stepNext"] },
    "PAGE.NEXT": { guard: "canNext", actions: ["stepNext"] },
    // Not gated, like `VALUE.SET` on tabs: the api is the consumer's own hand.
    "PAGE.SET": { actions: ["setPage"] },
    "PAGESIZE.SET": { actions: ["setPageSize"] },
    "ROOT.FOCUS": { actions: ["setFocused"] },
    "ROOT.BLUR": { actions: ["clearFocused", "clearPressed"] },
    "ROOT.PRESS_START": { guard: "isInteractive", actions: ["setPressed"] },
    "ROOT.PRESS_END": { actions: ["clearPressed"] },
    "ROOT.NAVIGATE": { guard: "isInteractive", actions: ["navigate"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
      canPrev: ({ computed }) => computed("canPrev"),
      canNext: ({ computed }) => computed("canNext"),
    },

    actions: {
      setPage(params) {
        const { event } = params;
        if (event.type === "ITEM.CLICK" || event.type === "PAGE.SET") {
          commitPage(params, event.page);
        }
      },

      stepPrev(params) {
        commitPage(params, params.computed("page") - 1);
      },

      stepNext(params) {
        commitPage(params, params.computed("page") + 1);
      },

      /**
       * The first visible item stays visible: the new page is the one that
       * holds the old range's `start` at the new size. The size is written
       * first (it emits `onPageSizeChange`), the reflowed page second.
       */
      setPageSize(params) {
        const { prop, context, computed, event } = params;
        if (event.type !== "PAGESIZE.SET") return;
        const size = Math.max(1, Math.floor(event.size));
        if (size === context.get("pageSize")) return;
        const start = computed("pageRange").start;
        context.set("pageSize", size);
        const total = Math.max(1, Math.ceil(prop("count") / size));
        commitPage(params, Math.floor(start / size) + 1, total);
      },

      clampPage(params) {
        commitPage(params, params.computed("page"));
      },

      setFocused({ context, event, scope }) {
        if (event.type !== "ROOT.FOCUS") return;
        context.set("focusedValue", event.value);
        // Read here and held: an arrow key moving between controls is a new
        // focus, so the source follows a keyboard user across the nav, while a
        // mouse merely crossing the page never touches it.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocused({ context }) {
        context.set("focusedValue", null);
        context.set("focusSource", null);
      },

      setPressed({ context, event }) {
        if (event.type !== "ROOT.PRESS_START") return;
        context.set("pressedValue", event.value);
      },

      clearPressed({ context }) {
        context.set("pressedValue", null);
      },

      /**
       * Moves the focus and nothing else, over the real controls in DOM order.
       * `loop: false` and not configurable: a pagination has hard ends. The
       * `aria-disabled` triggers stay targets — they are focusable by design
       * (§2), so no `isDisabled` filter is handed to the arithmetic.
       */
      navigate({ scope, event }) {
        if (event.type !== "ROOT.NAVIGATE") return;
        const controls = getControlEls(scope);
        const active = scope.getActiveElement();
        const current = active === null ? -1 : controls.indexOf(active);
        const next = getNextIndex(current, event.action, {
          count: controls.length,
          loop: false,
        });
        const target = controls[next];
        if (target === undefined || next === current) return;
        focusElement(target);
      },
    },

    effects: {
      // No listener: the source is read once, when the focus lands. Holding the
      // handle is the whole job — the tracker has to be running before the
      // first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      /**
       * LT/RT as `pageUp`/`pageDown`, gated on the focus being *inside* the nav
       * — unlike tabs' LB/RB, which reach in from the whole root. At a bound the
       * intent is consumed anyway (`return true` after the guard declines the
       * send): a user "in" the pagination leaning on LT must not see the page
       * scroll by surprise. Neither `trapped` nor `base`, for tabs' reasons,
       * word for word. The `preventDefault` here is what the connect's keyboard
       * guard reads to avoid playing the same step twice.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        if (host === null || host === undefined) return;
        return host.pushScope(
          (event) => {
            if (event.intent !== "pageUp" && event.intent !== "pageDown") return false;
            if (prop("disabled") || !ownsFocus(scope)) return false;
            send({ type: event.intent === "pageDown" ? "PAGE.NEXT" : "PAGE.PREV" });
            event.preventDefault();
            return true;
          },
          { within: getRootEl(scope) },
        );
      },
    },
  },
});
