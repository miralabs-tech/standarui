/**
 * What the composed slider owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file, and string equality is
 * the whole proof that the two forms place the same tree. It is also blind to the
 * one thing this component changed: every row renders `<SliderValueText/>` and
 * `<SliderMarkerGroup/>` **empty on both sides**, so a default that drew nothing
 * would leave both forms empty, equal, and green. The two parts learned to render
 * derived content in this wave, and that is asserted here or nowhere.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slider } from "./composed";
import { SliderMarker, SliderMarkerGroup, SliderRoot, SliderValueText } from "./slider";

/**
 * How many elements carry `token`. `partsOf` in the shared harness answers a
 * different question — the token list of the *one* element carrying it — and
 * counting is the whole point here: a marker group that resolved `marks={5}`
 * into four ticks would pass every existence check.
 */
function count(html: string, token: string): number {
  return [...html.matchAll(/\sdata-part="([^"]*)"/g)].filter((match) =>
    (match[1] ?? "").split(" ").includes(token),
  ).length;
}

describe("the value text prints what the machine formatted", () => {
  it("fills an empty part with the formatted value", () => {
    const html = renderToString(<Slider id="volume" label="Volume" defaultValue={35} />);

    expect(html).toContain(">35<");
  });

  it("runs the value through `formatOptions` rather than printing the number", () => {
    const html = renderToString(
      <Slider
        id="price"
        defaultValue={40}
        max={200}
        formatOptions={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }}
      />,
    );

    // The exact glyph and its spacing are the platform's, so the assertion is that
    // formatting happened at all — a bare `40` would mean the part printed the
    // raw value and `formatOptions` reached nothing.
    expect(html).not.toContain(">40<");
    expect(html).toContain("40");
  });

  it("joins the values of a multi-thumb slider", () => {
    const html = renderToString(<Slider id="range" defaultValue={[20, 80]} />);

    expect(html).toContain("20");
    expect(html).toContain("80");
  });

  it("hands the part back to `children` — the default never wins over a consumer", () => {
    const html = renderToString(
      <SliderRoot id="custom" defaultValue={35}>
        <SliderValueText>Loud enough</SliderValueText>
      </SliderRoot>,
    );

    expect(html).toContain(">Loud enough<");
    expect(html).not.toContain(">35<");
  });
});

describe("the marker group draws the marks the machine resolved", () => {
  it("expands a count into that many markers", () => {
    // `marks={5}` is the form only the machine can resolve: the composed layer
    // never sees a list, so a marker per tick here proves it read `api.marks`
    // rather than something a consumer handed in.
    const html = renderToString(<Slider id="ticks" defaultValue={50} marks={5} />);

    expect(count(html, "slider:marker")).toBe(5);
  });

  it("draws one marker per explicit position", () => {
    const html = renderToString(<Slider id="thirds" defaultValue={50} marks={[0, 50, 100]} />);

    expect(count(html, "slider:marker")).toBe(3);
  });

  it("renders no group at all when no marks were asked for", () => {
    const html = renderToString(<Slider id="plain" defaultValue={50} />);

    expect(html).not.toContain("slider:marker-group");
  });

  it("keeps the scale and drops the group under `ticks={false}`", () => {
    const html = renderToString(<Slider id="quiet" defaultValue={50} marks={5} ticks={false} />);

    expect(html).not.toContain("slider:marker-group");
  });

  it("hands the group back to `children` — a subset stays a subset", () => {
    const html = renderToString(
      <SliderRoot id="some" defaultValue={50} marks={5}>
        <SliderMarkerGroup>
          <SliderMarker value={0} />
        </SliderMarkerGroup>
      </SliderRoot>,
    );

    expect(count(html, "slider:marker")).toBe(1);
  });
});

describe("the thumb count is read from the value", () => {
  it("gives a two-value slider two thumbs and two hidden inputs", () => {
    const html = renderToString(<Slider id="budget" defaultValue={[20, 80]} />);

    expect(count(html, "slider:thumb")).toBe(2);
    expect(count(html, "slider:hidden-input")).toBe(2);
  });

  it("gives a slider with no value at all exactly one", () => {
    const html = renderToString(<Slider id="bare" />);

    expect(count(html, "slider:thumb")).toBe(1);
  });
});
