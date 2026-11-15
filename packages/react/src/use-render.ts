/**
 * Composition, in the Base UI shape (`render`) with the Radix spelling
 * (`asChild`) kept as an alias — both end at the same place, and neither is worth
 * making somebody relearn.
 *
 * The merge order is the core's `mergeProps` rule, and it is the whole point:
 * the consumer's values win, but the consumer's handlers run *first*, so their
 * `preventDefault()` is a real veto over the machine's own handler.
 */

import { type AnyProps, mergeProps, toKebabCase } from "@standarui/core";
import {
  Children,
  cloneElement,
  createElement,
  type ElementType,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useMemo,
  useRef,
} from "react";
import { composeRefs } from "./compose-refs";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

/**
 * Handed the part's props to place itself. It must forward `props.ref` to the
 * element it renders: the part's core styles are written on that node by the
 * CSSOM after mount, and a function that drops the ref leaves them unwritten.
 */
export type RenderFunction = (props: AnyProps) => ReactNode;

/** An element to clone, or a function handed the props to place itself. */
export type RenderProp = ReactElement | RenderFunction;

export interface RenderableProps {
  readonly render?: RenderProp | undefined;
  readonly asChild?: boolean | undefined;
}

export interface RenderOptions extends RenderableProps {
  /** What the part renders when nothing is substituted. */
  readonly element: ElementType;
  /**
   * The prop getter's output, already normalized. Typed as `object` rather than a
   * record: `normalizeProps.button(…)` hands back React's own props type, which
   * has no index signature and would not satisfy a `Record<string, unknown>`.
   */
  readonly props: object;
  /**
   * What the consumer put on the part — `className`, `ref`, their own `onClick`.
   * Merged here rather than by each component so the one cast this needs lives in
   * one place, and so the ordering rule is stated once.
   */
  readonly elementProps?: object | undefined;
  readonly children?: ReactNode;
}

function onlyElement(children: ReactNode): ReactElement | null {
  const child = Children.only(children);
  return isValidElement(child) ? child : null;
}

type Written = readonly [text: string, applied: string];

const NO_WRITES: ReadonlyMap<string, Written> = new Map();

const SIDE = /-(?:top|right|bottom|left|block|inline|x|y)(?:-(?:start|end))?(?=-width$|$)/;

function propertyName(key: string): string {
  return key.startsWith("--") ? key : toKebabCase(key);
}

function styleProperties(style: unknown): string[] {
  return typeof style === "object" && style !== null ? Object.keys(style).map(propertyName) : [];
}

function sharesDeclaration(core: string, consumer: string): boolean {
  return core === consumer || (!consumer.startsWith("--") && core === consumer.replace(SIDE, ""));
}

export function useRender(options: RenderOptions): ReactNode {
  const { render, asChild, element, props, elementProps, children } = options;

  const target = asChild === true ? onlyElement(children) : (render ?? null);
  const substituted = typeof target === "object" && target !== null ? target.props : undefined;

  const node = useRef<unknown>(null);

  // **`ref` is chained, not overwritten, and it is the one prop that has to be.**
  // `mergeProps` is later-wins, and React 19 carries `ref` as a plain prop — so a
  // consumer putting their own ref on a part silently *replaced* the part's, and
  // whatever the part needed the node for stopped happening. It was found through
  // the accordion, where the part's ref is what writes `hidden="until-found"`:
  // pass a ref and Ctrl+F quietly stopped revealing the panel. Chained here rather
  // than in each component, because the failure is silent and every part is
  // exposed to it. Memoised on the two refs: a fresh callback every render would
  // detach and re-attach on each pass, tearing down anything a consumer installed
  // in their own callback. The node the core's styles are written on is captured by
  // an internal ref chained in the same memo, so its identity is as stable.
  const machineRef = (props as AnyProps)["ref"] as Ref<never> | undefined;
  const consumerRef = (elementProps as AnyProps | undefined)?.["ref"] as Ref<never> | undefined;
  const substitutedRef = (substituted as AnyProps | undefined)?.["ref"] as Ref<never> | undefined;
  const chained = useMemo(
    () => composeRefs(node as Ref<never>, machineRef, consumerRef, substitutedRef),
    [machineRef, consumerRef, substitutedRef],
  );

  // The machine's props first, then the consumer's: later wins for values, and
  // handlers run in reverse — theirs before the machine's, which is what makes
  // `preventDefault()` a veto rather than a suggestion. The machine's `style` is
  // taken out first: it is written on the node by the CSSOM below, never rendered.
  const { style: machineStyle, ...machineProps } = props as AnyProps;
  const base = mergeProps(machineProps, elementProps as AnyProps | undefined);
  const own = { ...base, ref: chained };

  const consumerProperties = [
    ...styleProperties(base["style"]),
    ...styleProperties((substituted as AnyProps | undefined)?.["style"]),
  ];
  const written = useRef<ReadonlyMap<string, Written>>(NO_WRITES);
  useSafeLayoutEffect(() => {
    const style = (node.current as Partial<ElementCSSInlineStyle> | null)?.style;
    if (typeof style?.setProperty !== "function") {
      written.current = NO_WRITES;
      return;
    }
    const isConsumers = (name: string): boolean =>
      consumerProperties.some((property) => sharesDeclaration(name, property));
    const next = new Map<string, Written>();
    for (const [key, value] of Object.entries(machineStyle ?? {})) {
      const name = propertyName(key);
      if (value == null || (typeof value !== "string" && !name.startsWith("--"))) continue;
      if (isConsumers(name)) continue;
      const text = String(value);
      const previous = written.current.get(name);
      if (previous?.[0] !== text || style.getPropertyValue(name) !== previous[1]) {
        style.setProperty(name, text);
      }
      next.set(name, [text, style.getPropertyValue(name)]);
    }
    for (const [name, [, applied]] of written.current) {
      if (!next.has(name) && !isConsumers(name) && style.getPropertyValue(name) === applied) {
        style.removeProperty(name);
      }
    }
    written.current = next;
  });

  if (target === null) return createElement(element, own, children);

  if (typeof target === "function") return target({ ...own, children });

  // In `asChild` the target *is* the children, so passing them down would nest the
  // element inside itself; `render` keeps the part's children unless the
  // substituted element brought its own. `mergeProps` ignores `undefined`, which
  // is what makes the first argument a defaulting one. The refs are the exception
  // to later-wins: the substituted element's own ref is chained after the part's.
  const placed = mergeProps(
    { children: asChild === true ? undefined : children },
    own,
    substituted as AnyProps,
  );
  return cloneElement(target, { ...placed, ref: chained } as object);
}
