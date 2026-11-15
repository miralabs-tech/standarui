/**
 * The dialog in React: a machine in the root, a portalled surface, and two
 * presences so the scrim and the surface each finish their own exit.
 *
 * **The root renders no element.** The anatomy has no `root` part — the trigger
 * stays where the author wrote it and the surface is portalled elsewhere, so the
 * two are siblings with nothing above them. What the annexe called `root` is this
 * context, which is the adapter's business (spec §8, divergence 1).
 *
 * Two things are wired here that a consumer should never have to wire by hand: the
 * intent scope the gamepad's B button travels on, taken from the nearest
 * `<NavProvider>`, and the parenthood of a surface opened from inside another
 * one — declared, because once both are portalled the DOM cannot tell.
 *
 * That parenthood travels on `layer-context`, which is shared with every other
 * overlay family rather than owned here: what opens inside a dialog is as often a
 * popover or a menu as another dialog, and a private context would only chain the
 * cases that happen to be the same component.
 */

import type { Service } from "@standarui/core";
import * as dialog from "@standarui/core/dialog";
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

export type DialogApi = dialog.DialogApi<ReactPropTypes>;

export interface UseDialogProps extends dialog.DialogMachineProps, MachineRuntimeProps {}

interface DialogContextValue {
  readonly api: DialogApi;
  /** Keeps the surface in the tree while closed; the consumer hides it in CSS. */
  readonly keepMounted: boolean;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

const DialogContext = createPartContext<DialogContextValue>("Dialog");

function useDialogService(props: UseDialogProps): Service<dialog.DialogSchema> {
  const parentLayerId = useParentLayerId();
  const host = useIntentScopeHost();

  return useMachine(dialog.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this dialog answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    parentId: props.parentId ?? parentLayerId,
  });
}

export function useDialog(props: UseDialogProps): DialogApi {
  return dialog.connect(useDialogService(props), normalizeProps);
}

/** The api of the dialog a subtree sits in — the queue case of spec §9.4 reads it. */
export function useDialogContext(): DialogApi {
  return DialogContext.usePart("DialogContext").api;
}

export interface DialogRootProps extends UseDialogProps {
  readonly keepMounted?: boolean | undefined;
  readonly children?: ReactNode;
}

export function DialogRoot(props: DialogRootProps): ReactNode {
  const { children, keepMounted, ...machineProps } = props;
  const service = useDialogService(machineProps);
  const api = dialog.connect(service, normalizeProps);
  const { motion } = useEnvironment();

  // `motion === "none"` and not `reducedMotion`, because the two are not the same
  // question. `reduced` keeps every duration and only flattens the movement — the
  // fade is the whole point of that mode — so skipping the wait there throws the
  // surface out before the crossfade the sheet deliberately kept can play. Only
  // `none` zeroes the durations, and there the wait has nothing to wait for.
  const immediate = motion === "none";

  // Two presences, not one. The scrim and the surface run different exits — 200 ms
  // against 150 or 250 (motion.md §2.5) — and a single presence can only measure
  // the animations of the one node it holds, so it would cut the other one short.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  const value: DialogContextValue = {
    api,
    keepMounted: keepMounted === true,
    backdrop,
    content,
  };

  // Outside the dialog's own context, because what reads it is not a dialog part:
  // it is whatever surface a consumer opens from inside this one.
  return (
    <LayerProvider layerId={dialog.getContentId(service.scope)}>
      <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
    </LayerProvider>
  );
}

/**
 * Mounted the moment the machine says open, rather than when the presence catches
 * up — and that is not an optimisation.
 *
 * `usePresence` learns of a change in a layout effect, which is one commit late,
 * and one commit is too late: the interpreter installs the open state's effects in
 * the layout effect of the very commit that opened it, and the focus trap, the
 * dismissable layer, the scroll lock and `hideOthers` all look the surface up by
 * id. A surface arriving a commit later would find every one of them installed
 * against nothing, with nothing to re-install them. So the open direction is read
 * straight off the machine; the presence only ever extends the mount past the close.
 */
function isMounted(context: DialogContextValue, presence: PresenceApi): boolean {
  return context.keepMounted || context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  // Memoised on identity: a fresh callback every render would make React detach and
  // re-attach the consumer's own ref on every render too.
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const DialogTrigger: (props: PartProps<"button">) => ReactNode = createPart(DialogContext, {
  name: "DialogTrigger",
  element: "button",
  props: (context) => context.api.getTriggerProps(),
});

export interface DialogPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function DialogPortal(props: DialogPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = DialogContext.usePart("DialogPortal");
  const present = isMounted(context, context.backdrop) || isMounted(context, context.content);
  return present ? <Portal {...portalProps}>{children}</Portal> : null;
}

export function DialogBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = DialogContext.usePart("DialogBackdrop");
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

export function DialogPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = DialogContext.usePart("DialogPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  // Leaves with the surface it centres: an empty positioner still lays out.
  return isMounted(context, context.content) ? element : null;
}

export function DialogContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = DialogContext.usePart("DialogContent");
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

export const DialogTitle: (props: PartProps<"h2">) => ReactNode = createPart(DialogContext, {
  name: "DialogTitle",
  element: "h2",
  props: (context) => context.api.getTitleProps(),
});

export const DialogDescription: (props: PartProps<"p">) => ReactNode = createPart(DialogContext, {
  name: "DialogDescription",
  element: "p",
  props: (context) => context.api.getDescriptionProps(),
});

export const DialogCloseTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DialogContext,
  {
    name: "DialogCloseTrigger",
    element: "button",
    props: (context) => context.api.getCloseTriggerProps(),
  },
);
