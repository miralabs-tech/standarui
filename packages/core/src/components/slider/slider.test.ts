/**
 * The node half of `slider`: no document, no framework, the shape a server render
 * has — and, above all, the arithmetic.
 *
 * Almost every trap this component is famous for is a pure function, and every
 * one of them is exercised here rather than through a page: the decimal-safe
 * snap, the large step that has to scale with the range instead of the step, the
 * 32 cells of the RTL × orientation table, the pointer→percent conversion with
 * its two independent inversions. A slider that gets those wrong is wrong in
 * every framework at once, so none of it belongs in a browser.
 *
 * What is *not* here is anything that needs the machine running. `start()` is the
 * mount effect and `trackModality` holds the modality handle for the document,
 * so a started slider needs a real one — `slider.browser.test.ts` owns the
 * callbacks, the gesture, the keyboard and the pad.
 */

import { describe, expect, it, vi } from "vitest";
import type { Direction, Orientation } from "../../types";
import { arrayEquals } from "../../utils/equality";
import {
  constrainValue,
  fromPercent,
  getPercentFromPoint,
  normalizeValues,
  resolveLargeStep,
  resolveMarks,
  setValueAtIndex,
  snapToStep,
  toPercent,
  toValueArray,
} from "../../utils/range";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./slider.connect";
import { machine } from "./slider.machine";
import { getKeyIntent, resolveDirection, toAdjustEvent } from "./slider.props";
import type {
  SliderAdjustmentKind,
  SliderApi,
  SliderIntent,
  SliderMachineProps,
  SliderRange,
  SliderSchema,
} from "./slider.types";

type Api = SliderApi<PlainPropTypes>;

const build = (props: SliderMachineProps = {}) =>
  connectWithoutDom<SliderSchema, Api>({ machine, connect, id: "sl1", props });

const range = (overrides: Partial<SliderRange> = {}): SliderRange => ({
  min: 0,
  max: 100,
  step: 1,
  minStepsBetweenThumbs: 0,
  ...overrides,
});

function quietly<T>(run: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  try {
    return { result: run(), warnings };
  } finally {
    spy.mockRestore();
  }
}

describe("slider — the value model", () => {
  it("takes a scalar for ergonomics and never lets one reach the context", () => {
    expect(toValueArray(50, 0)).toEqual([50]);
    expect(toValueArray(undefined, 10)).toEqual([10]);
    expect(toValueArray([20, 80], 0)).toEqual([20, 80]);

    // A copy, not the consumer's array: the machine writes into this one.
    const source = [20, 80];
    expect(toValueArray(source, 0)).not.toBe(source);

    expect(build({ defaultValue: 40 }).api().value).toEqual([40]);
    expect(build({ defaultValue: [20, 80] }).api().value).toEqual([20, 80]);
    // No value at all is the minimum, not zero — which is the same thing only
    // when the range happens to start there.
    expect(build({ min: 10, max: 20 }).api().value).toEqual([10]);
  });

  it("clamps a default value that starts outside the range, at both ends", () => {
    expect(build({ defaultValue: 500 }).api().value).toEqual([100]);
    expect(build({ defaultValue: -20 }).api().value).toEqual([0]);
  });

  it("snaps in decimals without leaking one, which is what a reader would say out loud", () => {
    // The textbook formula — round((v − min) / step) × step + min — answers
    // 0.30000000000000004 here, and that number reaches `aria-valuenow`.
    expect(snapToStep(0.3, 0, 0.1)).toBe(0.3);
    expect(snapToStep(0.28, 0, 0.1)).toBe(0.3);
    expect(constrainValue(0.7, range({ max: 1, step: 0.1 }))).toBe(0.7);
    expect(build({ min: 0, max: 1, step: 0.1, defaultValue: 0.3 }).api().value).toEqual([0.3]);

    // The offset grid too: counted from `min`, not from zero.
    expect(snapToStep(1.25, 1, 0.5)).toBe(1.5);
  });

  it("clamps after snapping, because a snap can push a value past a max off the grid", () => {
    // 7 is not on the 3-grid and 9 is past the end: without the second clamp the
    // value lands outside the range it was just clamped into.
    expect(constrainValue(7, range({ max: 7, step: 3 }))).toBe(6);
  });

  it("survives a max below its min instead of looping on an empty range", () => {
    const { result, warnings } = quietly(() => build({ min: 50, max: 10 }).api());

    expect(result.value).toEqual([50]);
    expect(result.getThumbProps({ index: 0 })["aria-valuemax"]).toBe(50);
    // An empty range has no percentage to report; reporting one would place a
    // thumb somewhere it cannot be.
    expect(result.valuePercent).toEqual([0]);
    expect(warnings.some((line) => line.includes("max 10 is below min 50"))).toBe(true);
  });

  it("falls back to a step of 1 when it is given one that cannot move a value", () => {
    const { result, warnings } = quietly(() => build({ step: 0, defaultValue: 2.5 }).api());

    // Snapped to the fallback grid. Left as 0 the snap is a no-op and 2.5 stands,
    // which is how a broken step hides.
    expect(result.value).toEqual([3]);
    expect(warnings.some((line) => line.includes("step must be positive"))).toBe(true);
  });

  it("scales the large step with the range rather than with the step", () => {
    // A tenth of the range, which is the whole point: `step × 10` on a 0→1000
    // slider is 10, and PageUp would take a hundred presses to cross it.
    expect(resolveLargeStep(undefined, 0, 100, 1)).toBe(10);
    expect(resolveLargeStep(undefined, 0, 1000, 1)).toBe(100);
    // Aligned on the step grid, so a page never lands between two reachable values.
    expect(resolveLargeStep(undefined, 0, 100, 3)).toBe(9);
    // And never smaller than one step, or PageUp would do less than an arrow.
    expect(resolveLargeStep(undefined, 0, 2, 5)).toBe(5);
    expect(resolveLargeStep(1, 0, 100, 10)).toBe(10);
    expect(resolveLargeStep(25, 0, 100, 1)).toBe(25);
  });

  it("reports no change at the ends, which is what keeps onValueChange quiet", () => {
    const values = [100];
    const next = setValueAtIndex(values, 0, 101, range());

    expect(next).toEqual([100]);
    // The bindable's `isEqual`: a fresh array holding the same numbers is not a
    // change, so a held arrow key at the maximum says nothing at all.
    expect(arrayEquals(values, next)).toBe(true);
    expect(arrayEquals([50], [50, 50])).toBe(false);
    expect(arrayEquals([50], [51])).toBe(false);
  });

  it("keeps the thumbs apart only once there are two of them", () => {
    const spaced = range({ minStepsBetweenThumbs: 10 });

    // One thumb: the neighbours are the bounds and the spacing has nothing to
    // apply to. The v1 slider must not pay for the Phase 7 model.
    expect(setValueAtIndex([20], 0, 95, spaced)).toEqual([95]);
    // Two: the lower one stops ten steps short of the upper.
    expect(setValueAtIndex([20, 50], 0, 45, spaced)).toEqual([40, 50]);
    expect(setValueAtIndex([20, 50], 1, 25, spaced)).toEqual([20, 30]);
    // And a pair given crossed pushes back into order rather than staying crossed.
    expect(normalizeValues([80, 20], spaced)).toEqual([80, 90]);
  });
});

describe("slider — the direction table", () => {
  interface Row {
    readonly intent: SliderIntent;
    readonly horizontalLtr: SliderAdjustmentKind;
    readonly horizontalRtl: SliderAdjustmentKind;
    readonly vertical: SliderAdjustmentKind;
    readonly large: boolean;
  }

  /**
   * The whole mirror, in one table: eight inputs against `ltr`/`rtl` and
   * horizontal/vertical is 32 cells, and three of the columns are the traps.
   * Up/down have no writing order to mirror. Home/End are *the minimum* and *the
   * maximum*, not the left and right ends — the APG is explicit and the mistake
   * is the classic one. And the vertical axis reads from the bottom under both
   * directions, so `dir` has no column of its own there.
   */
  const TABLE: readonly Row[] = [
    {
      intent: "moveRight",
      horizontalLtr: "increment",
      horizontalRtl: "decrement",
      vertical: "increment",
      large: false,
    },
    {
      intent: "moveLeft",
      horizontalLtr: "decrement",
      horizontalRtl: "increment",
      vertical: "decrement",
      large: false,
    },
    {
      intent: "moveUp",
      horizontalLtr: "increment",
      horizontalRtl: "increment",
      vertical: "increment",
      large: false,
    },
    {
      intent: "moveDown",
      horizontalLtr: "decrement",
      horizontalRtl: "decrement",
      vertical: "decrement",
      large: false,
    },
    {
      intent: "pageUp",
      horizontalLtr: "increment",
      horizontalRtl: "increment",
      vertical: "increment",
      large: true,
    },
    {
      intent: "pageDown",
      horizontalLtr: "decrement",
      horizontalRtl: "decrement",
      vertical: "decrement",
      large: true,
    },
    {
      intent: "home",
      horizontalLtr: "min",
      horizontalRtl: "min",
      vertical: "min",
      large: false,
    },
    {
      intent: "end",
      horizontalLtr: "max",
      horizontalRtl: "max",
      vertical: "max",
      large: false,
    },
  ];

  for (const row of TABLE) {
    it(`resolves ${row.intent} in all four layouts`, () => {
      expect(resolveDirection(row.intent, "ltr", "horizontal")).toEqual({
        kind: row.horizontalLtr,
        large: row.large,
      });
      expect(resolveDirection(row.intent, "rtl", "horizontal")).toEqual({
        kind: row.horizontalRtl,
        large: row.large,
      });
      expect(resolveDirection(row.intent, "ltr", "vertical")).toEqual({
        kind: row.vertical,
        large: row.large,
      });
      expect(resolveDirection(row.intent, "rtl", "vertical")).toEqual({
        kind: row.vertical,
        large: row.large,
      });
    });
  }

  it("leaves Home and End alone in RTL, where a mirrored keymap breaks them", () => {
    // Stated on its own because it is the failure a wholesale mirror produces:
    // Home would send the thumb to the maximum, and the slider would look right
    // in LTR while being backwards for half the world's readers.
    expect(resolveDirection("home", "rtl", "horizontal").kind).toBe("min");
    expect(resolveDirection("end", "rtl", "horizontal").kind).toBe("max");
  });

  it("maps the eight APG keys onto the pad's own intents, and nothing else", () => {
    const keys: Record<string, SliderIntent> = {
      ArrowRight: "moveRight",
      ArrowLeft: "moveLeft",
      ArrowUp: "moveUp",
      ArrowDown: "moveDown",
      PageUp: "pageUp",
      PageDown: "pageDown",
      Home: "home",
      End: "end",
    };
    for (const [key, intent] of Object.entries(keys)) expect(getKeyIntent(key)).toBe(intent);

    for (const key of ["Enter", " ", "Escape", "Tab", "a"]) {
      expect(getKeyIntent(key)).toBeNull();
    }
  });

  it("turns an adjustment into the one event both sources send", () => {
    expect(toAdjustEvent({ kind: "increment", large: true }, 1)).toEqual({
      type: "THUMB.INCREMENT",
      index: 1,
      large: true,
    });
    expect(toAdjustEvent({ kind: "decrement", large: false }, 0)).toEqual({
      type: "THUMB.DECREMENT",
      index: 0,
      large: false,
    });
    expect(toAdjustEvent({ kind: "min", large: false }, 0)).toEqual({
      type: "THUMB.SET_MIN",
      index: 0,
    });
    expect(toAdjustEvent({ kind: "max", large: false }, 0)).toEqual({
      type: "THUMB.SET_MAX",
      index: 0,
    });
  });
});

describe("slider — pointer arithmetic", () => {
  const rect = { x: 20, y: 40, width: 200, height: 100 };
  const point = (
    x: number,
    y: number,
    options: { dir?: Direction; orientation?: Orientation; thumbSize?: number } = {},
  ): number =>
    getPercentFromPoint(x, y, {
      rect,
      orientation: options.orientation ?? "horizontal",
      dir: options.dir ?? "ltr",
      thumbSize: options.thumbSize ?? 0,
    });

  it("measures along the control under `center`, where the travel is the whole box", () => {
    expect(point(20, 90)).toBe(0);
    expect(point(120, 90)).toBe(0.5);
    expect(point(220, 90)).toBe(1);
  });

  it("measures against the shortened travel under `contain`", () => {
    // A 20px thumb: its centre runs from 10px in to 10px short of the end, so the
    // track it can actually reach is 180 long and the ends are still reachable.
    expect(point(30, 90, { thumbSize: 20 })).toBe(0);
    expect(point(120, 90, { thumbSize: 20 })).toBe(0.5);
    expect(point(210, 90, { thumbSize: 20 })).toBe(1);
  });

  it("mirrors the horizontal axis in RTL and nothing else", () => {
    expect(point(20, 90, { dir: "rtl" })).toBe(1);
    expect(point(220, 90, { dir: "rtl" })).toBe(0);
  });

  it("reads the vertical axis from the bottom, under both directions", () => {
    // 0% at the bottom is not a writing order, it is which way up a value goes.
    expect(point(70, 140, { orientation: "vertical" })).toBe(0);
    expect(point(70, 40, { orientation: "vertical" })).toBe(1);
    expect(point(70, 90, { orientation: "vertical", dir: "rtl" })).toBe(0.5);
  });

  it("clamps a point that left the box, and refuses to divide by an empty travel", () => {
    expect(point(-500, 90)).toBe(0);
    expect(point(5000, 90)).toBe(1);
    expect(
      getPercentFromPoint(100, 90, {
        rect,
        orientation: "horizontal",
        dir: "ltr",
        // A thumb as wide as its control: no travel, and no division either.
        thumbSize: 200,
      }),
    ).toBe(0);
  });

  it("converts both ways against the range", () => {
    expect(toPercent(25, 0, 100)).toBe(0.25);
    expect(toPercent(5, 0, 20)).toBe(0.25);
    // A controlled value outside the range still paints inside it.
    expect(toPercent(500, 0, 100)).toBe(1);
    expect(toPercent(1, 5, 5)).toBe(0);
    expect(fromPercent(0.25, 0, 100)).toBe(25);
    expect(fromPercent(0.5, 10, 20)).toBe(15);
  });
});

describe("slider — marks", () => {
  it("resolves the three shapes it accepts", () => {
    expect(resolveMarks(undefined, 0, 100, 1)).toEqual([]);
    expect(resolveMarks([0, 33, 100], 0, 100, 1)).toEqual([0, 33, 100]);
    expect(resolveMarks(5, 0, 100, 1)).toEqual([0, 25, 50, 75, 100]);
    expect(resolveMarks("step", 0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("caps a count that is a mistake rather than a design", () => {
    expect(resolveMarks("step", 0, 1000, 1)).toHaveLength(256);
    expect(resolveMarks(1, 0, 100, 1)).toEqual([0]);
    expect(resolveMarks(0, 0, 100, 1)).toEqual([]);
  });

  it("hands the resolved positions to the consumer, which is what it maps over", () => {
    expect(build({ marks: 3 }).api().marks).toEqual([0, 50, 100]);
  });
});

describe("slider — connect on a server", () => {
  it("connects with no document, from the initial state alone", () => {
    const harness = build({ defaultValue: 40 });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    // Pure: no DOM read decides it, so the server and the first client render
    // agree on the markup.
    expect(harness.service.state.get()).toBe("idle");
    expect(api.dragging).toBe(false);
    expect(api.engaged).toBe(false);
    expect(api.focusedIndex).toBe(-1);
    expect(api.focusSource).toBeNull();
    expect(api.focusVisible).toBe(false);
  });

  it("places the percentages the sheet lays out from", () => {
    const api = build({ defaultValue: 40 }).api();

    expect(api.valuePercent).toEqual([0.4]);
    expect(api.getRootProps().style).toEqual({ "--sui-slider-percent": "40%" });
    expect(api.getThumbProps({ index: 0 }).style).toEqual({
      "--sui-slider-thumb-percent": "40%",
    });
    // Both ends of the fill, always — which is what makes `range-slider` a preset
    // later instead of a second component.
    expect(api.getRangeProps().style).toEqual({
      "--sui-slider-range-start": "0%",
      "--sui-slider-range-end": "40%",
    });
  });

  it("rounds the percentage instead of serialising seventeen digits of it", () => {
    const api = build({ defaultValue: 1, min: 0, max: 3 }).api();

    expect(api.getRootProps().style).toEqual({ "--sui-slider-percent": "33.3333%" });
  });

  it("fills between the thumbs as soon as there are two", () => {
    const api = build({ defaultValue: [20, 80] }).api();

    expect(api.getRangeProps().style).toEqual({
      "--sui-slider-range-start": "20%",
      "--sui-slider-range-end": "80%",
    });
  });

  // The percentages alone cannot say whether the fill's leading side is a knob or
  // the track's edge: `range-start` is 0% for a lone knob and for a low knob on
  // the minimum, and the sheet owes those two different geometry.
  it("says whether the fill's leading side is a knob or the track's edge", () => {
    expect(build({ defaultValue: 40 }).api().getRangeProps()["data-bounded"]).toBeUndefined();
    expect(
      build({ defaultValue: [0, 80] })
        .api()
        .getRangeProps()["data-bounded"],
    ).toBe("");
    expect(
      build({ defaultValue: [20, 80] })
        .api()
        .getRangeProps()["data-bounded"],
    ).toBe("");
  });

  it("is a slider to a screen reader, and the thumb is the one that says so", () => {
    const api = build({ defaultValue: 40 }).api();
    const thumb = api.getThumbProps({ index: 0 });

    expect(thumb.role).toBe("slider");
    expect(thumb.tabIndex).toBe(0);
    expect(thumb["aria-valuemin"]).toBe(0);
    expect(thumb["aria-valuemax"]).toBe(100);
    expect(thumb["aria-valuenow"]).toBe(40);
    expect(thumb["aria-orientation"]).toBe("horizontal");
    expect(thumb["data-index"]).toBe(0);
  });

  it("withholds aria-valuetext when the format adds nothing to the number", () => {
    // `valuenow=50` beside `valuetext="50"` makes some readers say "50, 50".
    expect(build({ defaultValue: 50 }).api().getThumbProps({ index: 0 })["aria-valuetext"]).toBe(
      undefined,
    );

    const formatted = build({
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      formatOptions: { style: "percent" },
    })
      .api()
      .getThumbProps({ index: 0 });

    expect(formatted["aria-valuetext"]).toBe("50%");
  });

  it("lets a consumer write the whole string, per thumb", () => {
    const api = build({
      defaultValue: [1, 3],
      getValueText: ({ value, index }) => `thumb ${index}: ${value} of 100`,
    }).api();

    expect(api.valueAsText).toEqual(["thumb 0: 1 of 100", "thumb 1: 3 of 100"]);
  });

  it("narrows the reachable bounds to the neighbours once there are two thumbs", () => {
    const api = build({ defaultValue: [20, 80] }).api();

    // What the user can actually reach, which is not what the scale allows.
    expect(api.getThumbProps({ index: 0 })["aria-valuemax"]).toBe(80);
    expect(api.getThumbProps({ index: 1 })["aria-valuemin"]).toBe(20);
    expect(api.getThumbProps({ index: 0 })["aria-valuemin"]).toBe(0);
    expect(api.getThumbProps({ index: 1 })["aria-valuemax"]).toBe(100);
  });

  it("points at no label until one has been proved to exist", () => {
    // The regression the 2026-08-27 audit found in two components at once: every
    // fixture rendered its label, so a dangling IDREF was unobservable.
    expect(
      build({ defaultValue: 40 }).api().getThumbProps({ index: 0 })["aria-labelledby"],
    ).toBeUndefined();
  });

  it("carries the field's description through", () => {
    expect(
      build({ describedBy: "hint-1" }).api().getThumbProps({ index: 0 })["aria-describedby"],
    ).toBe("hint-1");
  });

  it("leaves the tab order entirely when disabled, rather than sitting in it at −1", () => {
    const api = build({ disabled: true }).api();
    const thumb = api.getThumbProps({ index: 0 });

    // A lone `tabindex="-1"` still answers a script's `.focus()` as though the
    // control were reachable.
    expect(thumb.tabIndex).toBeUndefined();
    expect(thumb["aria-disabled"]).toBe("true");
    expect(api.getRootProps()["data-disabled"]).toBe("");
  });

  it("promises read-only to assistive technology while staying in the tab order", () => {
    const api = build({ readOnly: true }).api();

    expect(api.getThumbProps({ index: 0 }).tabIndex).toBe(0);
    expect(api.getThumbProps({ index: 0 })["aria-readonly"]).toBe("true");
    expect(api.getRootProps()["data-readonly"]).toBe("");
  });

  it("submits through a hidden input rather than a second slider in the a11y tree", () => {
    const input = build({ defaultValue: 40, name: "volume", form: "prefs" })
      .api()
      .getHiddenInputProps({ index: 0 });

    expect(input.type).toBe("hidden");
    expect(input.name).toBe("volume");
    expect(input.form).toBe("prefs");
    expect(input.value).toBe(40);
    // No role, no tabindex, nothing to neutralise: it is not in the tree at all.
    expect(input.role).toBeUndefined();
    expect(input["aria-hidden"]).toBeUndefined();
  });

  it("keeps a disabled slider out of the submission, the way HTML does", () => {
    expect(build({ disabled: true }).api().getHiddenInputProps({ index: 0 }).disabled).toBe(true);
  });

  it("keeps the value text out of the accessibility tree, since the thumb already says it", () => {
    expect(build().api().getValueTextProps()["aria-hidden"]).toBe("true");
    expect(build().api().getMarkerGroupProps()["aria-hidden"]).toBe("true");
  });

  it("marks a tick as crossed or not, and places it", () => {
    const api = build({ defaultValue: 40, marks: [0, 50, 100] }).api();

    expect(api.getMarkerProps({ value: 0 })["data-state"]).toBe("in-range");
    expect(api.getMarkerProps({ value: 50 })["data-state"]).toBe("out-of-range");
    expect(api.getMarkerProps({ value: 50 }).style).toEqual({ "--sui-marker-percent": "50%" });
  });

  it("wears its layout on the root, where the sheet reads it", () => {
    const root = build({ dir: "rtl", orientation: "vertical" }).api().getRootProps();

    expect(root.dir).toBe("rtl");
    expect(root["data-orientation"]).toBe("vertical");
    // `contain` is the default: the knob never hangs out of its own box, which is
    // what survives an `overflow: hidden` and a 320px viewport in touch density.
    expect(root["data-thumb-alignment"]).toBe("contain");
    expect(build({ thumbAlignment: "center" }).api().getRootProps()["data-thumb-alignment"]).toBe(
      "center",
    );
  });

  it("queues a value written before it starts rather than losing it, and without warning", () => {
    const harness = build();
    const { warnings } = quietly(() => harness.api().setValue(70));

    expect(harness.service.status()).toBe("not-started");
    expect(harness.api().value).toEqual([0]);
    // The "sent after the service stopped" warning is the library's only leak
    // detector; a queued event must not spend it.
    expect(warnings).toEqual([]);
  });
});
