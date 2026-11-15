/**
 * The toggle the core shipped in Phase 2, given its adapter. Two parts, one
 * machine, and the same shape as every other T1a component: a root that owns the
 * service and publishes its api, a part that reads it.
 */

import * as toggle from "@standarui/core/toggle";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ToggleApi = toggle.ToggleApi<ReactPropTypes>;

const ToggleContext = createPartContext<ToggleApi>("Toggle");

export interface UseToggleProps extends toggle.ToggleMachineProps, MachineRuntimeProps {}

export function useToggle(props: UseToggleProps): ToggleApi {
  return toggle.connect(useMachine(toggle.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "pressed",
  "defaultPressed",
  "disabled",
  "onPressedChange",
] as const;

export interface ToggleRootProps extends UseToggleProps, PartProps<"button", UseToggleProps> {}

export function ToggleRoot(props: ToggleRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useToggle(machineProps);

  return (
    <ToggleContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "button",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ToggleContext.Provider>
  );
}

export type ToggleIndicatorProps = PartProps<"span">;

export function ToggleIndicator(props: ToggleIndicatorProps): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = ToggleContext.usePart("ToggleIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getIndicatorProps(),
    elementProps,
    children,
  });
}
