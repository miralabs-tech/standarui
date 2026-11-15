/**
 * Most parts are the same eight lines: read the api from the component's context,
 * hand its prop getter to `useRender`, let the consumer's own props and `render`
 * through. A component with eight parts should not restate that eight times —
 * what differs is the getter and the default element, so those are the arguments.
 *
 * Roots keep their own function: they own the machine, and several of them infer
 * something from what they are about to render.
 */

import type { ComponentPropsWithRef, ElementType, ReactNode } from "react";
import type { PartContext } from "./part-context";
import { type RenderableProps, useRender } from "./use-render";

/**
 * Everything the element accepts, plus composition. `Own` is the machine's own
 * props: a root declares them itself, and the element's versions of `id`, `dir`
 * or `defaultValue` have to step aside rather than clash — they mean something
 * different here (`id` is the scope id, not the DOM one).
 */
export type PartProps<E extends ElementType = "div", Own = unknown> = RenderableProps &
  Omit<ComponentPropsWithRef<E>, "children" | keyof Own> & {
    readonly children?: ReactNode;
  };

export interface PartOptions<Api> {
  /** Named in the error when the part is rendered outside its root. */
  readonly name: string;
  readonly element: ElementType;
  props(api: Api): object;
}

export function createPart<Api, E extends ElementType = "div">(
  context: PartContext<Api>,
  options: PartOptions<Api>,
): (props: PartProps<E>) => ReactNode {
  return function Part(props: PartProps<E>): ReactNode {
    const { render, asChild, children, ...elementProps } = props;
    const api = context.usePart(options.name);

    return useRender({
      render,
      asChild,
      element: options.element,
      props: options.props(api),
      elementProps,
      children,
    });
  };
}
