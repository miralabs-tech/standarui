/**
 * The popover in React: the dialog's shape, plus an anchor, an arrow, and the one
 * thing the dialog never had to decide — what to render when the density says the
 * surface should be a sheet instead.
 *
 * Like the dialog, the root renders no element: the trigger stays where the author
 * wrote it and the surface is portalled, so the two are siblings. The intent scope
 * and the parent layer id are wired here for the same reasons, and the parenthood
 * travels on the shared `layer-context` rather than on a private one — what opens
 * inside a dialog is as often a popover as another dialog.
 */

import type { Service } from "@standarui/core";
import * as popover from "@standarui/core/popover";
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

export type PopoverApi = popover.PopoverApi<ReactPropTypes>;

export interface UsePopoverProps extends popover.PopoverMachineProps, MachineRuntimeProps {}

interface PopoverContextValue {
  readonly api: PopoverApi;
  readonly keepMounted: boolean;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

const PopoverContext = createPartContext<PopoverContextValue>("Popover");

function usePopoverService(props: UsePopoverProps): Service<popover.PopoverSchema> {
  const parentLayerId = useParentLayerId();
  const host = useIntentScopeHost();

  return useMachine(popover.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // surface answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    parentId: props.parentId ?? parentLayerId,
  });
}

export function usePopover(props: UsePopoverProps): PopoverApi {
  return popover.connect(usePopoverService(props), normalizeProps);
}

export function usePopoverContext(): PopoverApi {
  return PopoverContext.usePart("PopoverContext").api;
}

export interface PopoverRootProps extends UsePopoverProps {
  readonly keepMounted?: boolean | undefined;
  readonly children?: ReactNode;
}

export function PopoverRoot(props: PopoverRootProps): ReactNode {
  const { children, keepMounted, ...machineProps } = props;
  const service = usePopoverService(machineProps);
  const api = popover.connect(service, normalizeProps);
  const { motion } = useEnvironment();
  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const immediate = motion === "none";

  // Two presences: the scrim and the surface run different exits, and one
  // presence can only measure the animations of the node it holds.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  const value: PopoverContextValue = {
    api,
    keepMounted: keepMounted === true,
    backdrop,
    content,
  };

  return (
    <LayerProvider layerId={popover.getContentId(service.scope)}>
      <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence:
 * the interpreter installs the open state's effects in the layout effect of the
 * very commit that opened it, and every one of them looks the surface up by id.
 * The presence only ever extends the mount past the close.
 */
function isMounted(context: PopoverContextValue, presence: PresenceApi): boolean {
  return context.keepMounted || context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const PopoverTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  PopoverContext,
  {
    name: "PopoverTrigger",
    element: "button",
    props: (context) => context.api.getTriggerProps(),
  },
);

/** Only for a surface that points at something other than what opened it. */
export const PopoverAnchor: (props: PartProps<"div">) => ReactNode = createPart(PopoverContext, {
  name: "PopoverAnchor",
  element: "div",
  props: (context) => context.api.getAnchorProps(),
});

export interface PopoverPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function PopoverPortal(props: PopoverPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = PopoverContext.usePart("PopoverPortal");
  const present = isMounted(context, context.backdrop) || isMounted(context, context.content);
  return present ? <Portal {...portalProps}>{children}</Portal> : null;
}

/**
 * Rendered in both presentations and hidden by the sheet in one of them, rather
 * than mounted conditionally: the scrim is a paint decision, and a consumer who
 * wants a dimmed anchored popover should get it by writing CSS, not by learning
 * which presentation is allowed to have one.
 *
 * Spelled out here and again in the content below, rather than folded into one
 * factory. That was tried and measured: the factory took the minified bundle from
 * 3.15 to 3.02 kB and the **gzipped** one from 1.05 to 1.10 — two near-identical
 * component bodies compress almost to nothing, and replacing them with unique
 * code costs more than the text it removes. Same lesson as splitting a budget
 * line in two; the number that governs is the one after compression.
 */
export function PopoverBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = PopoverContext.usePart("PopoverBackdrop");
  const composed = usePresenceRef(context.backdrop, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getBackdropProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return isMounted(context, context.backdrop) ? element : null;
}

export function PopoverPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = PopoverContext.usePart("PopoverPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  return isMounted(context, context.content) ? element : null;
}

export function PopoverContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = PopoverContext.usePart("PopoverContent");
  const composed = usePresenceRef(context.content, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return isMounted(context, context.content) ? element : null;
}

/**
 * A **sibling of the content**, inside the positioner — never a child of the
 * surface: `contain: layout paint` on a glass surface would clip it away, and the
 * effect writes `--sui-arrow-x/y` relative to the floating element's origin.
 *
 * Unmounted in the sheet presentation, where there is no anchor to point at.
 *
 * The tip is drawn here rather than exported as a part component of its own. It
 * is still a part in the anatomy — `arrow` is what the effect writes on and
 * `arrow-tip` is what the sheet clips, and keeping them apart is what lets a
 * `clip-path` live on a node nothing is translating. But there is nothing a
 * consumer would ever put inside it, and an arrow whose silhouette the author
 * forgot to compose draws nothing at all, which reads as a styling bug rather
 * than as a missing element.
 */
export function PopoverArrow(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = PopoverContext.usePart("PopoverArrow");

  // Rendered then discarded rather than returned early: `useRender` is a hook,
  // and a presentation flip must not change how many of them this component runs.
  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getArrowProps(),
    elementProps,
    children: children ?? <div {...context.api.getArrowTipProps()} />,
  });

  return context.api.presentation === "sheet" ? null : element;
}

export const PopoverTitle: (props: PartProps<"h2">) => ReactNode = createPart(PopoverContext, {
  name: "PopoverTitle",
  element: "h2",
  props: (context) => context.api.getTitleProps(),
});

export const PopoverDescription: (props: PartProps<"p">) => ReactNode = createPart(PopoverContext, {
  name: "PopoverDescription",
  element: "p",
  props: (context) => context.api.getDescriptionProps(),
});

export const PopoverCloseTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  PopoverContext,
  {
    name: "PopoverCloseTrigger",
    element: "button",
    props: (context) => context.api.getCloseTriggerProps(),
  },
);
