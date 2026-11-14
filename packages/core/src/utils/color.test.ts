/**
 * The colour model, with no document anywhere — which is the whole point: a
 * conversion that is wrong here is wrong in every framework at once, and the
 * component that consumes it could never be the place to find out.
 *
 * The round trip is asserted **in sRGB and not in HSVA**, deliberately. Every
 * notation this module writes is quantised — eight bits per channel for hex and
 * `rgb()`, whole degrees and whole per cent for `hsl()` and `hsb()` — and near the
 * achromatic axis a hue is not recoverable from any of them at any precision: at
 * `s = 1` the twelve hues that surround a grey all serialise to the same three
 * bytes. Comparing the painted colour is the invariant that actually holds, and it
 * is the one a user can see.
 */

import { describe, expect, it } from "vitest";
import {
  anchorHue,
  type ColorFormat,
  type ColorValue,
  colorEquals,
  formatColor,
  getChannelRange,
  getChannelValue,
  getColorName,
  hslToHsv,
  hsvToHsl,
  hsvToRgb,
  parseColor,
  rgbToHsv,
  toHex,
  toRgb255,
  withChannel,
  wrapHue,
} from "./color";

const hsv = (h: number, s: number, v: number, a = 1): ColorValue => ({ h, s, v, a });

/** Mulberry32 — four lines, a fixed seed, and the same thousand colours forever. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("color — the conversions", () => {
  it("takes the six primaries through HSV and back", () => {
    const cases: readonly [ColorValue, [number, number, number]][] = [
      [hsv(0, 100, 100), [255, 0, 0]],
      [hsv(60, 100, 100), [255, 255, 0]],
      [hsv(120, 100, 100), [0, 255, 0]],
      [hsv(180, 100, 100), [0, 255, 255]],
      [hsv(240, 100, 100), [0, 0, 255]],
      [hsv(300, 100, 100), [255, 0, 255]],
    ];

    for (const [color, [r, g, b]] of cases) {
      expect(toRgb255(color)).toEqual({ r, g, b, a: 1 });
      const back = rgbToHsv(r, g, b, 1);
      expect(back.h).toBeCloseTo(color.h, 6);
      expect(back.s).toBeCloseTo(100, 6);
      expect(back.v).toBeCloseTo(100, 6);
    }
  });

  it("carries white, black and three greys with no hue to invent", () => {
    expect(toRgb255(hsv(0, 0, 100))).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(toRgb255(hsv(0, 0, 0))).toEqual({ r: 0, g: 0, b: 0, a: 1 });

    for (const level of [64, 128, 192]) {
      const back = rgbToHsv(level, level, level, 1);
      expect(back.s).toBe(0);
      // Undetermined rather than zero-by-accident: nothing in a grey names a hue,
      // and `anchorHue` is what puts one back.
      expect(back.h).toBe(0);
      expect(toRgb255(back)).toEqual({ r: level, g: level, b: level, a: 1 });
    }
  });

  it("agrees with HSL in both directions on the pairs that have a closed form", () => {
    // v=100 s=100 is l=50 s=100; v=100 s=0 is white; v=50 s=100 is a half-lit hue.
    expect(hsvToHsl(hsv(210, 100, 100))).toMatchObject({ h: 210, s: 100, l: 50 });
    expect(hsvToHsl(hsv(210, 0, 100))).toMatchObject({ s: 0, l: 100 });
    expect(hsvToHsl(hsv(210, 100, 50))).toMatchObject({ s: 100, l: 25 });

    const back = hslToHsv(210, 100, 25, 1);
    expect(back.h).toBeCloseTo(210, 6);
    expect(back.s).toBeCloseTo(100, 6);
    expect(back.v).toBeCloseTo(50, 6);

    // Black through HSL keeps neither hue nor saturation — the reason rule 2 of
    // the module header exists.
    expect(hslToHsv(210, 100, 0, 1)).toMatchObject({ s: 0, v: 0 });
  });

  it("keeps alpha out of the geometry", () => {
    expect(hsvToRgb(hsv(120, 100, 100, 0.25)).a).toBe(0.25);
    expect(hsvToHsl(hsv(120, 100, 100, 0.25)).a).toBe(0.25);
    expect(rgbToHsv(0, 255, 0, 0.25).a).toBe(0.25);
  });
});

describe("color — parsing", () => {
  it("reads every hex shape, with the hash and without", () => {
    expect(toRgb255(parseColor("#abc") as ColorValue)).toEqual({
      r: 170,
      g: 187,
      b: 204,
      a: 1,
    });
    expect(parseColor("#abcd")?.a).toBeCloseTo(221 / 255, 6);
    expect(toRgb255(parseColor("#aabbcc") as ColorValue)).toEqual({
      r: 170,
      g: 187,
      b: 204,
      a: 1,
    });
    expect(parseColor("#aabbccdd")?.a).toBeCloseTo(221 / 255, 6);
    expect(parseColor("aabbcc")).toEqual(parseColor("#aabbcc"));
    expect(parseColor("  #AABBCC  ")).toEqual(parseColor("#aabbcc"));
  });

  it("reads the legacy and the modern functional notations alike", () => {
    const plain = parseColor("rgb(1,2,3)") as ColorValue;
    expect(toRgb255(plain)).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(toRgb255(parseColor("rgb(1 2 3)") as ColorValue)).toEqual({ r: 1, g: 2, b: 3, a: 1 });

    expect(parseColor("rgb(1 2 3 / 50%)")?.a).toBe(0.5);
    expect(parseColor("rgba(1,2,3,.5)")?.a).toBe(0.5);
    expect(toRgb255(parseColor("rgb(100% 0% 0%)") as ColorValue)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });

    expect(parseColor("hsl(120,50%,50%)")).toMatchObject({ h: 120 });
    expect(parseColor("hsl(120 50% 50% / .5)")?.a).toBe(0.5);
    expect(parseColor("hsl(120deg 50% 50%)")).toMatchObject({ h: 120 });

    // Ours, and it has to parse: a controlled consumer hands the string back.
    expect(parseColor("hsb(210 40% 80%)")).toMatchObject({ h: 210, s: 40, v: 80 });
  });

  it("reads `transparent` as a colour with no alpha rather than as nothing", () => {
    expect(parseColor("transparent")).toEqual({ h: 0, s: 0, v: 0, a: 0 });
  });

  it("answers null for everything it does not read, and never throws", () => {
    for (const input of [
      "",
      "   ",
      "#ab",
      "#abcde",
      "#gg0000",
      "rgb(1,2)",
      "rgb(1,2,3,4,5)",
      "rgb()",
      "oklch(0.7 0.1 200)",
      "color(display-p3 1 0 0)",
      "rebeccapurple",
      "hsl(a b c)",
    ]) {
      expect(parseColor(input), input).toBeNull();
    }
  });
});

describe("color — formatting and the round trip", () => {
  const FORMATS: readonly ColorFormat[] = ["hex", "rgb", "hsl", "hsb"];

  it("writes the notation the format names", () => {
    const teal = hsv(180, 100, 100);
    expect(formatColor(teal, "hex")).toBe("#00ffff");
    expect(formatColor(teal, "rgb")).toBe("rgb(0 255 255)");
    expect(formatColor(teal, "hsl")).toBe("hsl(180 100% 50%)");
    expect(formatColor(teal, "hsb")).toBe("hsb(180 100% 100%)");

    const faded = hsv(180, 100, 100, 0.5);
    expect(formatColor(faded, "hex")).toBe("#00ffff80");
    expect(formatColor(faded, "rgb")).toBe("rgb(0 255 255 / 0.5)");
    expect(formatColor(faded, "hsl")).toBe("hsl(180 100% 50% / 0.5)");

    // The alpha suffix appears only when there is one to report.
    expect(toHex(teal, false)).toBe("#00ffff");
    expect(toHex(teal, true)).toBe("#00ffffff");
  });

  it("survives a thousand colours through all four notations, measured in sRGB", () => {
    const random = seeded(0x9e3779b9);
    // Per format, because the quantisations differ: eight bits for hex and rgb,
    // whole degrees and whole per cent for the two angular ones.
    const worst: Record<ColorFormat, number> = { hex: 0, rgb: 0, hsl: 0, hsb: 0 };
    let worstAlpha = 0;

    for (let index = 0; index < 1000; index++) {
      const color = hsv(
        random() * 360,
        random() * 100,
        random() * 100,
        Math.round(random() * 100) / 100,
      );
      const painted = toRgb255(color);

      for (const format of FORMATS) {
        const back = parseColor(formatColor(color, format));
        expect(back, `${format} — ${formatColor(color, format)}`).not.toBeNull();
        const returned = toRgb255(back as ColorValue);
        const error = Math.max(
          Math.abs(painted.r - returned.r),
          Math.abs(painted.g - returned.g),
          Math.abs(painted.b - returned.b),
        );
        worst[format] = Math.max(worst[format], error);
        worstAlpha = Math.max(worstAlpha, Math.abs(color.a - (back as ColorValue).a));
      }
    }

    // Eight bits in, eight bits out: exact, and it has to be — a hex field that
    // did not give back what it was shown would be a bug a user can read.
    expect(worst.hex).toBe(0);
    expect(worst.rgb).toBe(0);
    // Whole degrees of hue and whole per cent of the other two. The measured
    // ceilings are 4 and 3; the assertions are those numbers, not a round one, so
    // a regression in the conversions cannot hide inside a generous margin.
    expect(worst.hsl).toBeLessThanOrEqual(4);
    expect(worst.hsb).toBeLessThanOrEqual(3);
    // Under one step of the alpha channel (0.01), which is what makes the slider
    // land back where it was.
    expect(worstAlpha).toBeLessThan(0.01);
  });
});

describe("color — the channel arithmetic", () => {
  it("anchors the hue a conversion cannot carry", () => {
    const violet = hsv(280, 80, 80);
    const black = parseColor("#000000") as ColorValue;
    expect(black.h).toBe(0);

    const anchored = anchorHue(black, violet);
    expect(anchored.h).toBe(280);
    expect(anchored.s).toBe(80);
    expect(anchored.v).toBe(0);

    // And the hue comes back up with the brightness.
    const lit = withChannel(anchored, "brightness", 80);
    expect(lit.h).toBe(280);
    expect(toRgb255(lit)).toEqual(toRgb255(violet));
  });

  it("wraps the one circular channel and clamps the six that are not", () => {
    expect(wrapHue(360)).toBe(0);
    expect(wrapHue(-1)).toBe(359);
    expect(wrapHue(725)).toBe(5);

    // `withChannel` clamps rather than wraps: `End` on a hue slider is its right
    // edge, which is red again, not a jump back to the left.
    expect(withChannel(hsv(300, 50, 50), "hue", 360).h).toBe(360);
    // And the edge reads back as itself, or the thumb that `End` sent right would
    // be published at 0 and drawn on the left.
    expect(getChannelValue(hsv(360, 50, 50), "hue")).toBe(360);
    expect(getChannelValue(hsv(0, 50, 50), "hue")).toBe(0);
    expect(getChannelValue(hsv(725, 50, 50), "hue")).toBe(5);
    expect(toHex(hsv(360, 100, 100), false)).toBe(toHex(hsv(0, 100, 100), false));
    expect(withChannel(hsv(300, 50, 50), "saturation", 140).s).toBe(100);
    expect(withChannel(hsv(300, 50, 50), "saturation", -5).s).toBe(0);
    expect(withChannel(hsv(300, 50, 50), "alpha", 4).a).toBe(1);
    expect(withChannel(hsv(300, 50, 50), "alpha", -4).a).toBe(0);
  });

  it("moves an RGB channel on the eight-bit grid, and only that channel", () => {
    const base = parseColor("#336699") as ColorValue;
    expect(getChannelValue(base, "red")).toBe(0x33);
    expect(getChannelValue(base, "green")).toBe(0x66);
    expect(getChannelValue(base, "blue")).toBe(0x99);

    const brighter = withChannel(base, "red", 0x34);
    expect(toRgb255(brighter)).toEqual({ r: 0x34, g: 0x66, b: 0x99, a: 1 });

    // Ten nudges land exactly ten steps away — the drift an unrounded float
    // conversion would accumulate is what `toRgb255` exists to stop.
    let walked = base;
    for (let step = 0; step < 10; step++) {
      walked = withChannel(walked, "green", getChannelValue(walked, "green") + 1);
    }
    expect(getChannelValue(walked, "green")).toBe(0x66 + 10);
    expect(getChannelValue(walked, "red")).toBe(0x33);
  });

  it("keeps the hue when an RGB write lands on a grey", () => {
    // Anchored on the colour the *write* started from, not on some earlier one:
    // the two writes before this one moved the hue for real, and pinning 280 here
    // would be asserting that they had not.
    const violet = hsv(280, 80, 80);
    const halfway = withChannel(withChannel(violet, "red", 128), "green", 128);
    expect(halfway.s).toBeGreaterThan(0);

    const grey = withChannel(halfway, "blue", 128);
    expect(grey.s).toBe(0);
    expect(grey.h).toBe(halfway.h);
  });

  it("publishes a range per numeric channel", () => {
    expect(getChannelRange("hue")).toEqual({ min: 0, max: 360, step: 1 });
    expect(getChannelRange("saturation")).toEqual({ min: 0, max: 100, step: 1 });
    expect(getChannelRange("alpha")).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(getChannelRange("red")).toEqual({ min: 0, max: 255, step: 1 });
  });

  it("compares two colours by value, which is what stops the write loop", () => {
    expect(colorEquals(hsv(120, 50, 50), hsv(120, 50, 50))).toBe(true);
    expect(colorEquals(hsv(120, 50, 50), hsv(120, 50, 51))).toBe(false);
    expect(colorEquals(hsv(120, 50, 50, 1), hsv(120, 50, 50, 0.99))).toBe(false);
    // Float drift from a conversion is not a change.
    expect(colorEquals(hsv(120, 50, 50), hsv(120 + 1e-9, 50, 50))).toBe(true);
  });

  it("names a colour approximately, which is all `aria-valuetext` needs", () => {
    expect(getColorName(hsv(0, 100, 100))).toBe("red");
    expect(getColorName(hsv(210, 100, 100))).toBe("azure");
    expect(getColorName(hsv(0, 0, 100))).toBe("white");
    expect(getColorName(hsv(0, 0, 50))).toBe("gray");
    expect(getColorName(hsv(280, 80, 4))).toBe("black");
    expect(getColorName(hsv(120, 100, 100, 0))).toBe("transparent");
    expect(getColorName(hsv(120, 100, 30))).toBe("dark green");
    expect(getColorName(hsv(120, 20, 90))).toBe("pale green");
  });
});
