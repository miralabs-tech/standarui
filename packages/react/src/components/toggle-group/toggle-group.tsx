import { isDev, warn } from "@standarui/core";
import * as toggleGroup from "@standarui/core/toggle-group";
import { createContext, type ReactNode, useContext } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ToggleGroupApi = toggleGroup.ToggleGroupApi<ReactPropTypes>;

const ToggleGroupContext = createPartContext<ToggleGroupApi>("ToggleGroup");

export interface UseToggleGroupProps
  extends toggleGroup.ToggleGroupMachineProps,
    MachineRuntimeProps {}

export function useToggleGroup(props: UseToggleGroupProps): ToggleGroupApi {
  return toggleGroup.connect(useMachine(toggleGroup.machine, props), normalizeProps);
}

export const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "value",
  "defaultValue",
  "multiple",
  "disabled",
  "deselectable",
  "loopFocus",
  "sizing",
  "describedBy",
  "onValueChange",
] as const;

export interface ToggleGroupFrameProps
  extends UseToggleGroupProps,
    PartProps<"div", UseToggleGroupProps> {}

const ToggleGroupFrameContext = createContext<ToggleGroupApi | null>(null);

/**
 * The outer box that owns the machine, so the scroller and the drawn bar can be
 * siblings inside it: a bar that scrolls with its scroller, or is masked by it, is
 * no bar. Optional: a parts tree of `ToggleGroupRoot` alone owns its machine as it
 * always did and draws no bar.
 */
export function ToggleGroupFrame(props: ToggleGroupFrameProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useToggleGroup(inheritFromField(machineProps, field));

  return (
    <ToggleGroupContext.Provider value={api}>
      <ToggleGroupFrameContext.Provider value={api}>
        {useRender({
          render,
          asChild,
          element: "div",
          props: api.getFrameProps(),
          elementProps,
          children,
        })}
      </ToggleGroupFrameContext.Provider>
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupRootProps
  extends UseToggleGroupProps,
    PartProps<"div", UseToggleGroupProps> {}

function OwnedToggleGroupRoot(props: ToggleGroupRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useToggleGroup(inheritFromField(machineProps, field));

  return (
    <ToggleGroupContext.Provider value={api}>
      <ToggleGroupFrameContext.Provider value={null}>
        {useRender({
          render,
          asChild,
          element: "div",
          props: api.getRootProps(),
          elementProps,
          children,
        })}
      </ToggleGroupFrameContext.Provider>
    </ToggleGroupContext.Provider>
  );
}

function FramedToggleGroupRoot({
  api,
  ...props
}: ToggleGroupRootProps & { readonly api: ToggleGroupApi }): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;

  warn(
    isDev() && Object.keys(machineProps).length > 0,
    "ToggleGroupRoot: inside a `ToggleGroupFrame` the frame owns the machine, so the machine props given here (`value`, `multiple`, `disabled`…) are ignored. Pass them to the frame.",
  );

  return (
    <ToggleGroupFrameContext.Provider value={null}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ToggleGroupFrameContext.Provider>
  );
}

export function ToggleGroupRoot(props: ToggleGroupRootProps): ReactNode {
  const frame = useContext(ToggleGroupFrameContext);
  return frame === null ? (
    <OwnedToggleGroupRoot {...props} />
  ) : (
    <FramedToggleGroupRoot {...props} api={frame} />
  );
}

export const ToggleGroupLabel: (props: PartProps<"span">) => ReactNode = createPart(
  ToggleGroupContext,
  { name: "ToggleGroupLabel", element: "span", props: (api) => api.getLabelProps() },
);

export const ToggleGroupIndicator: (props: PartProps<"div">) => ReactNode = createPart(
  ToggleGroupContext,
  { name: "ToggleGroupIndicator", element: "div", props: (api) => api.getIndicatorProps() },
);

export const ToggleGroupScrollbar: (props: PartProps<"div">) => ReactNode = createPart(
  ToggleGroupContext,
  { name: "ToggleGroupScrollbar", element: "div", props: (api) => api.getScrollbarProps() },
);

export const ToggleGroupThumb: (props: PartProps<"div">) => ReactNode = createPart(
  ToggleGroupContext,
  { name: "ToggleGroupThumb", element: "div", props: (api) => api.getThumbProps() },
);

export interface ToggleGroupItemProps
  extends toggleGroup.ToggleGroupItemProps,
    PartProps<"button", toggleGroup.ToggleGroupItemProps> {}

/**
 * The one part with props of its own: an item is identified by its value, and
 * the machine reads the rest — its position, its neighbours — from the DOM.
 */
export function ToggleGroupItem(props: ToggleGroupItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["value", "disabled", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ToggleGroupContext.usePart("ToggleGroupItem");

  return useRender({
    render,
    asChild,
    element: "button",
    props: api.getItemProps(itemProps),
    elementProps,
    children,
  });
}
