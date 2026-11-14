/**
 * Roving tabindex: one stop in the tab order for the whole composite, arrows to
 * move inside it. Shared by radio-group, toolbar, toggle-group, tabs, menu and
 * listbox — the arithmetic is here so every one of them agrees on what Home does
 * and where a wrap lands.
 *
 * Pure, and that is the point: the arrow keys and the gamepad d-pad resolve to the
 * same `RovingAction` (CDC D9), so the machines never learn which one moved.
 * `dir` inverts left/right here rather than in each component.
 */

import type { Direction, NavigationIntent, Orientation } from "../types";

export type RovingAction = "next" | "prev" | "first" | "last";

export interface RovingOptions {
  readonly count: number;
  readonly loop?: boolean | undefined;
  readonly isDisabled?: ((index: number) => boolean) | undefined;
}

export interface RovingKeyOptions {
  readonly orientation?: Orientation | undefined;
  readonly dir?: Direction | undefined;
  /** Both axes move, whatever the orientation — grids and the d-pad. */
  readonly bothAxes?: boolean | undefined;
}

export function getRovingKeyAction(
  key: string,
  options: RovingKeyOptions = {},
): RovingAction | null {
  const orientation = options.orientation ?? "vertical";
  const rtl = options.dir === "rtl";
  const horizontal = options.bothAxes === true || orientation === "horizontal";
  const vertical = options.bothAxes === true || orientation === "vertical";

  switch (key) {
    case "ArrowDown":
      return vertical ? "next" : null;
    case "ArrowUp":
      return vertical ? "prev" : null;
    case "ArrowRight":
      return horizontal ? (rtl ? "prev" : "next") : null;
    case "ArrowLeft":
      return horizontal ? (rtl ? "next" : "prev") : null;
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** The intents that move a highlight, expressed as the keys they are twins of. */
const INTENT_KEYS: Readonly<Record<string, string>> = {
  moveUp: "ArrowUp",
  moveDown: "ArrowDown",
  moveLeft: "ArrowLeft",
  moveRight: "ArrowRight",
  home: "Home",
  end: "End",
};

/**
 * The same resolution, entered from a pad instead of a keyboard — the half that
 * makes the promise above true. It lives here and not in each machine because
 * two copies of this mirror are two chances for one of them to answer `next`
 * where the other answers `null`, which is precisely how a d-pad stops behaving
 * like the arrows it is supposed to be indistinguishable from.
 */
export function getRovingIntentAction(
  intent: NavigationIntent,
  options: RovingKeyOptions = {},
): RovingAction | null {
  const key = INTENT_KEYS[intent];
  return key === undefined ? null : getRovingKeyAction(key, options);
}

/**
 * Returns the index to move to, or the current one when the move is impossible.
 * Disabled items are stepped over — never focused and never left as the answer.
 */
export function getNextIndex(
  current: number,
  action: RovingAction,
  options: RovingOptions,
): number {
  const { count } = options;
  if (count <= 0) return -1;
  const loop = options.loop ?? true;
  const disabled = (index: number): boolean => options.isDisabled?.(index) === true;

  const scan = (from: number, step: number): number => {
    for (let offset = 1; offset <= count; offset++) {
      let index = from + step * offset;
      if (index < 0 || index >= count) {
        if (!loop) return from >= 0 && from < count ? from : -1;
        index = ((index % count) + count) % count;
      }
      if (!disabled(index)) return index;
    }
    return from;
  };

  const first = (): number => (disabled(0) ? scan(0, 1) : 0);
  const last = (): number => (disabled(count - 1) ? scan(count - 1, -1) : count - 1);
  // Outside the collection — nothing focused yet, or an index left over from a
  // shorter list. Entering forward lands on the first item, backward on the last.
  const outside = current < 0 || current >= count;

  switch (action) {
    case "next":
      return outside ? first() : scan(current, 1);
    case "prev":
      return outside ? last() : scan(current, -1);
    case "first":
      return first();
    case "last":
      return last();
  }
}

/** Exactly one item is in the tab order; everything else is reachable by arrow. */
export function getRovingTabIndex(index: number, activeIndex: number): 0 | -1 {
  return index === activeIndex ? 0 : -1;
}

/** The first enabled index — where a composite starts before anything is chosen. */
export function getInitialIndex(options: RovingOptions): number {
  for (let index = 0; index < options.count; index++) {
    if (options.isDisabled?.(index) !== true) return index;
  }
  return -1;
}

/**
 * Where the focus goes when the item at `index` is removed: the next enabled one,
 * and the previous one when there is no next (APG). `-1` when it was the only item
 * there was.
 *
 * Read against the collection as it stands *before* the removal, which is the only
 * state a machine can see — the consumer owns the removal itself.
 */
export function getRemovalIndex(index: number, options: RovingOptions): number {
  const bounded = { ...options, loop: false };
  // `getNextIndex` answers with the index it started from when a non-looping move
  // has nowhere to go, which is exactly the "no next item" signal wanted here.
  const forward = getNextIndex(index, "next", bounded);
  if (forward !== index && forward !== -1) return forward;
  const back = getNextIndex(index, "prev", bounded);
  return back === index ? -1 : back;
}
