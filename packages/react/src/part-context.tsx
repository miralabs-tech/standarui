/**
 * A component's parts share one thing: the api its root connected. This is that
 * context, with the error message a consumer actually needs when they render a
 * part outside its root.
 *
 * Not exported from the package root — it is component plumbing, and a consumer
 * writing their own component has `useMachine` and `connect`, which is the same
 * thing without the indirection.
 */

import { invariant } from "@standarui/core";
import { createContext, type ReactNode, useContext } from "react";

export interface PartContext<T> {
  Provider(props: { readonly value: T; readonly children: ReactNode }): ReactNode;
  /** `part` is the component name to name in the error, not a lookup key. */
  usePart(part: string): T;
  /**
   * For the contexts a component may legitimately be outside of — a field wraps
   * a control, but a control on its own is not a mistake.
   */
  useOptional(): T | null;
}

export function createPartContext<T>(component: string): PartContext<T> {
  const Context = createContext<T | null>(null);

  function Provider({ value, children }: { value: T; children: ReactNode }): ReactNode {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function usePart(part: string): T {
    const value = useContext(Context);
    invariant(value !== null, `<${part}> must be rendered inside <${component}Root>`);
    return value;
  }

  function useOptional(): T | null {
    return useContext(Context);
  }

  return { Provider, usePart, useOptional };
}
