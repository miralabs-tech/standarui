import * as switchMachine from "@standarui/core/switch";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type SwitchApi = switchMachine.SwitchApi<ReactPropTypes>;

const SwitchContext = createPartContext<SwitchApi>("Switch");

export interface UseSwitchProps extends switchMachine.SwitchMachineProps, MachineRuntimeProps {}

export function useSwitch(props: UseSwitchProps): SwitchApi {
  return switchMachine.connect(useMachine(switchMachine.machine, props), normalizeProps);
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
  "draggable",
  "size",
  "describedBy",
  "onCheckedChange",
] as const;

export interface SwitchRootProps extends UseSwitchProps, PartProps<"label", UseSwitchProps> {}

export function SwitchRoot(props: SwitchRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useSwitch({
    ...inheritFromField(machineProps, field),
    ids: { hiddenInput: field?.controlProps.id, ...machineProps.ids },
  });

  return (
    <SwitchContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "label",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </SwitchContext.Provider>
  );
}

export const SwitchLabel: (props: PartProps<"span">) => ReactNode = createPart(SwitchContext, {
  name: "SwitchLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

export const SwitchControl: (props: PartProps<"span">) => ReactNode = createPart(SwitchContext, {
  name: "SwitchControl",
  element: "span",
  props: (api) => api.getControlProps(),
});

export const SwitchThumb: (props: PartProps<"span">) => ReactNode = createPart(SwitchContext, {
  name: "SwitchThumb",
  element: "span",
  props: (api) => api.getThumbProps(),
});

export const SwitchHiddenInput: (props: PartProps<"input">) => ReactNode = createPart(
  SwitchContext,
  { name: "SwitchHiddenInput", element: "input", props: (api) => api.getHiddenInputProps() },
);
