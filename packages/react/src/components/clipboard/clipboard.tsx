/**
 * The clipboard in React: one machine on the root, six parts reading it.
 *
 * The indicator is the only part that takes an argument, and it is why it takes
 * one: the pair renders twice — a resting glyph and a copied one — and `copied`
 * says which of the two this element is. `connect` decides which is `hidden`, so
 * both stay mounted and the swap costs no remount.
 */

import * as clipboard from "@standarui/core/clipboard";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ClipboardApi = clipboard.ClipboardApi<ReactPropTypes>;

const ClipboardContext = createPartContext<ClipboardApi>("Clipboard");

export interface UseClipboardProps extends clipboard.ClipboardMachineProps, MachineRuntimeProps {}

export function useClipboard(props: UseClipboardProps): ClipboardApi {
  return clipboard.connect(useMachine(clipboard.machine, props), normalizeProps);
}

/** The api of the clipboard a subtree sits in — for a consumer's own chrome. */
export function useClipboardContext(): ClipboardApi {
  return ClipboardContext.usePart("ClipboardContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "value",
  "defaultValue",
  "disabled",
  "copiedDuration",
  "copiedText",
  "copyFailedText",
  "copyLabel",
  "onValueChange",
  "onCopiedChange",
  "onCopyError",
] as const;

export interface ClipboardRootProps
  extends UseClipboardProps,
    PartProps<"div", UseClipboardProps> {}

export function ClipboardRoot(props: ClipboardRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useClipboard(machineProps);

  return (
    <ClipboardContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ClipboardContext.Provider>
  );
}

/**
 * Only worth rendering next to the input part: its `for` names the input, and a
 * `for` with no target names nothing.
 */
export const ClipboardLabel: (props: PartProps<"label">) => ReactNode = createPart(
  ClipboardContext,
  { name: "ClipboardLabel", element: "label", props: (api) => api.getLabelProps() },
);

export const ClipboardControl: (props: PartProps<"div">) => ReactNode = createPart(
  ClipboardContext,
  { name: "ClipboardControl", element: "div", props: (api) => api.getControlProps() },
);

/**
 * Always read-only: it displays the value and it is the manual fallback — it
 * selects itself on focus, so Ctrl/Cmd+C is one keystroke away when the
 * Clipboard API refuses. An editable flow composes `<InputRoot>` with
 * `api.setValue` instead.
 */
export const ClipboardInput: (props: PartProps<"input">) => ReactNode = createPart(
  ClipboardContext,
  { name: "ClipboardInput", element: "input", props: (api) => api.getInputProps() },
);

export const ClipboardTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  ClipboardContext,
  { name: "ClipboardTrigger", element: "button", props: (api) => api.getTriggerProps() },
);

export interface ClipboardIndicatorProps
  extends clipboard.ClipboardIndicatorPartProps,
    PartProps<"span", clipboard.ClipboardIndicatorPartProps> {}

export function ClipboardIndicator(props: ClipboardIndicatorProps): ReactNode {
  const [indicatorProps, rest] = splitProps(props, ["copied"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ClipboardContext.usePart("ClipboardIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getIndicatorProps(indicatorProps),
    elementProps,
    children,
  });
}
