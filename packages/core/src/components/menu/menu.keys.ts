/**
 * The key table, pure and DOM-free, so the RTL mirror can be asserted in the node
 * project and so `connect` and the intent scope resolve a direction exactly once.
 *
 * `getRovingKeyAction` already owns the mirror for the axis a composite navigates
 * (architecture.md: "le miroir vit dans `getRovingKeyAction`, une fois par
 * composite"), and a vertical menu therefore gets `null` from it for both
 * horizontal arrows. What is left is the *other* horizontal meaning a menu has —
 * open a submenu, close a level — and it needs the same mirror, once, here.
 */

import type { RovingAction } from "../../focus/roving-focus";
import type { Direction, NavigationIntent } from "../../types";

export type MenuSubmenuAction = "open" | "close";

/**
 * `fwd` opens, `back` closes. `fwd` is ArrowRight in LTR and ArrowLeft in RTL —
 * the physical key, mirrored once, exactly like the roving axis.
 */
export function getSubmenuKeyAction(key: string, dir: Direction): MenuSubmenuAction | null {
  const rtl = dir === "rtl";
  if (key === "ArrowRight") return rtl ? "close" : "open";
  if (key === "ArrowLeft") return rtl ? "open" : "close";
  return null;
}

/**
 * The gamepad half. `moveLeft`/`moveRight` are physical intents by contract — the
 * keymap holds no mirror — so they are translated into their keys and answered by
 * the same function. One rule, two sources, which is the founding invariant.
 */
export function getSubmenuIntentAction(
  intent: NavigationIntent,
  dir: Direction,
): MenuSubmenuAction | null {
  if (intent === "moveRight") return getSubmenuKeyAction("ArrowRight", dir);
  if (intent === "moveLeft") return getSubmenuKeyAction("ArrowLeft", dir);
  return null;
}

/**
 * PageUp/PageDown are first/last in a menu, which `getRovingKeyAction` has no
 * opinion about — it speaks Home and End. Folding the pair onto those two keeps
 * one table rather than two, and keeps the gamepad's LT/RT on the same path.
 */
export function toRovingKey(key: string): string {
  if (key === "PageUp") return "Home";
  if (key === "PageDown") return "End";
  return key;
}

/** The intents that move the highlight, expressed as the keys they are twins of. */
export function toRovingIntentKey(intent: NavigationIntent): string | null {
  switch (intent) {
    case "moveUp":
      return "ArrowUp";
    case "moveDown":
      return "ArrowDown";
    case "home":
    case "pageUp":
      return "Home";
    case "end":
    case "pageDown":
      return "End";
    default:
      return null;
  }
}

/**
 * Which end of the menu a key on the **trigger** opens onto (APG Menu Button):
 * Enter, Space and ArrowDown land on the first item, ArrowUp on the last.
 */
export function getTriggerOpenAction(key: string): RovingAction | null {
  if (key === "Enter" || key === " " || key === "ArrowDown") return "first";
  if (key === "ArrowUp") return "last";
  return null;
}
