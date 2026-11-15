/**
 * The drawer in React: a second machine laid over a dialog that already owns the
 * surface, and four parts of which only one is an element of its own.
 *
 * **Three of the parts are composed onto the dialog's through `render`.** A
 * consumer writes `<DialogContent render={<DrawerContent/>}>`, `useRender` merges
 * the two prop getters with the core's `mergeProps`, and the element comes out
 * carrying both identities — `data-scope="dialog drawer"`, `data-part="dialog:content
 * drawer:content"` — because that merge treats those two attributes as token lists
 * (`slot.ts:94`). It is the mechanism `architecture.md:45` describes and the one
 * `<PopoverTrigger render={<ButtonRoot/>}>` already travels; no new primitive is
 * owed for it, and the dialog's mount and presence logic stays private to the
 * component that owns it, which is what keeps `react/dialog` off this component's
 * budget.
 *
 * **The root owns no `open`.** It reads the dialog's, which is what stops the
 * drawer from becoming a second owner of a truth the dialog already holds, and it
 * asks to close through `dismiss("drag")` rather than `setOpen(false)` so
 * `canDismiss` gets its say and `onDismiss` is told why (`dialog.types.ts:178`).
 */

import type { PartIdOverrides, Service } from "@standarui/core";
import * as drawer from "@standarui/core/drawer";
import { type ReactNode, useMemo, useRef } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { useHydrating } from "../../portal";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";
import { useSafeLayoutEffect } from "../../use-safe-layout-effect";
import { useDialogContext } from "../dialog/dialog";

export type DrawerApi = drawer.DrawerApi<ReactPropTypes>;

export interface UseDrawerProps extends drawer.DrawerMachineProps, MachineRuntimeProps {}

interface DrawerContextValue {
  readonly api: DrawerApi;
}

const DrawerContext = createPartContext<DrawerContextValue>("Drawer");

function useDrawerService(props: UseDrawerProps): Service<drawer.DrawerSchema> {
  const host = useIntentScopeHost();

  return useMachine(drawer.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this sheet answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
  });
}

/** The decorator on its own, for a surface that is not this library's dialog. */
export function useDrawer(props: UseDrawerProps): DrawerApi {
  return drawer.connect(useDrawerService(props), normalizeProps);
}

export function useDrawerContext(): DrawerApi {
  return DrawerContext.usePart("DrawerContext").api;
}

export interface DrawerRootProps extends Omit<UseDrawerProps, "open" | "onDismissRequest"> {
  readonly children?: ReactNode;
}

export function DrawerRoot(props: DrawerRootProps): ReactNode {
  const { children, ids, ...machineProps } = props;
  const dialog = useDialogContext();

  // **The three co-identities have to be found by the id the element really
  // carries, and that id is the dialog's.** `mergeProps` is later-wins for values
  // and the dialog contributes its own `id` last, so a drawer deriving
  // `drawer:<scope>:content` would hand `getElementById` a string no element
  // wears: `getContentEl` returns null, and every effect that resolves the
  // surface — the drag tracker, the offset writer, the progress publisher —
  // installs against nothing, silently. Seeding the overrides makes both machines
  // name the same string, which also leaves the merge with nothing to arbitrate.
  //
  // Read off the prop getters rather than from the dialog's scope, because the
  // shared context deliberately exposes an api and not a service. `useMachine`
  // reads `ids` once, at creation, and these are derived from the dialog's scope
  // id, so they are stable from the first render — including the server's.
  const drawerIds: PartIdOverrides = {
    positioner: dialog.getPositionerProps().id,
    backdrop: dialog.getBackdropProps().id,
    content: dialog.getContentProps().id,
    ...ids,
  };

  const api = drawer.connect(
    useDrawerService({
      ...machineProps,
      ids: drawerIds,
      open: dialog.open,
      onDismissRequest: () => {
        dialog.dismiss("drag");
      },
    }),
    normalizeProps,
  );

  return <DrawerContext.Provider value={{ api }}>{children}</DrawerContext.Provider>;
}

export const DrawerPositioner: (props: PartProps<"div">) => ReactNode = createPart(DrawerContext, {
  name: "DrawerPositioner",
  element: "div",
  props: (context) => context.api.getPositionerProps(),
});

export const DrawerBackdrop: (props: PartProps<"div">) => ReactNode = createPart(DrawerContext, {
  name: "DrawerBackdrop",
  element: "div",
  props: (context) => context.api.getBackdropProps(),
});

const PARTIAL_AND_OPEN = '[data-detent-position="partial"][data-state="open"]';

/**
 * **The detent is written without a transition when the tree is hydrating.** A
 * server cannot paint a partial detent, so a sheet that is open in the markup rests
 * closed until the CSSOM write of `--sui-drawer-detent` moves it to its detent —
 * and the dialog's `translate` transition would make that move a slide across the
 * screen, reduced motion included. A first write is not a gesture. Duration and
 * delay are zeroed before the write and given back after a forced style flush, so
 * the engine computes the new position once, with nothing to animate. A fresh
 * client mount is left alone: its entry is `@starting-style`'s, and has to play.
 * Only a partial sheet that is open is held: a full one is already at rest. The
 * two longhands are saved first and written back as they were, so a duration or a
 * delay the consumer set survives, and nothing else of `transition` is touched.
 */
export function DrawerContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = DrawerContext.usePart("DrawerContent");
  const hydrating = useHydrating();
  const first = useRef(hydrating);
  const held = useRef<readonly [string, string] | null>(null);
  const node = useRef<HTMLElement | null>(null);
  const chained = useMemo(() => composeRefs<HTMLElement>(node, ref), [ref]);

  useSafeLayoutEffect(() => {
    const style = node.current?.style;
    if (!first.current || !node.current?.matches(PARTIAL_AND_OPEN) || style === undefined) return;
    held.current = [style.transitionDuration, style.transitionDelay];
    style.transitionDuration = style.transitionDelay = "0s";
  }, []);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: chained },
    children,
  });

  useSafeLayoutEffect(() => {
    const saved = held.current;
    const target = node.current;
    if (saved === null || target === null) return;
    held.current = null;
    target.getBoundingClientRect();
    [target.style.transitionDuration, target.style.transitionDelay] = saved;
  }, []);

  return element;
}

export interface DrawerGrabberProps extends PartProps<"div"> {
  /** Opt-in `aria-valuetext`; without it the percentage speaks for itself. */
  readonly valueText?: string | undefined;
}

/**
 * The one element the drawer brings, and the last child of the surface on
 * purpose (spec §6.1): the trap's tab loop reaches it last, so a sheet never
 * opens with the focus sitting on a resize handle. What puts it back at the
 * visual edge is `_drawer.scss`, in four `inset-*` rules.
 */
export function DrawerGrabber(props: DrawerGrabberProps): ReactNode {
  const { render, asChild, children, valueText, ...elementProps } = props;
  const context = DrawerContext.usePart("DrawerGrabber");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getGrabberProps({ valueText }),
    elementProps,
    children,
  });

  // One detent is a sheet, not a track. Rendering a focusable `separator` with
  // `aria-valuenow` over a surface that cannot be resized would put a lie in the
  // tab order, so the part stands down rather than disabling itself.
  return context.api.hasTrack ? element : null;
}
