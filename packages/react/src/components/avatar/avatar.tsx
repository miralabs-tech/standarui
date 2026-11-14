/**
 * Three parts and no logic: the adapter's whole job here is to let `src` and
 * `alt` through to a real `<img>` and to keep the machine's `onLoad`/`onError`
 * on it. React replaces nodes rather than mutating them, so the handlers riding
 * on the prop getter are what re-attach themselves after a swap — the core's
 * `MutationObserver` covers the other direction, for consumers who write the
 * attribute themselves.
 */

import * as avatar from "@standarui/core/avatar";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type AvatarApi = avatar.AvatarApi<ReactPropTypes>;

const AvatarContext = createPartContext<AvatarApi>("Avatar");

export interface UseAvatarProps extends avatar.AvatarMachineProps, MachineRuntimeProps {}

/** The api behind the components — prop getters, status, nothing rendered. */
export function useAvatar(props: UseAvatarProps): AvatarApi {
  return avatar.connect(useMachine(avatar.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "size",
  "fallbackDelay",
  "label",
  "onStatusChange",
] as const;

export interface AvatarRootProps extends UseAvatarProps, PartProps<"span", UseAvatarProps> {}

export function AvatarRoot(props: AvatarRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useAvatar(machineProps);

  return (
    <AvatarContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        // A `<span>`: an avatar sits in a line of text as often as in a grid,
        // and an inline box is the one a consumer cannot add back.
        element: "span",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </AvatarContext.Provider>
  );
}

export const AvatarImage: (props: PartProps<"img">) => ReactNode = createPart(AvatarContext, {
  name: "AvatarImage",
  element: "img",
  props: (api) => api.getImageProps(),
});

export const AvatarFallback: (props: PartProps<"span">) => ReactNode = createPart(AvatarContext, {
  name: "AvatarFallback",
  element: "span",
  props: (api) => api.getFallbackProps(),
});
