import * as splitter from "@standarui/core/splitter";
import { useIntentScopeHost } from "@standarx/nav/react";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";

export type SplitterApi = splitter.SplitterApi<ReactPropTypes>;

const SplitterContext = createPartContext<SplitterApi>("Splitter");

export interface UseSplitterProps extends splitter.SplitterMachineProps, MachineRuntimeProps {}

export function useSplitter(props: UseSplitterProps): SplitterApi {
  const host = useIntentScopeHost();

  return splitter.connect(
    useMachine(splitter.machine, {
      ...props,
      intents: props.intents === undefined ? host : props.intents,
    }),
    normalizeProps,
  );
}

export function useSplitterContext(): SplitterApi {
  return SplitterContext.usePart("SplitterContext");
}

export interface SplitterRootProps extends UseSplitterProps {
  readonly children?: ReactNode;
}

export function SplitterRoot(props: SplitterRootProps): ReactNode {
  const { children, ...machineProps } = props;
  const api = useSplitter(machineProps);

  return <SplitterContext.Provider value={api}>{children}</SplitterContext.Provider>;
}

export const SplitterPanel: (props: PartProps<"div">) => ReactNode = createPart(SplitterContext, {
  name: "SplitterPanel",
  element: "div",
  props: (api) => api.getPanelProps(),
});

export const SplitterHandle: (props: PartProps<"div">) => ReactNode = createPart(SplitterContext, {
  name: "SplitterHandle",
  element: "div",
  props: (api) => api.getHandleProps(),
});
