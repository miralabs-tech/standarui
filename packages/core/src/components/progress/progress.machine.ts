/**
 * One state, and that is not an oversight: a progress bar has no interaction
 * modes to model. What it does have is a value that can be controlled or not, a
 * range to clamp against, and ids to derive for its label — which is exactly what
 * a service provides and a bare prop getter would have to reinvent.
 *
 * `null` is indeterminate, and it is a value rather than the absence of one. That
 * distinction is what lets `aria-valuenow` be dropped deliberately instead of by
 * accident, which is the difference between "still working" and "0%".
 */

import { observeChildren } from "../../dom/observers";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getRootEl, hasLabel } from "./progress.dom";
import type { ProgressSchema, ProgressState } from "./progress.types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const machine: Machine<ProgressSchema> = createMachine<ProgressSchema>({
  props({ props }) {
    return {
      min: 0,
      max: 100,
      orientation: "horizontal",
      locale: "en-US",
      formatOptions: { style: "percent" },
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<number | null>(() => ({
        // `?? null` would turn an explicit `defaultValue: null` into 0 on the way
        // back out; the coalescing has to be on absence, not on nullishness.
        defaultValue: prop("defaultValue") === undefined ? 0 : prop("defaultValue"),
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "progress value",
      })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    percent({ context, prop }) {
      const value = context.get("value");
      if (value === null) return null;
      const min = prop("min");
      const max = prop("max");
      if (max <= min) return 100;
      return ((clamp(value, min, max) - min) / (max - min)) * 100;
    },

    state({ context, prop }): ProgressState {
      const value = context.get("value");
      if (value === null) return "indeterminate";
      return value >= prop("max") ? "complete" : "loading";
    },

    valueAsText({ computed, context, prop }) {
      const percent = computed("percent");
      const value = context.get("value");
      if (percent === null || value === null) return "";
      const options = prop("formatOptions");
      // A percentage is the *progress*, expressed as the fraction Intl expects.
      // Anything else formats the value itself: "3 MB of 7" is the number 3, not
      // the 43 % it happens to represent.
      const isPercent = options.style === "percent";
      return new Intl.NumberFormat(prop("locale"), options).format(
        isPercent ? percent / 100 : value,
      );
    },
  },

  initialState() {
    return "idle";
  },

  effects: ["trackParts"],

  watch({ scope, track, action }) {
    track(
      () => [hasLabel(scope)],
      () => action(["syncParts"]),
    );
  },

  on: {
    "VALUE.SET": { actions: ["setValue"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    actions: {
      setValue({ context, event, prop }) {
        if (event.type !== "VALUE.SET") return;
        const next = event.value;
        context.set("value", next === null ? null : clamp(next, prop("min"), prop("max")));
      },
      syncParts({ context, scope }) {
        context.set("hasLabel", hasLabel(scope));
      },
    },

    effects: {
      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        return observeChildren(getRootEl(scope), () => send({ type: "PARTS.SYNC" }));
      },
    },
  },
});
