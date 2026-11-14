import { describe, expect, it } from "vitest";
import type { Rect } from "../types";
import { computePosition } from "./compute-position";

const anchor: Rect = { x: 100, y: 100, width: 100, height: 40 };
const floating: Rect = { x: 0, y: 0, width: 200, height: 100 };
const viewport: Rect = { x: 0, y: 0, width: 1000, height: 800 };

describe("computePosition", () => {
  it("places below and centred by default", () => {
    const result = computePosition(anchor, floating, viewport, { gap: 8 });

    expect(result).toMatchObject({ x: 50, y: 148, side: "bottom", align: "center" });
    expect(result.placement).toBe("bottom");
    expect(result.transformOrigin).toBe("center top");
  });

  it("aligns to either edge of the anchor", () => {
    expect(computePosition(anchor, floating, viewport, { placement: "bottom-start" }).x).toBe(100);
    expect(computePosition(anchor, floating, viewport, { placement: "bottom-end" }).x).toBe(0);
  });

  it("places to the side, aligning on the vertical axis", () => {
    const right = computePosition(anchor, floating, viewport, { placement: "right", gap: 8 });
    expect(right).toMatchObject({ x: 208, y: 70, side: "right" });
    expect(right.transformOrigin).toBe("left center");

    expect(computePosition(anchor, floating, viewport, { placement: "left-start" }).y).toBe(100);
  });

  it("reads start and end as logical, so RTL mirrors them", () => {
    const result = computePosition(anchor, floating, viewport, {
      placement: "bottom-start",
      dir: "rtl",
    });

    expect(result.x).toBe(0);
    expect(result.placement).toBe("bottom-end");
  });

  it("leaves the vertical axis alone in RTL", () => {
    expect(
      computePosition(anchor, floating, viewport, { placement: "right-start", dir: "rtl" }).y,
    ).toBe(100);
  });

  it("flips to the opposite side when the preferred one overflows", () => {
    const result = computePosition(anchor, floating, viewport, { placement: "top", gap: 8 });

    expect(result.side).toBe("bottom");
    expect(result.flipped).toBe(true);
    expect(result.y).toBe(148);
  });

  it("stays put when the opposite side would be worse", () => {
    const cramped: Rect = { x: 0, y: 0, width: 1000, height: 200 };
    const result = computePosition(anchor, floating, cramped, { placement: "top", gap: 8 });

    expect(result.side).toBe("top");
    expect(result.flipped).toBe(false);
  });

  it("does not flip when flipping is off", () => {
    const result = computePosition(anchor, floating, viewport, { placement: "top", flip: false });

    expect(result.side).toBe("top");
    expect(result.y).toBe(0);
  });

  it("shifts along the cross axis to stay inside the boundary", () => {
    const edge: Rect = { x: 900, y: 100, width: 100, height: 40 };
    const result = computePosition(edge, floating, viewport, {
      placement: "bottom-start",
      padding: 8,
    });

    expect(result.x).toBe(792);
    expect(result.side).toBe("bottom");
  });

  it("gives up shifting rather than centre a surface wider than the boundary", () => {
    const narrow: Rect = { x: 0, y: 0, width: 150, height: 800 };
    const result = computePosition(anchor, floating, narrow, { placement: "bottom", padding: 8 });

    expect(result.x).toBe(8);
  });

  it("does not shift when shifting is off", () => {
    const edge: Rect = { x: 900, y: 100, width: 100, height: 40 };

    expect(
      computePosition(edge, floating, viewport, { placement: "bottom-start", shift: false }).x,
    ).toBe(900);
  });

  it("centres the arrow on the anchor", () => {
    const result = computePosition(anchor, floating, viewport, {
      placement: "bottom",
      arrowSize: 10,
    });

    expect(result.arrow).toEqual({ x: 95, y: 0 });
  });

  it("keeps the arrow off the rounded corners", () => {
    const edge: Rect = { x: 0, y: 100, width: 20, height: 40 };
    const result = computePosition(edge, floating, viewport, {
      placement: "bottom",
      arrowSize: 10,
      arrowPadding: 12,
    });

    expect(result.arrow?.x).toBe(12);
  });

  it("puts the arrow on the vertical axis for side placements", () => {
    const result = computePosition(anchor, floating, viewport, {
      placement: "right",
      arrowSize: 10,
    });

    expect(result.arrow).toEqual({ x: 0, y: 45 });
  });

  it("omits the arrow when no size is given", () => {
    expect(computePosition(anchor, floating, viewport, {}).arrow).toBeNull();
  });

  it("floors a narrow surface at the anchor width, and positions against the new width", () => {
    const narrow: Rect = { x: 0, y: 0, width: 60, height: 100 };
    const result = computePosition(anchor, narrow, viewport, {
      placement: "bottom",
      matchWidth: true,
    });

    expect(result.width).toBe(100);
    // Widened to 100, so the centred placement lands flush on the anchor.
    expect(result.x).toBe(100);
  });

  it("leaves a surface wider than its anchor at its own width", () => {
    // `matchWidth` is a floor, never an identity: clamping a list down to its
    // trigger is what truncated every row of the select. Nothing is written, and
    // the placement is computed against the surface's real box.
    const result = computePosition(anchor, floating, viewport, {
      placement: "bottom",
      matchWidth: true,
    });

    expect(result.width).toBeNull();
    expect(result.x).toBe(50);
  });

  it("nudges along the cross axis before shifting", () => {
    expect(computePosition(anchor, floating, viewport, { placement: "bottom", offset: 12 }).x).toBe(
      62,
    );
  });

  it("reports a transform origin that grows out of the anchor", () => {
    expect(
      computePosition(anchor, floating, viewport, { placement: "top-start", flip: false })
        .transformOrigin,
    ).toBe("left bottom");
    expect(
      computePosition(anchor, floating, viewport, { placement: "left-end", flip: false })
        .transformOrigin,
    ).toBe("right bottom");
  });

  describe("available space", () => {
    it("measures the main axis from the anchor edge, the cross axis from the boundary", () => {
      // anchor bottom edge is at 140; 800 - 8 padding - (140 + 8 gap) = 644.
      const below = computePosition(anchor, floating, viewport, {
        placement: "bottom",
        gap: 8,
        padding: 8,
      });
      expect(below.availableHeight).toBe(644);
      expect(below.availableWidth).toBe(984);

      // Above the anchor there is only 100 - 8 - 8 = 84.
      const above = computePosition(anchor, floating, viewport, {
        placement: "top",
        gap: 8,
        padding: 8,
        flip: false,
      });
      expect(above.availableHeight).toBe(84);
    });

    it("measures the horizontal axis when the surface sits to the side", () => {
      const right = computePosition(anchor, floating, viewport, {
        placement: "right",
        gap: 8,
        padding: 8,
      });
      // anchor right edge at 200; 1000 - 8 - (200 + 8) = 784.
      expect(right.availableWidth).toBe(784);
      expect(right.availableHeight).toBe(784);
    });

    it("reports the space on the side it actually landed on, not the preferred one", () => {
      const tall: Rect = { x: 0, y: 0, width: 200, height: 700 };
      const result = computePosition(anchor, tall, viewport, { placement: "top", gap: 8 });

      expect(result.side).toBe("bottom");
      expect(result.availableHeight).toBe(652);
    });

    it("floors at zero rather than reporting room that is owed", () => {
      const offscreen: Rect = { x: 100, y: -200, width: 100, height: 40 };
      const result = computePosition(offscreen, floating, viewport, {
        placement: "top",
        flip: false,
      });

      expect(result.availableHeight).toBe(0);
    });
  });
});
