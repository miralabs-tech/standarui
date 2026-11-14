import * as list from "@standarui/core/list";
import { isValidElement, type ReactNode, useMemo, useRef } from "react";
import { composeRefs } from "../../compose-refs";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { useInputModality } from "../../use-input-modality";
import { useRender } from "../../use-render";

export type ListApi = list.ListApi<ReactPropTypes>;

export function useList(props: list.ListMachineProps): ListApi {
  return list.connect(props, normalizeProps);
}

const api: ListApi = list.connect({}, normalizeProps);

const MACHINE_PROPS = ["variant"] as const;

export interface ListRootProps
  extends list.ListMachineProps,
    PartProps<"div", list.ListMachineProps> {}

export function ListRoot(props: ListRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ref, ...elementProps } = rest;
  const node = useRef<HTMLElement | null>(null);
  const chained = useMemo(() => composeRefs<HTMLElement>(node, ref), [ref]);
  useInputModality(node);

  return useRender({
    render,
    asChild,
    element: "div",
    props: useList(ownProps).getRootProps(),
    elementProps: { ...elementProps, ref: chained },
    children,
  });
}

export function ListSection(props: PartProps<"section">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "section",
    props: api.getSectionProps(),
    elementProps,
    children,
  });
}

export function ListHeader(props: PartProps<"h3">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "h3",
    props: api.getHeaderProps(),
    elementProps,
    children,
  });
}

export function ListGroup(props: PartProps<"ul">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "ul",
    props: api.getGroupProps(),
    elementProps,
    children,
  });
}

export interface ListRowProps extends list.ListRowOptions, PartProps<"li", list.ListRowOptions> {}

export function ListRow(props: ListRowProps): ReactNode {
  const [ownProps, rest] = splitProps(props, ["size", "chevron"] as const);
  const { render, asChild, children, ...elementProps } = rest;

  return useRender({
    render,
    asChild,
    element: "li",
    props: api.getRowProps(ownProps),
    elementProps,
    children,
  });
}

function rendersButton(props: PartProps<"button">): boolean {
  if (props.asChild === true) return false;
  if (props.render === undefined) return true;
  return isValidElement(props.render) && props.render.type === "button";
}

export function ListAction(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "button",
    props: rendersButton(props)
      ? { type: "button", ...api.getActionProps() }
      : api.getActionProps(),
    elementProps,
    children,
  });
}

export function ListLeading(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getLeadingProps(),
    elementProps,
    children,
  });
}

export function ListTitle(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getTitleProps(),
    elementProps,
    children,
  });
}

export function ListSubtitle(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getSubtitleProps(),
    elementProps,
    children,
  });
}

export function ListTrailing(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getTrailingProps(),
    elementProps,
    children,
  });
}

export function ListFooter(props: PartProps<"p">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "p",
    props: api.getFooterProps(),
    elementProps,
    children,
  });
}
