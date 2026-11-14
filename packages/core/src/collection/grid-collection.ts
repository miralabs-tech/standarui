/**
 * Two-dimensional navigation for anything laid out in a grid: a calendar month,
 * a data grid, a virtual keyboard, a colour swatch panel.
 *
 * Column wrapping is deliberately asymmetric with row wrapping. Moving right off
 * the last column continues on the next row — the reading order APG specifies for
 * a grid — while moving down off the last row stays put unless looping is on. A
 * grid that teleports vertically is disorienting; one that continues horizontally
 * is how a text cursor already behaves.
 *
 * `dir` inverts left/right here rather than in each component, the way
 * `getRovingKeyAction` already does it for a one-dimensional composite: the
 * arrow keys and the gamepad d-pad both arrive physical (`@standarx/nav`'s keymap), and the
 * mirror is spent once per composite instead of in every machine.
 */

import type { Direction } from "../types";

export type GridAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "rowStart"
  | "rowEnd"
  | "gridStart"
  | "gridEnd"
  | "pageUp"
  | "pageDown";

export interface GridOptions {
  readonly count: number;
  readonly columns: number;
  /** Rows moved by PageUp/PageDown. */
  readonly page?: number | undefined;
  readonly loop?: boolean | undefined;
  readonly isDisabled?: ((index: number) => boolean) | undefined;
}

export interface GridPosition {
  readonly row: number;
  readonly column: number;
}

export function getGridPosition(index: number, columns: number): GridPosition {
  return { row: Math.floor(index / columns), column: index % columns };
}

export function getGridIndex(position: GridPosition, columns: number): number {
  return position.row * columns + position.column;
}

export function getRowCount(count: number, columns: number): number {
  return Math.ceil(count / columns);
}

/** The lowest cell that exists in a column — the last row is usually ragged. */
function lastInColumn(column: number, count: number, columns: number): number {
  for (let row = getRowCount(count, columns) - 1; row >= 0; row--) {
    const index = getGridIndex({ row, column }, columns);
    if (index < count) return index;
  }
  return column;
}

function target(current: number, action: GridAction, options: GridOptions): number {
  const { count, columns } = options;
  const { row, column } = getGridPosition(current, columns);
  const loop = options.loop === true;
  const page = options.page ?? 1;

  switch (action) {
    case "left":
      // Reading order: off the first column continues at the end of the row above.
      return current > 0 ? current - 1 : loop ? count - 1 : current;
    case "right":
      return current < count - 1 ? current + 1 : loop ? 0 : current;
    case "up":
      if (row > 0) return current - columns;
      return loop ? lastInColumn(column, count, columns) : current;
    case "down": {
      const below = current + columns;
      if (below < count) return below;
      if (!loop) return current;
      return column;
    }
    case "rowStart":
      return getGridIndex({ row, column: 0 }, columns);
    case "rowEnd":
      return Math.min(getGridIndex({ row, column: columns - 1 }, columns), count - 1);
    case "gridStart":
      return 0;
    case "gridEnd":
      return count - 1;
    case "pageUp":
      return Math.max(current - columns * page, column);
    case "pageDown": {
      const jumped = current + columns * page;
      // Never change column to land on the ragged last row: fall back to the
      // lowest cell this column actually has.
      return jumped < count ? jumped : lastInColumn(column, count, columns);
    }
  }
}

/**
 * Disabled cells are stepped over along the direction of travel — a disabled date
 * in a calendar must not swallow the arrow key.
 */
export function getGridNextIndex(
  current: number,
  action: GridAction,
  options: GridOptions,
): number {
  const { count } = options;
  if (count <= 0) return -1;
  const disabled = (index: number): boolean => options.isDisabled?.(index) === true;
  const from = current < 0 || current >= count ? 0 : current;

  let candidate = target(from, action, options);
  const seen = new Set<number>([from]);
  while (disabled(candidate) && !seen.has(candidate)) {
    seen.add(candidate);
    const next = target(candidate, action, options);
    if (next === candidate) return from;
    candidate = next;
  }
  return disabled(candidate) ? from : candidate;
}

export interface GridKeyOptions {
  readonly ctrlKey?: boolean | undefined;
  readonly dir?: Direction | undefined;
}

export function getGridKeyAction(key: string, options: GridKeyOptions = {}): GridAction | null {
  const rtl = options.dir === "rtl";

  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return rtl ? "right" : "left";
    case "ArrowRight":
      return rtl ? "left" : "right";
    // Home and End are bounds, not directions: the row is already laid out
    // right-to-left on screen, so mirroring them would send Home to the far end
    // of the week. Same answer `getRovingKeyAction` gives.
    case "Home":
      return options.ctrlKey === true ? "gridStart" : "rowStart";
    case "End":
      return options.ctrlKey === true ? "gridEnd" : "rowEnd";
    case "PageUp":
      return "pageUp";
    case "PageDown":
      return "pageDown";
    default:
      return null;
  }
}
