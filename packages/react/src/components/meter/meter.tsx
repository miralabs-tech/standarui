import * as meter from "@standarui/core/meter";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type MeterApi = meter.MeterApi<ReactPropTypes>;

const MeterContext = createPartContext<MeterApi>("Meter");

export interface UseMeterProps extends meter.MeterMachineProps, MachineRuntimeProps {}

export function useMeter(props: UseMeterProps): MeterApi {
  return meter.connect(useMachine(meter.machine, props), normalizeProps);
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
  "low",
  "high",
  "optimum",
  "orientation",
  "locale",
  "formatOptions",
  "valenceLabels",
  "onValueChange",
] as const;

export interface MeterRootProps extends UseMeterProps, PartProps<"div", UseMeterProps> {}

export function MeterRoot(props: MeterRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useMeter(machineProps);

  return (
    <MeterContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </MeterContext.Provider>
  );
}

export const MeterLabel: (props: PartProps<"span">) => ReactNode = createPart(MeterContext, {
  name: "MeterLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

export const MeterTrack: (props: PartProps<"div">) => ReactNode = createPart(MeterContext, {
  name: "MeterTrack",
  element: "div",
  props: (api) => api.getTrackProps(),
});

export const MeterRange: (props: PartProps<"div">) => ReactNode = createPart(MeterContext, {
  name: "MeterRange",
  element: "div",
  props: (api) => api.getRangeProps(),
});

export const MeterValueText: (props: PartProps<"span">) => ReactNode = createPart(MeterContext, {
  name: "MeterValueText",
  element: "span",
  props: (api) => api.getValueTextProps(),
});
