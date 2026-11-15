/**
 * The tooltip in React: the popover's shape with two thirds of it removed.
 *
 * No backdrop, no arrow, no close trigger, no title or description — a tooltip
 * has one surface and nothing inside it a consumer can reach. Like the dialog and
 * the popover, the root renders no element: the trigger stays where the author
 * wrote it and the surface is portalled, so the two are siblings.
 *
 * The parenthood travels on the shared `layer-context`, which is what makes the
 * Escape inside a popover close the tooltip and not the popover.
 */

import type { Service } from "@standarui/core";
import * as tooltip from "@standarui/core/tooltip";
import { type ReactNode, type Ref, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { LayerProvider, useParentLayerId } from "../../layer-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { Portal, type PortalProps } from "../../portal";
import { type PresenceApi, usePresence } from "../../presence";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type TooltipApi = tooltip.TooltipApi<ReactPropTypes>;

export interface UseTooltipProps extends tooltip.TooltipMachineProps, MachineRuntimeProps {}

interface TooltipContextValue {
  readonly api: TooltipApi;
  readonly keepMounted: boolean;
  readonly content: PresenceApi;
}

const TooltipContext = createPartContext<TooltipContextValue>("Tooltip");

function useTooltipService(props: UseTooltipProps): Service<tooltip.TooltipSchema> {
  const parentLayerId = useParentLayerId();
  const host = useIntentScopeHost();

  return useMachine(tooltip.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // surface answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    parentId: props.parentId ?? parentLayerId,
  });
}

export function useTooltip(props: UseTooltipProps): TooltipApi {
  return tooltip.connect(useTooltipService(props), normalizeProps);
}

export function useTooltipContext(): TooltipApi {
  return TooltipContext.usePart("TooltipContext").api;
}

export interface TooltipRootProps extends UseTooltipProps {
  readonly keepMounted?: boolean | undefined;
  readonly children?: ReactNode;
}

export function TooltipRoot(props: TooltipRootProps): ReactNode {
  const { children, keepMounted, ...machineProps } = props;
  const service = useTooltipService(machineProps);
  const api = tooltip.connect(service, normalizeProps);
  const { motion } = useEnvironment();

  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const content = usePresence({ present: api.open, immediate: motion === "none" });

  const value: TooltipContextValue = { api, keepMounted: keepMounted === true, content };

  return (
    <LayerProvider layerId={tooltip.getContentId(service.scope)}>
      <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence:
 * the interpreter installs the open state's effects in the layout effect of the
 * very commit that opened it, and every one of them looks the surface up by id.
 * The presence only ever extends the mount past the close.
 */
function isMounted(context: TooltipContextValue): boolean {
  return context.keepMounted || context.api.open || context.content.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const TooltipTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  TooltipContext,
  {
    name: "TooltipTrigger",
    element: "button",
    props: (context) => context.api.getTriggerProps(),
  },
);

export interface TooltipPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function TooltipPortal(props: TooltipPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = TooltipContext.usePart("TooltipPortal");
  return isMounted(context) ? <Portal {...portalProps}>{children}</Portal> : null;
}

export function TooltipPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = TooltipContext.usePart("TooltipPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  return isMounted(context) ? element : null;
}

export function TooltipContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = TooltipContext.usePart("TooltipContent");
  const composed = usePresenceRef(context.content, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return isMounted(context) ? element : null;
}
