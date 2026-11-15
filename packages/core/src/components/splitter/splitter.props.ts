import type { EngageIntent } from "../../nav";
import type { Direction, Orientation } from "../../types";
import type { SplitterPanelSide } from "./splitter.types";

export type SplitterGrowth = -1 | 0 | 1;

export function resolveGrowth(
  intent: EngageIntent,
  orientation: Orientation,
  panelSide: SplitterPanelSide,
  dir: Direction,
): SplitterGrowth {
  const towardsEnd: SplitterGrowth = panelSide === "start" ? 1 : -1;
  const towardsStart: SplitterGrowth = panelSide === "start" ? -1 : 1;
  if (orientation === "horizontal") {
    const mirrored = dir === "rtl";
    if (intent === "moveRight") return mirrored ? towardsStart : towardsEnd;
    if (intent === "moveLeft") return mirrored ? towardsEnd : towardsStart;
    return 0;
  }
  if (intent === "moveDown") return towardsEnd;
  if (intent === "moveUp") return towardsStart;
  return 0;
}

export function isAdjustable(
  intent: EngageIntent,
  orientation: Orientation,
  panelSide: SplitterPanelSide,
): boolean {
  return (
    intent === "home" ||
    intent === "end" ||
    resolveGrowth(intent, orientation, panelSide, "ltr") !== 0
  );
}

const KEY_INTENTS: Readonly<Record<string, EngageIntent>> = {
  ArrowRight: "moveRight",
  ArrowLeft: "moveLeft",
  ArrowUp: "moveUp",
  ArrowDown: "moveDown",
  Home: "home",
  End: "end",
};

export function getKeyIntent(key: string): EngageIntent | null {
  return KEY_INTENTS[key] ?? null;
}

export function precisionOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}
