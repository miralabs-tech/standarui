/**
 * The writes, in a module of its own — the machine declares *when* the colour
 * moves, this says *how*.
 *
 * Not a second component and not a barrel: the folder's own `index.ts` is still
 * the only one. Two rules live here rather than in eight actions that would each
 * have to remember them.
 *
 * **Every step is a multiple of the channel's own unit.** `step: 1` is one degree
 * of hue, one per cent of saturation and one hundredth of alpha; a flat number
 * would be a rounding error on a 0→360 channel and the whole range on a 0→1 one.
 *
 * **The hue is put back on the way in.** sRGB cannot tell a black from a black of
 * a particular hue, so a write that lands achromatic would throw it away and the
 * area would jump the next time it was used (`utils/color`, `anchorHue`).
 */

import type { MachineParams, PropAccessor } from "../../machine/types";
import {
  anchorHue,
  type ColorNumericChannel,
  type ColorValue,
  getChannelRange,
  parseColor,
  withChannel,
} from "../../utils/color";
import { constrainValue } from "../../utils/range";
import { getAreaXInputEl } from "./color-picker.dom";
import type { ColorPickerEngageTarget, ColorPickerSchema } from "./color-picker.types";

type Params = MachineParams<ColorPickerSchema>;
type Prop = PropAccessor<ColorPickerSchema>;

/** Black, opaque — what a picker holds when its `defaultValue` will not parse. */
export const FALLBACK: ColorValue = { h: 0, s: 0, v: 0, a: 1 };

export function strideOf(prop: Prop, channel: ColorNumericChannel, large: boolean): number {
  const range = getChannelRange(channel);
  if (!large) return prop("step") * range.step;
  // The default is a tenth of the range and not ten channel units, because ten
  // units is a rounding error on a 0→360 channel. An explicit `largeStep` stays
  // in channel units, like `step`, so the two props read the same way.
  const explicit = prop("largeStep");
  return explicit === undefined ? (range.max - range.min) / 10 : explicit * range.step;
}

export function quantise(prop: Prop, channel: ColorNumericChannel, value: number): number {
  const range = getChannelRange(channel);
  return constrainValue(value, {
    min: range.min,
    max: range.max,
    step: range.step * prop("step"),
    minStepsBetweenThumbs: 0,
  });
}

export function writeColor(params: Params, next: ColorValue): void {
  params.refs.set("changed", next);
  params.context.set("color", next);
}

export function writeChannel(params: Params, channel: ColorNumericChannel, value: number): void {
  const color = params.context.get("color");
  writeColor(params, withChannel(color, channel, quantise(params.prop, channel, value)));
}

/** Saturation and brightness move together, so they are written together — one notification. */
export function writeArea(params: Params, x: number, y: number): void {
  const color = params.context.get("color");
  const saturated = withChannel(color, "saturation", quantise(params.prop, "saturation", x * 100));
  writeColor(
    params,
    withChannel(saturated, "brightness", quantise(params.prop, "brightness", y * 100)),
  );
}

/** A parsed string, with the hue the notation could not carry put back. */
export function applyString(params: Params, input: string): void {
  const parsed = parseColor(input);
  if (parsed === null) return;
  const current = params.context.get("color");
  const anchored = anchorHue(parsed, current);
  writeColor(params, params.prop("alpha") ? anchored : { ...anchored, a: 1 });
}

/** What the pad is pointing at when A is pressed — the area's axis input, or a thumb. */
export function focusedEngageTarget(params: Params): ColorPickerEngageTarget | null {
  const active = params.scope.getActiveElement();
  if (active === null) return null;
  if (active === getAreaXInputEl(params.scope)) return "area";
  const part = active.getAttribute("data-part") ?? "";
  if (!part.split(" ").includes("color-picker:channel-slider-thumb")) return null;
  return active.getAttribute("data-channel") as ColorNumericChannel | null;
}
