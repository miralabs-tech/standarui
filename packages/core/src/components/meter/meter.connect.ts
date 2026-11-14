import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./meter.anatomy";
import { getLabelId, getRootId, getValueTextId } from "./meter.dom";
import type { MeterApi, MeterSchema } from "./meter.types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function connect<T extends PropTypes>(
  service: Service<MeterSchema>,
  normalize: NormalizeProps<T>,
): MeterApi<T> {
  const { context, prop, computed, send, scope } = service;

  const value = context.get("value");
  const percent = computed("percent");
  const valence = computed("valence");
  const valueAsText = computed("valueAsText");

  /**
   * The one channel the valence has to assistive technology. `data-valence` is
   * a styling hook, the colour ramps are 1.01:1 apart in greyscale, and the
   * visible value text is `aria-hidden` because the root already announces the
   * number — so without this the grading reaches nobody who cannot see it.
   *
   * Appended rather than substituted, and only for a region the consumer named:
   * the number is what the meter is for, and a core that has not been given the
   * words does not invent them.
   */
  const valenceLabel = valence === "none" ? undefined : prop("valenceLabels")?.[valence];
  const valueAsAnnouncedText =
    valenceLabel === undefined ? valueAsText : `${valueAsText}, ${valenceLabel}`;

  const stateAttrs = {
    "data-orientation": prop("orientation"),
    // Absent while the gauge is neutral, never present-and-empty — the same
    // rule as `data-scroll`.
    "data-valence": valence === "none" ? undefined : valence,
  };

  return {
    value,
    percent,
    valence,
    valueAsText,
    valueAsAnnouncedText,

    setValue(next: number): void {
      send({ type: "VALUE.SET", value: next });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        role: "meter",
        dir: prop("dir"),
        // Only when the label part is really there: a dangling IDREF would
        // leave the gauge with no accessible name at all and stop a consumer's
        // own `aria-label` from winning — the same guard as `progress`, and the
        // same answer a server gives before the mount effect.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        // Always present — a meter has no indeterminate state to drop them for.
        "aria-valuemin": prop("min"),
        "aria-valuemax": prop("max"),
        "aria-valuenow": clamp(value, prop("min"), prop("max")),
        "aria-valuetext": valueAsAnnouncedText,
        style: { "--sui-meter-percent": `${percent}%` },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getTrackProps: (): T["element"] => normalize.element({ ...parts.track.attrs, ...stateAttrs }),

    getRangeProps: (): T["element"] => normalize.element({ ...parts.range.attrs, ...stateAttrs }),

    getValueTextProps: (): T["element"] =>
      normalize.element({
        ...parts.valueText.attrs,
        ...stateAttrs,
        id: getValueTextId(scope),
        // The root already publishes the value to assistive technology through
        // `aria-valuetext`; reading the same number twice helps nobody.
        "aria-hidden": "true",
      }),
  };
}
