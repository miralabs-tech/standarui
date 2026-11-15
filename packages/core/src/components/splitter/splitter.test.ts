/**
 * The node half of `splitter`: no document, no framework, the shape a server render
 * has, with the service *started* so that anything reaching for a document in an
 * effect or an action surfaces here. Every arithmetic and every state transition is
 * exercised through events and prop getters; what needs a real engine — the pointer
 * capture, the Escape key during a gesture, the dblclick listener, the accessible
 * name warning — is in `splitter.browser.test.ts`.
 *
 * `containerSize` and `position` are what the pointer effect would measure; they are
 * written by hand because there is nothing to measure here.
 */

import { describe, expect, it, vi } from "vitest";
import type { EngageIntent, IntentEvent, IntentHandler, IntentScopeHost } from "../../nav";
import type { Direction, Orientation } from "../../types";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./splitter.connect";
import { machine } from "./splitter.machine";
import type {
  SplitterApi,
  SplitterMachineProps,
  SplitterPanelSide,
  SplitterSchema,
} from "./splitter.types";

type Api = SplitterApi<PlainPropTypes>;

const build = (props: SplitterMachineProps = {}) =>
  connectWithoutDom<SplitterSchema, Api>({ machine, connect, id: "sp1", props });

function run(props: SplitterMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

type Harness = ReturnType<typeof run>;

function quietly<T>(work: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  try {
    return { result: work(), warnings };
  } finally {
    spy.mockRestore();
  }
}

function adjust(harness: Harness, intent: EngageIntent): void {
  harness.service.send({ type: "HANDLE.ADJUST", intent });
}

function press(harness: Harness, key: string, modifiers: Record<string, boolean> = {}) {
  const preventDefault = vi.fn();
  const handler = harness.api().getHandleProps()["onKeyDown"] as (event: unknown) => void;
  handler({
    key,
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...modifiers,
    preventDefault,
  });
  return preventDefault;
}

function drag(harness: Harness, positions: readonly number[], containerSize = 1000): void {
  harness.service.send({ type: "HANDLE.DRAG_START", containerSize });
  for (const position of positions) harness.service.send({ type: "HANDLE.DRAG", position });
}

function endDrag(harness: Harness, position: number): void {
  harness.service.send({ type: "HANDLE.DRAG_END", position });
}

function stubBus() {
  const stack: IntentHandler[] = [];
  const host: IntentScopeHost = {
    pushScope(handler) {
      stack.push(handler);
      return () => {
        const index = stack.lastIndexOf(handler);
        if (index !== -1) stack.splice(index, 1);
      };
    },
  };
  const dispatch = (intent: string, source = "gamepad"): boolean =>
    stack.at(-1)?.({ intent, source, repeat: false } as unknown as IntentEvent) === true;
  return { host, dispatch, depth: () => stack.length };
}

describe("splitter — defaults and markup", () => {
  it("resolves its initial state from the props alone, so the server renders the same markup", () => {
    expect(build().service.state.get()).toBe("idle");
  });

  it("connects on a server, to the percent scale of the APG window splitter", () => {
    const api = run().api();
    const handle = api.getHandleProps();
    const panel = api.getPanelProps();

    expect(api.size).toBe(50);
    expect(api.collapsed).toBe(false);
    expect(panel["data-part"]).toBe("splitter:panel");
    expect(panel["style"]).toEqual({ "--sui-splitter-size": "50%" });
    expect(handle["data-part"]).toBe("splitter:handle");
    expect(handle["role"]).toBe("separator");
    expect(handle["tabIndex"]).toBe(0);
    expect(handle["aria-orientation"]).toBe("vertical");
    expect(handle["aria-valuenow"]).toBe(50);
    expect(handle["aria-valuemin"]).toBe(0);
    expect(handle["aria-valuemax"]).toBe(100);
    expect(handle["aria-controls"]).toBe(panel["id"]);
    expect(handle["style"]).toBeUndefined();
  });

  it("announces the perpendicular axis, whichever way the panels are laid out", () => {
    const stacked = run({ orientation: "vertical" }).api();
    expect(stacked.getHandleProps()["aria-orientation"]).toBe("horizontal");
    expect(stacked.getPanelProps()["data-orientation"]).toBe("vertical");
  });

  it("writes the size in the unit it was given", () => {
    const api = run({ unit: "px", max: 360, min: 180, defaultSize: 196 }).api();
    expect(api.getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "196px" });
    expect(api.getHandleProps()["aria-valuenow"]).toBe(196);
    expect(api.getHandleProps()["aria-valuemin"]).toBe(180);
    expect(api.getHandleProps()["aria-valuemax"]).toBe(360);
  });

  it("clamps a default size that starts outside the range", () => {
    expect(run({ defaultSize: 500 }).api().size).toBe(100);
    expect(run({ min: 20, defaultSize: 5 }).api().size).toBe(20);
  });

  it("warns in development when the unit is px and there is no max, and not otherwise", () => {
    const bare = quietly(() => build({ unit: "px" }).api());
    expect(bare.warnings.some((line) => line.includes("without a `max`"))).toBe(true);

    const bounded = quietly(() => build({ unit: "px", max: 400 }).api());
    expect(bounded.warnings).toEqual([]);

    const percent = quietly(() => build().api());
    expect(percent.warnings).toEqual([]);
  });

  it("survives a max below its min instead of publishing an inverted range", () => {
    const { result, warnings } = quietly(() => build({ min: 50, max: 10 }).api());
    expect(result.getHandleProps()["aria-valuemax"]).toBe(50);
    expect(warnings.some((line) => line.includes("max 10 is below min 50"))).toBe(true);
  });

  it("falls back to a positive step", () => {
    const harness = quietly(() => run({ step: 0 })).result;
    adjust(harness, "moveRight");
    expect(harness.api().size).toBe(51);
  });

  it("derives the two ids a pair needs", () => {
    const api = run().api();
    expect(api.getPanelProps()["id"]).toBe("splitter:sp1:panel");
    expect(api.getHandleProps()["id"]).toBe("splitter:sp1:handle");
  });

  it("names the handle from `label` or `labelledBy`, never both", () => {
    const labelled = run({ label: "Sidebar" }).api().getHandleProps();
    expect(labelled["aria-label"]).toBe("Sidebar");
    expect(labelled["aria-labelledby"]).toBeUndefined();

    const pointed = run({ labelledBy: "title" }).api().getHandleProps();
    expect(pointed["aria-labelledby"]).toBe("title");
    expect(pointed["aria-label"]).toBeUndefined();
  });

  it("reads the value text from `getValueText`, with the size that is painted", () => {
    const getValueText = vi.fn(
      ({ size, collapsed }: { size: number; collapsed: boolean }) =>
        `${collapsed ? "collapsed" : size}`,
    );
    const harness = run({ getValueText, collapsible: true, collapsedSize: 4 });
    expect(harness.api().getHandleProps()["aria-valuetext"]).toBe("50");
    harness.service.send({ type: "HANDLE.TOGGLE" });
    expect(harness.api().getHandleProps()["aria-valuetext"]).toBe("collapsed");
    expect(getValueText).toHaveBeenLastCalledWith({ size: 4, collapsed: true });
    expect(run().api().getHandleProps()["aria-valuetext"]).toBeUndefined();
  });
});

describe("splitter — the keyboard", () => {
  const CASES: ReadonlyArray<
    readonly [Orientation, Direction, SplitterPanelSide, EngageIntent, EngageIntent]
  > = [
    ["horizontal", "ltr", "start", "moveRight", "moveLeft"],
    ["horizontal", "ltr", "end", "moveLeft", "moveRight"],
    ["horizontal", "rtl", "start", "moveLeft", "moveRight"],
    ["horizontal", "rtl", "end", "moveRight", "moveLeft"],
    ["vertical", "ltr", "start", "moveDown", "moveUp"],
    ["vertical", "ltr", "end", "moveUp", "moveDown"],
    ["vertical", "rtl", "start", "moveDown", "moveUp"],
    ["vertical", "rtl", "end", "moveUp", "moveDown"],
  ];

  const KEYS: Readonly<Record<string, string>> = {
    moveRight: "ArrowRight",
    moveLeft: "ArrowLeft",
    moveDown: "ArrowDown",
    moveUp: "ArrowUp",
  };

  it.each(CASES)(
    "%s, %s, panel at %s: %s grows, %s shrinks",
    (orientation, dir, side, grow, shrink) => {
      const harness = run({ orientation, dir, panelSide: side });

      adjust(harness, grow);
      expect(harness.api().size).toBe(51);
      adjust(harness, shrink);
      adjust(harness, shrink);
      expect(harness.api().size).toBe(49);
    },
  );

  it.each(CASES)(
    "%s, %s, panel at %s: the keys reach the same answer through the handle",
    (orientation, dir, side, grow, shrink) => {
      const harness = run({ orientation, dir, panelSide: side });

      const prevented = press(harness, KEYS[grow] as string);
      expect(prevented).toHaveBeenCalledTimes(1);
      expect(harness.api().size).toBe(51);
      press(harness, KEYS[shrink] as string);
      press(harness, KEYS[shrink] as string);
      expect(harness.api().size).toBe(49);
    },
  );

  it("ignores the arrows of the other axis, and leaves them to the page", () => {
    const horizontal = run();
    expect(press(horizontal, "ArrowUp")).not.toHaveBeenCalled();
    expect(press(horizontal, "ArrowDown")).not.toHaveBeenCalled();
    adjust(horizontal, "moveUp");
    adjust(horizontal, "moveDown");
    adjust(horizontal, "pageUp");
    adjust(horizontal, "pageDown");
    expect(horizontal.api().size).toBe(50);

    const vertical = run({ orientation: "vertical" });
    expect(press(vertical, "ArrowLeft")).not.toHaveBeenCalled();
    expect(press(vertical, "ArrowRight")).not.toHaveBeenCalled();
    adjust(vertical, "moveLeft");
    expect(vertical.api().size).toBe(50);
  });

  it("reports no end for an intent of the other axis that reaches the machine from the pad", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    adjust(harness, "moveUp");
    adjust(harness, "pageDown");
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("ignores the page keys and every modifier", () => {
    const harness = run();
    expect(press(harness, "PageUp")).not.toHaveBeenCalled();
    for (const modifier of ["shiftKey", "altKey", "ctrlKey", "metaKey"]) {
      expect(press(harness, "ArrowRight", { [modifier]: true })).not.toHaveBeenCalled();
    }
    expect(harness.api().size).toBe(50);
  });

  it("sends Home to the minimum and End to the maximum, in either direction", () => {
    for (const dir of ["ltr", "rtl"] as const) {
      const harness = run({ min: 10, max: 90, dir });
      press(harness, "Home");
      expect(harness.api().size).toBe(10);
      press(harness, "End");
      expect(harness.api().size).toBe(90);
    }
  });

  it("stops at the bounds and reports nothing for a step that goes nowhere", () => {
    const onSizeChange = vi.fn();
    const harness = run({ defaultSize: 100, onSizeChange });
    adjust(harness, "moveRight");
    expect(harness.api().size).toBe(100);
    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it("moves by `step`, which is 1 on the percent scale and 10 in pixels", () => {
    const percent = run({ step: 5 });
    adjust(percent, "moveRight");
    expect(percent.api().size).toBe(55);

    const pixels = run({ unit: "px", max: 400, defaultSize: 196 });
    adjust(pixels, "moveRight");
    expect(pixels.api().size).toBe(206);
    adjust(pixels, "moveLeft");
    adjust(pixels, "moveLeft");
    expect(pixels.api().size).toBe(186);
  });

  it("adds a fractional step without letting the sum drift", () => {
    const harness = run({ step: 0.1, defaultSize: 0.2, max: 1 });
    adjust(harness, "moveRight");
    expect(harness.api().size).toBe(0.3);
    expect(harness.api().getHandleProps()["aria-valuenow"]).toBe(0.3);
  });

  it("toggles on Enter only when it is collapsible, and takes no key otherwise", () => {
    const fixed = run();
    expect(press(fixed, "Enter")).not.toHaveBeenCalled();
    expect(fixed.api().collapsed).toBe(false);

    const folding = run({ collapsible: true });
    expect(press(folding, "Enter")).toHaveBeenCalledTimes(1);
    expect(folding.api().collapsed).toBe(true);
    press(folding, "Enter");
    expect(folding.api().collapsed).toBe(false);
  });

  it("does not toggle on a held Enter", () => {
    const harness = run({ collapsible: true });
    press(harness, "Enter", { repeat: true });
    expect(harness.api().collapsed).toBe(false);
  });

  it("answers nothing when disabled, and leaves the handle out of the tab order", () => {
    const harness = run({ disabled: true, collapsible: true });
    const handle = harness.api().getHandleProps();
    expect(handle["tabIndex"]).toBeUndefined();
    expect(handle["aria-disabled"]).toBe("true");
    expect(handle["data-disabled"]).toBe("");
    expect(press(harness, "ArrowRight")).not.toHaveBeenCalled();
    expect(press(harness, "Enter")).not.toHaveBeenCalled();
    adjust(harness, "moveRight");
    harness.service.send({ type: "SIZE.SET", size: 70 });
    harness.service.send({ type: "HANDLE.TOGGLE" });
    expect(harness.api().size).toBe(50);
    expect(harness.api().collapsed).toBe(false);
  });
});

describe("splitter — collapsing", () => {
  const folding = (extra: SplitterMachineProps = {}) =>
    run({ collapsible: true, collapsedSize: 4, min: 20, defaultSize: 40, ...extra });

  it("keeps the last unfolded size while collapsed, and paints the collapsed one", () => {
    const harness = folding();
    harness.service.send({ type: "HANDLE.TOGGLE" });

    const api = harness.api();
    expect(api.collapsed).toBe(true);
    expect(api.size).toBe(40);
    expect(api.getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "4%" });
    expect(api.getPanelProps()["data-collapsed"]).toBe("");
    expect(api.getHandleProps()["aria-valuenow"]).toBe(4);
    expect(api.getHandleProps()["aria-valuemin"]).toBe(4);

    harness.service.send({ type: "HANDLE.TOGGLE" });
    expect(harness.api().getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "40%" });
  });

  it("marks a collapse that leaves a rail, and not one that leaves nothing", () => {
    const rail = run({
      collapsible: true,
      collapsedSize: 56,
      unit: "px",
      min: 180,
      max: 360,
      defaultSize: 196,
    });
    expect(rail.api().getPanelProps()["data-rail"]).toBeUndefined();
    rail.service.send({ type: "HANDLE.TOGGLE" });
    expect(rail.api().getPanelProps()["data-collapsed"]).toBe("");
    expect(rail.api().getPanelProps()["data-rail"]).toBe("");
    expect(rail.api().getHandleProps()["data-rail"]).toBe("");

    const gone = run({
      collapsible: true,
      collapsedSize: 0,
      unit: "px",
      min: 180,
      max: 360,
      defaultSize: 196,
    });
    gone.service.send({ type: "HANDLE.TOGGLE" });
    expect(gone.api().getPanelProps()["data-collapsed"]).toBe("");
    expect(gone.api().getPanelProps()["data-rail"]).toBeUndefined();
    expect(gone.api().getHandleProps()["data-rail"]).toBeUndefined();
  });

  it("announces `min` as the floor when it cannot collapse", () => {
    expect(run({ min: 20 }).api().getHandleProps()["aria-valuemin"]).toBe(20);
    expect(run({ min: 20, collapsedSize: 4 }).api().getHandleProps()["aria-valuemin"]).toBe(20);
  });

  it("is driven by the API, and refuses to collapse what is not collapsible", () => {
    const harness = folding();
    harness.api().setCollapsed(true);
    expect(harness.api().collapsed).toBe(true);
    harness.api().setCollapsed(false);
    expect(harness.api().collapsed).toBe(false);
    harness.api().toggle();
    expect(harness.api().collapsed).toBe(true);

    const fixed = run();
    fixed.api().setCollapsed(true);
    fixed.api().toggle();
    expect(fixed.api().collapsed).toBe(false);
  });

  it("reports a fold made by `setCollapsed` once, as `toggle` does, and nothing when it changes nothing", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = folding({ onSizeChangeEnd });
    const size = harness.api().size;

    harness.api().setCollapsed(true);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size });

    harness.api().setCollapsed(true);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);

    harness.api().setCollapsed(false);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(2);
  });

  it("starts collapsed from `defaultCollapsed`, only when it can", () => {
    expect(folding({ defaultCollapsed: true }).api().collapsed).toBe(true);
    expect(run({ defaultCollapsed: true }).api().collapsed).toBe(false);
  });

  it("reports the change, once, through `onCollapsedChange`", () => {
    const onCollapsedChange = vi.fn();
    const harness = folding({ onCollapsedChange });
    harness.service.send({ type: "HANDLE.TOGGLE" });
    expect(onCollapsedChange).toHaveBeenCalledTimes(1);
    expect(onCollapsedChange).toHaveBeenCalledWith({ collapsed: true });
  });

  it("restores on the grow key and stays put on the shrink key", () => {
    const harness = folding({ defaultCollapsed: true });
    adjust(harness, "moveLeft");
    expect(harness.api().collapsed).toBe(true);
    adjust(harness, "moveRight");
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(40);
  });

  it("restores on Home and End as well, at the bound they name", () => {
    const harness = folding({ defaultCollapsed: true });
    adjust(harness, "end");
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(100);
  });

  it("collapses a drag that crosses the half-way mark between the two sizes, in both directions", () => {
    const harness = folding();
    harness.service.send({ type: "HANDLE.DRAG_START", containerSize: 100 });

    harness.service.send({ type: "HANDLE.DRAG", position: -20 });
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(20);

    harness.service.send({ type: "HANDLE.DRAG", position: -27 });
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(20);

    harness.service.send({ type: "HANDLE.DRAG", position: -28.5 });
    expect(harness.api().collapsed).toBe(true);
    expect(harness.api().size).toBe(40);

    harness.service.send({ type: "HANDLE.DRAG", position: -10 });
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(30);
  });

  it("restores the size from before the gesture whatever the pointer sampling was", () => {
    const sizes: number[] = [];
    for (const positions of [[-10, -20, -30], [-30]]) {
      const onSizeChangeEnd = vi.fn();
      const harness = folding({ onSizeChangeEnd });
      harness.service.send({ type: "HANDLE.DRAG_START", containerSize: 100 });
      for (const position of positions) harness.service.send({ type: "HANDLE.DRAG", position });
      endDrag(harness, positions.at(-1) as number);
      expect(harness.api().collapsed).toBe(true);
      expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 40 });
      harness.api().toggle();
      sizes.push(harness.api().size);
    }
    expect(sizes).toEqual([40, 40]);
  });

  it("sends Home to the collapsed size when it can collapse, the minimum announced", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = folding({ onSizeChangeEnd });
    press(harness, "Home");
    expect(harness.api().collapsed).toBe(true);
    expect(harness.api().getHandleProps()["aria-valuenow"]).toBe(
      harness.api().getHandleProps()["aria-valuemin"],
    );
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    press(harness, "Home");
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    press(harness, "End");
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(100);
  });

  it("starts a drag from the collapsed size when it was collapsed", () => {
    const harness = folding({ defaultCollapsed: true });
    harness.service.send({ type: "HANDLE.DRAG_START", containerSize: 100 });

    harness.service.send({ type: "HANDLE.DRAG", position: 5 });
    expect(harness.api().collapsed).toBe(true);

    harness.service.send({ type: "HANDLE.DRAG", position: 30 });
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(34);
  });

  it("never collapses a drag when it is not collapsible", () => {
    const harness = run({ min: 20, defaultSize: 40 });
    drag(harness, [-100], 100);
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(20);
  });
});

describe("splitter — the pointer", () => {
  it("resizes in percent against the container measured once at the start", () => {
    const harness = run();
    drag(harness, [100], 1000);
    expect(harness.api().size).toBe(60);
    expect(harness.api().dragging).toBe(true);
    expect(harness.api().getPanelProps()["data-dragging"]).toBe("");
    expect(harness.api().getHandleProps()["data-dragging"]).toBe("");

    harness.service.send({ type: "HANDLE.DRAG", position: -250 });
    expect(harness.api().size).toBe(25);
  });

  it("resizes in pixels with no container", () => {
    const harness = run({ unit: "px", min: 100, max: 400, defaultSize: 200 });
    drag(harness, [60], 0);
    expect(harness.api().size).toBe(260);
    harness.service.send({ type: "HANDLE.DRAG", position: 500 });
    expect(harness.api().size).toBe(400);
    harness.service.send({ type: "HANDLE.DRAG", position: -500 });
    expect(harness.api().size).toBe(100);
  });

  it("does not divide by an empty container", () => {
    const harness = run();
    drag(harness, [100], 0);
    expect(harness.api().size).toBe(50);
  });

  it("inverts the travel for a panel on the end side", () => {
    const harness = run({ panelSide: "end" });
    drag(harness, [100], 1000);
    expect(harness.api().size).toBe(40);
  });

  it("rounds to two decimals, so the server and the client write the same string", () => {
    const harness = run();
    drag(harness, [1], 3);
    expect(harness.api().size).toBe(83.33);
  });

  it("reports every write through `onSizeChange` and the end of the gesture once", () => {
    const onSizeChange = vi.fn();
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChange, onSizeChangeEnd });

    drag(harness, [100, 200, 300]);
    expect(onSizeChange.mock.calls.map(([details]) => details.size)).toEqual([60, 70, 80]);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();

    endDrag(harness, 300);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 80 });
    expect(harness.api().dragging).toBe(false);
  });

  it("writes the last position at the release, which a browser may not have sent as a move", () => {
    const harness = run();
    drag(harness, [100]);
    endDrag(harness, 150);
    expect(harness.api().size).toBe(65);
  });

  it("answers a stray move or release when no gesture is running with nothing", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    harness.service.send({ type: "HANDLE.DRAG", position: 100 });
    endDrag(harness, 100);
    harness.service.send({ type: "HANDLE.DRAG_CANCEL" });
    expect(harness.api().size).toBe(50);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("puts the panel back where it was when the gesture is taken away, and reports no end", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ collapsible: true, min: 20, collapsedSize: 4, onSizeChangeEnd });
    drag(harness, [-45], 100);
    expect(harness.api().collapsed).toBe(true);

    harness.service.send({ type: "HANDLE.DRAG_CANCEL" });
    expect(harness.api().size).toBe(50);
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().dragging).toBe(false);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();

    harness.service.send({ type: "HANDLE.DRAG", position: 10 });
    expect(harness.api().size).toBe(50);
  });

  it("finishes a gesture that a disabled flip interrupted", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    drag(harness, [100]);
    harness.setProps({ disabled: true });
    endDrag(harness, 100);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(harness.api().dragging).toBe(false);
  });

  it("refuses to start a gesture when disabled", () => {
    const harness = run({ disabled: true });
    drag(harness, [100]);
    expect(harness.api().size).toBe(50);
    expect(harness.api().dragging).toBe(false);
  });

  it("does not start a gesture while the pad holds the panel", () => {
    const bus = stubBus();
    const harness = run({ intents: bus.host });
    harness.service.send({ type: "HANDLE.FOCUS" });
    bus.dispatch("select");
    expect(harness.api().engaged).toBe(true);

    drag(harness, [100]);
    expect(harness.api().size).toBe(50);
    expect(harness.api().dragging).toBe(false);
  });

  it("resets to the default size on a double-click, and reports the end", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ unit: "px", max: 400, defaultSize: 196, onSizeChangeEnd });
    harness.api().setSize(300);
    harness.service.send({ type: "HANDLE.RESET" });
    expect(harness.api().size).toBe(196);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 196 });
  });

  it("restores a collapsed panel on a double-click", () => {
    const harness = run({ collapsible: true, defaultCollapsed: true });
    harness.service.send({ type: "HANDLE.RESET" });
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(50);
  });

  it("leaves the double-click alone when `resetOnDoubleClick` is off", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ resetOnDoubleClick: false, onSizeChangeEnd });
    harness.api().setSize(70);
    harness.service.send({ type: "HANDLE.RESET" });
    expect(harness.api().size).toBe(70);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });
});

describe("splitter — the end of a change", () => {
  it("reports once per keyboard step, and none for a step on the other axis", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    press(harness, "ArrowRight");
    press(harness, "ArrowRight");
    press(harness, "ArrowUp");
    expect(onSizeChangeEnd.mock.calls.map(([details]) => details.size)).toEqual([51, 52]);
  });

  it("reports nothing for a step that moves nothing, a repeated End included", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    press(harness, "End");
    press(harness, "End");
    press(harness, "ArrowRight");
    expect(onSizeChangeEnd.mock.calls.map(([details]) => details.size)).toEqual([100]);

    const folded = run({ collapsible: true, defaultCollapsed: true, onSizeChangeEnd });
    onSizeChangeEnd.mockClear();
    adjust(folded, "moveLeft");
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports nothing for a double-click that finds the default size", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    harness.service.send({ type: "HANDLE.RESET" });
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports a fold and an unfold by Enter, each once, with the size the panel keeps", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ collapsible: true, onSizeChangeEnd });
    press(harness, "Enter");
    expect(harness.api().collapsed).toBe(true);
    expect(onSizeChangeEnd.mock.calls.map(([details]) => details.size)).toEqual([50]);
    press(harness, "Enter");
    expect(harness.api().collapsed).toBe(false);
    expect(onSizeChangeEnd.mock.calls.map(([details]) => details.size)).toEqual([50, 50]);
  });

  it("reports a fold by Home the same way it reports one by Enter", () => {
    const byHome = vi.fn();
    const byEnter = vi.fn();
    press(run({ collapsible: true, onSizeChangeEnd: byHome }), "Home");
    press(run({ collapsible: true, onSizeChangeEnd: byEnter }), "Enter");
    expect(byHome.mock.calls).toEqual(byEnter.mock.calls);
    expect(byHome).toHaveBeenCalledTimes(1);
  });

  it("reports a fold made by a drag once, at the release", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ collapsible: true, min: 20, collapsedSize: 4, onSizeChangeEnd });
    drag(harness, [-45], 100);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
    endDrag(harness, -45);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 50 });
  });

  it("reports nothing for a drag released where it began", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ onSizeChangeEnd });
    drag(harness, [100, 200, -50], 1000);
    endDrag(harness, 0);
    expect(harness.api().size).toBe(50);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports nothing for a drag that folds and comes back to where it began", () => {
    const onSizeChangeEnd = vi.fn();
    const harness = run({ collapsible: true, min: 20, collapsedSize: 4, onSizeChangeEnd });
    drag(harness, [-45], 100);
    expect(harness.api().collapsed).toBe(true);
    endDrag(harness, 0);
    expect(harness.api().collapsed).toBe(false);
    expect(harness.api().size).toBe(50);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });
});

describe("splitter — the API", () => {
  it("clamps a size it is given, and reports it", () => {
    const onSizeChange = vi.fn();
    const harness = run({ min: 10, max: 90, onSizeChange });
    harness.api().setSize(500);
    expect(harness.api().size).toBe(90);
    harness.api().setSize(-5);
    expect(harness.api().size).toBe(10);
    expect(onSizeChange).toHaveBeenCalledTimes(2);
  });

  it("keeps the size while collapsed, and paints it again on restore", () => {
    const harness = run({ collapsible: true, collapsedSize: 0 });
    harness.api().setCollapsed(true);
    harness.api().setSize(70);
    expect(harness.api().getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "0%" });
    harness.api().setCollapsed(false);
    expect(harness.api().getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "70%" });
  });
});

describe("splitter — a controlled size under a parent that answers later", () => {
  function deferredParent(props: SplitterMachineProps) {
    const requests: number[] = [];
    const harness = run({
      ...props,
      onSizeChange: ({ size }) => {
        requests.push(size);
      },
    });
    return {
      harness,
      requests,
      settle: (next: number) => harness.setProps({ size: next }),
    };
  }

  it("keeps the size the parent holds until the parent answers", () => {
    const { harness, requests } = deferredParent({ size: 40 });
    adjust(harness, "moveRight");
    expect(requests).toEqual([41]);
    expect(harness.api().size).toBe(40);
    expect(harness.api().getHandleProps()["aria-valuenow"]).toBe(40);
  });

  it("stays where it was when the parent rejects, and asks again from there", () => {
    const { harness, requests } = deferredParent({ size: 40 });
    adjust(harness, "moveRight");
    harness.setProps({ size: 40 });
    adjust(harness, "moveRight");
    expect(requests).toEqual([41, 41]);
    expect(harness.api().size).toBe(40);
  });

  it("follows the parent when it absorbs the change, and moves on from the new size", () => {
    const { harness, requests, settle } = deferredParent({ size: 40 });
    adjust(harness, "moveRight");
    settle(41);
    expect(harness.api().size).toBe(41);
    adjust(harness, "moveRight");
    expect(requests).toEqual([41, 42]);
    settle(42);
    expect(harness.api().size).toBe(42);
    expect(harness.api().getPanelProps()["style"]).toEqual({ "--sui-splitter-size": "42%" });
  });

  it("answers from where the gesture began, never from the stale size the parent still holds", () => {
    const { harness, requests, settle } = deferredParent({ size: 50 });
    drag(harness, [100]);
    expect(harness.api().size).toBe(50);

    harness.service.send({ type: "HANDLE.DRAG", position: 200 });
    expect(requests).toEqual([60, 70]);

    settle(70);
    harness.service.send({ type: "HANDLE.DRAG", position: 250 });
    expect(requests).toEqual([60, 70, 75]);
  });

  it("reports the end of a gesture with the size the parent holds when the write lands", () => {
    const onSizeChangeEnd = vi.fn();
    const { harness, settle } = deferredParent({ size: 50, onSizeChangeEnd });
    drag(harness, [100]);
    settle(60);
    endDrag(harness, 100);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 60 });
  });

  describe("the end of a change carries the size just written", () => {
    function pending(props: SplitterMachineProps = {}) {
      const onSizeChangeEnd = vi.fn();
      const parent = deferredParent({ size: 50, min: 10, max: 90, onSizeChangeEnd, ...props });
      return { ...parent, onSizeChangeEnd };
    }

    it("for an arrow key, which a parent that has not answered still holds at 50", () => {
      const { harness, onSizeChangeEnd } = pending();
      press(harness, "ArrowRight");
      expect(harness.api().size).toBe(50);
      expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 51 });
    });

    it("for Home and End", () => {
      const { harness, onSizeChangeEnd } = pending();
      press(harness, "Home");
      press(harness, "End");
      expect(onSizeChangeEnd.mock.calls.map(([details]) => details.size)).toEqual([10, 90]);
    });

    it("for a double-click, which names the default and not the size before it", () => {
      const { harness, onSizeChangeEnd } = pending({ size: 70, defaultSize: 30 });
      harness.service.send({ type: "HANDLE.RESET" });
      expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 30 });
    });

    it("for the end of a drag whose last write has not landed", () => {
      const { harness, onSizeChangeEnd } = pending();
      drag(harness, [100]);
      endDrag(harness, 200);
      expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
      expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 70 });
    });

    it("for the commit of a gamepad hold, and nothing for a release that rolls back to the entry size", () => {
      const bus = stubBus();
      const { harness, onSizeChangeEnd } = pending({ intents: bus.host });
      harness.service.send({ type: "HANDLE.FOCUS" });
      bus.dispatch("select");
      bus.dispatch("moveRight");
      bus.dispatch("end");
      bus.dispatch("select");
      expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 90 });

      onSizeChangeEnd.mockClear();
      bus.dispatch("select");
      bus.dispatch("end");
      bus.dispatch("back");
      expect(onSizeChangeEnd).not.toHaveBeenCalled();
    });
  });

  it("does not move the panel under a parent that rejects every write of a gesture", () => {
    const { harness, requests } = deferredParent({ size: 50 });
    drag(harness, [100, 200]);
    endDrag(harness, 200);
    expect(requests).toEqual([60, 70, 70]);
    expect(harness.api().size).toBe(50);
    expect(harness.api().dragging).toBe(false);
  });

  it("holds a controlled collapse the parent has not applied", () => {
    const onCollapsedChange = vi.fn();
    const harness = run({ collapsible: true, collapsed: false, onCollapsedChange });
    harness.service.send({ type: "HANDLE.TOGGLE" });
    expect(onCollapsedChange).toHaveBeenCalledWith({ collapsed: true });
    expect(harness.api().collapsed).toBe(false);

    harness.setProps({ collapsed: true });
    expect(harness.api().collapsed).toBe(true);
    expect(harness.api().getPanelProps()["data-collapsed"]).toBe("");
  });
});

describe("splitter — the pad's grip", () => {
  function focused(props: SplitterMachineProps = {}) {
    const bus = stubBus();
    const harness = run({ intents: bus.host, ...props });
    harness.service.send({ type: "HANDLE.FOCUS" });
    return { bus, harness };
  }

  it("takes hold on A while focused, and not before", () => {
    const bus = stubBus();
    const harness = run({ intents: bus.host });
    expect(bus.depth()).toBe(0);

    harness.service.send({ type: "HANDLE.FOCUS" });
    expect(bus.depth()).toBe(1);
    expect(harness.service.state.get()).toBe("focused");
    expect(bus.dispatch("select")).toBe(true);
    expect(harness.service.state.get()).toBe("engaged");
    expect(harness.api().engaged).toBe(true);
    expect(harness.api().getHandleProps()["data-engaged"]).toBe("");

    harness.service.send({ type: "HANDLE.BLUR" });
    expect(bus.depth()).toBe(0);
  });

  it("never takes hold from the keyboard, and lets other intents fall through", () => {
    const { bus, harness } = focused();
    expect(bus.dispatch("select", "keyboard")).toBe(false);
    expect(bus.dispatch("moveRight")).toBe(false);
    expect(harness.service.state.get()).toBe("focused");
  });

  it("adjusts on the d-pad while held and reports the end once, on A", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ onSizeChangeEnd });
    bus.dispatch("select");

    bus.dispatch("moveRight");
    bus.dispatch("moveRight");
    bus.dispatch("moveLeft");
    expect(harness.api().size).toBe(51);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();

    bus.dispatch("select");
    expect(harness.service.state.get()).toBe("focused");
    expect(harness.api().size).toBe(51);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 51 });
  });

  it("gives the entry size and the entry collapse back on B, and reports nothing since nothing changed", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ collapsible: true, onSizeChangeEnd });
    bus.dispatch("select");
    bus.dispatch("moveRight");
    bus.dispatch("end");
    harness.api().toggle();
    expect(harness.api().size).toBe(100);

    bus.dispatch("back");
    expect(harness.service.state.get()).toBe("focused");
    expect(harness.api().size).toBe(50);
    expect(harness.api().collapsed).toBe(false);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports nothing for a hold released on the size it began with", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ onSizeChangeEnd });
    bus.dispatch("select");
    bus.dispatch("moveRight");
    bus.dispatch("moveLeft");
    expect(harness.api().size).toBe(50);
    bus.dispatch("select");
    expect(harness.service.state.get()).toBe("focused");
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports a fold made during a hold once, when the hold is committed", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ collapsible: true, onSizeChangeEnd });
    bus.dispatch("select");
    harness.api().toggle();
    expect(harness.api().collapsed).toBe(true);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
    bus.dispatch("select");
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 50 });
  });

  it("reports a `setCollapsed` made during a hold once, when the hold is committed", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ collapsible: true, onSizeChangeEnd });
    bus.dispatch("select");
    harness.api().setCollapsed(true);
    expect(harness.api().collapsed).toBe(true);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
    bus.dispatch("select");
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    expect(onSizeChangeEnd).toHaveBeenCalledWith({ size: 50 });
  });

  it("gives back a `setCollapsed` made during a hold on B", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ collapsible: true, onSizeChangeEnd });
    bus.dispatch("select");
    harness.api().setCollapsed(true);
    bus.dispatch("back");
    expect(harness.api().collapsed).toBe(false);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("rolls back when the handle loses focus during a hold, and reports nothing", () => {
    const onSizeChange = vi.fn();
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ onSizeChange, onSizeChangeEnd });
    bus.dispatch("select");
    for (let step = 0; step < 10; step++) bus.dispatch("moveRight");
    expect(harness.api().size).toBe(60);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();

    harness.service.send({ type: "HANDLE.BLUR" });
    expect(harness.service.state.get()).toBe("idle");
    expect(bus.depth()).toBe(0);
    expect(harness.api().size).toBe(50);
    expect(onSizeChange).toHaveBeenLastCalledWith({ size: 50 });
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("reports nothing for a hold released without a move", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus } = focused({ onSizeChangeEnd });
    bus.dispatch("select");
    bus.dispatch("select");
    bus.dispatch("select");
    bus.dispatch("back");
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("maps the d-pad through the same axis, side and direction as the keyboard", () => {
    const { bus, harness } = focused({ panelSide: "end", dir: "rtl" });
    bus.dispatch("select");
    bus.dispatch("moveRight");
    expect(harness.api().size).toBe(51);
    bus.dispatch("moveLeft");
    bus.dispatch("moveLeft");
    expect(harness.api().size).toBe(49);
  });

  it("ignores the other axis while held", () => {
    const { bus, harness } = focused();
    bus.dispatch("select");
    bus.dispatch("moveUp");
    bus.dispatch("pageDown");
    expect(harness.api().size).toBe(50);
  });

  it("refuses to engage without a bus, when disabled and while a gesture runs", () => {
    const bare = run();
    bare.service.send({ type: "HANDLE.FOCUS" });
    bare.service.send({ type: "HANDLE.ENGAGE" });
    expect(bare.service.state.get()).toBe("focused");

    const busy = focused();
    busy.harness.service.send({ type: "HANDLE.DRAG_START", containerSize: 100 });
    busy.harness.service.send({ type: "HANDLE.ENGAGE" });
    expect(busy.harness.service.state.get()).toBe("focused");

    const bus = stubBus();
    const disabled = run({ intents: bus.host, disabled: true });
    disabled.service.send({ type: "HANDLE.FOCUS" });
    expect(bus.dispatch("select")).toBe(false);
    expect(disabled.service.state.get()).toBe("focused");
  });

  it("unmounts its scope with the machine, and says nothing about it", () => {
    const onSizeChangeEnd = vi.fn();
    const { bus, harness } = focused({ onSizeChangeEnd });
    bus.dispatch("select");
    expect(bus.depth()).toBe(1);
    harness.service.stop();
    expect(bus.depth()).toBe(0);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });
});

describe("splitter — focus", () => {
  it("marks the focus and clears it on blur", () => {
    const harness = run();
    harness.service.send({ type: "HANDLE.FOCUS" });
    expect(harness.service.state.get()).toBe("focused");
    harness.service.send({ type: "HANDLE.BLUR" });
    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().focusVisible).toBe(false);
    expect(harness.api().getHandleProps()["data-focus-visible"]).toBeUndefined();
  });
});
