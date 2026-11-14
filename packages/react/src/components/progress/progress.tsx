import * as progress from "@standarui/core/progress";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ProgressApi = progress.ProgressApi<ReactPropTypes>;

const ProgressContext = createPartContext<ProgressApi>("Progress");

export interface UseProgressProps extends progress.ProgressMachineProps, MachineRuntimeProps {}

export function useProgress(props: UseProgressProps): ProgressApi {
  return progress.connect(useMachine(progress.machine, props), normalizeProps);
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
  "orientation",
  "locale",
  "formatOptions",
  "onValueChange",
] as const;

export interface ProgressRootProps extends UseProgressProps, PartProps<"div", UseProgressProps> {}

export function ProgressRoot(props: ProgressRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useProgress(machineProps);

  return (
    <ProgressContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ProgressContext.Provider>
  );
}

export const ProgressLabel: (props: PartProps<"span">) => ReactNode = createPart(ProgressContext, {
  name: "ProgressLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

export const ProgressTrack: (props: PartProps<"div">) => ReactNode = createPart(ProgressContext, {
  name: "ProgressTrack",
  element: "div",
  props: (api) => api.getTrackProps(),
});

export const ProgressRange: (props: PartProps<"div">) => ReactNode = createPart(ProgressContext, {
  name: "ProgressRange",
  element: "div",
  props: (api) => api.getRangeProps(),
});

export const ProgressValueText: (props: PartProps<"span">) => ReactNode = createPart(
  ProgressContext,
  {
    name: "ProgressValueText",
    element: "span",
    props: (api) => api.getValueTextProps(),
  },
);

export const ProgressCircle: (props: PartProps<"svg">) => ReactNode = createPart(ProgressContext, {
  name: "ProgressCircle",
  element: "svg",
  props: (api) => api.getCircleProps(),
});

export const ProgressCircleTrack: (props: PartProps<"circle">) => ReactNode = createPart(
  ProgressContext,
  {
    name: "ProgressCircleTrack",
    element: "circle",
    props: (api) => api.getCircleTrackProps(),
  },
);

export const ProgressCircleRange: (props: PartProps<"circle">) => ReactNode = createPart(
  ProgressContext,
  {
    name: "ProgressCircleRange",
    element: "circle",
    props: (api) => api.getCircleRangeProps(),
  },
);
