/**
 * One state, the same shape as `progress` and for the same reason: nothing to
 * interact with, but a value that can be controlled or not, a range to clamp
 * against, ids to derive and a label part to detect — which is exactly what a
 * service provides and a bare prop getter would have to reinvent.
 *
 * Where the two split is what the value *means*. A progress value can be
 * unknown; a meter's cannot — a gauge always reads something, so `value` is a
 * number and there is no indeterminate branch anywhere. What a meter has
 * instead is quality: `low`/`high`/`optimum` grade the value the way the HTML
 * `<meter>` element does, by the distance between regions.
 */

import { observeChildren } from "../../dom/observers";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getRootEl, hasLabel } from "./meter.dom";
import type { MeterSchema, MeterValence } from "./meter.types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const machine: Machine<MeterSchema> = createMachine<MeterSchema>({
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
      value: bindable<number>(() => ({
        // Coalesced on absence, not nullishness, and onto `min` rather than 0:
        // a gauge over [2, 8] starts at 2.
        defaultValue: prop("defaultValue") === undefined ? prop("min") : prop("defaultValue"),
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "meter value",
      })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    percent({ context, prop }) {
      const min = prop("min");
      const max = prop("max");
      if (max <= min) return 100;
      return ((clamp(context.get("value"), min, max) - min) / (max - min)) * 100;
    },

    valence({ context, prop }): MeterValence {
      const low = prop("low");
      const high = prop("high");
      if (low === undefined && high === undefined) return "none";
      const min = prop("min");
      const max = prop("max");
      const lo = clamp(low ?? min, min, max);
      // Floored at `lo`, so a crossed pair normalises instead of turning the
      // middle region inside out.
      const hi = clamp(high ?? max, lo, max);
      const opt = clamp(prop("optimum") ?? (min + max) / 2, min, max);
      // Bounds belong to the middle region, the way `<meter>` reads them: a
      // value sitting exactly on `low` or `high` is not outside yet.
      const region = (x: number): number => (x < lo ? 0 : x > hi ? 2 : 1);
      const distance = Math.abs(region(clamp(context.get("value"), min, max)) - region(opt));
      return distance === 0 ? "optimum" : distance === 1 ? "suboptimal" : "critical";
    },

    valueAsText({ computed, context, prop }) {
      const options = prop("formatOptions");
      // A percentage is the *level*, expressed as the fraction Intl expects.
      // Anything else formats the value itself: "620 GB" is the number 620, not
      // the share of the disk it happens to occupy.
      const isPercent = options.style === "percent";
      const value = clamp(context.get("value"), prop("min"), prop("max"));
      return new Intl.NumberFormat(prop("locale"), options).format(
        isPercent ? computed("percent") / 100 : value,
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
        context.set("value", clamp(event.value, prop("min"), prop("max")));
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
