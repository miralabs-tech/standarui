/**
 * The node half of `scroll-area`: no document, no framework, the service *started* so
 * that anything reaching for a document in an effect or an action surfaces here. The
 * measures an observer would report are sent by hand as `VIEWPORT.RESIZE`; what needs a
 * real engine — the native scroll, the pointer capture, the focusable probe, the real
 * RTL `scrollLeft`, the accessible name warning — is in the browser tests.
 *
 * The hide timer is the one global `setTimeout` the machine installs, which is what
 * lets fake timers drive it here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./scroll-area.connect";
import { machine } from "./scroll-area.machine";
import type {
  ScrollAreaApi,
  ScrollAreaMachineProps,
  ScrollAreaSchema,
  ScrollAxis,
} from "./scroll-area.types";

type Api = ScrollAreaApi<PlainPropTypes>;

const build = (props: ScrollAreaMachineProps = {}) =>
  connectWithoutDom<ScrollAreaSchema, Api>({ machine, connect, id: "sa1", props });

function run(props: ScrollAreaMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

type Harness = ReturnType<typeof run>;

interface Measure {
  viewportX?: number;
  viewportY?: number;
  contentX?: number;
  contentY?: number;
  offsetX?: number;
  offsetY?: number;
}

function measure(harness: Harness, values: Measure): void {
  harness.service.send({
    type: "VIEWPORT.RESIZE",
    viewportX: 200,
    viewportY: 200,
    contentX: 200,
    contentY: 200,
    offsetX: 0,
    offsetY: 0,
    ...values,
  });
}

function scroll(harness: Harness, offsetY: number, offsetX = 0): void {
  harness.service.send({ type: "VIEWPORT.SCROLL", offsetX, offsetY });
}

function thumb(harness: Harness, orientation: "vertical" | "horizontal" = "vertical") {
  const style = harness.api().getThumbProps({ orientation })["style"] as Record<string, string>;
  return {
    size: parseFloat(style["--sui-scroll-area-thumb-size"] ?? "NaN"),
    offset: parseFloat(style["--sui-scroll-area-thumb-offset"] ?? "NaN"),
  };
}

function offsetOf(harness: Harness, axis: ScrollAxis): number {
  return harness.service.context.get(axis === "x" ? "offsetX" : "offsetY");
}

function startDrag(harness: Harness, offset: number, axis: ScrollAxis = "y"): void {
  harness.service.send({ type: "THUMB.DRAG_START", axis, offset });
}

function drag(harness: Harness, position: number): void {
  harness.service.send({ type: "THUMB.DRAG", position });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("scroll-area — defaults and markup", () => {
  it("resolves its initial state from the props alone, so the server renders the same markup", () => {
    expect(build().service.state.get()).toBe("idle");
  });

  it("defaults to a vertical bar that fades after a second", () => {
    const { service } = build();
    expect(service.prop("orientation")).toBe("vertical");
    expect(service.prop("always")).toBe(false);
    expect(service.prop("hideDelay")).toBe(1000);
    expect(service.prop("dir")).toBeUndefined();
  });

  it("keeps what it is given, and never takes a negative delay", () => {
    const { service } = build({ orientation: "both", always: true, hideDelay: 250 });
    expect(service.prop("orientation")).toBe("both");
    expect(service.prop("always")).toBe(true);
    expect(service.prop("hideDelay")).toBe(250);
    expect(build({ hideDelay: -5 }).service.prop("hideDelay")).toBe(0);
  });

  it("connects on a server with every part named and no style on the structure", () => {
    const api = run().api();
    const root = api.getRootProps();

    expect(root["data-scope"]).toBe("scroll-area");
    expect(root["data-part"]).toBe("scroll-area:root");
    expect(root["data-orientation"]).toBe("vertical");
    expect(root["data-scrolling"]).toBeUndefined();
    expect(root["data-dragging"]).toBeUndefined();
    expect(root["data-always"]).toBeUndefined();
    expect(api.getViewportProps()["data-part"]).toBe("scroll-area:viewport");
    expect(api.getContentProps()["data-part"]).toBe("scroll-area:content");
    expect(api.getScrollbarProps({ orientation: "vertical" })["data-part"]).toBe(
      "scroll-area:scrollbar",
    );
    expect(api.getThumbProps({ orientation: "vertical" })["data-part"]).toBe("scroll-area:thumb");
    expect(api.getCornerProps()["data-part"]).toBe("scroll-area:corner");
    expect(api.getRootProps()["style"]).toBeUndefined();
    expect(api.getViewportProps()["style"]).toBeUndefined();
  });

  it("gives every part, and each bar of the two axes, its own id", () => {
    const api = run().api();
    const ids = [
      api.getRootProps()["id"],
      api.getViewportProps()["id"],
      api.getContentProps()["id"],
      api.getScrollbarProps({ orientation: "vertical" })["id"],
      api.getScrollbarProps({ orientation: "horizontal" })["id"],
      api.getThumbProps({ orientation: "vertical" })["id"],
      api.getThumbProps({ orientation: "horizontal" })["id"],
      api.getCornerProps()["id"],
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hides the bars from the accessibility tree and says which way each one runs", () => {
    const api = run().api();
    const vertical = api.getScrollbarProps({ orientation: "vertical" });
    const horizontal = api.getScrollbarProps({ orientation: "horizontal" });

    expect(vertical["aria-hidden"]).toBe("true");
    expect(vertical["data-orientation"]).toBe("vertical");
    expect(horizontal["aria-hidden"]).toBe("true");
    expect(horizontal["data-orientation"]).toBe("horizontal");
    expect(api.getCornerProps()["aria-hidden"]).toBe("true");
  });

  it("does nothing when asked to scroll before there is a viewport", () => {
    expect(() => run().api().scrollTo({ top: 10, left: 10 })).not.toThrow();
  });
});

describe("scroll-area — overflow and thumb geometry", () => {
  it("reports no overflow until a measure arrives", () => {
    const api = run().api();
    expect(api.overflowX).toBe(false);
    expect(api.overflowY).toBe(false);
  });

  it("sizes the thumb by the share of the content in view, on the track inside its margins", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 1000 });

    expect(thumb(harness).size).toBeCloseTo(38.8, 5);
    expect(thumb(harness).offset).toBe(0);
    expect(harness.api().overflowY).toBe(true);
    expect(harness.api().overflowX).toBe(false);
  });

  it("moves the thumb along its travel in step with the offset, and stops it at the end", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 1000, offsetY: 400 });
    expect(thumb(harness).offset).toBeCloseTo(77.6, 5);

    measure(harness, { viewportY: 200, contentY: 1000, offsetY: 800 });
    expect(thumb(harness).offset).toBeCloseTo(155.2, 5);

    measure(harness, { viewportY: 200, contentY: 1000, offsetY: 5000 });
    expect(thumb(harness).offset).toBeCloseTo(155.2, 5);

    measure(harness, { viewportY: 200, contentY: 1000, offsetY: -30 });
    expect(thumb(harness).offset).toBe(0);
  });

  it("never lets the thumb shrink under 16 px, whatever the length of the content", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 1_000_000 });
    expect(thumb(harness).size).toBe(16);
  });

  it("never lets the thumb outgrow its track", () => {
    const harness = run();
    measure(harness, { viewportY: 20, contentY: 22 });
    expect(thumb(harness).size).toBeLessThanOrEqual(14);
  });

  it("draws no thumb when the content is the size of the view, or a pixel over it", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 200 });
    expect(thumb(harness).size).toBe(0);
    expect(harness.api().overflowY).toBe(false);

    measure(harness, { viewportY: 200, contentY: 201 });
    expect(thumb(harness).size).toBe(0);
    expect(harness.api().overflowY).toBe(false);

    measure(harness, { viewportY: 200, contentY: 202 });
    expect(harness.api().overflowY).toBe(true);
    expect(thumb(harness).size).toBeGreaterThan(0);
  });

  it("measures the two axes apart", () => {
    const harness = run({ orientation: "both" });
    measure(harness, { viewportX: 300, contentX: 900, viewportY: 200, contentY: 200 });

    expect(harness.api().overflowX).toBe(true);
    expect(harness.api().overflowY).toBe(false);
    expect(thumb(harness, "horizontal").size).toBeCloseTo((294 * 300) / 900, 5);
    expect(thumb(harness, "vertical").size).toBe(0);
  });

  it("gives the corner to both bars: each track is shorter by the band while both overflow", () => {
    const harness = run({ orientation: "both" });
    measure(harness, { viewportX: 300, contentX: 900, viewportY: 200, contentY: 1000 });

    expect(harness.api().getCornerProps()["data-state"]).toBe("visible");
    expect(thumb(harness, "vertical").size).toBeCloseTo((182 * 200) / 1000, 5);
    expect(thumb(harness, "horizontal").size).toBeCloseTo((282 * 300) / 900, 5);

    measure(harness, { viewportX: 300, contentX: 300, viewportY: 200, contentY: 1000 });
    expect(harness.api().getCornerProps()["data-state"]).toBe("hidden");
    expect(thumb(harness, "vertical").size).toBeCloseTo((194 * 200) / 1000, 5);
  });

  it("draws no corner for a single bar, however far both axes overflow", () => {
    const harness = run({ orientation: "vertical" });
    measure(harness, { viewportX: 300, contentX: 900, viewportY: 200, contentY: 1000 });
    expect(harness.api().getCornerProps()["data-state"]).toBe("hidden");
    expect(thumb(harness, "vertical").size).toBeCloseTo(38.8, 5);
  });

  it("marks a bar visible only on an axis that overflows", () => {
    const harness = run({ orientation: "both" });
    measure(harness, { viewportY: 200, contentY: 1000 });

    expect(harness.api().getScrollbarProps({ orientation: "vertical" })["data-state"]).toBe(
      "visible",
    );
    expect(harness.api().getScrollbarProps({ orientation: "horizontal" })["data-state"]).toBe(
      "hidden",
    );
    expect(harness.api().getRootProps()["data-overflow-y"]).toBe("");
    expect(harness.api().getRootProps()["data-overflow-x"]).toBeUndefined();
    expect(harness.api().getViewportProps()["data-overflow-y"]).toBe("");
  });

  it("follows a scroll without being measured again", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 1000 });
    scroll(harness, 800);

    expect(offsetOf(harness, "y")).toBe(800);
    expect(thumb(harness).offset).toBeCloseTo(155.2, 5);
  });
});

describe("scroll-area — dragging the thumb", () => {
  function overflowing(props: ScrollAreaMachineProps = {}) {
    const harness = run(props);
    measure(harness, { viewportY: 200, contentY: 1000, viewportX: 200, contentX: 1000 });
    return harness;
  }

  it("moves the offset by the pointer travel over the travel of the thumb, from where it began", () => {
    const harness = overflowing();
    startDrag(harness, 100);
    drag(harness, 31.04);

    expect(harness.service.state.get()).toBe("dragging");
    expect(offsetOf(harness, "y")).toBeCloseTo(260, 5);

    drag(harness, -15.52);
    expect(offsetOf(harness, "y")).toBeCloseTo(20, 5);
  });

  it("clamps the offset to the content on both ends", () => {
    const harness = overflowing();
    startDrag(harness, 100);

    drag(harness, 100_000);
    expect(offsetOf(harness, "y")).toBe(800);
    drag(harness, -100_000);
    expect(offsetOf(harness, "y")).toBe(0);
  });

  it("marks the bar of the dragged axis and the root while it lasts", () => {
    const harness = overflowing({ orientation: "both" });
    startDrag(harness, 0, "x");

    expect(harness.api().dragging).toBe(true);
    expect(harness.api().getRootProps()["data-dragging"]).toBe("");
    expect(harness.api().getScrollbarProps({ orientation: "horizontal" })["data-dragging"]).toBe(
      "",
    );
    expect(
      harness.api().getScrollbarProps({ orientation: "vertical" })["data-dragging"],
    ).toBeUndefined();
  });

  it("drags the horizontal axis on its own measures", () => {
    const harness = run({ orientation: "horizontal" });
    measure(harness, { viewportX: 200, contentX: 1000, viewportY: 200, contentY: 200 });
    startDrag(harness, 0, "x");
    drag(harness, 155.2);

    expect(offsetOf(harness, "x")).toBeCloseTo(800, 5);
    expect(offsetOf(harness, "y")).toBe(0);
  });

  it("keeps following the scroll the write of the offset causes", () => {
    const harness = overflowing();
    startDrag(harness, 0);
    drag(harness, 77.6);
    scroll(harness, 400);

    expect(harness.service.state.get()).toBe("dragging");
    expect(offsetOf(harness, "y")).toBe(400);
  });

  it("settles on the last position at the end and shows the bar for the delay", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    startDrag(harness, 0);
    harness.service.send({ type: "THUMB.DRAG_END", position: 77.6 });

    expect(offsetOf(harness, "y")).toBeCloseTo(400, 5);
    expect(harness.service.state.get()).toBe("scrolling");
    expect(harness.service.context.get("dragAxis")).toBeNull();

    vi.advanceTimersByTime(1000);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("puts the offset back where it began on a cancel", () => {
    const harness = overflowing();
    startDrag(harness, 120);
    drag(harness, 60);
    expect(offsetOf(harness, "y")).not.toBe(120);

    harness.service.send({ type: "THUMB.DRAG_CANCEL" });
    expect(offsetOf(harness, "y")).toBe(120);
    expect(harness.service.state.get()).toBe("scrolling");
    expect(harness.api().dragging).toBe(false);
  });

  it("ignores a drag that comes after the end", () => {
    const harness = overflowing();
    startDrag(harness, 100);
    harness.service.send({ type: "THUMB.DRAG_END", position: 0 });
    drag(harness, 90);

    expect(offsetOf(harness, "y")).toBe(100);
  });

  it("does not start on an axis with nothing to scroll", () => {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 200 });
    startDrag(harness, 0);
    drag(harness, 50);

    expect(harness.service.state.get()).toBe("idle");
    expect(offsetOf(harness, "y")).toBe(0);
  });

  it("does not start before a measure, when the track is still nothing", () => {
    const harness = run();
    startDrag(harness, 0);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("does not restart a drag that is under way", () => {
    const harness = overflowing();
    startDrag(harness, 100);
    drag(harness, 31.04);
    startDrag(harness, 0);
    drag(harness, 31.04);

    expect(offsetOf(harness, "y")).toBeCloseTo(260, 5);
  });

  it("goes straight to idle when the bars stay up", () => {
    const harness = overflowing({ always: true });
    startDrag(harness, 0);
    harness.service.send({ type: "THUMB.DRAG_END", position: 10 });
    expect(harness.service.state.get()).toBe("idle");

    startDrag(harness, 0);
    harness.service.send({ type: "THUMB.DRAG_CANCEL" });
    expect(harness.service.state.get()).toBe("idle");
  });
});

describe("scroll-area — clicking the track", () => {
  function overflowing() {
    const harness = run();
    measure(harness, { viewportY: 200, contentY: 1000 });
    return harness;
  }

  function page(harness: Harness, direction: 1 | -1, axis: ScrollAxis = "y"): void {
    harness.service.send({ type: "TRACK.PAGE", axis, direction });
  }

  it("jumps a page of the view towards the point, one page per click", () => {
    const harness = overflowing();
    page(harness, 1);
    expect(offsetOf(harness, "y")).toBe(200);
    page(harness, 1);
    expect(offsetOf(harness, "y")).toBe(400);
    page(harness, -1);
    expect(offsetOf(harness, "y")).toBe(200);
  });

  it("stops at the two ends", () => {
    const harness = overflowing();
    page(harness, -1);
    expect(offsetOf(harness, "y")).toBe(0);

    for (let click = 0; click < 10; click += 1) page(harness, 1);
    expect(offsetOf(harness, "y")).toBe(800);
  });

  it("does nothing on an axis that does not overflow", () => {
    const harness = overflowing();
    page(harness, 1, "x");
    expect(offsetOf(harness, "x")).toBe(0);
  });

  it("moves the thumb with it", () => {
    const harness = overflowing();
    page(harness, 1);
    expect(thumb(harness).offset).toBeCloseTo(38.8, 5);
  });
});

describe("scroll-area — the bars appear on a scroll and fade after the delay", () => {
  function overflowing(props: ScrollAreaMachineProps = {}) {
    const harness = run(props);
    measure(harness, { viewportY: 200, contentY: 1000 });
    return harness;
  }

  it("stays idle through a measure, which is not a scroll", () => {
    const harness = overflowing();
    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().scrolling).toBe(false);
  });

  it("enters scrolling on a scroll and leaves it after the default second", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    scroll(harness, 10);

    expect(harness.service.state.get()).toBe("scrolling");
    expect(harness.api().scrolling).toBe(true);
    expect(harness.api().getRootProps()["data-scrolling"]).toBe("");

    vi.advanceTimersByTime(999);
    expect(harness.service.state.get()).toBe("scrolling");
    vi.advanceTimersByTime(1);
    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().getRootProps()["data-scrolling"]).toBeUndefined();
  });

  it("starts the delay again on every scroll", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    scroll(harness, 10);
    vi.advanceTimersByTime(600);
    scroll(harness, 20);
    vi.advanceTimersByTime(999);
    expect(harness.service.state.get()).toBe("scrolling");
    vi.advanceTimersByTime(1);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("follows the hide delay it is given", () => {
    vi.useFakeTimers();
    const harness = overflowing({ hideDelay: 250 });
    scroll(harness, 10);
    vi.advanceTimersByTime(249);
    expect(harness.service.state.get()).toBe("scrolling");
    vi.advanceTimersByTime(1);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("is inert when the bars stay up: a scroll moves the thumb and nothing else", () => {
    vi.useFakeTimers();
    const harness = overflowing({ always: true });
    scroll(harness, 400);

    expect(harness.service.state.get()).toBe("idle");
    expect(offsetOf(harness, "y")).toBe(400);
    expect(thumb(harness).offset).toBeCloseTo(77.6, 5);
    expect(harness.api().getRootProps()["data-always"]).toBe("");

    vi.advanceTimersByTime(10_000);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("clears its timer when the service stops", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    scroll(harness, 10);
    harness.service.stop();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the bar it left up for the delay when that delay had run out, without a scroll or the other bar", () => {
    vi.useFakeTimers();
    const harness = run({ orientation: "both" });
    measure(harness, { viewportX: 200, contentX: 1000, viewportY: 200, contentY: 1000 });
    const hovering = (orientation: "vertical" | "horizontal") =>
      harness.api().getScrollbarProps({ orientation })["data-lingering"];
    scroll(harness, 10);
    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    vi.advanceTimersByTime(1000);
    expect(harness.service.state.get()).toBe("idle");

    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "y" });
    expect(harness.service.state.get()).toBe("lingering");
    expect(harness.api().scrolling).toBe(false);
    expect(harness.api().getRootProps()["data-scrolling"]).toBeUndefined();
    expect(hovering("vertical")).toBe("");
    expect(hovering("horizontal")).toBeUndefined();
    expect(
      harness.api().getScrollbarProps({ orientation: "vertical" })["data-hovering"],
    ).toBeUndefined();

    vi.advanceTimersByTime(999);
    expect(harness.service.state.get()).toBe("lingering");
    vi.advanceTimersByTime(1);
    expect(harness.service.state.get()).toBe("idle");
    expect(hovering("vertical")).toBeUndefined();
    expect(
      harness.api().getScrollbarProps({ orientation: "vertical" })["data-hovering"],
    ).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets a bar that lingers go at once to a pointer that comes back, and to a scroll", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    const bar = () => harness.api().getScrollbarProps({ orientation: "vertical" });
    const hovering = () => bar()["data-hovering"];
    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "y" });
    expect(harness.service.state.get()).toBe("lingering");
    expect(hovering()).toBeUndefined();
    expect(bar()["data-lingering"]).toBe("");

    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    expect(harness.service.state.get()).toBe("idle");
    expect(hovering()).toBe("");
    expect(bar()["data-lingering"]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "y" });
    scroll(harness, 10);
    expect(harness.service.state.get()).toBe("scrolling");
    expect(hovering()).toBeUndefined();
    expect(bar()["data-lingering"]).toBeUndefined();
    expect(harness.api().getRootProps()["data-scrolling"]).toBe("");
  });

  it("starts the delay again when the pointer leaves a bar while the area is still scrolling", () => {
    vi.useFakeTimers();
    const harness = overflowing();
    scroll(harness, 10);
    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    vi.advanceTimersByTime(600);

    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "y" });
    vi.advanceTimersByTime(999);
    expect(harness.service.state.get()).toBe("scrolling");
    vi.advanceTimersByTime(1);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("leaves a bar that was never hovered alone, and an `always` bar at rest", () => {
    vi.useFakeTimers();
    const plain = overflowing({ orientation: "both" });
    plain.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    plain.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "x" });
    expect(plain.service.state.get()).toBe("idle");

    const always = overflowing({ always: true });
    always.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    always.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "y" });
    expect(always.service.state.get()).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tracks the pointer over the bars, one axis at a time", () => {
    const harness = run({ orientation: "both" });
    measure(harness, { viewportX: 200, contentX: 1000, viewportY: 200, contentY: 1000 });
    const hovering = (orientation: "vertical" | "horizontal") =>
      harness.api().getScrollbarProps({ orientation })["data-hovering"];

    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "y" });
    expect(hovering("vertical")).toBe("");
    expect(hovering("horizontal")).toBeUndefined();

    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "x" });
    expect(hovering("vertical")).toBe("");

    harness.service.send({ type: "SCROLLBAR.POINTERENTER", axis: "x" });
    expect(hovering("horizontal")).toBe("");
    expect(hovering("vertical")).toBeUndefined();

    harness.service.send({ type: "SCROLLBAR.POINTERLEAVE", axis: "x" });
    expect(hovering("horizontal")).toBeUndefined();
    expect(hovering("vertical")).toBeUndefined();
  });
});

describe("scroll-area — the viewport takes focus only when it has to", () => {
  it("is not a tab stop while nothing overflows", () => {
    const viewport = run({ label: "Messages" }).api().getViewportProps();
    expect(viewport["tabIndex"]).toBeUndefined();
    expect(viewport["role"]).toBeUndefined();
    expect(viewport["aria-label"]).toBeUndefined();
  });

  it("is a named region and a tab stop when it overflows and holds nothing focusable", () => {
    const harness = run({ label: "Messages" });
    measure(harness, { viewportY: 200, contentY: 1000 });
    const viewport = harness.api().getViewportProps();

    expect(viewport["tabIndex"]).toBe(0);
    expect(viewport["role"]).toBe("region");
    expect(viewport["aria-label"]).toBe("Messages");
  });

  it("ignores a horizontal overflow under a vertical area: no tab stop, no flag", () => {
    const vertical = run({ label: "Messages", orientation: "vertical" });
    measure(vertical, { viewportX: 200, contentX: 600, viewportY: 200, contentY: 200 });
    expect(vertical.api().overflowX).toBe(false);
    expect(vertical.api().getViewportProps()["tabIndex"]).toBeUndefined();
    expect(vertical.api().getRootProps()["data-overflow-x"]).toBeUndefined();
    expect(vertical.api().getViewportProps()["data-overflow-x"]).toBeUndefined();
  });

  it("ignores a vertical overflow under a horizontal area: no tab stop, no flag", () => {
    const horizontal = run({ label: "Messages", orientation: "horizontal" });
    measure(horizontal, { viewportX: 200, contentX: 200, viewportY: 200, contentY: 600 });
    expect(horizontal.api().overflowY).toBe(false);
    expect(horizontal.api().getViewportProps()["tabIndex"]).toBeUndefined();
    expect(horizontal.api().getRootProps()["data-overflow-y"]).toBeUndefined();
    expect(horizontal.api().getViewportProps()["data-overflow-y"]).toBeUndefined();
  });

  it("carries the reference to a visible label instead", () => {
    const harness = run({ labelledBy: "heading", orientation: "horizontal" });
    measure(harness, { viewportX: 200, contentX: 1000 });
    const viewport = harness.api().getViewportProps();

    expect(viewport["tabIndex"]).toBe(0);
    expect(viewport["aria-labelledby"]).toBe("heading");
    expect(viewport["aria-label"]).toBeUndefined();
  });

  it("gives the stop up to a focusable inside, and takes it back when that leaves", () => {
    const harness = run({ label: "Messages" });
    measure(harness, { viewportY: 200, contentY: 1000 });

    harness.service.send({ type: "CONTENT.FOCUSABLES", has: true });
    const taken = harness.api().getViewportProps();
    expect(taken["tabIndex"]).toBeUndefined();
    expect(taken["role"]).toBeUndefined();
    expect(taken["aria-label"]).toBeUndefined();

    harness.service.send({ type: "CONTENT.FOCUSABLES", has: false });
    expect(harness.api().getViewportProps()["tabIndex"]).toBe(0);
  });

  it("keeps the stop while the viewport holds the focus, whatever arrives or leaves", () => {
    const harness = run({ label: "Messages" });
    measure(harness, { viewportY: 200, contentY: 1000 });
    harness.service.send({ type: "VIEWPORT.FOCUS" });

    harness.service.send({ type: "CONTENT.FOCUSABLES", has: true });
    measure(harness, { viewportY: 200, contentY: 200 });
    const held = harness.api().getViewportProps();
    expect(held["tabIndex"]).toBe(0);
    expect(held["role"]).toBe("region");
    expect(held["aria-label"]).toBe("Messages");

    harness.service.send({ type: "VIEWPORT.BLUR" });
    expect(harness.api().getViewportProps()["tabIndex"]).toBeUndefined();
  });

  it("gives the stop up when the content stops overflowing", () => {
    const harness = run({ label: "Messages" });
    measure(harness, { viewportY: 200, contentY: 1000 });
    expect(harness.api().getViewportProps()["tabIndex"]).toBe(0);

    measure(harness, { viewportY: 200, contentY: 200 });
    expect(harness.api().getViewportProps()["tabIndex"]).toBeUndefined();
  });
});
