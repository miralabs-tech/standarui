import { ariaAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { roundToPrecision, toPercent, toValueArray } from "../../utils/range";
import { parts } from "./slider.anatomy";
import {
  getControlEl,
  getControlId,
  getHiddenInputId,
  getLabelId,
  getRootId,
  getThumbId,
} from "./slider.dom";
import { getKeyIntent, resolveDirection, toAdjustEvent } from "./slider.props";
import type { SliderApi, SliderMarkerProps, SliderSchema, SliderThumbProps } from "./slider.types";

/**
 * The core places percentages, the sheet does the layout. Rounded, so a third of a
 * track does not serialise seventeen digits into the markup — and so the server
 * and the client write the same string.
 */
function pct(ratio: number): string {
  return `${roundToPrecision(ratio * 100, 4)}%`;
}

export function connect<T extends PropTypes>(
  service: Service<SliderSchema>,
  normalize: NormalizeProps<T>,
): SliderApi<T> {
  const { context, prop, computed, state, send, scope } = service;

  const value = context.get("value");
  const valuePercent = computed("percent");
  const valueAsText = computed("valueAsText");
  const interactive = computed("isInteractive");

  const min = prop("min");
  const max = prop("max");
  const dir = prop("dir");
  const orientation = prop("orientation");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");

  const activeIndex = context.get("activeIndex");
  const dragging = activeIndex >= 0;
  const engaged = state.matches("engaged");
  const focusedIndex = context.get("focusedIndex");
  // Held from the moment focus landed, and only while it is still here — the same
  // rule every other control in the library follows.
  const focusSource = state.matches("focused", "engaged") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const lastIndex = value.length - 1;
  // One thumb fills from the floor; two fill between themselves. Both are written
  // as the same pair of custom properties, which is what makes `range-slider` a
  // preset later rather than a second component.
  const rangeStart = value.length > 1 ? (value[0] ?? min) : min;
  const rangeEnd = value[lastIndex] ?? min;

  const stateAttrs = {
    "data-orientation": orientation,
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-invalid": dataAttr(invalid),
    "data-dragging": dataAttr(dragging),
    "data-engaged": dataAttr(engaged),
  };

  return {
    value,
    valuePercent,
    valueAsText,
    marks: computed("markValues"),
    dragging,
    engaged,
    disabled,
    focusedIndex,
    focusSource,
    focusVisible,

    setValue(next: number | readonly number[]): void {
      send({ type: "VALUE.SET", value: toValueArray(next, min) });
    },

    setValueAtIndex(index: number, next: number): void {
      const values = [...value];
      values[index] = next;
      send({ type: "VALUE.SET", value: values });
    },

    increment(index?: number): void {
      send({ type: "THUMB.INCREMENT", index: index ?? Math.max(focusedIndex, 0), large: false });
    },

    decrement(index?: number): void {
      send({ type: "THUMB.DECREMENT", index: index ?? Math.max(focusedIndex, 0), large: false });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir,
        "data-thumb-alignment": prop("thumbAlignment"),
        style: { "--sui-slider-percent": pct(valuePercent[0] ?? 0) },
      }),

    // A `span`, not a `<label>`: `for` only names *labelable* elements, and a
    // `div[role="slider"]` is not one. The thumb points back with
    // `aria-labelledby` instead.
    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getValueTextProps: (): T["element"] =>
      normalize.element({
        ...parts.valueText.attrs,
        ...stateAttrs,
        // The thumb already publishes the value through `aria-valuenow`; reading
        // the same number twice helps nobody.
        "aria-hidden": "true",
      }),

    getControlProps: (): T["element"] =>
      normalize.element({
        ...parts.control.attrs,
        ...stateAttrs,
        id: getControlId(scope),
        // The finger owns the axis for the length of the gesture; a scroll
        // container underneath must not take it away mid-drag.
        style: { touchAction: "none" },
      }),

    getTrackProps: (): T["element"] => normalize.element({ ...parts.track.attrs, ...stateAttrs }),

    getRangeProps: (): T["element"] =>
      normalize.element({
        ...parts.range.attrs,
        ...stateAttrs,
        // Whether the fill has a low *thumb* or a track edge for its leading side.
        // The percentages cannot say: `range-start` is 0% both for a lone thumb
        // and for a low thumb sitting on the minimum, and the sheet owes those two
        // different geometry — the first runs out to the track's edge, the second
        // stops on a knob's centre half a knob further in.
        "data-bounded": dataAttr(value.length > 1),
        style: {
          "--sui-slider-range-start": pct(toPercent(rangeStart, min, max)),
          "--sui-slider-range-end": pct(toPercent(rangeEnd, min, max)),
        },
      }),

    getThumbProps: ({ index }: SliderThumbProps): T["element"] => {
      const current = value[index] ?? min;
      const text = valueAsText[index] ?? "";
      const focused = focusedIndex === index;
      const active = dragging && activeIndex === index;

      return normalize.element({
        ...parts.thumb.attrs,
        ...stateAttrs,
        id: getThumbId(scope, index),
        role: "slider",
        // Dropped rather than set to -1: a disabled slider is out of the tab
        // order entirely, and a lone `tabindex="-1"` still answers a script's
        // `.focus()` as if it were reachable.
        tabIndex: disabled ? undefined : 0,
        "data-index": index,
        "data-dragging": dataAttr(active),
        "data-pressed": dataAttr(active),
        "data-engaged": dataAttr(engaged && focused),
        "data-focus-visible": dataAttr(focused && focusVisible),
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        // Narrowed to the neighbours as soon as there is more than one thumb:
        // that is what the user can actually reach.
        "aria-valuemin": index === 0 ? min : (value[index - 1] ?? min),
        "aria-valuemax": index === lastIndex ? max : (value[index + 1] ?? max),
        "aria-valuenow": current,
        // Only when the format adds something. On a bare 0→100 slider,
        // `valuenow=50` next to `valuetext="50"` makes some readers say "50, 50".
        "aria-valuetext": text === String(current) ? undefined : text,
        "aria-orientation": orientation,
        // Its own label part when there is one, the field's label otherwise. Never
        // both: two ids would read the same name twice.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : prop("labelledBy"),
        "aria-describedby": prop("describedBy"),
        "aria-disabled": ariaAttr(disabled),
        "aria-readonly": ariaAttr(readOnly),
        // On the thumb, because the thumb is the `role="slider"` — a field that
        // marks itself invalid has to be heard on the element that owns the value,
        // the same place `checkbox`, `input`, `radio-group` and `switch` say it.
        "aria-invalid": ariaAttr(invalid),
        // Allowed on `role="slider"`, and an announcement rather than a
        // constraint: the submission is a `type="hidden"` input, which never
        // validates. It is here because the field around a required slider
        // already draws its asterisk, and nothing was saying it out loud.
        "aria-required": ariaAttr(prop("required")),
        style: { "--sui-slider-thumb-percent": pct(valuePercent[index] ?? 0) },

        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          // Shift+arrow carries no slider intent (research/input.md): consuming it
          // would take a text-selection gesture away from whatever owns one.
          if (event.shiftKey) return;
          const intent = getKeyIntent(event.key);
          // The interactive test sits before `preventDefault`, deliberately: on a
          // read-only slider PageDown still belongs to the page.
          if (intent === null || !interactive) return;
          event.preventDefault();
          // Resolved here rather than at the `dir` hoist in `connect`: with no
          // `dir` prop the answer is read off the track, and a DOM read at the
          // top of `connect` would run on the server.
          const keyDir = resolveDir(dir, getControlEl(scope));
          send(toAdjustEvent(resolveDirection(intent, keyDir, orientation), index));
        },

        onFocus(event) {
          if (!event.defaultPrevented) send({ type: "THUMB.FOCUS", index });
        },

        onBlur(event) {
          if (!event.defaultPrevented) send({ type: "THUMB.BLUR" });
        },
      });
    },

    /**
     * `type="hidden"`, not a hidden `<input type="range">`. A real range input
     * would bring form association *and* a second `role="slider"` into the
     * accessibility tree — two elements each claiming to hold the value, and
     * neutralising one with `aria-hidden` + `tabindex="-1"` hides the duplicate
     * without removing it. The thumb is the slider; this is the submission.
     */
    getHiddenInputProps: ({ index }: SliderThumbProps): T["input"] =>
      normalize.input({
        ...parts.hiddenInput.attrs,
        id: getHiddenInputId(scope, index),
        type: "hidden",
        name: prop("name"),
        form: prop("form"),
        // Native rule: a disabled control is not submitted.
        disabled,
        value: value[index] ?? min,
      }),

    getMarkerGroupProps: (): T["element"] =>
      normalize.element({
        ...parts.markerGroup.attrs,
        "data-orientation": orientation,
        "aria-hidden": "true",
      }),

    getMarkerProps: ({ value: mark }: SliderMarkerProps): T["element"] =>
      normalize.element({
        ...parts.marker.attrs,
        "data-orientation": orientation,
        "data-value": mark,
        // Neither design paints these two differently — the attribute exists so an
        // app can, and the default sheet renders them alike.
        "data-state":
          mark >= Math.min(rangeStart, rangeEnd) && mark <= Math.max(rangeStart, rangeEnd)
            ? "in-range"
            : "out-of-range",
        "data-disabled": dataAttr(disabled),
        style: { "--sui-marker-percent": pct(toPercent(mark, min, max)) },
      }),
  };
}
