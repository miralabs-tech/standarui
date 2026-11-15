import * as radioGroup from "@standarui/core/radio-group";
import { useIntentScopeHost } from "@standarx/nav/react";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type RadioGroupApi = radioGroup.RadioGroupApi<ReactPropTypes>;

const RadioGroupContext = createPartContext<RadioGroupApi>("RadioGroup");
/** An item publishes its own value so its parts do not have to repeat it. */
const RadioItemContext = createPartContext<radioGroup.RadioItemProps>("RadioGroup");

export interface UseRadioGroupProps
  extends radioGroup.RadioGroupMachineProps,
    MachineRuntimeProps {}

export function useRadioGroup(props: UseRadioGroupProps): RadioGroupApi {
  const host = useIntentScopeHost();

  return radioGroup.connect(
    useMachine(radioGroup.machine, {
      ...props,
      // `??` would override an explicit `null`, and `null` is how a consumer says
      // "this group answers no gamepad" while a provider is mounted above it.
      intents: props.intents === undefined ? host : props.intents,
    }),
    normalizeProps,
  );
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
  "intents",
  "onValueChange",
] as const;

export interface RadioGroupRootProps
  extends UseRadioGroupProps,
    PartProps<"div", UseRadioGroupProps> {}

export function RadioGroupRoot(props: RadioGroupRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useRadioGroup(inheritFromField(machineProps, field));

  return (
    <RadioGroupContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </RadioGroupContext.Provider>
  );
}

export const RadioGroupLabel: (props: PartProps<"span">) => ReactNode = createPart(
  RadioGroupContext,
  { name: "RadioGroupLabel", element: "span", props: (api) => api.getLabelProps() },
);

export const RadioGroupIndicator: (props: PartProps<"div">) => ReactNode = createPart(
  RadioGroupContext,
  { name: "RadioGroupIndicator", element: "div", props: (api) => api.getIndicatorProps() },
);

export interface RadioGroupItemProps
  extends radioGroup.RadioItemProps,
    PartProps<"label", radioGroup.RadioItemProps> {}

export function RadioGroupItem(props: RadioGroupItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["value", "disabled"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = RadioGroupContext.usePart("RadioGroupItem");

  return (
    <RadioItemContext.Provider value={itemProps}>
      {useRender({
        render,
        asChild,
        element: "label",
        props: api.getItemProps(itemProps),
        elementProps,
        children,
      })}
    </RadioItemContext.Provider>
  );
}

function createItemPart<E extends "span" | "input">(
  name: string,
  element: E,
  getter: (api: RadioGroupApi, item: radioGroup.RadioItemProps) => object,
): (props: PartProps<E>) => ReactNode {
  return function ItemPart(props: PartProps<E>): ReactNode {
    const { render, asChild, children, ...elementProps } = props;
    const api = RadioGroupContext.usePart(name);
    const item = RadioItemContext.usePart(name);

    return useRender({
      render,
      asChild,
      element,
      props: getter(api, item),
      elementProps,
      children,
    });
  };
}

export const RadioGroupItemControl: (props: PartProps<"span">) => ReactNode = createItemPart(
  "RadioGroupItemControl",
  "span",
  (api, item) => api.getItemControlProps(item),
);

export const RadioGroupItemText: (props: PartProps<"span">) => ReactNode = createItemPart(
  "RadioGroupItemText",
  "span",
  (api, item) => api.getItemTextProps(item),
);

export const RadioGroupItemHiddenInput: (props: PartProps<"input">) => ReactNode = createItemPart(
  "RadioGroupItemHiddenInput",
  "input",
  (api, item) => api.getItemHiddenInputProps(item),
);
