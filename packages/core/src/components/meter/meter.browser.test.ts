/**
 * The browser half of `meter`: real anatomy attributes, the label observer, the
 * custom property the fill reads, and the fact that Tab never stops here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getTabbables } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./meter.connect";
import { machine } from "./meter.machine";
import type { MeterApi, MeterMachineProps, MeterSchema } from "./meter.types";

type Api = MeterApi<DomPropTypes>;

const FULL = `<div><span class="label"></span><div class="track"><div class="range"></div></div><span class="value"></span></div>`;

function render(props: MeterMachineProps = {}, html: string = FULL) {
  return mountMachine<MeterSchema, Api>({
    machine,
    connect,
    html,
    id: "m1",
    props,
    // Queried by marker class rather than by position: the label comes and
    // goes in the cases below, and a paint that assumes a child order would
    // crash on the very mutation under test.
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      const label = root.querySelector(".label");
      if (label !== null) apply(label, api.getLabelProps());
      const track = root.querySelector(".track");
      if (track !== null) apply(track, api.getTrackProps());
      const range = root.querySelector(".range");
      if (range !== null) apply(range, api.getRangeProps());
      const value = root.querySelector(".value");
      if (value !== null) apply(value, api.getValueTextProps());
    },
  });
}

afterEach(() => {
  unmountAll();
});

describe("meter", () => {
  it("paints the meter role, the anatomy tokens and the derived ids", () => {
    const harness = render({ defaultValue: 40 });
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("meter");
    expect(root.getAttribute("data-scope")).toBe("meter");
    expect(root.getAttribute("data-part")).toBe("meter:root");
    expect(root.id).toBe("meter:m1:root");
    expect(root.getAttribute("aria-valuemin")).toBe("0");
    expect(root.getAttribute("aria-valuemax")).toBe("100");
    expect(root.getAttribute("aria-valuenow")).toBe("40");
    expect(root.getAttribute("aria-valuetext")).toBe("40%");
    expect(root.getAttribute("aria-labelledby")).toBe("meter:m1:label");
    expect(harness.part("label").id).toBe("meter:m1:label");
    expect(harness.part("track").getAttribute("data-part")).toBe("meter:track");
    expect(harness.part("range").getAttribute("data-part")).toBe("meter:range");
    expect(harness.part("value-text").getAttribute("aria-hidden")).toBe("true");
    expect(root.getAttribute("data-orientation")).toBe("horizontal");
  });

  it("drops the IDREF the moment the label leaves the DOM, and takes it back", async () => {
    const harness = render({ defaultValue: 40 });
    const root = harness.part("root");
    const label = harness.part("label");

    expect(root.getAttribute("aria-labelledby")).toBe("meter:m1:label");

    label.remove();
    // The MutationObserver's turn, not the reactivity graph's: nothing sent an
    // event, the DOM simply changed under the machine.
    await vi.waitFor(() => {
      expect(root.hasAttribute("aria-labelledby")).toBe(false);
    });

    root.prepend(label);
    await vi.waitFor(() => {
      expect(root.getAttribute("aria-labelledby")).toBe("meter:m1:label");
    });
  });

  it("stops observing once the service stops", async () => {
    const harness = render({ defaultValue: 40 });
    const root = harness.part("root");

    harness.service.stop();
    harness.part("label").remove();

    // Give an observer that survived its cleanup every chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(root.getAttribute("aria-labelledby")).toBe("meter:m1:label");
  });

  it("publishes the percentage as a custom property the fill reads", () => {
    const harness = render({ defaultValue: 25 });
    const root = harness.part("root");

    expect(root.style.getPropertyValue("--sui-meter-percent")).toBe("25%");

    harness.api().setValue(60);
    expect(root.style.getPropertyValue("--sui-meter-percent")).toBe("60%");
  });

  it("swings the valence as the value crosses the thresholds", () => {
    const harness = render({ defaultValue: 10, low: 30, high: 70, optimum: 90 });
    const root = harness.part("root");

    expect(root.getAttribute("data-valence")).toBe("critical");
    expect(harness.part("range").getAttribute("data-valence")).toBe("critical");

    harness.api().setValue(50);
    expect(root.getAttribute("data-valence")).toBe("suboptimal");

    harness.api().setValue(95);
    expect(root.getAttribute("data-valence")).toBe("optimum");
  });

  it("carries no data-valence at all while neutral", () => {
    const harness = render({ defaultValue: 50 });

    expect(harness.part("root").hasAttribute("data-valence")).toBe(false);
    expect(harness.part("range").hasAttribute("data-valence")).toBe(false);
  });

  it("is invisible to Tab", () => {
    const harness = render({ defaultValue: 50 });
    const before = document.createElement("button");
    const after = document.createElement("button");
    harness.host.prepend(before);
    harness.host.append(after);

    // The meter posts no tabindex anywhere, so the tab order goes straight from
    // the button upstream to the button downstream.
    expect(getTabbables(harness.host)).toEqual([before, after]);
  });
});
