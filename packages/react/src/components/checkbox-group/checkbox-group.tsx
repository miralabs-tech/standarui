import * as checkboxGroup from "@standarui/core/checkbox-group";
import type { ReactNode } from "react";
import { CheckboxGroupContext } from "../../checkbox-group-context";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type CheckboxGroupApi = checkboxGroup.CheckboxGroupApi<ReactPropTypes>;

export interface UseCheckboxGroupProps
  extends checkboxGroup.CheckboxGroupMachineProps,
    MachineRuntimeProps {}

export function useCheckboxGroup(props: UseCheckboxGroupProps): CheckboxGroupApi {
  return checkboxGroup.connect(useMachine(checkboxGroup.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "value",
  "defaultValue",
  "disabled",
  "readOnly",
  "invalid",
  "required",
  "name",
  "form",
  "describedBy",
  "onValueChange",
] as const;

export interface CheckboxGroupRootProps
  extends UseCheckboxGroupProps,
    PartProps<"div", UseCheckboxGroupProps> {}

/**
 * The boxes are ordinary `<CheckboxRoot>`s — a checkbox exists on its own, so
 * there is nothing to re-declare as item parts here. Each one with a `value` is
 * an item; one without is the tri-state summary (`checkbox-group-context`).
 */
export function CheckboxGroupRoot(props: CheckboxGroupRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useCheckboxGroup(inheritFromField(machineProps, field));

  return (
    <CheckboxGroupContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </CheckboxGroupContext.Provider>
  );
}

export const CheckboxGroupLabel: (props: PartProps<"span">) => ReactNode = createPart(
  CheckboxGroupContext,
  { name: "CheckboxGroupLabel", element: "span", props: (api) => api.getLabelProps() },
);
