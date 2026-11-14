/**
 * The indicator arithmetic, without a page.
 *
 * Everything `tabs` measures goes through this one function, and the three
 * corrections it applies — the RTL mirror, the scroll offset and the border — are
 * each a bug that only shows up in one layout. A browser test can prove the
 * result lands on the tab (and `tabs.browser.test.ts` does exactly that), but it
 * cannot show *which* of the three terms was wrong when it does not. That is what
 * this file is for.
 */

import { describe, expect, it } from "vitest";
import { getIndicatorMetrics, type IndicatorBox, type IndicatorScroll } from "./indicator-rect";

/** A track at x = 100, 300 wide, with no border and nothing scrolled. */
const TRACK: IndicatorBox = { left: 100, right: 400, top: 50, width: 300, height: 30 };
const STILL: IndicatorScroll = { scrollLeft: 0, scrollTop: 0, clientLeft: 0, clientTop: 0 };

function box(left: number, width: number, top = 50, height = 30): IndicatorBox {
  return { left, right: left + width, top, width, height };
}

describe("getIndicatorMetrics — horizontal", () => {
  it("measures from the start edge, and takes the item's own width", () => {
    // The whole reason this exists rather than an index: the three tabs below are
    // 60, 100 and 40 wide, so no arithmetic on an index could place any of them.
    const axis = { orientation: "horizontal", dir: "ltr" } as const;

    expect(getIndicatorMetrics(TRACK, box(100, 60), STILL, axis)).toEqual({ offset: 0, size: 60 });
    expect(getIndicatorMetrics(TRACK, box(160, 100), STILL, axis)).toEqual({
      offset: 60,
      size: 100,
    });
    expect(getIndicatorMetrics(TRACK, box(260, 40), STILL, axis)).toEqual({
      offset: 160,
      size: 40,
    });
  });

  it("measures from the right in RTL, which is where the start edge is", () => {
    const axis = { orientation: "horizontal", dir: "rtl" } as const;

    // Same three tabs, laid out right to left: the first one is the rightmost.
    expect(getIndicatorMetrics(TRACK, box(340, 60), STILL, axis)).toEqual({ offset: 0, size: 60 });
    expect(getIndicatorMetrics(TRACK, box(240, 100), STILL, axis)).toEqual({
      offset: 60,
      size: 100,
    });
    expect(getIndicatorMetrics(TRACK, box(200, 40), STILL, axis)).toEqual({
      offset: 160,
      size: 40,
    });
  });

  it("adds back the scroll, in the sign each direction counts it with", () => {
    // An overflowing track scrolled 80px: the tab's *viewport* rect has moved, and
    // the indicator is positioned inside the scrolled content, so the offset must
    // not move with it.
    const scrolledLtr: IndicatorScroll = { ...STILL, scrollLeft: 80 };
    expect(
      getIndicatorMetrics(TRACK, box(180, 40), scrolledLtr, {
        orientation: "horizontal",
        dir: "ltr",
      }),
    ).toEqual({ offset: 160, size: 40 });

    // In RTL `scrollLeft` counts down from zero, so the same 80px of travel
    // arrives as −80 and the sign has to be flipped rather than dropped. Dropping
    // it is the regression this line exists for: it passes in LTR and puts the
    // pill 160px away from its tab in RTL.
    const scrolledRtl: IndicatorScroll = { ...STILL, scrollLeft: -80 };
    expect(
      getIndicatorMetrics(TRACK, box(280, 40), scrolledRtl, {
        orientation: "horizontal",
        dir: "rtl",
      }),
    ).toEqual({ offset: 160, size: 40 });
  });

  it("discounts the track's own border, which a bounding rect includes", () => {
    // `getBoundingClientRect` reports the border box and the indicator is placed
    // against the padding box; without `clientLeft` the pill sits one border width
    // past every tab.
    const bordered: IndicatorScroll = { ...STILL, clientLeft: 2 };

    expect(
      getIndicatorMetrics(TRACK, box(162, 100), bordered, {
        orientation: "horizontal",
        dir: "ltr",
      }),
    ).toEqual({ offset: 60, size: 100 });
  });
});

describe("getIndicatorMetrics — vertical", () => {
  it("measures down the block axis and takes the item's height", () => {
    const axis = { orientation: "vertical", dir: "ltr" } as const;

    expect(getIndicatorMetrics(TRACK, box(100, 60, 50, 30), STILL, axis)).toEqual({
      offset: 0,
      size: 30,
    });
    expect(getIndicatorMetrics(TRACK, box(100, 60, 80, 44), STILL, axis)).toEqual({
      offset: 30,
      size: 44,
    });
  });

  it("ignores the writing direction, because a column has no mirror", () => {
    const item = box(100, 60, 80, 44);
    const ltr = getIndicatorMetrics(TRACK, item, STILL, { orientation: "vertical", dir: "ltr" });
    const rtl = getIndicatorMetrics(TRACK, item, STILL, { orientation: "vertical", dir: "rtl" });

    expect(rtl).toEqual(ltr);
  });

  it("adds back the block scroll and the block border", () => {
    const scrolled: IndicatorScroll = { scrollLeft: 0, scrollTop: 90, clientLeft: 0, clientTop: 2 };

    expect(
      getIndicatorMetrics(TRACK, box(100, 60, 42, 44), scrolled, {
        orientation: "vertical",
        dir: "ltr",
      }),
    ).toEqual({ offset: 80, size: 44 });
  });
});
