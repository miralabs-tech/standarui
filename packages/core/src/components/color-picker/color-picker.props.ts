/**
 * What this component adds on top of the shared arithmetic: turning an input —
 * eight keys, a modifier, or a d-pad — into one of the value events.
 *
 * **`Home`/`End` and the vertical axis never mirror.** RTL flips left and right
 * and nothing else: the APG says Home is *the minimum value*, not the left end,
 * and up/down have no writing order to follow. The mirror therefore lives in
 * exactly one function, `resolveDirection`, the way it does on the slider.
 *
 * Written here rather than imported from `slider.props`, and the reason is
 * measurable rather than stylistic: a `../slider/slider.props.js` import is not
 * covered by the `../../*` external of the budget script, so it would be counted
 * twice — once on this component's line and once on the slider's. It diverges on
 * two points anyway. **Shift+arrow is consumed here** (the slider leaves it to the
 * text selection it might be taking away; an area and a colour track have no text
 * in them, and Shift is the step modifier every colour picker on the market
 * uses), and the area needs a two-axis intent the slider has never had.
 *
 * The swatch grid is not here at all: `collection/grid-collection` gained a
 * `dir` option, so `getGridKeyAction(key, { dir, ctrlKey })` already answers the
 * §6.6 table — reading right-to-left mirrored, `Home`/`End` bounded to the row and
 * `Ctrl+Home`/`Ctrl+End` to the grid. Restating it as a `getSwatchKeyAction`
 * would be a second copy of a mirror that is now shared.
 */

import type { EngageIntent } from "../../nav";
import type { Direction } from "../../types";
import type { ColorNumericChannel } from "../../utils/color";
import type {
  ColorPickerAreaAdjustEvent,
  ColorPickerAreaAxis,
  ColorPickerChannelAdjustEvent,
} from "./color-picker.types";

export type ColorAdjustmentKind = "increment" | "decrement" | "min" | "max";

export interface ColorAdjustment {
  readonly kind: ColorAdjustmentKind;
  readonly large: boolean;
}

/** The eight APG keys, mapped onto the same intents a pad produces. */
const KEY_INTENTS: Readonly<Record<string, EngageIntent>> = {
  ArrowRight: "moveRight",
  ArrowLeft: "moveLeft",
  ArrowUp: "moveUp",
  ArrowDown: "moveDown",
  PageUp: "pageUp",
  PageDown: "pageDown",
  Home: "home",
  End: "end",
};

export function getKeyIntent(key: string): EngageIntent | null {
  return KEY_INTENTS[key] ?? null;
}

/** The mirror, in one place. Only `moveLeft`/`moveRight` ever reach the RTL branch. */
export function resolveDirection(intent: EngageIntent, dir: Direction): ColorAdjustment {
  const mirrored = dir === "rtl";
  switch (intent) {
    case "moveRight":
      return { kind: mirrored ? "decrement" : "increment", large: false };
    case "moveLeft":
      return { kind: mirrored ? "increment" : "decrement", large: false };
    case "moveUp":
      return { kind: "increment", large: false };
    case "moveDown":
      return { kind: "decrement", large: false };
    case "pageUp":
      return { kind: "increment", large: true };
    case "pageDown":
      return { kind: "decrement", large: true };
    case "home":
      return { kind: "min", large: false };
    default:
      return { kind: "max", large: false };
  }
}

/** Written once so the keyboard and the engage scope cannot send different events. */
export function toChannelAdjustEvent(
  adjustment: ColorAdjustment,
  channel: ColorNumericChannel,
): ColorPickerChannelAdjustEvent {
  const { kind, large } = adjustment;
  if (kind === "increment") return { type: "CHANNEL.INCREMENT", channel, large };
  if (kind === "decrement") return { type: "CHANNEL.DECREMENT", channel, large };
  if (kind === "min") return { type: "CHANNEL.SET_MIN", channel };
  return { type: "CHANNEL.SET_MAX", channel };
}

export function toAreaAdjustEvent(
  adjustment: ColorAdjustment,
  axis: ColorPickerAreaAxis,
): ColorPickerAreaAdjustEvent {
  const { kind, large } = adjustment;
  if (kind === "min") return { type: "AREA.SET_EXTREME", axis, edge: "min" };
  if (kind === "max") return { type: "AREA.SET_EXTREME", axis, edge: "max" };
  return { type: "AREA.ADJUST", axis, direction: kind, large };
}

/**
 * Which axis an intent moves. Left and right are the saturation, up and down the
 * brightness — and the page keys go with the vertical pair, because a colour area
 * is read the way a chart is: the big move is up the light.
 */
export function getAreaAxis(intent: EngageIntent): ColorPickerAreaAxis {
  switch (intent) {
    case "moveLeft":
    case "moveRight":
    case "home":
    case "end":
      return "x";
    default:
      return "y";
  }
}

export interface ColorKeyOptions {
  readonly dir: Direction;
  readonly shiftKey: boolean;
}

/**
 * The area's keyboard, both axes on one element. `Shift` is the large step and
 * it also moves `Home`/`End` from the saturation onto the brightness — the only
 * way to reach the second axis's bounds from a single tab stop.
 */
export function getAreaKeyEvent(
  key: string,
  options: ColorKeyOptions,
): ColorPickerAreaAdjustEvent | null {
  const intent = getKeyIntent(key);
  if (intent === null) return null;
  const adjustment = resolveDirection(intent, options.dir);
  const bound = adjustment.kind === "min" || adjustment.kind === "max";
  const axis: ColorPickerAreaAxis = bound && options.shiftKey ? "y" : getAreaAxis(intent);
  return toAreaAdjustEvent(
    { kind: adjustment.kind, large: adjustment.large || (options.shiftKey && !bound) },
    axis,
  );
}

/** A channel track's keyboard. One axis, so the mirror is the whole of RTL here. */
export function getChannelKeyEvent(
  key: string,
  channel: ColorNumericChannel,
  options: ColorKeyOptions,
): ColorPickerChannelAdjustEvent | null {
  const intent = getKeyIntent(key);
  if (intent === null) return null;
  const adjustment = resolveDirection(intent, options.dir);
  const bound = adjustment.kind === "min" || adjustment.kind === "max";
  return toChannelAdjustEvent(
    { kind: adjustment.kind, large: adjustment.large || (options.shiftKey && !bound) },
    channel,
  );
}
