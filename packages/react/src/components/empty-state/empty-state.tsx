import * as emptyState from "@standarui/core/empty-state";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { useRender } from "../../use-render";

export type EmptyStateApi = emptyState.EmptyStateApi<ReactPropTypes>;

const EmptyStateContext = createPartContext<EmptyStateApi>("EmptyState");

/** No machine and no service — see the note in the core's `empty-state.ts`. */
export function useEmptyState(props: emptyState.EmptyStateMachineProps): EmptyStateApi {
  return emptyState.connect(props, normalizeProps);
}

const MACHINE_PROPS = ["variant", "announce"] as const;

export interface EmptyStateRootProps
  extends emptyState.EmptyStateMachineProps,
    PartProps<"div", emptyState.EmptyStateMachineProps> {}

export function EmptyStateRoot(props: EmptyStateRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useEmptyState(ownProps);

  return (
    <EmptyStateContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </EmptyStateContext.Provider>
  );
}

export type EmptyStateIndicatorProps = PartProps<"div">;

export const EmptyStateIndicator: (props: EmptyStateIndicatorProps) => ReactNode = createPart(
  EmptyStateContext,
  {
    name: "EmptyStateIndicator",
    element: "div",
    props: (api) => api.getIndicatorProps(),
  },
);

export type EmptyStateTitleProps = PartProps<"h2">;

/**
 * An `h2` by default — a window-level placeholder, not a repeated unit. When
 * the document outline wants another level, substitute it: `render={<h3/>}`.
 */
export const EmptyStateTitle: (props: EmptyStateTitleProps) => ReactNode = createPart(
  EmptyStateContext,
  {
    name: "EmptyStateTitle",
    element: "h2",
    props: (api) => api.getTitleProps(),
  },
);

export type EmptyStateDescriptionProps = PartProps<"p">;

export const EmptyStateDescription: (props: EmptyStateDescriptionProps) => ReactNode = createPart(
  EmptyStateContext,
  {
    name: "EmptyStateDescription",
    element: "p",
    props: (api) => api.getDescriptionProps(),
  },
);

export type EmptyStateActionsProps = PartProps<"div">;

export const EmptyStateActions: (props: EmptyStateActionsProps) => ReactNode = createPart(
  EmptyStateContext,
  {
    name: "EmptyStateActions",
    element: "div",
    props: (api) => api.getActionsProps(),
  },
);
