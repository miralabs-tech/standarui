/**
 * The node half of `meter`: no document, no framework, no page — the shape a
 * server render has. `meter.browser.test.ts` covers what needs a real engine.
 *
 * Some cases start the service anyway: `trackParts` observes a root the scope
 * answers `null` for, so starting is safe here, and it is the only way to see
 * an event delivered — a not-started service queues what it is sent.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./meter.connect";
import { machine } from "./meter.machine";
import type { MeterApi, MeterMachineProps, MeterSchema, MeterValence } from "./meter.types";

type Api = MeterApi<PlainPropTypes>;

const build = (props: MeterMachineProps = {}) =>
  connectWithoutDom<MeterSchema, Api>({ machine, connect, id: "m1", props });

describe("meter without a DOM", () => {
  it("connects on a server, with the whole ARIA range always present", () => {
    const harness = build({ defaultValue: 40 });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.role).toBe("meter");
    expect(root["aria-valuemin"]).toBe(0);
    expect(root["aria-valuemax"]).toBe(100);
    expect(root["aria-valuenow"]).toBe(40);
    expect(root["aria-valuetext"]).toBe("40%");
    // The label part cannot be seen from here, so the IDREF is withheld — the
    // same answer as the first client render, before the mount effect.
    expect(root["aria-labelledby"]).toBeUndefined();
    expect(root.style).toEqual({ "--sui-meter-percent": "40%" });
  });

  it("starts at `min` when no default is given, even on a shifted range", () => {
    const api = build({ min: 2, max: 8 }).api();

    expect(api.value).toBe(2);
    expect(api.percent).toBe(0);
    expect(api.getRootProps()["aria-valuenow"]).toBe(2);
  });

  it("clamps what it is told to the range", () => {
    const harness = build({ defaultValue: 0 });
    harness.service.start();

    harness.api().setValue(180);
    expect(harness.api().value).toBe(100);

    harness.api().setValue(-20);
    expect(harness.api().value).toBe(0);
  });

  it("reports without writing while controlled", () => {
    const onValueChange = vi.fn();
    const harness = build({ value: 10, onValueChange });
    harness.service.start();

    harness.api().setValue(60);

    expect(onValueChange).toHaveBeenCalledWith({ value: 60 });
    expect(harness.api().value).toBe(10);

    harness.setProps({ value: 60 });
    expect(harness.api().value).toBe(60);
  });

  it("maps the percentage against a non-default range", () => {
    const api = build({ defaultValue: 5, min: 0, max: 20 }).api();

    expect(api.percent).toBe(25);
    expect(api.valueAsText).toBe("25%");
  });

  it("answers 100 on a degenerate range rather than dividing by zero", () => {
    const api = build({ defaultValue: 5, min: 10, max: 10 }).api();

    expect(api.percent).toBe(100);
    // The reported value is clamped into the range, degenerate or not.
    expect(api.getRootProps()["aria-valuenow"]).toBe(10);
  });

  it("has no valence and no data-valence anywhere while no threshold is given", () => {
    const api = build({ defaultValue: 50 }).api();

    expect(api.valence).toBe("none");
    for (const props of [
      api.getRootProps(),
      api.getLabelProps(),
      api.getTrackProps(),
      api.getRangeProps(),
      api.getValueTextProps(),
    ]) {
      expect(props["data-valence"]).toBeUndefined();
    }
  });

  it("grades the value by its distance from the optimum's region", () => {
    // low: 30, high: 70 — three regions; the valence is the region distance,
    // the way the HTML `<meter>` element grades it.
    const cases: readonly [optimum: number, value: number, valence: MeterValence][] = [
      [90, 10, "critical"],
      [90, 50, "suboptimal"],
      [90, 80, "optimum"],
      [50, 10, "suboptimal"],
      [50, 50, "optimum"],
      [50, 90, "suboptimal"],
      [10, 20, "optimum"],
      [10, 50, "suboptimal"],
      [10, 90, "critical"],
    ];

    for (const [optimum, value, valence] of cases) {
      const api = build({ low: 30, high: 70, optimum, defaultValue: value }).api();
      expect(api.valence, `optimum ${optimum}, value ${value}`).toBe(valence);
      expect(api.getRangeProps()["data-valence"]).toBe(valence);
    }
  });

  it("announces the valence only once it has been given the words for it", () => {
    const graded = { low: 30, high: 70, optimum: 90, defaultValue: 10 } as const;

    // Colour and `data-valence` only, which is what the audit measured: the two
    // ramps are 1.01:1 apart in greyscale and no assistive technology reads a
    // data attribute. The number is announced, the grading is not.
    const silent = build(graded).api();
    expect(silent.valence).toBe("critical");
    expect(silent.getRootProps()["aria-valuetext"]).toBe("10%");
    expect(silent.valueAsAnnouncedText).toBe("10%");

    const spoken = build({
      ...graded,
      valenceLabels: { critical: "critically low", suboptimal: "low" },
    }).api();
    expect(spoken.getRootProps()["aria-valuetext"]).toBe("10%, critically low");
    // The visible text is untouched — the grading belongs in the announcement,
    // not painted twice on screen.
    expect(spoken.valueAsText).toBe("10%");

    // A region the consumer did not name is simply not announced, rather than
    // announced in a language the core picked.
    const partial = build({
      ...graded,
      defaultValue: 80,
      valenceLabels: { critical: "critically low" },
    }).api();
    expect(partial.valence).toBe("optimum");
    expect(partial.getRootProps()["aria-valuetext"]).toBe("80%");
  });

  it("keeps the bounds inside the middle region", () => {
    expect(build({ low: 30, high: 70, optimum: 50, defaultValue: 30 }).api().valence).toBe(
      "optimum",
    );
    expect(build({ low: 30, high: 70, optimum: 50, defaultValue: 70 }).api().valence).toBe(
      "optimum",
    );
  });

  it("defaults the optimum to the midpoint, like <meter>", () => {
    expect(build({ low: 30, high: 70, defaultValue: 50 }).api().valence).toBe("optimum");
    // Midpoint sits in the middle region, so an out-of-band value is one step
    // away, never two.
    expect(build({ low: 30, high: 70, defaultValue: 10 }).api().valence).toBe("suboptimal");
  });

  it("activates the valence from one threshold alone", () => {
    expect(build({ low: 30, defaultValue: 40 }).api().valence).toBe("optimum");
    expect(build({ low: 30, defaultValue: 10 }).api().valence).toBe("suboptimal");
    expect(build({ high: 70, defaultValue: 90 }).api().valence).toBe("suboptimal");
  });

  it("normalises a crossed pair instead of turning the middle region inside out", () => {
    // lo = 60, hi floors at lo: below is region 0, above is region 2, and only
    // exactly 60 is the middle.
    expect(build({ low: 60, high: 40, optimum: 80, defaultValue: 50 }).api().valence).toBe(
      "critical",
    );
    expect(build({ low: 60, high: 40, optimum: 80, defaultValue: 60 }).api().valence).toBe(
      "suboptimal",
    );
  });

  it("clamps an optimum that escapes the range", () => {
    expect(build({ low: 30, high: 70, optimum: 150, defaultValue: 80 }).api().valence).toBe(
      "optimum",
    );
  });

  it("formats percent as the fraction and any other style as the value", () => {
    expect(build({ defaultValue: 5, min: 0, max: 20 }).api().valueAsText).toBe("25%");

    const gigabytes = build({
      defaultValue: 620,
      max: 1000,
      formatOptions: { style: "unit", unit: "gigabyte" },
    }).api();
    // The value itself, not the 62 % it happens to represent.
    expect(gigabytes.valueAsText).toMatch(/620/);

    const french = build({ defaultValue: 42, locale: "fr-FR" }).api();
    // French typography sets a space before the percent sign.
    expect(french.valueAsText).toMatch(/42\s%/u);
  });

  it("keeps the IDREF withheld after PARTS.SYNC when there is no DOM to find a label in", () => {
    const harness = build({ defaultValue: 40 });
    harness.service.start();

    harness.service.send({ type: "PARTS.SYNC" });

    expect(harness.api().getRootProps()["aria-labelledby"]).toBeUndefined();
  });
});
