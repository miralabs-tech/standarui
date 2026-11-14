/**
 * The node half of `pagination`: no document, no framework — the shape a server
 * render has, plus everything in this component that is genuinely pure, which
 * is more than most: the truncation model, the clamped page, the range and the
 * whole ARIA surface are functions of props alone.
 *
 * What is *not* here is anything that needs the machine running. The machine's
 * two effects (`trackModality`, `captureIntents`) resolve a document the moment
 * `start()` runs, so a node harness cannot start it — the same split `tabs`
 * documents at the head of its own node file. Events, guards, the watch and the
 * focus moves live in `pagination.browser.test.ts`, against a real engine.
 */

import { describe, expect, it } from "vitest";
import type { EventHandler } from "../../machine/prop-types";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./pagination.connect";
import { machine } from "./pagination.machine";
import type { PaginationApi, PaginationMachineProps, PaginationSchema } from "./pagination.types";

type Api = PaginationApi<PlainPropTypes>;

const build = (props: Partial<PaginationMachineProps> = {}) =>
  connectWithoutDom<PaginationSchema, Api>({
    machine,
    connect,
    id: "p1",
    props: { count: 100, ...props },
  });

/** The model, flattened to what a reader sees in the bar. */
function model(api: Api): string[] {
  return api.pages.map((item) => (item.type === "page" ? String(item.value) : "…"));
}

interface FakeKey {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
}

/**
 * A keyboard event with only the fields `connect` reads. What is under test is
 * which keys are claimed, and the answer is arithmetic.
 */
function press(props: Record<string, unknown>, init: FakeKey): boolean {
  let prevented = false;
  const event = {
    key: init.key,
    shiftKey: init.shiftKey === true,
    altKey: init.altKey === true,
    ctrlKey: init.ctrlKey === true,
    metaKey: init.metaKey === true,
    repeat: init.repeat === true,
    defaultPrevented: init.defaultPrevented === true,
    preventDefault(): void {
      prevented = true;
    },
  };
  (props.onKeyDown as EventHandler<KeyboardEvent>)(event as unknown as KeyboardEvent);
  return prevented;
}

describe("pagination without a DOM", () => {
  it("connects on a server, with its defaults materialised", () => {
    const harness = build();
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.service.state.get()).toBe("idle");
    expect(api.page).toBe(1);
    expect(api.pageSize).toBe(10);
    expect(api.totalPages).toBe(10);
    expect(api.isFirstPage).toBe(true);
    expect(api.isLastPage).toBe(false);
    expect(api.pageRange).toEqual({ start: 0, end: 10 });
  });

  it("is a named landmark and a spatial zone", () => {
    const root = build().api().getRootProps();

    expect(root["aria-label"]).toBe("pagination");
    expect(root["data-snav"]).toBe("container");
    // Omitted unless asked for: the region inherits its direction.
    expect(root.dir).toBeUndefined();

    const translated = build({
      dir: "rtl",
      translations: { rootLabel: "Résultats" },
    }).api();
    expect(translated.getRootProps()["aria-label"]).toBe("Résultats");
    expect(translated.getRootProps().dir).toBe("rtl");
  });

  it("labels every item as a page, and the current one as the current page", () => {
    const api = build({ defaultPage: 3 }).api();
    const current = api.getItemProps({ page: 3 });
    const other = api.getItemProps({ page: 4 });

    expect(current.id).toBe("pagination:p1:item:3");
    expect(current["aria-label"]).toBe("page 3");
    expect(current["aria-current"]).toBe("page");
    expect(current["data-current"]).toBe("");
    expect(current["data-value"]).toBe("3");
    expect(current.type).toBe("button");

    expect(other["aria-current"]).toBeUndefined();
    expect(other["data-current"]).toBeUndefined();

    const labelled = build({
      translations: { itemLabel: ({ page, totalPages }) => `page ${page} sur ${totalPages}` },
    }).api();
    expect(labelled.getItemProps({ page: 2 })["aria-label"]).toBe("page 2 sur 10");
  });

  it("keeps every control in the tab order — no roving tabindex", () => {
    // A pagination is a landmark of links/buttons, not an APG composite with a
    // single stop: each control stays individually reachable by Tab.
    const api = build().api();

    expect(api.getItemProps({ page: 2 }).tabIndex).toBeUndefined();
    expect(api.getPrevTriggerProps().tabIndex).toBeUndefined();
    expect(api.getNextTriggerProps().tabIndex).toBeUndefined();
  });

  it("refuses the bounds with aria-disabled, never with the native attribute", () => {
    // Native `disabled` would drop the focus on `body` at the last activation
    // before the bound — the focusable-disabled shape is the default here.
    const first = build({ defaultPage: 1 }).api();
    expect(first.getPrevTriggerProps()["aria-disabled"]).toBe("true");
    expect(first.getPrevTriggerProps()["data-disabled"]).toBe("");
    expect(first.getPrevTriggerProps().disabled).toBeUndefined();
    expect(first.getNextTriggerProps()["aria-disabled"]).toBeUndefined();

    const last = build({ defaultPage: 10 }).api();
    expect(last.getNextTriggerProps()["aria-disabled"]).toBe("true");
    expect(last.getPrevTriggerProps()["aria-disabled"]).toBeUndefined();
    expect(last.getNextTriggerProps().disabled).toBeUndefined();
  });

  it("says disabled on the root and on every control when the nav is disabled", () => {
    const api = build({ disabled: true }).api();

    expect(api.getRootProps()["data-disabled"]).toBe("");
    expect(api.getItemProps({ page: 2 })["data-disabled"]).toBe("");
    expect(api.getPrevTriggerProps()["aria-disabled"]).toBe("true");
    expect(api.getNextTriggerProps()["aria-disabled"]).toBe("true");
    expect(api.getItemProps({ page: 2 }).disabled).toBeUndefined();
  });

  it("hides the ellipsis from the tree and stamps its rank", () => {
    const ellipsis = build().api().getEllipsisProps({ index: 1 });

    expect(ellipsis["aria-hidden"]).toBe("true");
    expect(ellipsis["data-index"]).toBe("1");
    expect(ellipsis.id).toBe("pagination:p1:ellipsis:1");
  });

  it("wears no focus ring until a focus has actually landed", () => {
    const item = build().api().getItemProps({ page: 1 });

    expect(item["data-focus-visible"]).toBeUndefined();
    expect(item["data-focus-source"]).toBeUndefined();
    expect(item["data-pressed"]).toBeUndefined();
  });
});

describe("pagination — the truncation model", () => {
  it("shows everything under the threshold", () => {
    expect(model(build({ count: 50 }).api())).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("truncates the far end from the first page", () => {
    expect(model(build({ page: 1 }).api())).toEqual(["1", "2", "3", "4", "5", "…", "10"]);
  });

  it("truncates both ends from the middle", () => {
    expect(model(build({ page: 5 }).api())).toEqual(["1", "…", "4", "5", "6", "…", "10"]);
  });

  it("mirrors at the far end", () => {
    expect(model(build({ page: 9 }).api())).toEqual(["1", "…", "6", "7", "8", "9", "10"]);
  });

  it("draws no ellipsis at the exact threshold", () => {
    // totalPages = 2b + 2s + 3 = 7 with the defaults.
    const api = build({ count: 70, page: 4 }).api();
    expect(model(api)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("widens with siblingCount", () => {
    expect(model(build({ count: 200, page: 10, siblingCount: 2 }).api())).toEqual([
      "1",
      "…",
      "8",
      "9",
      "10",
      "11",
      "12",
      "…",
      "20",
    ]);
  });

  it("pins more pages with boundaryCount", () => {
    expect(model(build({ count: 200, page: 10, boundaryCount: 2 }).api())).toEqual([
      "1",
      "2",
      "…",
      "9",
      "10",
      "11",
      "…",
      "19",
      "20",
    ]);
  });

  it("collapses to five cells with siblingCount 0 — the 320px shape", () => {
    expect(model(build({ count: 200, page: 4, siblingCount: 0 }).api())).toEqual([
      "1",
      "…",
      "4",
      "…",
      "20",
    ]);
  });

  it("keeps a constant number of cells while navigating", () => {
    // The invariant the sheet stands on: past the threshold the model is always
    // 2b + 2s + 3 cells long, so with tabular numerals the bar never breathes.
    for (let page = 1; page <= 20; page++) {
      expect(build({ count: 200, page }).api().pages).toHaveLength(7);
    }
  });
});

describe("pagination — the clamped truth", () => {
  it("clamps a controlled page into the displayable range", () => {
    const over = build({ count: 50, page: 99 }).api();
    expect(over.page).toBe(5);
    expect(over.isLastPage).toBe(true);
    expect(over.getItemProps({ page: 5 })["aria-current"]).toBe("page");

    expect(build({ count: 50, page: 0 }).api().page).toBe(1);
  });

  it("answers an empty collection with one empty page", () => {
    const api = build({ count: 0 }).api();

    expect(api.totalPages).toBe(1);
    expect(api.page).toBe(1);
    expect(api.pageRange).toEqual({ start: 0, end: 0 });
    expect(api.getPrevTriggerProps()["aria-disabled"]).toBe("true");
    expect(api.getNextTriggerProps()["aria-disabled"]).toBe("true");
  });

  it("ends the range at the collection, not at the page", () => {
    expect(build({ count: 42, page: 5 }).api().pageRange).toEqual({ start: 40, end: 42 });
  });
});

describe("pagination — link mode", () => {
  const link = (props: Partial<PaginationMachineProps> = {}) =>
    build({
      type: "link",
      getPageUrl: ({ page }) => `#page-${page}`,
      defaultPage: 5,
      ...props,
    }).api();

  it("hands every control its href, the current page included", () => {
    const api = link();

    expect(api.getItemProps({ page: 3 }).href).toBe("#page-3");
    // A link to itself: `aria-current` carries the state, the href stays.
    expect(api.getItemProps({ page: 5 }).href).toBe("#page-5");
    expect(api.getItemProps({ page: 5 })["aria-current"]).toBe("page");
    expect(api.getPrevTriggerProps().href).toBe("#page-4");
    expect(api.getNextTriggerProps().href).toBe("#page-6");
  });

  it("renders anchors, not buttons", () => {
    // No `type="button"` on an anchor — the one attribute that would betray
    // the wrong element underneath.
    expect(link().getItemProps({ page: 3 }).type).toBeUndefined();
    expect(link().getPrevTriggerProps().type).toBeUndefined();
  });

  it("clamps the trigger hrefs at the bounds", () => {
    expect(link({ defaultPage: 1 }).getPrevTriggerProps().href).toBe("#page-1");
    expect(link({ defaultPage: 10 }).getNextTriggerProps().href).toBe("#page-10");
  });
});

describe("pagination — the keys it claims", () => {
  const item = (props: Partial<PaginationMachineProps> = {}): Record<string, unknown> =>
    build(props).api().getItemProps({ page: 2 });

  it("claims the horizontal arrows and leaves the vertical ones to the page", () => {
    expect(press(item(), { key: "ArrowRight" })).toBe(true);
    expect(press(item(), { key: "ArrowLeft" })).toBe(true);
    expect(press(item(), { key: "ArrowDown" })).toBe(false);
    expect(press(item(), { key: "ArrowUp" })).toBe(false);
  });

  it("claims the same keys in RTL — the mirror is in the resolution, not the claim", () => {
    expect(press(item({ dir: "rtl" }), { key: "ArrowRight" })).toBe(true);
    expect(press(item({ dir: "rtl" }), { key: "ArrowLeft" })).toBe(true);
  });

  it("claims PageUp and PageDown, and hands Home and End back to the page", () => {
    expect(press(item(), { key: "PageUp" })).toBe(true);
    expect(press(item(), { key: "PageDown" })).toBe(true);

    // Free in a single-tab-stop composite, not free in a `navigation` landmark
    // where every control is already tabbable: the browser binds them to the top
    // and the bottom of the document, and Tab reaches both ends of the bar anyway.
    expect(press(item(), { key: "Home" })).toBe(false);
    expect(press(item(), { key: "End" })).toBe(false);
  });

  it("steps aside when an input system already consumed the key", () => {
    // The anti-double-step gate: a running keymap turns PageUp/PageDown into
    // intents and prevents the native event before this handler sees it.
    expect(press(item(), { key: "PageDown", defaultPrevented: true })).toBe(false);
    expect(press(item(), { key: "ArrowRight", defaultPrevented: true })).toBe(false);
  });

  it("never prevents Enter or Space, so the native activation still happens", () => {
    expect(press(item(), { key: "Enter" })).toBe(false);
    expect(press(item(), { key: " " })).toBe(false);
  });

  it("ignores a modified arrow", () => {
    expect(press(item(), { key: "ArrowRight", shiftKey: true })).toBe(false);
    expect(press(item(), { key: "ArrowRight", altKey: true })).toBe(false);
    expect(press(item(), { key: "ArrowRight", ctrlKey: true })).toBe(false);
    expect(press(item(), { key: "ArrowRight", metaKey: true })).toBe(false);
  });

  it("leaves Escape and Tab alone — a pagination is not a layer", () => {
    expect(press(item(), { key: "Escape" })).toBe(false);
    expect(press(item(), { key: "Tab" })).toBe(false);
  });
});
