/**
 * The circle's geometry is fixed here rather than made configurable: a viewBox of
 * 100 × 100 with r = 42 leaves room for the thickest stroke the design system
 * asks for, and the SVG scales to whatever size the CSS gives it. A `size` prop
 * would only be a second way to say `inline-size`.
 */

import { dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./progress.anatomy";
import { getLabelId, getRootId, getValueTextId } from "./progress.dom";
import type { ProgressApi, ProgressSchema } from "./progress.types";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function connect<T extends PropTypes>(
  service: Service<ProgressSchema>,
  normalize: NormalizeProps<T>,
): ProgressApi<T> {
  const { context, prop, computed, send, scope } = service;

  const value = context.get("value");
  const percent = computed("percent");
  const state = computed("state");
  const indeterminate = state === "indeterminate";
  const orientation = prop("orientation");

  const stateAttrs = {
    "data-state": state,
    "data-orientation": orientation,
  };

  return {
    value,
    percent,
    indeterminate,
    complete: state === "complete",
    valueAsText: computed("valueAsText"),

    setValue(next: number | null): void {
      send({ type: "VALUE.SET", value: next });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        role: "progressbar",
        dir: prop("dir"),
        // Only when the label part is really there: a bar pointing at a label
        // that was never rendered has no accessible name, which is worse than
        // having none declared — a consumer's own `aria-label` cannot win
        // against a dangling IDREF.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        // Dropped, not zeroed: an indeterminate bar that reports 0 is a bar that
        // says the work has not started.
        "aria-valuemin": indeterminate ? undefined : prop("min"),
        "aria-valuemax": indeterminate ? undefined : prop("max"),
        "aria-valuenow": indeterminate || value === null ? undefined : value,
        "aria-valuetext": indeterminate ? undefined : computed("valueAsText"),
        "data-indeterminate": dataAttr(indeterminate),
        style: { "--sui-progress-percent": percent === null ? "0%" : `${percent}%` },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getTrackProps: (): T["element"] => normalize.element({ ...parts.track.attrs, ...stateAttrs }),

    getRangeProps: (): T["element"] =>
      normalize.element({
        ...parts.range.attrs,
        ...stateAttrs,
        "data-indeterminate": dataAttr(indeterminate),
      }),

    getValueTextProps: (): T["element"] =>
      normalize.element({
        ...parts.valueText.attrs,
        ...stateAttrs,
        id: getValueTextId(scope),
        // The root already publishes the value to assistive technology through
        // `aria-valuetext`; reading the same number twice helps nobody.
        "aria-hidden": "true",
      }),

    getCircleProps: (): T["svg"] =>
      normalize.svg({
        ...parts.circle.attrs,
        ...stateAttrs,
        viewBox: "0 0 100 100",
        focusable: false,
        "aria-hidden": "true",
      }),

    getCircleTrackProps: (): T["circle"] =>
      normalize.circle({ ...parts.circleTrack.attrs, cx: 50, cy: 50, r: RADIUS, fill: "none" }),

    getCircleRangeProps: (): T["circle"] =>
      normalize.circle({
        ...parts.circleRange.attrs,
        ...stateAttrs,
        cx: 50,
        cy: 50,
        r: RADIUS,
        fill: "none",
        strokeLinecap: "round",
        strokeDasharray: CIRCUMFERENCE,
        // A quarter arc while indeterminate, spun by CSS: the geometry says
        // "unknown amount of work", the animation says "still working".
        strokeDashoffset:
          percent === null ? CIRCUMFERENCE * 0.75 : CIRCUMFERENCE * (1 - percent / 100),
        "data-indeterminate": dataAttr(indeterminate),
      }),
  };
}
