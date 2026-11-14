/**
 * The toolbar in React. Five parts, one machine, and one decision that is the
 * adapter's alone.
 *
 * **`type="button"` is placed here and never by `connect`.** An item is whatever
 * the author composed into it — a `<button>`, an anchor, a `Toggle.Root` — and a
 * `type` attribute posted by the machine would land on an `<a>` that has no such
 * thing. So the wrapper adds it to *its own* default element and stops there,
 * which also leaves `type="submit"` available to a consumer who means it.
 *
 * The item's `value` defaults to a `useId()`: identity in the roving order is
 * what the machine needs, not a name the author has to invent, and a bar of icon
 * buttons rarely has one to give.
 */

import * as toolbar from "@standarui/core/toolbar";
import { type ReactNode, useId } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ToolbarApi = toolbar.ToolbarApi<ReactPropTypes>;

const ToolbarContext = createPartContext<ToolbarApi>("Toolbar");

export interface UseToolbarProps extends toolbar.ToolbarMachineProps, MachineRuntimeProps {}

export function useToolbar(props: UseToolbarProps): ToolbarApi {
  return toolbar.connect(useMachine(toolbar.machine, props), normalizeProps);
}

/** The api of the bar a subtree sits in — a consumer's own chrome reads it. */
export function useToolbarContext(): ToolbarApi {
  return ToolbarContext.usePart("ToolbarContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "loopFocus",
  "label",
] as const;

export interface ToolbarRootProps extends UseToolbarProps, PartProps<"div", UseToolbarProps> {}

export function ToolbarRoot(props: ToolbarRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useToolbar(machineProps);

  return (
    <ToolbarContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ToolbarContext.Provider>
  );
}

/**
 * A cluster of related controls — the leading and trailing groups of a title bar.
 * It changes nothing about the roving: its children are items like any others,
 * which is exactly why a group of toggles belongs here rather than in a
 * `toggle-group` (two rovings on one axis fight over `preventDefault`).
 */
export const ToolbarGroup: (props: PartProps<"div">) => ReactNode = createPart(ToolbarContext, {
  name: "ToolbarGroup",
  element: "div",
  props: (api) => api.getGroupProps(),
});

/** The toolbar's `Spacer`: what pushes the trailing group to the far edge. */
export const ToolbarSpacer: (props: PartProps<"div">) => ReactNode = createPart(ToolbarContext, {
  name: "ToolbarSpacer",
  element: "div",
  props: (api) => api.getSpacerProps(),
});

export interface ToolbarSeparatorProps
  extends toolbar.ToolbarSeparatorProps,
    PartProps<"div", toolbar.ToolbarSeparatorProps> {}

/**
 * A part of the toolbar rather than a composed `Separator`: the rule between two
 * groups is as tall as an icon and runs across the bar, where a standalone
 * separator stretches. Both sheets would be at specificity zero in the same
 * layer, so only source order would decide — four duplicated declarations against
 * a cascade accident.
 */
export function ToolbarSeparator(props: ToolbarSeparatorProps): ReactNode {
  const [separatorProps, rest] = splitProps(props, ["orientation"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ToolbarContext.usePart("ToolbarSeparator");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getSeparatorProps(separatorProps),
    elementProps,
    children,
  });
}

export interface ToolbarTitleProps
  extends toolbar.ToolbarTitleProps,
    PartProps<"h1", toolbar.ToolbarTitleProps> {}

/**
 * The title of a navigation bar — anatomy only, no state and no roving stop. It
 * renders an `h1` and the consumer picks the level that fits the page with `render`.
 */
export function ToolbarTitle(props: ToolbarTitleProps): ReactNode {
  const [titleProps, rest] = splitProps(props, ["size"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ToolbarContext.usePart("ToolbarTitle");

  return useRender({
    render,
    asChild,
    element: "h1",
    props: api.getTitleProps(titleProps),
    elementProps,
    children,
  });
}

export interface ToolbarItemProps
  extends toolbar.ToolbarItemProps,
    PartProps<"button", toolbar.ToolbarItemProps> {}

/**
 * One stop of the roving order. It is the focusable itself — compose a control
 * into it with `render`, never wrap one in it, or the bar would rove over
 * elements the browser cannot focus.
 */
export function ToolbarItem(props: ToolbarItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["value"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ToolbarContext.usePart("ToolbarItem");
  const fallback = useId();

  // Only on the element this part renders itself. A composed `<a>` or a
  // `Toggle.Root` brings its own element and its own attributes; the consumer's
  // own `type` still wins, because their props are spread last.
  const substituted = render !== undefined || asChild === true;
  const ownProps = substituted ? elementProps : { type: "button" as const, ...elementProps };

  return useRender({
    render,
    asChild,
    element: "button",
    props: api.getItemProps({ value: itemProps.value ?? fallback }),
    elementProps: ownProps,
    children,
  });
}
