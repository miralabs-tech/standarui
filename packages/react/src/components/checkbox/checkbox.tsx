import * as checkbox from "@standarui/core/checkbox";
import type { ReactNode } from "react";
import { inheritFromCheckboxGroup, useCheckboxGroupContext } from "../../checkbox-group-context";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type CheckboxApi = checkbox.CheckboxApi<ReactPropTypes>;

const CheckboxContext = createPartContext<CheckboxApi>("Checkbox");

export interface UseCheckboxProps extends checkbox.CheckboxMachineProps, MachineRuntimeProps {}

export function useCheckbox(props: UseCheckboxProps): CheckboxApi {
  return checkbox.connect(useMachine(checkbox.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "checked",
  "defaultChecked",
  "disabled",
  "invalid",
  "required",
  "readOnly",
  "name",
  "value",
  "form",
  "describedBy",
  "onCheckedChange",
] as const;

export interface CheckboxRootProps extends UseCheckboxProps, PartProps<"label", UseCheckboxProps> {}

export function CheckboxRoot(props: CheckboxRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const group = useCheckboxGroupContext();
  // In a group, the group is the only context: it has already inherited from the
  // field on its own root, and handing every box the field's control id would put
  // the same id on all of them.
  const api = useCheckbox(
    group === null
      ? {
          ...inheritFromField(machineProps, field),
          ids: { hiddenInput: field?.controlProps.id, ...machineProps.ids },
        }
      : inheritFromCheckboxGroup(machineProps, group),
  );

  return (
    <CheckboxContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "label",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </CheckboxContext.Provider>
  );
}

export const CheckboxLabel: (props: PartProps<"span">) => ReactNode = createPart(CheckboxContext, {
  name: "CheckboxLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

export const CheckboxControl: (props: PartProps<"span">) => ReactNode = createPart(
  CheckboxContext,
  {
    name: "CheckboxControl",
    element: "span",
    props: (api) => api.getControlProps(),
  },
);

export const CheckboxIndicator: (props: PartProps<"span">) => ReactNode = createPart(
  CheckboxContext,
  { name: "CheckboxIndicator", element: "span", props: (api) => api.getIndicatorProps() },
);

export const CheckboxHiddenInput: (props: PartProps<"input">) => ReactNode = createPart(
  CheckboxContext,
  { name: "CheckboxHiddenInput", element: "input", props: (api) => api.getHiddenInputProps() },
);
