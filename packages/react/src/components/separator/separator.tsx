import * as separator from "@standarui/core/separator";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { useRender } from "../../use-render";

export type SeparatorApi = separator.SeparatorApi<ReactPropTypes>;

/** No machine and no service — see the note in the core's `separator.ts`. */
export function useSeparator(props: separator.SeparatorMachineProps): SeparatorApi {
  return separator.connect(props, normalizeProps);
}

const MACHINE_PROPS = ["orientation", "decorative"] as const;

export interface SeparatorRootProps
  extends separator.SeparatorMachineProps,
    PartProps<"div", separator.SeparatorMachineProps> {}

export function SeparatorRoot(props: SeparatorRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useSeparator(ownProps);

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getRootProps(),
    elementProps,
    children,
  });
}
