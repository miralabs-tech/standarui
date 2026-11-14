/**
 * sRGB colour arithmetic, as pure functions. Nothing here reads a document, a
 * service or a prop accessor — which is what lets the conversions, the parser and
 * the round trip be tested in the `unit` project, with no page anywhere.
 *
 * It sits outside `components/` for the reason `utils/range` does: `color-picker`
 * is the first consumer, not the only one, and per the CDC §5.1 amendment of
 * 2026-08-28 a shared layer with a single consumer carries its own budget line
 * rather than disappearing from every component's.
 *
 * **It imports nothing, on purpose.** `roundToPrecision` in `utils/range` does the
 * same job, but a shared module with a budget line of its own should not drag a
 * second one into every bundle that wanted a hex parser — and the decimal-safe
 * snap `range` is famous for solves a step-grid problem colours do not have.
 *
 * Three rules hold the model together:
 *
 * 1. **HSVA is the source of truth.** RGB and HSL are views, derived on demand.
 * 2. **Hue is anchored on the way in.** sRGB cannot tell a black from a black of
 *    a particular hue, so a conversion that lands on `v === 0` (or `s === 0`)
 *    would throw the hue away and the area would jump the next time it is used.
 *    `anchorHue` puts it back from the colour the write started on.
 * 3. **Rounding is late and once.** Channels stay floating point; only
 *    `formatColor` and `toHex` round, and only to what the notation can carry.
 *
 * Out of scope, and named rather than forgotten: the 148 CSS colour keywords
 * (~1.3 kB min+gzip on their own), `color()`, `lab()`, `lch()`, `oklab()`,
 * `oklch()` and `color-mix()`. OKLCH is excluded from v1 — no design
 * expresses a colour outside sRGB, and the gamut mapping CSS Color 4 requires is
 * the weight of this whole module again.
 */

export interface ColorValue {
  /** 0…360. Kept through achromatic writes rather than recomputed from them. */
  readonly h: number;
  /** 0…100. */
  readonly s: number;
  /** 0…100 — HSV *value*, the "B" of the `hsb` notation. */
  readonly v: number;
  /** 0…1. */
  readonly a: number;
}

/** Channels in 0…255, alpha in 0…1. Floating point until something formats them. */
export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface HslColor {
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly a: number;
}

/**
 * `hsb` is this library's own notation, not a CSS one — it is what the panel
 * shows when a designer works in HSB, and `parseColor` accepts it back so a
 * controlled consumer can hand the string it was just given straight in again.
 */
export type ColorFormat = "hex" | "rgb" | "hsl" | "hsb";

export type ColorNumericChannel =
  | "hue"
  | "saturation"
  | "brightness"
  | "alpha"
  | "red"
  | "green"
  | "blue";

/** `hex` is a text channel: it has a field, never a slider — see `getChannelRange`. */
export type ColorChannel = ColorNumericChannel | "hex";

export interface ColorChannelRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Below one hundredth of the smallest step any channel has. */
const EPSILON = 1e-6;

const CHANNEL_RANGES: Readonly<Record<ColorNumericChannel, ColorChannelRange>> = {
  hue: { min: 0, max: 360, step: 1 },
  saturation: { min: 0, max: 100, step: 1 },
  brightness: { min: 0, max: 100, step: 1 },
  alpha: { min: 0, max: 1, step: 0.01 },
  red: { min: 0, max: 255, step: 1 },
  green: { min: 0, max: 255, step: 1 },
  blue: { min: 0, max: 255, step: 1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** The one circular channel. `359 + 1` is `0`, and `0 − 1` is `359`. */
export function wrapHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  return ((hue % 360) + 360) % 360;
}

/**
 * The range a channel's slider, its arrow keys and its `aria-value*` all read.
 * Total on the numeric channels alone: `hex` has no numbers to bound, and a
 * degenerate range for it is a trap rather than an answer.
 */
export function getChannelRange(channel: ColorNumericChannel): ColorChannelRange {
  return CHANNEL_RANGES[channel];
}

export function hsvToRgb(color: ColorValue): RgbColor {
  const h = wrapHue(color.h) / 60;
  const s = clamp(color.s, 0, 100) / 100;
  const v = clamp(color.v, 0, 100) / 100;
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const base = v - chroma;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) {
    r = chroma;
    g = second;
  } else if (h < 2) {
    r = second;
    g = chroma;
  } else if (h < 3) {
    g = chroma;
    b = second;
  } else if (h < 4) {
    g = second;
    b = chroma;
  } else if (h < 5) {
    r = second;
    b = chroma;
  } else {
    r = chroma;
    b = second;
  }

  return { r: (r + base) * 255, g: (g + base) * 255, b: (b + base) * 255, a: clamp(color.a, 0, 1) };
}

export function rgbToHsv(r: number, g: number, b: number, a: number): ColorValue {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h = wrapHue(h * 60);
  }

  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100, a: clamp(a, 0, 1) };
}

export function hsvToHsl(color: ColorValue): HslColor {
  const s = clamp(color.s, 0, 100) / 100;
  const v = clamp(color.v, 0, 100) / 100;
  const l = (v * (2 - s)) / 2;
  const edge = Math.min(l, 1 - l);
  return {
    h: wrapHue(color.h),
    s: edge === 0 ? 0 : ((v - l) / edge) * 100,
    l: l * 100,
    a: clamp(color.a, 0, 1),
  };
}

export function hslToHsv(h: number, s: number, l: number, a: number): ColorValue {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const v = lightness + saturation * Math.min(lightness, 1 - lightness);
  return {
    h: wrapHue(h),
    s: v === 0 ? 0 : 2 * (1 - lightness / v) * 100,
    v: v * 100,
    a: clamp(a, 0, 1),
  };
}

/** The eight-bit view — what a hex string, an `rgb()` and a swatch all show. */
export function toRgb255(color: ColorValue): RgbColor {
  const rgb = hsvToRgb(color);
  return { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b), a: rgb.a };
}

function pad(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

export function toHex(color: ColorValue, withAlpha: boolean): string {
  const { r, g, b } = toRgb255(color);
  const alpha = withAlpha ? pad(clamp(color.a, 0, 1) * 255) : "";
  return `#${pad(r)}${pad(g)}${pad(b)}${alpha}`;
}

/**
 * The hue (and, on black, the saturation) the conversion could not carry.
 * Without it, dragging the brightness to zero and back would come up red.
 */
export function anchorHue(next: ColorValue, previous: ColorValue): ColorValue {
  if (next.v <= EPSILON) return { h: previous.h, s: previous.s, v: next.v, a: next.a };
  if (next.s <= EPSILON) return { h: previous.h, s: next.s, v: next.v, a: next.a };
  return next;
}

export function getChannelValue(color: ColorValue, channel: ColorNumericChannel): number {
  switch (channel) {
    case "hue":
      // 360 is the track's right edge, where `End` puts it: read back as 0, the
      // thumb would be drawn and published at the left. Both edges paint red.
      return color.h === 360 ? 360 : wrapHue(color.h);
    case "saturation":
      return color.s;
    case "brightness":
      return color.v;
    case "alpha":
      return color.a;
    default: {
      const rgb = toRgb255(color);
      if (channel === "red") return rgb.r;
      if (channel === "green") return rgb.g;
      return rgb.b;
    }
  }
}

/**
 * One channel moves, everything else holds still. The RGB channels round-trip
 * through the eight-bit view first, so nudging red by one lands on an integer
 * instead of drifting off the grid a float conversion left it on.
 */
export function withChannel(
  color: ColorValue,
  channel: ColorNumericChannel,
  value: number,
): ColorValue {
  const range = CHANNEL_RANGES[channel];
  const next = clamp(Number.isFinite(value) ? value : 0, range.min, range.max);
  switch (channel) {
    case "hue":
      return { ...color, h: next };
    case "saturation":
      return { ...color, s: next };
    case "brightness":
      return { ...color, v: next };
    case "alpha":
      return { ...color, a: next };
    default: {
      const rgb = toRgb255(color);
      const r = channel === "red" ? next : rgb.r;
      const g = channel === "green" ? next : rgb.g;
      const b = channel === "blue" ? next : rgb.b;
      return anchorHue(rgbToHsv(r, g, b, color.a), color);
    }
  }
}

/**
 * Four numbers, compared with the tolerance the smallest channel step makes
 * meaningless to go below. It is the bindable's `isEqual`: without it every write
 * of a fresh object — which is every write — would report a change and re-render,
 * forever (the defect `arrayEquals` fixes on the slider).
 */
export function colorEquals(a: ColorValue, b: ColorValue): boolean {
  return (
    Math.abs(a.h - b.h) < EPSILON &&
    Math.abs(a.s - b.s) < EPSILON &&
    Math.abs(a.v - b.v) < EPSILON &&
    Math.abs(a.a - b.a) < EPSILON
  );
}

// --- parsing -----------------------------------------------------------------

const HEX_PATTERN = /^#?([0-9a-f]+)$/;
const FUNCTION_PATTERN = /^(rgba?|hsla?|hsba?)\(([^()]*)\)$/;

function parseHex(text: string): ColorValue | null {
  const match = HEX_PATTERN.exec(text);
  if (match === null) return null;
  const digits = match[1] ?? "";
  const size = digits.length;
  if (size !== 3 && size !== 4 && size !== 6 && size !== 8) return null;

  const short = size < 6;
  const width = short ? 1 : 2;
  const read = (index: number): number => {
    const slice = digits.slice(index * width, index * width + width);
    return Number.parseInt(short ? slice + slice : slice, 16);
  };

  const alpha = size === 4 || size === 8 ? read(3) / 255 : 1;
  return rgbToHsv(read(0), read(1), read(2), alpha);
}

interface NumberToken {
  readonly value: number;
  readonly percent: boolean;
}

function readToken(raw: string): NumberToken | null {
  const percent = raw.endsWith("%");
  let body = percent ? raw.slice(0, -1) : raw;
  if (body.endsWith("deg")) body = body.slice(0, -3);
  if (body === "") return null;
  const value = Number(body);
  return Number.isFinite(value) ? { value, percent } : null;
}

/** `50%` is half of whatever the channel's full scale is; a bare number is itself. */
function scaled(token: NumberToken, full: number): number {
  return token.percent ? (token.value / 100) * full : token.value;
}

function parseFunction(text: string): ColorValue | null {
  const match = FUNCTION_PATTERN.exec(text);
  if (match === null) return null;
  const name = match[1] ?? "";
  // Legacy commas, modern spaces and the `/` before an alpha all separate the
  // same four numbers; normalising them is what lets one reader serve both.
  const parts = (match[2] ?? "").replaceAll(",", " ").replaceAll("/", " ").trim().split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;

  const tokens: NumberToken[] = [];
  for (const part of parts) {
    const token = readToken(part);
    if (token === null) return null;
    tokens.push(token);
  }

  const [first, second, third, fourth] = tokens as [
    NumberToken,
    NumberToken,
    NumberToken,
    NumberToken | undefined,
  ];
  const alpha = fourth === undefined ? 1 : clamp(scaled(fourth, 1), 0, 1);

  if (name.startsWith("rgb")) {
    return rgbToHsv(scaled(first, 255), scaled(second, 255), scaled(third, 255), alpha);
  }
  if (name.startsWith("hsl")) {
    return hslToHsv(first.value, scaled(second, 100), scaled(third, 100), alpha);
  }
  return {
    h: wrapHue(first.value),
    s: clamp(scaled(second, 100), 0, 100),
    v: clamp(scaled(third, 100), 0, 100),
    a: alpha,
  };
}

/**
 * `null` for anything this module does not read, never a throw: the value comes
 * from a text field as often as from a prop, and a half-typed `#ab` is a normal
 * state of the world rather than an error.
 */
export function parseColor(input: string): ColorValue | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;
  if (text === "transparent") return { h: 0, s: 0, v: 0, a: 0 };
  return text.includes("(") ? parseFunction(text) : parseHex(text);
}

export function formatColor(color: ColorValue, format: ColorFormat): string {
  const alpha = clamp(color.a, 0, 1);
  const opaque = alpha >= 1;
  const suffix = opaque ? "" : ` / ${round(alpha, 2)}`;

  switch (format) {
    case "hex":
      return toHex(color, !opaque);
    case "rgb": {
      const { r, g, b } = toRgb255(color);
      return `rgb(${r} ${g} ${b}${suffix})`;
    }
    case "hsl": {
      const hsl = hsvToHsl(color);
      return `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%${suffix})`;
    }
    default:
      return `hsb(${Math.round(wrapHue(color.h))} ${Math.round(color.s)}% ${Math.round(color.v)}%${suffix})`;
  }
}

/**
 * Twelve hues and four achromatic answers — what `aria-valuetext` says out loud
 * so a slider reports "hue 210, azure" rather than a bare number. Approximate on
 * purpose: it names a colour, it does not identify one.
 */
const HUE_NAMES: readonly string[] = [
  "red",
  "orange",
  "yellow",
  "chartreuse",
  "green",
  "spring green",
  "cyan",
  "azure",
  "blue",
  "violet",
  "magenta",
  "rose",
];

export function getColorName(color: ColorValue): string {
  if (color.a <= 0) return "transparent";
  if (color.v <= 8) return "black";
  if (color.s <= 8) return color.v >= 92 ? "white" : "gray";
  const name = HUE_NAMES[Math.round(wrapHue(color.h) / 30) % 12] ?? "red";
  if (color.v <= 40) return `dark ${name}`;
  if (color.s <= 40) return `pale ${name}`;
  return name;
}
