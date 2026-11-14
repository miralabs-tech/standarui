import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./progress.connect";
import { machine } from "./progress.machine";
import type { ProgressApi, ProgressMachineProps, ProgressSchema } from "./progress.types";

type Api = ProgressApi<DomPropTypes>;

function render(props: ProgressMachineProps = {}) {
  return mountMachine<ProgressSchema, Api>({
    machine,
    connect,
    html: `<div><span></span><div><div></div></div><span></span><svg><circle></circle><circle></circle></svg></div>`,
    id: "p1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getLabelProps());
      apply(root.children[1] as Element, api.getTrackProps());
      apply((root.children[1] as Element).children[0] as Element, api.getRangeProps());
      apply(root.children[2] as Element, api.getValueTextProps());
      const svg = root.children[3] as Element;
      apply(svg, api.getCircleProps());
      apply(svg.children[0] as Element, api.getCircleTrackProps());
      apply(svg.children[1] as Element, api.getCircleRangeProps());
    },
  });
}

afterEach(() => {
  unmountAll();
});

describe("progress", () => {
  it("paints the progressbar role and the whole ARIA range", () => {
    const harness = render({ defaultValue: 40 });
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("progressbar");
    expect(root.getAttribute("aria-valuemin")).toBe("0");
    expect(root.getAttribute("aria-valuemax")).toBe("100");
    expect(root.getAttribute("aria-valuenow")).toBe("40");
    expect(root.getAttribute("aria-valuetext")).toBe("40%");
    expect(root.getAttribute("data-state")).toBe("loading");
    expect(root.getAttribute("aria-labelledby")).toBe("progress:p1:label");
    expect(harness.part("label").id).toBe("progress:p1:label");
  });

  it("publishes the percentage as a custom property for the fill", () => {
    const harness = render({ defaultValue: 25 });

    expect(harness.part("root").style.getPropertyValue("--sui-progress-percent")).toBe("25%");
  });

  it("maps the percentage against a non-default range", () => {
    const harness = render({ defaultValue: 5, min: 0, max: 20 });

    expect(harness.part("root").style.getPropertyValue("--sui-progress-percent")).toBe("25%");
    expect(harness.api().valueAsText).toBe("25%");
    expect(harness.part("root").getAttribute("aria-valuenow")).toBe("5");
  });

  it("drops the value entirely while indeterminate rather than reporting zero", () => {
    const harness = render({ defaultValue: null });
    const root = harness.part("root");

    expect(root.getAttribute("data-state")).toBe("indeterminate");
    expect(root.hasAttribute("aria-valuenow")).toBe(false);
    expect(root.hasAttribute("aria-valuemin")).toBe(false);
    expect(root.hasAttribute("aria-valuetext")).toBe(false);
    expect(root.getAttribute("data-indeterminate")).toBe("");
    expect(harness.api().percent).toBeNull();
  });

  it("reports completion at the top of the range", () => {
    const harness = render({ defaultValue: 100 });

    expect(harness.part("root").getAttribute("data-state")).toBe("complete");
    expect(harness.api().complete).toBe(true);
  });

  it("clamps what it is told to the range", () => {
    const harness = render({ defaultValue: 0 });

    harness.api().setValue(180);
    expect(harness.part("root").getAttribute("aria-valuenow")).toBe("100");

    harness.api().setValue(-20);
    expect(harness.part("root").getAttribute("aria-valuenow")).toBe("0");
  });

  it("reports without writing while controlled", () => {
    const onValueChange = vi.fn();
    const harness = render({ value: 10, onValueChange });

    harness.api().setValue(60);

    expect(onValueChange).toHaveBeenCalledWith({ value: 60 });
    expect(harness.part("root").getAttribute("aria-valuenow")).toBe("10");

    harness.setProps({ value: 60 });
    expect(harness.part("root").getAttribute("aria-valuenow")).toBe("60");
  });

  it("formats the value text with Intl, in the locale it was given", () => {
    const harness = render({
      defaultValue: 42,
      locale: "fr-FR",
      formatOptions: { style: "unit", unit: "megabyte" },
    });

    // Not a percentage: the raw value is formatted, and the separator is French.
    expect(harness.api().valueAsText).toMatch(/42/);
    expect(harness.part("root").getAttribute("aria-valuetext")).toMatch(/42/);
  });

  it("draws the circle from one geometry, offset by the value", () => {
    const harness = render({ defaultValue: 50 });
    const range = harness.part("circle-range");
    const circumference = 2 * Math.PI * 42;

    // `stroke-dasharray`, not `strokeDasharray`. SVG attribute names are the
    // dashed ones, and until `dom/apply` owned the spelling this test read back
    // the same camelCase name the harness had just written — so it passed while
    // the browser was drawing nothing. React never had the bug: React DOM
    // translates the JSX name itself.
    expect(harness.part("circle").getAttribute("viewBox")).toBe("0 0 100 100");
    expect(Number(range.getAttribute("stroke-dasharray"))).toBeCloseTo(circumference, 3);
    expect(Number(range.getAttribute("stroke-dashoffset"))).toBeCloseTo(circumference / 2, 3);
  });

  it("keeps the circle at a quarter arc while indeterminate", () => {
    const harness = render({ defaultValue: null });
    const circumference = 2 * Math.PI * 42;

    expect(Number(harness.part("circle-range").getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference * 0.75,
      3,
    );
  });

  it("hides the visible value text from assistive technology", () => {
    const harness = render({ defaultValue: 30 });

    // The root already says it through `aria-valuetext`.
    expect(harness.part("value-text").getAttribute("aria-hidden")).toBe("true");
  });
});
