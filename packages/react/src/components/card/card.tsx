import * as card from "@standarui/core/card";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { useRender } from "../../use-render";

export type CardApi = card.CardApi<ReactPropTypes>;

/** No machine and no service — see the note in the core's `card.ts`. */
export function useCard(props: card.CardMachineProps): CardApi {
  return card.connect(props, normalizeProps);
}

/**
 * `connect` is pure and every non-root part's output is constant, so one
 * module-level api serves them all. No `PartContext` either: there is no id and
 * no state to share, and a provider would enforce an invariant that buys
 * nothing.
 */
const api: CardApi = card.connect({}, normalizeProps);

const MACHINE_PROPS = ["variant"] as const;

export interface CardRootProps
  extends card.CardMachineProps,
    PartProps<"div", card.CardMachineProps> {}

export function CardRoot(props: CardRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;

  return useRender({
    render,
    asChild,
    element: "div",
    props: useCard(ownProps).getRootProps(),
    elementProps,
    children,
  });
}

export function CardHeader(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getHeaderProps(),
    elementProps,
    children,
  });
}

/**
 * An `h3`, not the `h2` of dialog and popover: a card is a repeated unit inside
 * a page, not a window-level surface. The level is corrected per context with
 * `render={<h2/>}`.
 */
export function CardTitle(props: PartProps<"h3">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "h3",
    props: api.getTitleProps(),
    elementProps,
    children,
  });
}

export function CardDescription(props: PartProps<"p">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "p",
    props: api.getDescriptionProps(),
    elementProps,
    children,
  });
}

export function CardAction(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getActionProps(),
    elementProps,
    children,
  });
}

export function CardBody(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getBodyProps(),
    elementProps,
    children,
  });
}

export function CardFooter(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getFooterProps(),
    elementProps,
    children,
  });
}
