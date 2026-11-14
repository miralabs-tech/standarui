/**
 * The date field in React: one machine in the root, six parts that read it.
 *
 * Two things are wired here that a consumer should never wire by hand. The field
 * it sits in — inherited as machine props, never merged over the output, so a
 * field's `disabled: false` cannot talk over a control that disabled itself; and
 * the group takes the field's *control* id, which is what makes `field` notice
 * that a `div[role="group"]` is not labelable and drop its `for` rather than point
 * it at something a click cannot reach.
 *
 * The segment list is the consumer's to map over, the way the slider's markers
 * are: `useDateFieldContext().segments` is in display order, literals included, so
 * a `/` between month and day is a part like any other and nothing here has to
 * guess what a locale writes between two numbers.
 */

import * as dateField from "@standarui/core/date-field";
import { useIntentScopeHost } from "@standarx/nav/react";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type DateFieldApi = dateField.DateFieldApi<ReactPropTypes>;

const DateFieldContext = createPartContext<DateFieldApi>("DateField");

export interface UseDateFieldProps extends dateField.DateFieldMachineProps, MachineRuntimeProps {}

export function useDateField(props: UseDateFieldProps): DateFieldApi {
  const host = useIntentScopeHost();

  return dateField.connect(
    useMachine(dateField.machine, {
      ...props,
      // `??` would override an explicit `null`, and `null` is how a consumer says
      // "this field answers no gamepad" while a provider is mounted above it.
      intents: props.intents === undefined ? host : props.intents,
    }),
    normalizeProps,
  );
}

/** The api of the field a subtree sits in — what a consumer maps the segments from. */
export function useDateFieldContext(): DateFieldApi {
  return DateFieldContext.usePart("DateFieldContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "value",
  "defaultValue",
  "min",
  "max",
  "granularity",
  "hourCycle",
  "placeholder",
  "locale",
  "disabled",
  "invalid",
  "readOnly",
  "required",
  "name",
  "form",
  "describedBy",
  // A machine prop and not an element one: left out of this list it would not
  // merely fail to name the group, it would land on the root `div` as a bare
  // `label` attribute.
  "label",
  "labelledBy",
  "intents",
  "onValueChange",
] as const;

export interface DateFieldRootProps
  extends UseDateFieldProps,
    PartProps<"div", UseDateFieldProps> {}

export function DateFieldRoot(props: DateFieldRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();

  const api = useDateField({
    ...inheritFromField(machineProps, field),
    ids: { control: field?.controlProps.id, ...machineProps.ids },
  });

  return (
    <DateFieldContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </DateFieldContext.Provider>
  );
}

export const DateFieldControl: (props: PartProps<"div">) => ReactNode = createPart(
  DateFieldContext,
  {
    name: "DateFieldControl",
    element: "div",
    props: (api) => api.getControlProps(),
  },
);

export interface DateFieldSegmentProps extends PartProps<"div"> {
  /** One entry of `useDateFieldContext().segments`, in the order it came in. */
  readonly segment: dateField.DateSegment;
}

/**
 * Renders its own text by default: a segment's content is the formatted number,
 * or the dashes standing in for one, and having every consumer write
 * `{segment.text}` would be a chance to render the wrong segment's.
 */
export function DateFieldSegment(props: DateFieldSegmentProps): ReactNode {
  const { segment, render, asChild, children, ...elementProps } = props;
  const api = DateFieldContext.usePart("DateFieldSegment");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getSegmentProps(segment),
    elementProps,
    children: children ?? segment.text,
  });
}

/**
 * The whole strip, in the locale's own order — what all but a handful of
 * consumers want, and the shape that keeps the keys right. A literal is keyed by
 * its rank rather than by its character, because `formatToParts` can hand back
 * the same slash twice and React would take the two for one node. Anyone who
 * needs their own markup per unit maps `useDateFieldContext().segments` instead.
 */
export function DateFieldSegments(): ReactNode {
  const api = DateFieldContext.usePart("DateFieldSegments");
  let literals = 0;

  return api.segments.map((segment) => {
    if (segment.type === "literal") literals += 1;
    return (
      <DateFieldSegment
        key={segment.type === "literal" ? `literal-${literals}` : segment.type}
        segment={segment}
      />
    );
  });
}

export const DateFieldIncrementTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DateFieldContext,
  {
    name: "DateFieldIncrementTrigger",
    element: "button",
    props: (api) => api.getIncrementTriggerProps(),
  },
);

export const DateFieldDecrementTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DateFieldContext,
  {
    name: "DateFieldDecrementTrigger",
    element: "button",
    props: (api) => api.getDecrementTriggerProps(),
  },
);

export const DateFieldHiddenInput: (props: PartProps<"input">) => ReactNode = createPart(
  DateFieldContext,
  {
    name: "DateFieldHiddenInput",
    element: "input",
    props: (api) => api.getHiddenInputProps(),
  },
);
