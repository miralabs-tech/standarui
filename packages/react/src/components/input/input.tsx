import * as input from "@standarui/core/input";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type InputApi = input.InputApi<ReactPropTypes>;

const InputContext = createPartContext<InputApi>("Input");

export interface UseInputProps extends input.InputMachineProps, MachineRuntimeProps {}

export function useInput(props: UseInputProps): InputApi {
  return input.connect(useMachine(input.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "value",
  "defaultValue",
  "type",
  "shape",
  "placeholder",
  "disabled",
  "invalid",
  "readOnly",
  "required",
  "name",
  "form",
  "autoComplete",
  "inputMode",
  "maxLength",
  "describedBy",
  "clearOnEscape",
  "defaultMasked",
  "onValueChange",
] as const;

export interface InputRootProps extends UseInputProps, PartProps<"div", UseInputProps> {}

export function InputRoot(props: InputRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();

  const api = useInput({
    ...inheritFromField(machineProps, field),
    ids: { control: field?.controlProps.id, ...machineProps.ids },
  });

  return (
    <InputContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </InputContext.Provider>
  );
}

export const InputControl: (props: PartProps<"input">) => ReactNode = createPart(InputContext, {
  name: "InputControl",
  element: "input",
  props: (api) => api.getControlProps(),
});

export const InputTextarea: (props: PartProps<"textarea">) => ReactNode = createPart(InputContext, {
  name: "InputTextarea",
  element: "textarea",
  props: (api) => api.getTextareaProps(),
});

export const InputVisibilityTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  InputContext,
  {
    name: "InputVisibilityTrigger",
    element: "button",
    props: (api) => api.getVisibilityTriggerProps(),
  },
);
