import { describe, expect, it } from "vitest";
import {
  type AxisMetrics,
  dragOffset,
  overflows,
  pageOffset,
  SCROLLBAR_SIZE,
  THUMB_INSET,
  THUMB_MIN,
  thumbLength,
  thumbPosition,
  trackLength,
} from "./scroll-thumb";

const metrics = (offset: number, content = 400, viewport = 100): AxisMetrics => ({
  viewport,
  content,
  offset,
});

describe("scroll-thumb — the track and the thumb", () => {
  it("leaves the margin on both ends of the track, and the corner when there is one", () => {
    expect(trackLength(100, false)).toBe(100 - 2 * THUMB_INSET);
    expect(trackLength(100, true)).toBe(100 - 2 * THUMB_INSET - SCROLLBAR_SIZE);
    expect(trackLength(4, true)).toBe(0);
  });

  it("overflows by more than a pixel only", () => {
    expect(overflows(metrics(0, 101))).toBe(false);
    expect(overflows(metrics(0, 102))).toBe(true);
  });

  it("sizes the thumb by the share of the content in view, never below the floor", () => {
    const track = trackLength(100, false);
    expect(thumbLength(metrics(0), track)).toBe((track * 100) / 400);
    expect(thumbLength(metrics(0, 100_000), track)).toBe(THUMB_MIN);
    expect(thumbLength(metrics(0, 100), track)).toBe(0);
    expect(thumbLength(metrics(0), 0)).toBe(0);
  });

  it("places the thumb in proportion to the offset, clamped to the track", () => {
    const track = trackLength(100, false);
    const travel = track - thumbLength(metrics(0), track);
    expect(thumbPosition(metrics(0), track)).toBe(0);
    expect(thumbPosition(metrics(150), track)).toBeCloseTo(travel / 2, 6);
    expect(thumbPosition(metrics(300), track)).toBeCloseTo(travel, 6);
    expect(thumbPosition(metrics(900), track)).toBeCloseTo(travel, 6);
    expect(thumbPosition(metrics(-5), track)).toBe(0);
  });
});

describe("scroll-thumb — what a drag and a page do to the offset", () => {
  it("turns a travel along the track into the offset it stands for", () => {
    const track = trackLength(100, false);
    const travel = track - thumbLength(metrics(0), track);
    expect(dragOffset(0, travel / 2, metrics(0), track)).toBeCloseTo(150, 6);
    expect(dragOffset(0, travel * 10, metrics(0), track)).toBe(300);
    expect(dragOffset(100, -travel * 10, metrics(100), track)).toBe(0);
  });

  it("keeps the start where it was when there is nothing to travel", () => {
    expect(dragOffset(40, 10, metrics(40, 100), 94)).toBe(0);
  });

  it("pages by one viewport and stops at both ends", () => {
    expect(pageOffset(metrics(0), 1)).toBe(100);
    expect(pageOffset(metrics(250), 1)).toBe(300);
    expect(pageOffset(metrics(50), -1)).toBe(0);
  });
});
