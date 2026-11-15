import * as badge from "@standarui/core/badge";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { useRender } from "../../use-render";

export type BadgeApi = badge.BadgeApi<ReactPropTypes>;

/** No machine and no service — see the note in the core's `badge.ts`. */
export function useBadge(props: badge.BadgeMachineProps): BadgeApi {
  return badge.connect(props, normalizeProps);
}

const MACHINE_PROPS = [
  "kind",
  "tone",
  "variant",
  "count",
  "max",
  "showZero",
  "label",
  "overlap",
] as const;

export interface BadgeRootProps
  extends badge.BadgeMachineProps,
    PartProps<"span", badge.BadgeMachineProps> {}

export function BadgeRoot(props: BadgeRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useBadge(ownProps);

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getRootProps(),
    elementProps,
    // Explicit children win: localised digits, rich label content. The empty
    // display value of a label or a dot must not render as an empty text node.
    children: children ?? (api.displayValue === "" ? undefined : api.displayValue),
  });
}
