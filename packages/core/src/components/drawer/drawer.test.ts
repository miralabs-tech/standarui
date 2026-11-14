/**
 * The node half of `drawer`: no document, no framework, the shape a server render
 * has. The service is *started* here, so any effect or action that reaches for a
 * document surfaces in this file rather than in a page — which is how the inverted
 * `trackModality` guard was caught before it ever ran in a browser.
 *
 * The arithmetic is the whole subject: which detents a track resolves to, where a
 * release lands, and what a keystroke is allowed to do at each end of it. Anything
 * that needs a real engine — the pointer path, the settle, the engage scope on a
 * live intent bus — is in `drawer.browser.test.ts`.
 *
 * **`containerSize` is set by hand after a drag starts.** It is a measurement, and
 * there is nothing to measure here; writing it is what lets the release table be
 * asserted as arithmetic instead of as a rendering.
 */

import type { IntentScopeHost } from "@standarx/nav";
import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./drawer.connect";
import { machine } from "./drawer.machine";
import type { DrawerApi, DrawerMachineProps, DrawerSchema } from "./drawer.types";

type Api = DrawerApi<PlainPropTypes>;

const build = (props: DrawerMachineProps = {}) =>
  connectWithoutDom<DrawerSchema, Api>({ machine, connect, id: "d1", props });

function run(props: DrawerMachineProps = {}) {
  const harness = build({ open: true, ...props });
  harness.service.start();
  return harness;
}

/** Enough of a bus for the engage scope to be pushed and popped. */
function stubIntents(): IntentScopeHost {
  return { pushScope: () => () => {} };
}

type Harness = ReturnType<typeof run>;

function release(
  harness: Harness,
  {
    position,
    velocity,
    container = 1000,
  }: { position: number; velocity: number; container?: number },
): void {
  harness.service.send({ type: "CONTENT.DRAG_START" });
  harness.service.refs.set("containerSize", container);
  harness.service.send({ type: "CONTENT.DRAG_END", position, velocity });
}

describe("drawer — the state is a projection of the surface it decorates", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ open: true }).service.state.get()).toBe("idle");
  });

  it("connects on a server", () => {
    const api = run().api();
    expect(api.getContentProps()["data-part"]).toContain("drawer:content");
    expect(api.getGrabberProps()["role"]).toBe("separator");
  });

  it("cannot open itself — only the prop moves it", () => {
    const harness = run({ open: false });
    expect(harness.service.state.get()).toBe("closed");
    harness.service.send({ type: "DETENT.SET", detent: 1 });
    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("drawer — resolving the track", () => {
  it("sorts, deduplicates and clamps", () => {
    expect(run({ detents: [1, 0.5, 0.5] }).api().detents).toEqual([0.5, 1]);
    expect(run({ detents: [1.4] }).api().detents).toEqual([1]);
    expect(run({ detents: [0.3, 0.9, 0.6] }).api().detents).toEqual([0.3, 0.6, 0.9]);
  });

  it("never keeps a zero rung — a track that reaches nothing is a surface that closes", () => {
    expect(run({ detents: [0] }).api().detents).toEqual([1]);
    expect(run({ detents: [0, 0.5] }).api().detents).toEqual([0.5]);
    expect(run({ detents: [-1] }).api().detents).toEqual([1]);
    expect(run({ detents: [] }).api().detents).toEqual([1]);
  });

  it("folds two rungs the splitter would announce as one", () => {
    // Below a point apart, `aria-valuemin` and `-max` round to the same integer: a
    // focusable `role="separator"` whose range has equal ends and a keystroke with
    // no audible effect. It passes axe, which only checks the role and the name.
    expect(run({ detents: [0.9978, 1] }).api().detents).toEqual([0.9978]);
    expect(run({ detents: [0.5, 0.504] }).api().detents).toEqual([0.5]);
    expect(run({ detents: [0.9978, 1] }).api().hasTrack).toBe(false);
    // A full point apart is two rungs, and stays two.
    expect(run({ detents: [0.99, 1] }).api().detents).toEqual([0.99, 1]);
  });

  it("starts on the first detent, or on the nearest one to a default off the track", () => {
    expect(run({ detents: [0.4, 1] }).api().detent).toBe(0.4);
    expect(run({ detents: [0.4, 1], defaultDetent: 1 }).api().detent).toBe(1);
    // Off the track: the value is kept, and everything derived from it snaps.
    expect(run({ detents: [0.4, 1], defaultDetent: 0.45 }).api().detentIndex).toBe(0);
    expect(run({ detents: [0.4, 1], defaultDetent: 0.9 }).api().detentIndex).toBe(1);
  });

  it("has no track, and therefore no grabber, on a single detent", () => {
    expect(run({ detents: [1] }).api().hasTrack).toBe(false);
    expect(run({ detents: [0.5, 1] }).api().hasTrack).toBe(true);
  });
});

describe("drawer — stepping, and the ends of the track", () => {
  it("does not wrap at either end", () => {
    const harness = run({ detents: [0.3, 0.6, 1] });
    harness.service.send({ type: "DETENT.STEP", delta: -1 });
    expect(harness.api().detent).toBe(0.3);

    for (let step = 0; step < 4; step += 1) {
      harness.service.send({ type: "DETENT.STEP", delta: 1 });
    }
    expect(harness.api().detent).toBe(1);
  });

  it("reports the detent and its index on every change", () => {
    const onDetentChange = vi.fn();
    const harness = run({ detents: [0.3, 0.6, 1], onDetentChange });
    harness.service.send({ type: "DETENT.STEP", delta: 1 });
    expect(onDetentChange).toHaveBeenCalledWith({ detent: 0.6, index: 1 });
    expect(onDetentChange).toHaveBeenCalledTimes(1);

    // A step that would land off the track says nothing at all — it is not a
    // clamp to the end, it is a refusal, and a consumer hears the difference.
    harness.service.send({ type: "DETENT.STEP", delta: -2 });
    expect(onDetentChange).toHaveBeenCalledTimes(1);
    expect(harness.api().detent).toBe(0.6);

    harness.service.send({ type: "DETENT.STEP", delta: -1 });
    expect(onDetentChange).toHaveBeenLastCalledWith({ detent: 0.3, index: 0 });
    expect(onDetentChange).toHaveBeenCalledTimes(2);
  });

  it("toggles to the top, and back to the one below rather than to the bottom", () => {
    const harness = run({ detents: [0.3, 0.6, 1] });
    harness.service.send({ type: "DETENT.TOGGLE" });
    expect(harness.api().detent).toBe(1);
    // Not 0.3: with three rungs, "restore" that always dropped to the floor would
    // throw away the one the person was actually using.
    harness.service.send({ type: "DETENT.TOGGLE" });
    expect(harness.api().detent).toBe(0.6);
  });

  it("never closes by keystroke, even aimed off the bottom of the track", () => {
    const onDismissRequest = vi.fn();
    const harness = run({ detents: [0.5, 1], onDismissRequest });
    harness.service.send({ type: "DETENT.ADJUST", intent: "moveDown" });
    expect(harness.api().detent).toBe(0.5);
    expect(onDismissRequest).not.toHaveBeenCalled();
  });
});

describe("drawer — which way is bigger", () => {
  const grow = (
    props: DrawerMachineProps,
    intent: "moveUp" | "moveDown" | "moveLeft" | "moveRight",
  ) => {
    const harness = run({ detents: [0.5, 1], ...props });
    harness.service.send({ type: "DETENT.ADJUST", intent });
    return harness.api().detent;
  };

  it("grows a bottom sheet upward and a top sheet downward", () => {
    expect(grow({ edge: "bottom" }, "moveUp")).toBe(1);
    expect(grow({ edge: "bottom" }, "moveDown")).toBe(0.5);
    expect(grow({ edge: "top" }, "moveDown")).toBe(1);
    expect(grow({ edge: "top" }, "moveUp")).toBe(0.5);
  });

  it("grows an inline drawer away from the edge it is anchored to", () => {
    expect(grow({ edge: "start" }, "moveRight")).toBe(1);
    expect(grow({ edge: "start" }, "moveLeft")).toBe(0.5);
    expect(grow({ edge: "end" }, "moveLeft")).toBe(1);
    expect(grow({ edge: "end" }, "moveRight")).toBe(0.5);
  });

  it("mirrors the inline axis in RTL, and leaves the block axis alone", () => {
    // The intents are physical, so in RTL a drawer anchored at the inline start is
    // on the right and grows leftward.
    expect(grow({ edge: "start", dir: "rtl" }, "moveLeft")).toBe(1);
    expect(grow({ edge: "start", dir: "rtl" }, "moveRight")).toBe(0.5);
    // A writing direction has nothing to say about up and down.
    expect(grow({ edge: "bottom", dir: "rtl" }, "moveUp")).toBe(1);
  });

  it("sends Home and End to the ends whatever the edge", () => {
    for (const edge of ["bottom", "top", "start", "end"] as const) {
      expect(grow({ edge, defaultDetent: 1 }, "moveDown")).toBeLessThanOrEqual(1);
      const harness = run({ detents: [0.3, 0.6, 1], edge, defaultDetent: 0.6 });
      harness.service.send({ type: "DETENT.ADJUST", intent: "end" });
      expect(harness.api().detent).toBe(1);
      harness.service.send({ type: "DETENT.ADJUST", intent: "home" });
      expect(harness.api().detent).toBe(0.3);
    }
  });
});

describe("drawer — where a release lands", () => {
  it("takes one rung in the direction of a flick, whatever the position says", () => {
    const harness = run({ detents: [0.5, 1] });
    release(harness, { position: -20, velocity: -1 });
    expect(harness.api().detent).toBe(1);
  });

  it("dismisses on a flick off the bottom rung", () => {
    const onDismissRequest = vi.fn();
    const onDragEnd = vi.fn();
    const harness = run({ detents: [0.5, 1], onDismissRequest, onDragEnd });
    release(harness, { position: 20, velocity: 1 });
    expect(onDismissRequest).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith({ detent: 0.5, dismissed: true, velocity: 1 });
  });

  it("dismisses on a slow drag that ended under the threshold", () => {
    const onDismissRequest = vi.fn();
    const harness = run({ detents: [0.5, 1], onDismissRequest });
    // 0.5 − 400/1000 = 0.1, under 0.5 × 0.5.
    release(harness, { position: 400, velocity: 0.1 });
    expect(onDismissRequest).toHaveBeenCalledTimes(1);
  });

  it("snaps to the nearest rung on a slow drag that stayed above it", () => {
    const onDismissRequest = vi.fn();
    const harness = run({ detents: [0.5, 1], defaultDetent: 1, onDismissRequest });
    // 1 − 300/1000 = 0.7, nearer 0.5 than 1.
    release(harness, { position: 300, velocity: 0.1 });
    expect(harness.api().detent).toBe(0.5);
    expect(onDismissRequest).not.toHaveBeenCalled();
  });

  it("honours the threshold as a fraction of the smallest rung", () => {
    const onDismissRequest = vi.fn();
    const harness = run({ detents: [0.5, 1], dismissThreshold: 0.1, onDismissRequest });
    // 0.1 would have dismissed at the default 0.5; against 0.5 × 0.1 it holds.
    release(harness, { position: 400, velocity: 0.1 });
    expect(onDismissRequest).not.toHaveBeenCalled();
    expect(harness.api().detent).toBe(0.5);
  });

  it("falls back to the bottom rung rather than dismissing when it may not", () => {
    const onDismissRequest = vi.fn();
    // From the bottom rung, which is the only place a flick has nowhere left to go
    // — thrown from the top it simply steps down one, and the clause under test
    // would never be reached.
    const harness = run({ detents: [0.5, 1], dismissible: false, onDismissRequest });
    release(harness, { position: 900, velocity: 2 });
    expect(onDismissRequest).not.toHaveBeenCalled();
    expect(harness.api().detent).toBe(0.5);
  });

  it("reads the flick threshold at exactly 0.5 px/ms", () => {
    const onDismissRequest = vi.fn();
    const justUnder = run({ detents: [0.5, 1], onDismissRequest });
    // Below the threshold the position decides, and this one has barely moved — so
    // it holds. A threshold set any lower would read this as a flick off the bottom
    // rung and close the surface, which is what the callback is here to catch.
    release(justUnder, { position: 10, velocity: 0.499 });
    expect(onDismissRequest).not.toHaveBeenCalled();
    expect(justUnder.api().detent).toBe(0.5);

    // At the threshold the flick decides, and it says "up" against a position that
    // has already travelled most of the way down. A threshold set any higher would
    // let the position win and drop this to 0.5.
    const atIt = run({ detents: [0.5, 1], defaultDetent: 1 });
    release(atIt, { position: 400, velocity: -0.5 });
    expect(atIt.api().detent).toBe(1);
  });

  it("puts the surface back where it was when the gesture is taken away", () => {
    const onDragEnd = vi.fn();
    const harness = run({ detents: [0.5, 1], onDragEnd });
    harness.service.send({ type: "CONTENT.DRAG_START" });
    harness.service.send({ type: "CONTENT.DRAG_CANCEL" });
    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().detent).toBe(0.5);
    expect(onDragEnd).not.toHaveBeenCalled();
  });
});

describe("drawer — the pad's grip", () => {
  it("holds, adjusts, and gives the entry detent back on B", () => {
    const harness = run({ detents: [0.3, 0.6, 1], defaultDetent: 0.6, intents: stubIntents() });
    harness.service.send({ type: "ENGAGE.START" });
    expect(harness.service.state.get()).toBe("engaged");
    expect(harness.api().engaged).toBe(true);

    harness.service.send({ type: "DETENT.ADJUST", intent: "moveUp" });
    expect(harness.api().detent).toBe(1);

    harness.service.send({ type: "ENGAGE.END", committed: false });
    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().detent).toBe(0.6);
  });

  it("keeps what was adjusted on A", () => {
    const harness = run({ detents: [0.3, 0.6, 1], defaultDetent: 0.6, intents: stubIntents() });
    harness.service.send({ type: "ENGAGE.START" });
    harness.service.send({ type: "DETENT.ADJUST", intent: "moveUp" });
    harness.service.send({ type: "ENGAGE.END", committed: true });
    expect(harness.api().detent).toBe(1);
  });

  it("refuses the grip with no bus, and on a sheet with one height", () => {
    const noBus = run({ detents: [0.5, 1] });
    noBus.service.send({ type: "ENGAGE.START" });
    expect(noBus.service.state.get()).toBe("idle");

    const noTrack = run({ detents: [1], intents: stubIntents() });
    noTrack.service.send({ type: "ENGAGE.START" });
    expect(noTrack.service.state.get()).toBe("idle");
  });
});

describe("drawer — disabled freezes the track and nothing else", () => {
  it("ignores every way of changing the detent", () => {
    const harness = run({ detents: [0.5, 1], disabled: true, intents: stubIntents() });
    harness.service.send({ type: "DETENT.SET", detent: 1 });
    harness.service.send({ type: "DETENT.STEP", delta: 1 });
    harness.service.send({ type: "DETENT.TOGGLE" });
    harness.service.send({ type: "DETENT.ADJUST", intent: "moveUp" });
    harness.service.send({ type: "ENGAGE.START" });
    expect(harness.api().detent).toBe(0.5);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("refuses a gesture when it is not draggable", () => {
    const harness = run({ detents: [0.5, 1], draggable: false });
    harness.service.send({ type: "CONTENT.DRAG_START" });
    expect(harness.service.state.get()).toBe("idle");
  });
});

describe("drawer — what the sheet is told", () => {
  it("publishes the detent and the track's top as inline custom properties", () => {
    const api = run({ detents: [0.4, 0.8], defaultDetent: 0.4 }).api();
    const style = api.getContentProps()["style"] as Record<string, unknown>;
    expect(style["--sui-drawer-detent"]).toBe(0.4);
    expect(style["--sui-drawer-detent-max"]).toBe(0.8);
  });

  it("only calls itself full when the surface really reaches the whole positioner", () => {
    const partial = run({ detents: [0.4, 0.8], defaultDetent: 0.8 }).api();
    expect(partial.getContentProps()["data-detent-position"]).toBe("partial");

    const full = run({ detents: [0.5, 1], defaultDetent: 1 }).api();
    expect(full.getContentProps()["data-detent-position"]).toBe("full");
  });

  it("announces the track as a percentage, bounded by its own rungs", () => {
    const grabber = run({ detents: [0.3, 0.9], defaultDetent: 0.3 })
      .api()
      .getGrabberProps();
    expect(grabber["aria-valuenow"]).toBe(30);
    expect(grabber["aria-valuemin"]).toBe(30);
    expect(grabber["aria-valuemax"]).toBe(90);
    expect(grabber["aria-orientation"]).toBe("horizontal");
  });

  it("turns the separator on its side for an inline drawer", () => {
    const grabber = run({ edge: "start" }).api().getGrabberProps();
    expect(grabber["aria-orientation"]).toBe("vertical");
  });

  it("points `aria-controls` at the surface it resizes", () => {
    const api = run().api();
    expect(api.getGrabberProps()["aria-controls"]).toBe(api.getContentProps()["id"]);
  });

  it("takes the grabber out of the tab order when the track is frozen", () => {
    expect(run().api().getGrabberProps()["tabIndex"]).toBe(0);
    expect(run({ disabled: true }).api().getGrabberProps()["tabIndex"]).toBeUndefined();
  });

  it("carries the edge on every part, because the sheet needs it on all of them", () => {
    const api = run({ edge: "end" }).api();
    expect(api.getPositionerProps()["data-edge"]).toBe("end");
    expect(api.getBackdropProps()["data-edge"]).toBe("end");
    expect(api.getContentProps()["data-edge"]).toBe("end");
    expect(api.getGrabberProps()["data-edge"]).toBe("end");
  });

  it("says nothing about being a dialog — that identity is the other machine's", () => {
    const content = run().api().getContentProps();
    expect(content["role"]).toBeUndefined();
    expect(content["aria-modal"]).toBeUndefined();
    expect(content["tabIndex"]).toBeUndefined();
  });
});
