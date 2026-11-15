/**
 * Pagination in React: one machine in the root, five thin parts, and a
 * render-prop context so a consumer can map `api.pages` without reaching for
 * the hook.
 *
 * The one decision the adapter owns is the element: `type="link"` renders every
 * control as an anchor, `"button"` (the default) as a button. That flag rides
 * the part context rather than being re-read from the api — `connect` already
 * spent it on the props, only the tag choice is left, and the tag is React's.
 *
 * The intent scope LT/RT arrive on is taken from the nearest
 * `<NavProvider>`, exactly as `tabs` wires LB/RB.
 */

import type { Service } from "@standarui/core";
import * as pagination from "@standarui/core/pagination";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type PaginationApi = pagination.PaginationApi<ReactPropTypes>;

export interface UsePaginationProps
  extends pagination.PaginationMachineProps,
    MachineRuntimeProps {}

interface PaginationContextValue {
  readonly api: PaginationApi;
  /** Mirrored off the machine props: the parts pick their element from it. */
  readonly link: boolean;
}

const PaginationPartContext = createPartContext<PaginationContextValue>("Pagination");

function usePaginationService(props: UsePaginationProps): Service<pagination.PaginationSchema> {
  const host = useIntentScopeHost();

  return useMachine(pagination.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this pagination answers no gamepad" while a provider is mounted above.
    intents: props.intents === undefined ? host : props.intents,
  });
}

export function usePagination(props: UsePaginationProps): PaginationApi {
  return pagination.connect(usePaginationService(props), normalizeProps);
}

/** The api of the pagination a subtree sits in — a consumer's own chrome reads it. */
export function usePaginationContext(): PaginationApi {
  return PaginationPartContext.usePart("PaginationContext").api;
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "count",
  "page",
  "defaultPage",
  "pageSize",
  "defaultPageSize",
  "siblingCount",
  "boundaryCount",
  "type",
  "getPageUrl",
  "disabled",
  "translations",
  "intents",
  "onPageChange",
  "onPageSizeChange",
] as const;

export interface PaginationRootProps
  extends UsePaginationProps,
    PartProps<"nav", UsePaginationProps> {}

export function PaginationRoot(props: PaginationRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = usePagination(machineProps);

  const context: PaginationContextValue = { api, link: machineProps.type === "link" };

  return (
    <PaginationPartContext.Provider value={context}>
      {useRender({
        render,
        asChild,
        element: "nav",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </PaginationPartContext.Provider>
  );
}

export interface PaginationItemProps
  extends pagination.PaginationItemProps,
    PartProps<"button", pagination.PaginationItemProps> {}

/**
 * An item is identified by its page and nothing else: its neighbours and the
 * focus order are read back off the DOM by the machine, so a cell rendered
 * conditionally — which is every cell, since `api.pages` reshapes as the window
 * slides — never goes out of sync with a registry.
 */
export function PaginationItem(props: PaginationItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["page"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api, link } = PaginationPartContext.usePart("PaginationItem");

  return useRender({
    render,
    asChild,
    element: link ? "a" : "button",
    props: api.getItemProps(itemProps),
    elementProps,
    children,
  });
}

export interface PaginationEllipsisProps
  extends pagination.PaginationEllipsisProps,
    PartProps<"span", pagination.PaginationEllipsisProps> {}

/**
 * Purely presentational, `aria-hidden`. The content is the consumer's — an
 * inline SVG, never the `…` glyph, whose ink sits on its baseline rather than
 * in the middle of its box.
 */
export function PaginationEllipsis(props: PaginationEllipsisProps): ReactNode {
  const [ellipsisProps, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api } = PaginationPartContext.usePart("PaginationEllipsis");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getEllipsisProps(ellipsisProps),
    elementProps,
    children,
  });
}

export function PaginationPrevTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api, link } = PaginationPartContext.usePart("PaginationPrevTrigger");

  return useRender({
    render,
    asChild,
    element: link ? "a" : "button",
    props: api.getPrevTriggerProps(),
    elementProps,
    children,
  });
}

export function PaginationNextTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api, link } = PaginationPartContext.usePart("PaginationNextTrigger");

  return useRender({
    render,
    asChild,
    element: link ? "a" : "button",
    props: api.getNextTriggerProps(),
    elementProps,
    children,
  });
}

export interface PaginationContextProps {
  /** Handed the connected api — the way a consumer maps `api.pages` into cells. */
  readonly children: (api: PaginationApi) => ReactNode;
}

export function PaginationContext(props: PaginationContextProps): ReactNode {
  return props.children(usePaginationContext());
}
