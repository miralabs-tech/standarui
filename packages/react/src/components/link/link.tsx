/**
 * The React layer of the link: a root that owns the machine, two companion parts
 * for the outbound affordance, and `useLink` underneath for anyone who would
 * rather place the props themselves.
 *
 * `nativeLink` is inferred here because this is the only layer that knows what is
 * about to be rendered, and the inference deliberately leans the other way from
 * the button's. There, anything substituted is assumed *not* to be a button; here
 * the overwhelming substitution is a router's `Link`, which renders an `<a>`. The
 * asymmetry is a cost comparison, not a preference:
 *
 *   - guessing `false` on something that really is an `<a>` fires `onPress` twice
 *     on Enter — the synthesised `ROOT.PRESS` plus the browser's own click;
 *   - guessing `true` on a `<div>` costs the link role and Enter, on a root
 *     nobody writes by accident and which the `nativeLink` prop overrides.
 *
 * So only an intrinsic element that is *not* `"a"` answers false. A component —
 * a router's link, a styled wrapper — answers true.
 */

import * as link from "@standarui/core/link";
import { Children, isValidElement, type ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { type RenderProp, useRender } from "../../use-render";

export type LinkApi = link.LinkApi<ReactPropTypes>;

const LinkContext = createPartContext<LinkApi>("Link");

export interface UseLinkProps extends link.LinkMachineProps, MachineRuntimeProps {}

/** The api behind the components — prop getters, state, nothing rendered. */
export function useLink(props: UseLinkProps): LinkApi {
  return link.connect(useMachine(link.machine, props), normalizeProps);
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "href",
  "target",
  "rel",
  "external",
  "current",
  "variant",
  "underline",
  "disabled",
  "focusableWhenDisabled",
  "nativeLink",
  "onPress",
] as const;

export interface LinkRootProps extends UseLinkProps, PartProps<"a", UseLinkProps> {}

function onlyElement(children: ReactNode): ReactNode {
  // `Children.only` throws on anything but exactly one child, and a root with two
  // children under `asChild` is the consumer's bug to hear about from `useRender`,
  // not a reason for this inference to blow up first.
  return Children.count(children) === 1 ? Children.toArray(children)[0] : undefined;
}

/** `false` only when the element being rendered is an intrinsic that is not `<a>`. */
function isNativeLink(
  render: RenderProp | undefined,
  asChild: boolean | undefined,
  children: ReactNode,
): boolean {
  const target = asChild === true ? onlyElement(children) : render;
  if (target === undefined || !isValidElement(target)) return true;
  return typeof target.type === "string" ? target.type === "a" : true;
}

export function LinkRoot(props: LinkRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;

  const api = useLink({
    nativeLink: isNativeLink(render, asChild, children),
    ...machineProps,
  });

  return (
    <LinkContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "a",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </LinkContext.Provider>
  );
}

/**
 * Wraps the outbound glyph. Its children are the consumer's own inline SVG — a
 * text character would sit on its baseline rather than in the middle of its box,
 * which is not the same shape at every font size.
 */
export const LinkExternalIcon: (props: PartProps<"span">) => ReactNode = createPart(LinkContext, {
  name: "LinkExternalIcon",
  element: "span",
  props: (api) => api.getExternalIconProps(),
});

/**
 * The "opens in a new tab" wording, inside the anchor so it joins the accessible
 * name with no `aria-describedby` to keep in sync. The stylesheet hides it
 * visually; the text itself is the consumer's, and so is its language.
 */
export const LinkExternalLabel: (props: PartProps<"span">) => ReactNode = createPart(LinkContext, {
  name: "LinkExternalLabel",
  element: "span",
  props: (api) => api.getExternalLabelProps(),
});
