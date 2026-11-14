/**
 * The node half of `tooltip`: no document anywhere, including for the open state.
 *
 * The tooltip is the first component whose behaviour depends on what the *other*
 * instances on the page are doing, so this file has two jobs rather than one. The
 * usual promise — connect and run with no DOM — and the store, which is pure
 * enough to prove here on a document that is nothing but a `defaultView` and two
 * timer functions. Everything that needs a real engine — the delay under real
 * pointers, the layer stack, the position — is in `tooltip.browser.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./tooltip.connect";
import { machine } from "./tooltip.machine";
import { hideTooltip, isTooltipWarm, showTooltip } from "./tooltip.store";
import type { TooltipApi, TooltipMachineProps, TooltipSchema } from "./tooltip.types";

type Api = TooltipApi<PlainPropTypes>;

const build = (props: TooltipMachineProps = {}) =>
  connectWithoutDom<TooltipSchema, Api>({ machine, connect, id: "t1", props });

describe("tooltip without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server with the role and the placement it was asked for", () => {
    const harness = build({ defaultOpen: true, placement: "right-start" });
    const content = harness.api().getContentProps();

    expect(harness.service.status()).toBe("not-started");
    expect(content.role).toBe("tooltip");
    expect(content["data-state"]).toBe("open");
    // Seeded from the prop, not from a default the first measurement contradicts.
    expect(content["data-side"]).toBe("right");
    expect(content["data-align"]).toBe("start");
  });

  it("has no arrow, no anchor and no way in — three parts, and that is the component", () => {
    const api = build().api();

    expect(Object.keys(api).filter((key) => key.startsWith("get"))).toEqual([
      "getTriggerProps",
      "getPositionerProps",
      "getContentProps",
    ]);
    // Never focusable: `role="tooltip"` has no interactive contents by definition.
    expect(api.getContentProps().tabIndex).toBeUndefined();
  });

  it("describes its trigger only while open, and never names it", () => {
    const closed = build().api().getTriggerProps();
    const open = build({ defaultOpen: true }).api().getTriggerProps();

    // A dangling IDREF describes nothing.
    expect(closed["aria-describedby"]).toBeUndefined();
    expect(closed["data-state"]).toBe("closed");
    expect(open["aria-describedby"]).toBe("tooltip:t1:content");
    // Adds to the name, never replaces it.
    expect(open["aria-label"]).toBeUndefined();
    expect(open["aria-labelledby"]).toBeUndefined();
  });

  it("disables the tooltip and not the control it hangs off", () => {
    // A disabled control is exactly the one whose tooltip explains why.
    const trigger = build({ disabled: true }).api().getTriggerProps();

    expect(trigger.disabled).toBeUndefined();
    expect(trigger["data-disabled"]).toBe("");
  });

  it("starts and stops in the open state without reaching for a document", () => {
    const harness = build({ defaultOpen: true });

    expect(() => harness.service.start()).not.toThrow();
    expect(harness.service.state.get()).toBe("open");
    expect(() => harness.service.stop()).not.toThrow();
  });

  it("takes the open delay from the props, both of them", () => {
    const harness = build({ openDelay: 120, warmDelay: 20, warmDuration: 900 });

    expect(harness.service.prop("openDelay")).toBe(120);
    expect(harness.service.prop("warmDelay")).toBe(20);
    expect(harness.service.prop("warmDuration")).toBe(900);
    // motion.md §2.4, and the third is this library's decision.
    expect(build().service.prop("openDelay")).toBe(700);
    expect(build().service.prop("warmDelay")).toBe(300);
    expect(build().service.prop("warmDuration")).toBe(300);
  });
});

/**
 * A document that is nothing but a view and two timers. The store never reads a
 * node — it is a `WeakMap` key and a `setTimeout` — so this is the whole surface
 * it touches, and driving it here is what makes the cooldown testable without
 * waiting on a real clock.
 */
function fakeDocument(): Document {
  const win = { setTimeout, clearTimeout } as unknown as Window;
  return { defaultView: win } as unknown as Document;
}

describe("the tooltip store", () => {
  let doc: Document;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = fakeDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers cold for a document nothing has ever shown a tooltip in", () => {
    expect(isTooltipWarm(doc)).toBe(false);
  });

  it("closes the one that was up when the next opens", () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();

    showTooltip(doc, "a", closeFirst);
    showTooltip(doc, "b", closeSecond);

    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).not.toHaveBeenCalled();
  });

  it("does not close the one that is already up when it re-registers", () => {
    const close = vi.fn();

    showTooltip(doc, "a", close);
    showTooltip(doc, "a", close);

    expect(close).not.toHaveBeenCalled();
  });

  it("stays warm for the cooldown after the last one closed, then goes cold", () => {
    showTooltip(doc, "a", vi.fn());
    hideTooltip(doc, "a", 300);
    expect(isTooltipWarm(doc)).toBe(true);

    vi.advanceTimersByTime(299);
    expect(isTooltipWarm(doc)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isTooltipWarm(doc)).toBe(false);
  });

  it("is warm while one is up, which is the handover case the short delay exists for", () => {
    showTooltip(doc, "a", vi.fn());

    expect(isTooltipWarm(doc)).toBe(true);
  });

  it("ignores a release from a tooltip that no longer holds the slot", () => {
    // The handover order: `showTooltip` swaps first and tells the loser second,
    // so the loser's own teardown must not start a cooldown for the winner.
    const closeFirst = vi.fn();
    showTooltip(doc, "a", closeFirst);
    showTooltip(doc, "b", vi.fn());

    hideTooltip(doc, "a", 300);

    expect(isTooltipWarm(doc)).toBe(true);
    vi.advanceTimersByTime(1000);
    // Still warm: "b" is up, and nothing "a" did was allowed to end that.
    expect(isTooltipWarm(doc)).toBe(true);
  });

  it("goes cold immediately when the cooldown is zero", () => {
    showTooltip(doc, "a", vi.fn());
    hideTooltip(doc, "a", 0);

    expect(isTooltipWarm(doc)).toBe(false);
  });

  it("keeps two documents apart", () => {
    const other = fakeDocument();
    showTooltip(doc, "a", vi.fn());

    expect(isTooltipWarm(doc)).toBe(true);
    expect(isTooltipWarm(other)).toBe(false);
  });
});
