/**
 * The toast in React: one machine for the region, one presence per card, and a
 * render prop in between.
 *
 * The render prop is not a stylistic choice. A toast is created at runtime from a
 * store the app owns — often from a module that is not a component at all — so
 * there is no JSX the library could have written for it: the app is handed each
 * record and renders the card it wants, `meta` included. What the library keeps
 * is the region, the ARIA, the keyboard, the hand-off and the exit.
 *
 * `createToaster` is re-exported rather than wrapped, because it is UI-less: the
 * same call works in a React tree, in a worker-adjacent module, or in the error
 * handler of a fetch that no component is watching.
 */

import type { Service } from "@standarui/core";
import * as toast from "@standarui/core/toast";
import { useIntentScopeHost } from "@standarx/nav/react";
import { type ReactNode, type Ref, useEffect, useMemo, useRef } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { Portal, type PortalProps } from "../../portal";
import { usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type {
  ToastActionOptions,
  ToastDismissDetails,
  ToastDismissReason,
  Toaster,
  ToasterOptions,
  ToastOptions,
  ToastPlacement,
  ToastPromiseOptions,
  ToastRecord,
  ToastStatus,
  ToastType,
} from "@standarui/core/toast";
export { createToaster } from "@standarui/core/toast";

export type ToastApi = toast.ToastApi<ReactPropTypes>;

export interface UseToastGroupProps extends toast.ToastGroupMachineProps, MachineRuntimeProps {}

interface ToastContextValue {
  readonly api: ToastApi;
  /** `none` is the only motion mode with nothing to wait for (see `dialog`). */
  readonly immediate: boolean;
}

interface ToastItemContextValue {
  readonly api: ToastApi;
  readonly toast: toast.ToastRecord;
}

const ToastContext = createPartContext<ToastContextValue>("ToastGroup");
const ToastItemContext = createPartContext<ToastItemContextValue>("ToastRoot");

function useToastService(props: UseToastGroupProps): Service<toast.ToastGroupSchema> {
  const host = useIntentScopeHost();
  return useMachine(toast.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // region answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
  });
}

export function useToastGroup(props: UseToastGroupProps): ToastApi {
  return toast.connect(useToastService(props), normalizeProps);
}

/** The region's api, for a card rendered outside the render prop's own subtree. */
export function useToastGroupContext(): ToastApi {
  return ToastContext.usePart("ToastGroupContext").api;
}

/** The record this card is rendering — what a custom part reads instead of a prop. */
export function useToastContext(): toast.ToastRecord {
  return ToastItemContext.usePart("ToastContext").toast;
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "toaster",
  "hotkey",
  "pauseOnInteraction",
  "pauseOnPageIdle",
  "topLayer",
  "translations",
  "intents",
] as const;

export interface ToastGroupProps
  extends UseToastGroupProps,
    Omit<PartProps<"div", UseToastGroupProps>, "children">,
    Omit<PortalProps, "children" | "disabled"> {
  /** Renders the region where it was written instead of on the body. */
  readonly portalled?: boolean | undefined;
  /** Handed every visible record, front first. */
  readonly children: (record: toast.ToastRecord) => ReactNode;
}

export function ToastGroup(props: ToastGroupProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { children, container, portalled, render, asChild, ...elementProps } = rest;
  const api = toast.connect(useToastService(machineProps), normalizeProps);
  const { motion } = useEnvironment();

  const value: ToastContextValue = { api, immediate: motion === "none" };

  const cards = api.toasts.map((record) => (
    <ToastItemContext.Provider key={record.id} value={{ api, toast: record }}>
      {children(record)}
    </ToastItemContext.Provider>
  ));

  // Always rendered, empty or not: the region is a landmark, and one that comes
  // and goes with the first notification is one a screen reader has to discover
  // twice. It also guarantees the machine's effects find their node the moment
  // the first toast arrives, rather than a commit later.
  return (
    <ToastContext.Provider value={value}>
      <Portal container={container} disabled={portalled === false}>
        {useRender({
          render,
          asChild,
          element: "div",
          props: api.getGroupProps(),
          elementProps,
          children: cards,
        })}
      </Portal>
    </ToastContext.Provider>
  );
}

export interface ToastRootProps extends PartProps<"div"> {
  readonly toast: toast.ToastRecord;
}

/**
 * One presence per card, on the dialog's model: `dismissing` writes
 * `data-state="closed"`, the sheet's exit transition runs, and only when it has
 * finished does the record leave the store. Without the wait the node would be
 * gone on the same tick and nobody would ever see a toast leave.
 */
export function ToastRoot(props: ToastRootProps): ReactNode {
  const { toast: record, render, asChild, children, ref, ...elementProps } = props;
  const context = ToastContext.usePart("ToastRoot");
  const { api, immediate } = context;

  const leaving = record.status !== "visible";
  const presence = usePresence({ present: !leaving, immediate });
  const composed = useMemo(
    (): Ref<HTMLElement> => composeRefs(presence.ref, ref),
    [presence.ref, ref],
  );

  // No dependency array, and a latch instead: `api` is a fresh object every
  // render (that is what `connect` is), so a dependency on it would re-run this
  // on every commit — and reporting the same exit twice would remove a record
  // somebody has since re-created under the same id.
  const reported = useRef(false);
  useEffect(() => {
    if (!leaving || presence.present) {
      reported.current = false;
      return;
    }
    if (reported.current) return;
    reported.current = true;
    api.notifyExit(record.id);
  });

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: api.getRootProps(record),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return presence.present || !leaving ? element : null;
}

export const ToastIndicator: (props: PartProps<"span">) => ReactNode = createPart(
  ToastItemContext,
  {
    name: "ToastIndicator",
    element: "span",
    props: (context) => context.api.getIndicatorProps(context.toast),
  },
);

export const ToastTitle: (props: PartProps<"div">) => ReactNode = createPart(ToastItemContext, {
  name: "ToastTitle",
  element: "div",
  props: (context) => context.api.getTitleProps(context.toast),
});

export const ToastDescription: (props: PartProps<"div">) => ReactNode = createPart(
  ToastItemContext,
  {
    name: "ToastDescription",
    element: "div",
    props: (context) => context.api.getDescriptionProps(context.toast),
  },
);

export const ToastActionTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  ToastItemContext,
  {
    name: "ToastActionTrigger",
    element: "button",
    props: (context) => context.api.getActionTriggerProps(context.toast),
  },
);

export const ToastCloseTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  ToastItemContext,
  {
    name: "ToastCloseTrigger",
    element: "button",
    props: (context) => context.api.getCloseTriggerProps(context.toast),
  },
);
