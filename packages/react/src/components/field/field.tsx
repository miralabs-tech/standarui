import * as field from "@standarui/core/field";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { FieldContext as SharedFieldContext, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type FieldApi = field.FieldApi<ReactPropTypes>;

const FieldContext = SharedFieldContext;

export interface UseFieldProps extends field.FieldMachineProps, MachineRuntimeProps {}

export function useField(props: UseFieldProps): FieldApi {
  return field.connect(useMachine(field.machine, props), normalizeProps);
}

export { useFieldContext };

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "invalid",
  "disabled",
  "readOnly",
  "required",
  "group",
] as const;

export interface FieldRootProps extends UseFieldProps, PartProps<"div", UseFieldProps> {}

export function FieldRoot(props: FieldRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useField(machineProps);

  return (
    <FieldContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        // A group of controls is a `<fieldset>`; a single labelled control is a
        // `<div>`, because a fieldset around one input is noise to a screen
        // reader.
        element: machineProps.group === true ? "fieldset" : "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </FieldContext.Provider>
  );
}

export const FieldLabel: (props: PartProps<"label">) => ReactNode = createPart(FieldContext, {
  name: "FieldLabel",
  element: "label",
  props: (api) => api.getLabelProps(),
});

/** A `<legend>` when the field is a group — the label a fieldset understands. */
export const FieldLegend: (props: PartProps<"legend">) => ReactNode = createPart(FieldContext, {
  name: "FieldLegend",
  element: "legend",
  props: (api) => api.getLabelProps(),
});

export const FieldRequiredIndicator: (props: PartProps<"span">) => ReactNode = createPart(
  FieldContext,
  {
    name: "FieldRequiredIndicator",
    element: "span",
    props: (api) => api.getRequiredIndicatorProps(),
  },
);

export const FieldHelperText: (props: PartProps<"span">) => ReactNode = createPart(FieldContext, {
  name: "FieldHelperText",
  element: "span",
  props: (api) => api.getHelperTextProps(),
});

export const FieldErrorText: (props: PartProps<"span">) => ReactNode = createPart(FieldContext, {
  name: "FieldErrorText",
  element: "span",
  props: (api) => api.getErrorTextProps(),
});
