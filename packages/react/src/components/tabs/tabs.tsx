/**
 * Tabs in React: one machine in the root, and one panel per value that has to be
 * allowed to finish leaving.
 *
 * Two things are wired here that a consumer should never have to wire by hand:
 * the intent scope LB/RB arrive on, taken from the nearest `<NavProvider>`,
 * and the field a tab list may sit in, which is where `describedBy` comes from.
 *
 * **The presence lives on the panel, not on the root.** A dialog has one surface
 * and keeps its presence in the root context; a tab list has one panel per value,
 * and the panel that is leaving is never the panel that is arriving — a single
 * presence could only measure the animations of whichever node it happened to
 * hold. One per `<TabsContent>` is also what keeps a panel that has never been
 * activated from paying for one at all (`lazyMount` unmounts it outright).
 *
 * Nothing here decides *what* is selected, mounted or focused: `isSelected`,
 * `isMounted` and the whole roving order come off the machine, so the React
 * adapter and the vanilla one cannot drift on the questions that matter.
 */

import type { Service } from "@standarui/core";
import * as tabs from "@standarui/core/tabs";
import { useIntentScopeHost } from "@standarx/nav/react";
import { type ReactNode, type Ref, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type TabsApi = tabs.TabsApi<ReactPropTypes>;

export interface UseTabsProps extends tabs.TabsMachineProps, MachineRuntimeProps {}

interface TabsContextValue {
  readonly api: TabsApi;
  /**
   * Mirrored out of the machine props rather than read back off the api: it is
   * the panels that act on it, and `connect` already spends it on the `hidden`
   * attribute. Only the mount decision is left, and that one is React's.
   */
  readonly keepMounted: boolean;
}

const TabsContext = createPartContext<TabsContextValue>("Tabs");

function useTabsService(props: UseTabsProps): Service<tabs.TabsSchema> {
  const host = useIntentScopeHost();

  return useMachine(tabs.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this tab list answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
  });
}

export function useTabs(props: UseTabsProps): TabsApi {
  return tabs.connect(useTabsService(props), normalizeProps);
}

/** The api of the tab list a subtree sits in — a consumer's own chrome reads it. */
export function useTabsContext(): TabsApi {
  return TabsContext.usePart("TabsContext").api;
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "value",
  "defaultValue",
  "activationMode",
  "loopFocus",
  "disabled",
  "closable",
  "lazyMount",
  "keepMounted",
  "scrollActiveIntoView",
  "describedBy",
  "intents",
  "onValueChange",
  "onFocusChange",
  "onClose",
] as const;

export interface TabsRootProps extends UseTabsProps, PartProps<"div", UseTabsProps> {}

export function TabsRoot(props: TabsRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useTabs(inheritFromField(machineProps, field));

  const context: TabsContextValue = { api, keepMounted: machineProps.keepMounted === true };

  return (
    <TabsContext.Provider value={context}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </TabsContext.Provider>
  );
}

export const TabsList: (props: PartProps<"div">) => ReactNode = createPart(TabsContext, {
  name: "TabsList",
  element: "div",
  props: (context) => context.api.getListProps(),
});

/**
 * Decoration, and `aria-hidden` says so. It is placed by the two custom
 * properties the machine measured onto `list`, so it renders wherever the author
 * put it inside that list and nothing here has to know about geometry.
 */
export const TabsIndicator: (props: PartProps<"span">) => ReactNode = createPart(TabsContext, {
  name: "TabsIndicator",
  element: "span",
  props: (context) => context.api.getIndicatorProps(),
});

/**
 * The drawn bar of a list that scrolls along its line, a **sibling** of the list
 * and never inside it: a child of a scroller scrolls with it and is clipped and
 * faded by it. Opt-in for a parts tree, and decoration, hence `aria-hidden`.
 */
export const TabsScrollbar: (props: PartProps<"div">) => ReactNode = createPart(TabsContext, {
  name: "TabsScrollbar",
  element: "div",
  props: (context) => context.api.getScrollbarProps(),
});

export const TabsThumb: (props: PartProps<"div">) => ReactNode = createPart(TabsContext, {
  name: "TabsThumb",
  element: "div",
  props: (context) => context.api.getThumbProps(),
});

export interface TabsTriggerProps
  extends tabs.TabsTriggerProps,
    PartProps<"button", tabs.TabsTriggerProps> {}

/**
 * A tab is identified by its value and nothing else: its position, its
 * neighbours and whether it is the tab stop are all read back off the DOM by the
 * machine, which is what stops a conditionally rendered tab going out of sync
 * with a registry nobody remembered to update.
 */
export function TabsTrigger(props: TabsTriggerProps): ReactNode {
  const [triggerProps, rest] = splitProps(props, ["value", "disabled", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = TabsContext.usePart("TabsTrigger");

  return useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getTriggerProps(triggerProps),
    elementProps,
    children,
  });
}

export interface TabsCloseTriggerProps
  extends tabs.TabsCloseTriggerProps,
    PartProps<"button", tabs.TabsCloseTriggerProps> {}

/**
 * A **sibling** of the tab it closes, never a child of it: a `<button>` may hold
 * no interactive content, and a close button nested in one would also hand its
 * click to the tab on the way out — selecting the tab the user just asked to be
 * rid of. `getTriggerEls` reads `[data-part~="tabs:trigger"]`, and `close-trigger`
 * is a different token, so a sibling changes nothing about the roving order.
 *
 * It takes no tab stop: the list exposes exactly one, and the keyboard route to
 * closing is `Delete` (APG). Only live under `closable` — the machine declines
 * `TRIGGER.CLOSE` otherwise, so a stray one is inert rather than wrong.
 */
export function TabsCloseTrigger(props: TabsCloseTriggerProps): ReactNode {
  const [closeProps, rest] = splitProps(props, ["value", "disabled"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = TabsContext.usePart("TabsCloseTrigger");

  return useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getCloseTriggerProps(closeProps),
    elementProps,
    children,
  });
}

export interface TabsContentProps
  extends tabs.TabsContentProps,
    PartProps<"div", tabs.TabsContentProps> {}

export function TabsContent(props: TabsContentProps): ReactNode {
  const [contentProps, rest] = splitProps(props, ["value"]);
  const { render, asChild, children, ref, ...elementProps } = rest;
  const { api, keepMounted } = TabsContext.usePart("TabsContent");
  const { motion } = useEnvironment();

  const selected = api.isSelected(contentProps.value);
  // `keepMounted` skips the wait the way `data-motion="none"` does: the panel is
  // `hidden` the moment it deactivates, `display: none` runs no animation, and a
  // presence left waiting on one would only schedule a render nobody reads.
  // `reduced` is not in that list — it keeps the 150ms fade, and skipping there
  // would lose the crossfade the sheet keeps on purpose (see `dialog.tsx`).
  const presence = usePresence({ present: selected, immediate: motion === "none" || keepMounted });
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
    props: api.getContentProps(contentProps),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  // `isMounted` is the `lazyMount` gate and it comes first: a panel that has
  // never been activated is not in the tree at all, which is also what keeps
  // `aria-controls` from naming an element that does not exist. Past that gate a
  // panel is present while it is selected, while `keepMounted` holds it, and for
  // as long as its exit is still running — the presence only ever extends a
  // mount past the deactivation, never delays one.
  return api.isMounted(contentProps.value) && (keepMounted || selected || presence.present)
    ? element
    : null;
}
