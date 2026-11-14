/**
 * The pattern every T1a component follows: a root that owns the machine and
 * publishes its api, parts that read it, and a `use*` hook underneath for anyone
 * who would rather place the props themselves.
 *
 * `nativeButton` is inferred from what is actually rendered. A substituted `<a>`
 * or `<div>` needs `role="button"`, a tab index and synthesised Enter/Space; a
 * real `<button>` needs none of it and must keep its native click, or a submit
 * button stops submitting. The adapter is the only layer that knows which one it
 * is about to render, so it is the layer that says so.
 */

import * as button from "@standarui/core/button";
import { isValidElement, type ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { type RenderProp, useRender } from "../../use-render";

export type ButtonApi = button.ButtonApi<ReactPropTypes>;

const ButtonContext = createPartContext<ButtonApi>("Button");

export interface UseButtonProps extends button.ButtonMachineProps, MachineRuntimeProps {}

/** The api behind the components — prop getters, state, nothing rendered. */
export function useButton(props: UseButtonProps): ButtonApi {
  return button.connect(useMachine(button.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "type",
  "variant",
  "size",
  "disabled",
  "loading",
  "loadingText",
  "focusableWhenDisabled",
  "nativeButton",
  "onPress",
] as const;

export interface ButtonRootProps extends UseButtonProps, PartProps<"button", UseButtonProps> {}

/** `false` when the element being rendered is not a real `<button>`. */
function isNativeButton(render: RenderProp | undefined, asChild: boolean | undefined): boolean {
  if (asChild === true) return false;
  if (render === undefined) return true;
  // A render function can produce anything; assuming a button would hand it the
  // one behaviour it cannot opt out of.
  if (!isValidElement(render)) return false;
  return render.type === "button";
}

export function ButtonRoot(props: ButtonRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;

  const api = useButton({
    nativeButton: isNativeButton(render, asChild),
    ...machineProps,
  });

  return (
    <ButtonContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "button",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ButtonContext.Provider>
  );
}

export type ButtonLoadingIndicatorProps = PartProps<"span">;

export function ButtonLoadingIndicator(props: ButtonLoadingIndicatorProps): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = ButtonContext.usePart("ButtonLoadingIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getLoadingIndicatorProps(),
    elementProps,
    children,
  });
}
