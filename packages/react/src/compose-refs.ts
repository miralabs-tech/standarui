/**
 * React 19 made `ref` a plain prop, so composition is the only thing left to
 * write: a part that needs the node for itself must still hand it to whoever put
 * a ref on the element.
 *
 * The composed callback returns a cleanup, which is React 19's protocol: a ref
 * that returned its own cleanup is torn down with it, and one that did not is
 * detached the old way, with a `null` call. Mixing the two is what makes this
 * worth a file — an observer installed in a consumer's ref callback would
 * otherwise leak, or be cleaned twice.
 */

import type { Ref } from "react";

// biome-ignore lint/suspicious/noConfusingVoidType: React's own RefCallback return type.
type RefCleanup = VoidFunction | void;

function assign<T>(ref: Ref<T> | undefined, node: T | null): RefCleanup {
  if (ref == null) return;
  if (typeof ref === "function") return ref(node) as RefCleanup;
  (ref as { current: T | null }).current = node;
}

export function composeRefs<T>(
  ...refs: readonly (Ref<T> | undefined)[]
): (node: T | null) => VoidFunction {
  return (node: T | null): VoidFunction => {
    const cleanups = refs.map((ref) => {
      const cleanup = assign(ref, node);
      return typeof cleanup === "function" ? cleanup : (): void => void assign(ref, null);
    });
    return (): void => {
      for (let index = cleanups.length - 1; index >= 0; index--) cleanups[index]?.();
    };
  };
}
