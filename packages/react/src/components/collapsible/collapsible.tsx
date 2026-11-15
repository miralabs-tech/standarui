/**
 * The disclosure in React: one machine in the root, and one content that has to
 * be allowed to finish leaving.
 *
 * The adapter owns exactly one decision the core cannot make — whether the
 * content is in the tree at all — and it is the decision the whole component
 * turns on. React commits the DOM before it runs a layout effect, and
 * `useMachine` runs its watchers in one; that ordering is what lets the machine
 * measure a node that already carries its new `data-state`. Mount the content
 * later than the commit, or hide it earlier, and the measurement reads a box
 * that is not the one about to animate.
 *
 * `keepMounted` and the presence are the tabs arrangement, not a new one: a
 * kept content is `hidden` the moment it closes, `display: none` runs no
 * animation, and a presence left waiting on one would only schedule a render
 * nobody reads. `reduced` is deliberately not in that list — it keeps the 150ms
 * fade the sheet holds on purpose, and only `none` removes it.
 */

import * as collapsible from "@standarui/core/collapsible";
import { type ReactNode, type Ref, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type CollapsibleApi = collapsible.CollapsibleApi<ReactPropTypes>;

export interface UseCollapsibleProps
  extends collapsible.CollapsibleMachineProps,
    MachineRuntimeProps {}

interface CollapsibleContextValue {
  readonly api: CollapsibleApi;
  /**
   * Mirrored out of the machine props rather than read back off the api: the
   * content is what acts on it, and `connect` already spends it on `hidden`.
   * Only the mount decision is left, and that one is React's.
   */
  readonly keepMounted: boolean;
}

const CollapsibleContext = createPartContext<CollapsibleContextValue>("Collapsible");

export function useCollapsible(props: UseCollapsibleProps): CollapsibleApi {
  return collapsible.connect(useMachine(collapsible.machine, props), normalizeProps);
}

/** The api of the disclosure a subtree sits in — a consumer's own chrome reads it. */
export function useCollapsibleContext(): CollapsibleApi {
  return CollapsibleContext.usePart("CollapsibleContext").api;
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "open",
  "defaultOpen",
  "disabled",
  "keepMounted",
  "onOpenChange",
] as const;

export interface CollapsibleRootProps
  extends UseCollapsibleProps,
    PartProps<"div", UseCollapsibleProps> {}

export function CollapsibleRoot(props: CollapsibleRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useCollapsible(machineProps);

  const context: CollapsibleContextValue = {
    api,
    keepMounted: machineProps.keepMounted === true,
  };

  return (
    <CollapsibleContext.Provider value={context}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </CollapsibleContext.Provider>
  );
}

export const CollapsibleTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  CollapsibleContext,
  {
    name: "CollapsibleTrigger",
    element: "button",
    props: (context) => context.api.getTriggerProps(),
  },
);

/**
 * Decoration, and `aria-hidden` says so. A chevron composed into it rotates with
 * the box; an empty one is drawn by the sheet, so a consumer who wants the
 * library's own affordance writes nothing at all.
 */
export const CollapsibleIndicator: (props: PartProps<"span">) => ReactNode = createPart(
  CollapsibleContext,
  {
    name: "CollapsibleIndicator",
    element: "span",
    props: (context) => context.api.getIndicatorProps(),
  },
);

export function CollapsibleContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const { api, keepMounted } = CollapsibleContext.usePart("CollapsibleContent");
  const { motion } = useEnvironment();

  const presence = usePresence({
    present: api.open,
    immediate: motion === "none" || keepMounted,
  });
  // Memoised on identity: a fresh callback every render would make React detach
  // and re-attach the consumer's own ref on every render too.
  const composed: Ref<HTMLElement> = useMemo(
    () => composeRefs(presence.ref, ref),
    [presence.ref, ref],
  );

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  // Read off the machine in the opening direction and off the presence only in
  // the closing one: the entry action that measures this node runs in the layout
  // effect of the very commit that opened it, and it looks the node up by id.
  // The presence never delays a mount, it only extends one past the close.
  return keepMounted || api.open || presence.present ? element : null;
}
