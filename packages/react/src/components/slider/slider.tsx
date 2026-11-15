/**
 * The slider in React: one machine in the root, ten parts that read it.
 *
 * Two things are wired here that a consumer should never have to wire by hand.
 * The field a slider sits in — inherited as machine props, never merged over the
 * output, so a field's `disabled: false` cannot talk over a control that disabled
 * itself. And the intent scope engage mode pushes onto, taken from the nearest
 * `<NavProvider>`, exactly the way the dialog takes the one B travels on.
 *
 * The three indexed parts take their `index` as a prop rather than through a
 * context. A v1 slider has one thumb, so the default is 0 and the single-handle
 * markup never mentions it; when `range-slider` arrives (Phase 7) the same parts
 * take 0 and 1 with nothing new to learn.
 */

import * as slider from "@standarui/core/slider";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type SliderApi = slider.SliderApi<ReactPropTypes>;

const SliderContext = createPartContext<SliderApi>("Slider");

export interface UseSliderProps extends slider.SliderMachineProps, MachineRuntimeProps {}

export function useSlider(props: UseSliderProps): SliderApi {
  const host = useIntentScopeHost();

  return slider.connect(
    useMachine(slider.machine, {
      ...props,
      // `??` would override an explicit `null`, and `null` is how a consumer says
      // "this slider answers no gamepad" while a provider is mounted above it.
      intents: props.intents === undefined ? host : props.intents,
    }),
    normalizeProps,
  );
}

/**
 * The api of the slider a subtree sits in — what a consumer reads to lay out the
 * markers (`api.marks`) or to print the formatted value themselves.
 */
export function useSliderContext(): SliderApi {
  return SliderContext.usePart("SliderContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "min",
  "max",
  "step",
  "largeStep",
  "minStepsBetweenThumbs",
  "thumbAlignment",
  "value",
  "defaultValue",
  "marks",
  "disabled",
  "readOnly",
  "invalid",
  "required",
  "name",
  "form",
  "locale",
  "formatOptions",
  "getValueText",
  "describedBy",
  "labelledBy",
  "intents",
  "onValueChange",
  "onValueChangeEnd",
] as const;

export interface SliderRootProps extends UseSliderProps, PartProps<"div", UseSliderProps> {}

export function SliderRoot(props: SliderRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useSlider(inheritFromField(machineProps, field));

  return (
    <SliderContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </SliderContext.Provider>
  );
}

/**
 * A `span`, and it has to be: `<label for>` only names *labelable* elements, and
 * the thumb is a `div[role="slider"]`. The thumb points back at this instead —
 * but only once the machine has seen the part in the DOM, so an author who omits
 * it never gets a dangling `aria-labelledby`.
 */
export const SliderLabel: (props: PartProps<"span">) => ReactNode = createPart(SliderContext, {
  name: "SliderLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

/**
 * Prints the formatted value when given nothing to print, the way
 * `SelectValueText` prints the selected label: the value is derived state, and a
 * part that made every consumer reach for `useSliderContext` to render the one
 * string the machine already formatted would be publishing a chore, not an api.
 * `children` still wins, so a consumer who wants another separator or another
 * shape writes it and nothing here interferes.
 */
export function SliderValueText(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = SliderContext.usePart("SliderValueText");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getValueTextProps(),
    elementProps,
    children: children ?? api.valueAsText.join(" – "),
  });
}

export const SliderControl: (props: PartProps<"div">) => ReactNode = createPart(SliderContext, {
  name: "SliderControl",
  element: "div",
  props: (api) => api.getControlProps(),
});

export const SliderTrack: (props: PartProps<"div">) => ReactNode = createPart(SliderContext, {
  name: "SliderTrack",
  element: "div",
  props: (api) => api.getTrackProps(),
});

export const SliderRange: (props: PartProps<"div">) => ReactNode = createPart(SliderContext, {
  name: "SliderRange",
  element: "div",
  props: (api) => api.getRangeProps(),
});

/**
 * Draws one `SliderMarker` per resolved mark when given no children. `marks` is
 * accepted as explicit positions, a count, or `"step"`, and only the machine
 * resolves those three into a list — so a group that rendered nothing forced
 * every consumer through `useSliderContext` to map `api.marks`, which is exactly
 * what the story and the browser test each wrote by hand. `children` still wins,
 * for a tick that carries a label or a subset that skips some.
 */
export function SliderMarkerGroup(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = SliderContext.usePart("SliderMarkerGroup");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getMarkerGroupProps(),
    elementProps,
    children: children ?? api.marks.map((mark) => <SliderMarker key={mark} value={mark} />),
  });
}

export interface SliderThumbProps extends PartProps<"div", slider.SliderThumbProps> {
  /** Defaults to 0 — the v1 slider has one thumb. */
  readonly index?: number | undefined;
}

export function SliderThumb(props: SliderThumbProps): ReactNode {
  const { index = 0, render, asChild, children, ...elementProps } = props;
  const api = SliderContext.usePart("SliderThumb");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getThumbProps({ index }),
    elementProps,
    children,
  });
}

export interface SliderHiddenInputProps extends PartProps<"input", slider.SliderThumbProps> {
  readonly index?: number | undefined;
}

export function SliderHiddenInput(props: SliderHiddenInputProps): ReactNode {
  const { index = 0, render, asChild, children, ...elementProps } = props;
  const api = SliderContext.usePart("SliderHiddenInput");

  return useRender({
    render,
    asChild,
    element: "input",
    props: api.getHiddenInputProps({ index }),
    elementProps,
    children,
  });
}

export interface SliderMarkerProps extends PartProps<"div", slider.SliderMarkerProps> {
  /** Where on the scale this tick sits — `api.marks` is the list to map over. */
  readonly value: number;
}

export function SliderMarker(props: SliderMarkerProps): ReactNode {
  const { value, render, asChild, children, ...elementProps } = props;
  const api = SliderContext.usePart("SliderMarker");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getMarkerProps({ value }),
    elementProps,
    children,
  });
}
