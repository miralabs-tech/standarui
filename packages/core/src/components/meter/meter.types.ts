import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, Orientation } from "../../types";

export interface MeterValueChangeDetails {
  readonly value: number;
}

/**
 * How the value sits against `low`/`high`/`optimum`, the way the HTML `<meter>`
 * element grades it: the distance between the value's region and the optimum's.
 * `"none"` while neither threshold is given — a neutral gauge has no opinion.
 */
export type MeterValence = "none" | "optimum" | "suboptimal" | "critical";

/**
 * What each graded region is *called*, so the valence reaches assistive
 * technology at all.
 *
 * Without this the grading is carried by colour and by nothing else — the
 * success and warning ramps are 1.01:1 apart in greyscale, `data-valence` is a
 * styling hook no screen reader reads, and the visible value text is
 * `aria-hidden` because the root already announces the number. A gauge that says
 * "18 %" in a calm voice while it is painted red is a gauge that lied.
 *
 * The strings stay the consumer's: a headless core has no business inventing
 * "Low" or "Critical", and it certainly has no business inventing them in
 * English. Whatever is given is appended to `aria-valuetext`; whatever is left
 * out simply is not announced, which is today's behaviour for that region.
 */
export type MeterValenceLabels = Partial<Record<Exclude<MeterValence, "none">, string>>;

/**
 * `role="meter"` requires an accessible name: render the label part or pass
 * `aria-label` on the root — a bare meter is an axe violation.
 */
export interface MeterMachineProps {
  readonly dir?: Direction | undefined;
  /** Controlled. Never null: a meter always has a value. */
  readonly value?: number | undefined;
  /** Uncontrolled. Defaults to `min`, not 0 — a range [2, 8] starts at 2. */
  readonly defaultValue?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Low bound of the middle region. Absent along with `high` → no valence. */
  readonly low?: number | undefined;
  readonly high?: number | undefined;
  /** The ideal point. Effective default: `(min + max) / 2`, like `<meter>`. */
  readonly optimum?: number | undefined;
  readonly orientation?: Orientation | undefined;
  readonly locale?: string | undefined;
  /** Passed to `Intl.NumberFormat` for the value text. Percent by default. */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  /** The only channel the valence has to assistive technology — see the type. */
  readonly valenceLabels?: MeterValenceLabels | undefined;
  readonly onValueChange?: ((details: MeterValueChangeDetails) => void) | undefined;
}

/**
 * `low`/`high`/`optimum` stay optional once resolved: their *absence* carries
 * meaning — no thresholds, no valence.
 */
export interface ResolvedMeterMachineProps extends MeterMachineProps {
  readonly min: number;
  readonly max: number;
  readonly orientation: Orientation;
  readonly locale: string;
  readonly formatOptions: Intl.NumberFormatOptions;
}

export interface MeterSchema extends MachineSchema {
  state: "idle";
  props: ResolvedMeterMachineProps;
  context: { value: number; hasLabel: boolean };
  computed: { percent: number; valence: MeterValence; valueAsText: string };
  event: { type: "VALUE.SET"; value: number } | { type: "PARTS.SYNC" };
  action: "setValue" | "syncParts";
  effect: "trackParts";
}

export interface MeterApi<T extends PropTypes = PropTypes> {
  readonly value: number;
  /** Never null — a meter has no indeterminate state. */
  readonly percent: number;
  /** For rendering the valence as text on the consumer's side. */
  readonly valence: MeterValence;
  readonly valueAsText: string;
  /**
   * What the root announces: `valueAsText`, plus the valence label when the
   * consumer named this region. The visible text stays `valueAsText` — the
   * grading belongs in the announcement, not painted twice on screen.
   */
  readonly valueAsAnnouncedText: string;
  setValue(value: number): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getTrackProps(): T["element"];
  getRangeProps(): T["element"];
  getValueTextProps(): T["element"];
}
