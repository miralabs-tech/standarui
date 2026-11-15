import * as scrollArea from "@standarui/core/scroll-area";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ScrollAreaApi = scrollArea.ScrollAreaApi<ReactPropTypes>;

const ScrollAreaContext = createPartContext<ScrollAreaApi>("ScrollArea");

export interface UseScrollAreaProps
  extends scrollArea.ScrollAreaMachineProps,
    MachineRuntimeProps {}

export function useScrollArea(props: UseScrollAreaProps): ScrollAreaApi {
  return scrollArea.connect(useMachine(scrollArea.machine, props), normalizeProps);
}

export function useScrollAreaContext(): ScrollAreaApi {
  return ScrollAreaContext.usePart("ScrollAreaContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "always",
  "hideDelay",
  "label",
  "labelledBy",
] as const;

export interface ScrollAreaRootProps
  extends UseScrollAreaProps,
    PartProps<"div", UseScrollAreaProps> {}

export function ScrollAreaRoot(props: ScrollAreaRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useScrollArea(machineProps);

  return (
    <ScrollAreaContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ScrollAreaContext.Provider>
  );
}

export const ScrollAreaViewport: (props: PartProps<"div">) => ReactNode = createPart(
  ScrollAreaContext,
  {
    name: "ScrollAreaViewport",
    element: "div",
    props: (api) => api.getViewportProps(),
  },
);

export const ScrollAreaContent: (props: PartProps<"div">) => ReactNode = createPart(
  ScrollAreaContext,
  {
    name: "ScrollAreaContent",
    element: "div",
    props: (api) => api.getContentProps(),
  },
);

export const ScrollAreaCorner: (props: PartProps<"div">) => ReactNode = createPart(
  ScrollAreaContext,
  {
    name: "ScrollAreaCorner",
    element: "div",
    props: (api) => api.getCornerProps(),
  },
);

export interface ScrollAreaBarProps {
  readonly orientation: "vertical" | "horizontal";
}

export interface ScrollAreaScrollbarProps
  extends ScrollAreaBarProps,
    PartProps<"div", ScrollAreaBarProps> {}

export function ScrollAreaScrollbar(props: ScrollAreaScrollbarProps): ReactNode {
  const [{ orientation }, rest] = splitProps(props, ["orientation"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ScrollAreaContext.usePart("ScrollAreaScrollbar");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getScrollbarProps({ orientation }),
    elementProps,
    children,
  });
}

export interface ScrollAreaThumbProps
  extends ScrollAreaBarProps,
    PartProps<"div", ScrollAreaBarProps> {}

export function ScrollAreaThumb(props: ScrollAreaThumbProps): ReactNode {
  const [{ orientation }, rest] = splitProps(props, ["orientation"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ScrollAreaContext.usePart("ScrollAreaThumb");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getThumbProps({ orientation }),
    elementProps,
    children,
  });
}
