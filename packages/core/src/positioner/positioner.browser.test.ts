import { afterEach, describe, expect, it, vi } from "vitest";
import type { PositionResult } from "./compute-position";
import { trackPosition } from "./track-position";

const cleanups: VoidFunction[] = [];

function scene(): { anchor: HTMLElement; floating: HTMLElement; arrow: HTMLElement } {
  const host = document.createElement("div");
  host.innerHTML = `
    <button id="anchor" style="position: fixed; left: 100px; top: 100px; width: 120px; height: 40px"></button>
    <div id="floating" style="width: 200px; height: 80px">
      <div id="arrow" style="width: 10px; height: 10px"></div>
    </div>
  `;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return {
    anchor: host.querySelector("#anchor") as HTMLElement,
    floating: host.querySelector("#floating") as HTMLElement,
    arrow: host.querySelector("#arrow") as HTMLElement,
  };
}

function frames(count = 3): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      if (--left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("trackPosition", () => {
  it("moves the surface with a transform, never with top and left", () => {
    const { anchor, floating } = scene();
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", gap: 8 }));

    expect(floating.style.transform).toBe("translate3d(60px, 148px, 0px)");
    expect(floating.style.top).toBe("0px");
    expect(floating.style.left).toBe("0px");
    // `fixed`, and the assertion used to read `absolute` — which is the bug it was
    // written over. Everything computed here is in viewport coordinates, so the
    // containing block has to be the viewport; under `absolute` in a portal it was
    // the document, and the surface sat `-scrollY` away from its anchor.
    expect(floating.style.position).toBe("fixed");
  });

  it("lands on its anchor on a scrolled page", async () => {
    // The class of bug no test in this repo could see: every positioner test until
    // now ran on a document that never scrolled, so the difference between viewport
    // and document coordinates was always zero.
    const tall = document.createElement("div");
    tall.style.height = "3000px";
    document.body.append(tall);
    const anchor = document.createElement("button");
    anchor.textContent = "anchor";
    Object.assign(anchor.style, { position: "absolute", top: "1500px", left: "40px" });
    document.body.append(anchor);
    const floating = document.createElement("div");
    Object.assign(floating.style, { width: "120px", height: "60px" });
    document.body.append(floating);

    window.scrollTo(0, 1200);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const stop = trackPosition(anchor, floating, { placement: "bottom-start", gap: 4 });
    const anchorBox = anchor.getBoundingClientRect();
    const box = floating.getBoundingClientRect();

    expect(Math.round(box.top - anchorBox.bottom)).toBe(4);
    expect(Math.round(box.left)).toBe(Math.round(anchorBox.left));

    stop();
    window.scrollTo(0, 0);
    tall.remove();
    anchor.remove();
    floating.remove();
  });

  it("publishes the contract's custom properties and data attributes", () => {
    const { anchor, floating } = scene();
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom" }));

    expect(floating.style.getPropertyValue("--sui-transform-origin")).toBe("center top");
    expect(floating.style.getPropertyValue("--sui-anchor-width")).toBe("120px");
    expect(floating.style.getPropertyValue("--sui-anchor-height")).toBe("40px");
    expect(floating.dataset["side"]).toBe("bottom");
    expect(floating.dataset["align"]).toBe("center");
  });

  it("positions the arrow through custom properties", () => {
    const { anchor, floating, arrow } = scene();
    cleanups.push(
      trackPosition(anchor, floating, {
        placement: "bottom",
        arrowSize: 10,
        arrowNode: () => arrow,
      }),
    );

    expect(arrow.style.getPropertyValue("--sui-arrow-x")).toBe("95px");
    expect(arrow.style.getPropertyValue("--sui-arrow-y")).toBe("0px");
  });

  it("floors a narrow surface at the anchor width when asked", () => {
    const { anchor, floating } = scene();
    floating.style.width = "60px";
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", matchWidth: true }));

    expect(floating.style.width).toBe("120px");
  });

  it("leaves a surface wider than the anchor at its own width", () => {
    // `matchWidth` is a floor, not an identity — the fixture's 200px surface over
    // a 120px anchor keeps every pixel it needs. Clamping it down is what
    // ellipsised all five rows of a select.
    const { anchor, floating } = scene();
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", matchWidth: true }));

    expect(floating.style.width).toBe("200px");
  });

  it("measures the surface, never the width it wrote on the last pass", async () => {
    const { anchor, floating } = scene();
    floating.style.width = "60px";
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", matchWidth: true }));
    expect(floating.style.width).toBe("120px");

    // The anchor narrows past the width the first pass wrote. A tracker that
    // measured its own previous answer would compare 120 against 40, decide the
    // surface is wide enough and leave the 120 in place for ever.
    anchor.style.width = "40px";
    await frames(6);

    expect(floating.style.width).toBe("40px");
  });

  it("keeps the geometry it has while paused", async () => {
    const { anchor, floating } = scene();
    let paused = false;
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", paused: () => paused }));
    const before = floating.style.transform;

    paused = true;
    anchor.style.width = "300px";
    await frames(6);
    expect(floating.style.transform).toBe(before);

    paused = false;
    anchor.style.height = "60px";
    await frames(6);
    expect(floating.style.transform).not.toBe(before);
  });

  it("reports the result to the caller", () => {
    const { anchor, floating } = scene();
    const onPositioned = vi.fn();
    // 40px of gap does not fit above an anchor 100px from the top edge.
    cleanups.push(trackPosition(anchor, floating, { placement: "top", gap: 40, onPositioned }));

    const result = onPositioned.mock.calls[0]?.[0] as PositionResult;
    expect(result.side).toBe("bottom");
    expect(result.flipped).toBe(true);
  });

  it("repositions when the anchor resizes", async () => {
    const { anchor, floating } = scene();
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom" }));
    const before = floating.style.transform;

    anchor.style.width = "300px";
    await frames(6);

    expect(floating.style.transform).not.toBe(before);
    expect(floating.style.getPropertyValue("--sui-anchor-width")).toBe("300px");
  });

  it("stops repositioning once disposed", async () => {
    const { anchor, floating } = scene();
    trackPosition(anchor, floating, { placement: "bottom" })();
    const before = floating.style.transform;

    anchor.style.width = "300px";
    await frames(6);

    expect(floating.style.transform).toBe(before);
  });

  it("is a no-op without both elements", () => {
    const { anchor } = scene();
    expect(() => trackPosition(anchor, null)()).not.toThrow();
  });

  it("publishes the room left on the side it landed on", () => {
    const { anchor, floating } = scene();
    cleanups.push(trackPosition(anchor, floating, { placement: "bottom", gap: 8, padding: 8 }));

    // The anchor is fixed 100px down and 40px tall, so the surface below it has
    // the viewport height less 148 and less the padding.
    const expected = window.innerHeight - 8 - 148;
    expect(floating.style.getPropertyValue("--sui-available-height")).toBe(`${expected}px`);
    expect(floating.style.getPropertyValue("--sui-available-width")).toBe(
      `${window.innerWidth - 16}px`,
    );
  });

  it("anchors to a rect instead of to the element's own box", () => {
    const { anchor, floating } = scene();
    cleanups.push(
      trackPosition(anchor, floating, {
        placement: "bottom",
        gap: 0,
        getAnchorRect: () => ({ x: 300, y: 500, width: 0, height: 0 }),
      }),
    );

    // Centred on a zero-width caret at x 300: 300 - 200/2.
    expect(floating.style.transform).toBe("translate3d(200px, 500px, 0px)");
    expect(floating.style.getPropertyValue("--sui-anchor-width")).toBe("0px");
  });

  it("keeps watching the anchor element while reading a rect from elsewhere", async () => {
    const { anchor, floating } = scene();
    let top = 500;
    cleanups.push(
      trackPosition(anchor, floating, {
        placement: "bottom",
        gap: 0,
        getAnchorRect: () => ({ x: 300, y: top, width: 0, height: 0 }),
      }),
    );
    expect(floating.style.transform).toBe("translate3d(200px, 500px, 0px)");

    // Resizing the element the surface watches re-reads the rect, even though the
    // rect does not come from that element.
    top = 600;
    anchor.style.width = "300px";
    await frames(6);

    expect(floating.style.transform).toBe("translate3d(200px, 600px, 0px)");
  });

  it("positions against a rect with no anchor element at all", () => {
    const { floating } = scene();
    cleanups.push(
      trackPosition(null, floating, {
        placement: "bottom",
        gap: 0,
        getAnchorRect: () => ({ x: 300, y: 500, width: 0, height: 0 }),
      }),
    );

    expect(floating.style.transform).toBe("translate3d(200px, 500px, 0px)");
  });

  it("is still a no-op with neither an anchor element nor a rect", () => {
    const { floating } = scene();
    trackPosition(null, floating)();

    expect(floating.style.transform).toBe("");
  });
});
