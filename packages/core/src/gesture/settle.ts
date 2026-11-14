/**
 * The release half of a gesture: carrying a surface from where the finger left it
 * to where it belongs, at a speed that matches how it was thrown.
 *
 * Opt-in, behind `@standarui/core/gesture`, because this is the only WAAPI in the
 * library besides `focus-ring` and a consumer who never drags anything should not
 * download it (motion.md §3.3). `interaction/drag-axis` is its other half and has
 * no dependency on it — a component that pages rather than settles takes the
 * tracking alone.
 *
 * **No physics at runtime.** Three precalculated (duration, easing) pairs are
 * perceptually enough (motion.md §2.5), and a spring integrator in JS is the kind
 * of dependency this repo writes by hand or does without.
 *
 * **No curve is written here, and the media query is never consulted.** Both
 * values are read from custom properties *on the node*, so the cascade answers —
 * which means `data-motion="full" | "reduced" | "none"` and
 * `prefers-reduced-motion` arrive already resolved, in the priority motion.md §4.2
 * gives them (`data-motion` wins). A `matchMedia` call here would silently
 * override an app that had asked for full motion. `focus-ring` does consult it,
 * for a reason that does not apply here: it swaps a travel for a crossfade, a
 * change of *nature* no token can express. A settle has no such variant — the
 * surface has to reach its detent either way, and only the speed changes.
 */

/** Which of the three recipes a release earned. */
export type SettleBucket = "slow" | "medium" | "flick";

export interface SettleCurve {
  /** Name of the custom property holding the duration, e.g. `--sui-duration-300`. */
  readonly duration: string;
  /** Name of the custom property holding the easing, e.g. `--sui-spring-smooth`. */
  readonly easing: string;
}

export interface SettleOptions {
  /** Value the animated property has right now, e.g. `"0 120px"`. */
  readonly from: string;
  /**
   * Value it must end on. Make the CSS say the same thing before calling: the
   * animation does not fill, so the last frame hands straight over to the cascade
   * and a mismatch shows as a one-frame jump.
   */
  readonly to: string;
  /** Signed px/ms, as `drag-axis` reports it. Only its magnitude is read here. */
  readonly velocity: number;
  /** Defaults to `translate` — compositor-only, and what a sheet moves on. */
  readonly property?: string | undefined;
  /** Override any of the three recipes' property names. */
  readonly tokens?: Partial<Readonly<Record<SettleBucket, SettleCurve>>> | undefined;
}

/**
 * The two speeds that separate the recipes, in px/ms (motion.md §2.5). Physics,
 * not presentation: a threshold is about the finger, and there is nothing for a
 * stylesheet to say about it.
 */
const SLOW_MAX = 0.2;
const FLICK_MIN = 0.5;

const DEFAULT_TOKENS: Readonly<Record<SettleBucket, SettleCurve>> = {
  slow: { duration: "--sui-spring-smooth-duration", easing: "--sui-spring-smooth" },
  medium: { duration: "--sui-duration-300", easing: "--sui-spring-smooth" },
  // motion.md §2.5 prescribes 180 ms here and the token ladder's nearest rung is
  // 200. The 20 ms are left on the table rather than written into this file: a
  // component that wants the exact number passes its own property, and the
  // catalogue keeps one place where durations live.
  flick: { duration: "--sui-duration-200", easing: "--sui-ease-in" },
};

const FALLBACK_DURATION: Readonly<Record<SettleBucket, number>> = {
  slow: 520,
  medium: 300,
  flick: 180,
};

const FALLBACK_EASING = "ease-out";

/** Local rather than shared: hoisting it would put it in the root bundle, which is
 * the one thing an opt-in module exists to stay out of. `focus-ring` keeps its own
 * copy for the same reason. */
function readMilliseconds(value: string, fallback: number): number {
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return trimmed.endsWith("ms") ? parsed : parsed * 1000;
}

/**
 * Pure, and exported so a machine can assert the boundaries without a DOM. The
 * comparisons are deliberately asymmetric — `0.2` is medium and `0.5` is a flick —
 * so every speed lands in exactly one bucket.
 */
export function resolveSettleBucket(velocity: number): SettleBucket {
  const speed = Math.abs(velocity);
  if (speed < SLOW_MAX) return "slow";
  return speed < FLICK_MIN ? "medium" : "flick";
}

/**
 * Animates `node` from `from` to `to`, returning the `Animation` so the caller can
 * `cancel()` it when a new gesture starts and await `finished` when it lands.
 *
 * That promise is the second reason this lives in the core rather than in a
 * stylesheet: a sheet has to resize its inner scroller **once the settle is over**,
 * and `transitionend` fires per property and lies when interrupted.
 *
 * Returns `null` when there is nothing to animate — no node, no `animate`, or a
 * duration the cascade has flattened to zero. A caller treats that as "already
 * arrived", because the CSS has placed it.
 */
export function settleTo(
  node: HTMLElement | null | undefined,
  options: SettleOptions,
): Animation | null {
  if (node === null || node === undefined || typeof node.animate !== "function") return null;

  const bucket = resolveSettleBucket(options.velocity);
  const curve = options.tokens?.[bucket] ?? DEFAULT_TOKENS[bucket];
  const style = node.ownerDocument.defaultView?.getComputedStyle(node) ?? null;

  const duration = readMilliseconds(
    style?.getPropertyValue(curve.duration) ?? "",
    FALLBACK_DURATION[bucket],
  );
  if (duration <= 0) return null;

  const easing = (style?.getPropertyValue(curve.easing) ?? "").trim();
  const property = options.property ?? "translate";

  return node.animate([{ [property]: options.from }, { [property]: options.to }], {
    duration,
    easing: easing === "" ? FALLBACK_EASING : easing,
    // No fill: the last frame hands over to the cascade, which is already holding
    // the resting position. A `fill: "forwards"` would pin an inline-ish override
    // on the node and the next detent change would animate from a stale base.
    fill: "none",
  });
}
