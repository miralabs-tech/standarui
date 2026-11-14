import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, Orientation } from "../../types";

export interface ProgressValueChangeDetails {
  readonly value: number | null;
}

export type ProgressState = "indeterminate" | "loading" | "complete";

export interface ProgressMachineProps {
  readonly dir?: Direction | undefined;
  /** `null` is indeterminate — a real value, not a missing one. Controlled. */
  readonly value?: number | null | undefined;
  readonly defaultValue?: number | null | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly orientation?: Orientation | undefined;
  readonly locale?: string | undefined;
  /** Passed to `Intl.NumberFormat` for the value text. Percent by default. */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  readonly onValueChange?: ((details: ProgressValueChangeDetails) => void) | undefined;
}

export interface ResolvedProgressMachineProps extends ProgressMachineProps {
  readonly min: number;
  readonly max: number;
  readonly orientation: Orientation;
  readonly locale: string;
  readonly formatOptions: Intl.NumberFormatOptions;
}

export interface ProgressSchema extends MachineSchema {
  state: "idle";
  props: ResolvedProgressMachineProps;
  context: { value: number | null; hasLabel: boolean };
  computed: { percent: number | null; state: ProgressState; valueAsText: string };
  event: { type: "VALUE.SET"; value: number | null } | { type: "PARTS.SYNC" };
  action: "setValue" | "syncParts";
  effect: "trackParts";
}

export interface ProgressApi<T extends PropTypes = PropTypes> {
  readonly value: number | null;
  /** `null` while indeterminate, so a consumer cannot render "0%" by accident. */
  readonly percent: number | null;
  readonly indeterminate: boolean;
  readonly complete: boolean;
  readonly valueAsText: string;
  setValue(value: number | null): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getTrackProps(): T["element"];
  getRangeProps(): T["element"];
  getValueTextProps(): T["element"];
  getCircleProps(): T["svg"];
  getCircleTrackProps(): T["circle"];
  getCircleRangeProps(): T["circle"];
}
