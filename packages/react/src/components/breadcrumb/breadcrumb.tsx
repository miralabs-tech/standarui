/**
 * Breadcrumb in React: one machine in the root and six thin parts.
 *
 * There is no presence and no portal here, and that is the design rather than an
 * omission. A folded level leaves through the `hidden` attribute, which is
 * instantaneous by construction — nothing to animate on the way out, so nothing
 * to hold mounted. The reveal is a fade the sheet owns.
 *
 * The one thing this adapter does that the core cannot is **order**: `useMachine`
 * runs the machine's watchers in a layout effect, i.e. after the commit that took
 * `hidden` off the revealed levels. That is what lets the focus move land on a
 * level that is really in the tree — the whole reason this component has a
 * machine (see the head of `breadcrumb.machine.ts`).
 *
 * `EllipsisTrigger` is also the composition point for the overflow-menu
 * presentation: `<BreadcrumbEllipsisTrigger render={<MenuTrigger />} />` gives one
 * element both identities, and the two sheets match it at once. The menu is never
 * a dependency of this component — it is the 8 kB overlay-and-collection class,
 * and a trail of links must not pay for one.
 */

import * as breadcrumb from "@standarui/core/breadcrumb";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type BreadcrumbApi = breadcrumb.BreadcrumbApi<ReactPropTypes>;

export interface UseBreadcrumbProps
  extends breadcrumb.BreadcrumbMachineProps,
    MachineRuntimeProps {}

const BreadcrumbPartContext = createPartContext<BreadcrumbApi>("Breadcrumb");

export function useBreadcrumb(props: UseBreadcrumbProps): BreadcrumbApi {
  return breadcrumb.connect(useMachine(breadcrumb.machine, props), normalizeProps);
}

/** The api of the trail a subtree sits in — a consumer's own chrome reads it. */
export function useBreadcrumbContext(): BreadcrumbApi {
  return BreadcrumbPartContext.usePart("BreadcrumbContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "label",
  "ellipsisLabel",
  "expanded",
  "defaultExpanded",
  "onExpandedChange",
] as const;

export interface BreadcrumbRootProps
  extends UseBreadcrumbProps,
    PartProps<"nav", UseBreadcrumbProps> {}

/**
 * A `nav` landmark, named by `label`. Two trails on one page need two names, or
 * the two landmarks are indistinguishable to anyone navigating by them.
 */
export function BreadcrumbRoot(props: BreadcrumbRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useBreadcrumb(machineProps);

  return (
    <BreadcrumbPartContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "nav",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </BreadcrumbPartContext.Provider>
  );
}

/**
 * An `ol`, and it holds nothing but `Item`s and the `Ellipsis`: `ol > li` is the
 * structure a screen reader counts the levels from, and a stray `div` between the
 * two breaks the count. It carries a permanent `tabindex="-1"` — never in the Tab
 * order, it is where a pointer reveal parks the focus.
 */
export const BreadcrumbList: (props: PartProps<"ol">) => ReactNode = createPart<
  BreadcrumbApi,
  "ol"
>(BreadcrumbPartContext, {
  name: "BreadcrumbList",
  element: "ol",
  props: (api) => api.getListProps(),
});

export interface BreadcrumbItemProps
  extends breadcrumb.BreadcrumbItemProps,
    PartProps<"li", breadcrumb.BreadcrumbItemProps> {}

/**
 * One level. `collapsed` marks it as living behind the ellipsis: it is `hidden`
 * while the trail is folded — out of layout and out of the accessibility tree —
 * and keeps `data-collapsed` once revealed, which is what the fade keys on.
 */
export function BreadcrumbItem(props: BreadcrumbItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["collapsed"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = BreadcrumbPartContext.usePart("BreadcrumbItem");

  return useRender({
    render,
    asChild,
    element: "li",
    props: api.getItemProps(itemProps),
    elementProps,
    children,
  });
}

export interface BreadcrumbLinkProps
  extends breadcrumb.BreadcrumbLinkProps,
    PartProps<"a", breadcrumb.BreadcrumbLinkProps> {}

/**
 * An `a[href]` by default. The current level is usually rendered as a `span`
 * through `render` — `aria-current` is a global attribute, so it stays valid
 * there — and a router's own `Link` drops in the same way.
 */
export function BreadcrumbLink(props: BreadcrumbLinkProps): ReactNode {
  const [linkProps, rest] = splitProps(props, ["current"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = BreadcrumbPartContext.usePart("BreadcrumbLink");

  return useRender({
    render,
    asChild,
    element: "a",
    props: api.getLinkProps(linkProps),
    elementProps,
    children,
  });
}

/**
 * The `li` that hosts the ellipsis button — a real list item, so the sheet's
 * chevrons count it by adjacency like any other level. It leaves with the reveal.
 */
export const BreadcrumbEllipsis: (props: PartProps<"li">) => ReactNode = createPart<
  BreadcrumbApi,
  "li"
>(BreadcrumbPartContext, {
  name: "BreadcrumbEllipsis",
  element: "li",
  props: (api) => api.getEllipsisProps(),
});

/**
 * The disclosure button. It renders no children of its own: the three dots are
 * the sheet's, never a text `…` — a glyph's ink rests on its baseline rather than
 * in the middle of its box — and the accessible name comes from `ellipsisLabel`.
 */
export const BreadcrumbEllipsisTrigger: (props: PartProps<"button">) => ReactNode = createPart<
  BreadcrumbApi,
  "button"
>(BreadcrumbPartContext, {
  name: "BreadcrumbEllipsisTrigger",
  element: "button",
  props: (api) => api.getEllipsisTriggerProps(),
});
