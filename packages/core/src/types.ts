export type Direction = "ltr" | "rtl";

export type Orientation = "horizontal" | "vertical";

export type Density = "desktop" | "touch";

// The input vocabulary is the engine's, and the engine is `@standarx/nav`
// (decision 57). Re-exported here so a machine keeps naming its modality and its
// intents from the same module as its direction and its density.
export type { InputModality, IntentEvent, IntentSource, NavigationIntent } from "@standarx/nav";

/** Viewport-relative geometry, in the shape `getBoundingClientRect` reports it. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The three modes the styles layer ships, and they are three and not two.
 *
 * `reduced` replaces movement with a crossfade — scales go to 1, distances to 0
 * — and deliberately leaves the durations alone; `none` is the one that flattens
 * them. A boolean cannot carry that difference, and anything downstream that
 * skips an animation on `reduced` is skipping a fade the design kept on purpose.
 */
export type MotionMode = "full" | "reduced" | "none";

export interface EnvironmentContext {
  readonly dir: Direction;
  readonly locale: string;
  readonly density: Density;
  readonly motion: MotionMode;
  /**
   * `motion !== "full"`. Kept because most consumers of it are asking the right
   * question — a smooth scroll and a travelling focus ring are both wrong under
   * either reduced mode. Only the ones deciding whether an animation exists at
   * all need to read `motion`.
   */
  readonly reducedMotion: boolean;
}
