/**
 * What the slider adds on top of the shared range arithmetic (`utils/range`):
 * turning an input — eight keys or a d-pad — into one of the four value events.
 *
 * **`Home`/`End` and the vertical axis never mirror.** RTL flips left/right and
 * nothing else: the APG says Home is *the minimum value*, not the left end, and
 * up/down have no writing order to follow. A keymap that mirrors wholesale breaks
 * both, which is why the mirror lives in exactly one function.
 */

import type { Direction, Orientation } from "../../types";
import type { SliderAdjustEvent, SliderAdjustment, SliderIntent } from "./slider.types";

/**
 * The mirror, in one place. `moveUp`/`moveDown`, `home`/`end` and the page keys
 * never reach the RTL branch — see the file header.
 */
export function resolveDirection(
  intent: SliderIntent,
  dir: Direction,
  orientation: Orientation,
): SliderAdjustment {
  const mirrored = orientation === "horizontal" && dir === "rtl";
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
export function toAdjustEvent(adjustment: SliderAdjustment, index: number): SliderAdjustEvent {
  const { kind, large } = adjustment;
  if (kind === "increment") return { type: "THUMB.INCREMENT", index, large };
  if (kind === "decrement") return { type: "THUMB.DECREMENT", index, large };
  if (kind === "min") return { type: "THUMB.SET_MIN", index };
  return { type: "THUMB.SET_MAX", index };
}

const KEY_INTENTS: Readonly<Record<string, SliderIntent>> = {
  ArrowRight: "moveRight",
  ArrowLeft: "moveLeft",
  ArrowUp: "moveUp",
  ArrowDown: "moveDown",
  PageUp: "pageUp",
  PageDown: "pageDown",
  Home: "home",
  End: "end",
};

/** The eight APG keys, mapped onto the same intents the pad produces. */
export function getKeyIntent(key: string): SliderIntent | null {
  return KEY_INTENTS[key] ?? null;
}
