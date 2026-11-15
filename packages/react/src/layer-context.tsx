/**
 * Which layer a portalled surface was opened from — the one thing a dialog, a
 * popover, a menu and a tooltip have to be able to tell each other, and the only
 * thing.
 *
 * Once two surfaces are portalled they are DOM siblings, so `contains` cannot see
 * that one belongs to the other and parenthood has to be *declared*
 * (`layer-stack.ts` chains on the declaration, never on containment). The dialog
 * declared it through a context private to its own module, which works exactly as
 * long as the outer surface and the inner one are the same component. A popover
 * inside a dialog had no path to that context: it would register as a root layer,
 * and a press inside it would read as an interaction outside the dialog and take
 * the dialog down with it.
 *
 * So the parenthood lives here instead of in any one component's folder — same
 * reason as `field-context`, and the same shape. A surface provides it; a surface
 * reads it; nothing else in the library knows it exists.
 */

import { type ReactNode, useMemo } from "react";
import { createPartContext } from "./part-context";

interface LayerContextValue {
  /**
   * The id of the *surface*, not of the trigger that opens it. A trigger sits in
   * the layer above the one it opens, so naming it here would chain the stack one
   * link short.
   */
  readonly layerId: string;
}

const LayerContext = createPartContext<LayerContextValue>("Layer");

export interface LayerProviderProps {
  readonly layerId: string;
  readonly children?: ReactNode;
}

/**
 * Wraps a surface's subtree, including the parts rendered through its portal.
 * Memoised on the id so the identity is as stable as the layer is: a surface's
 * own context value changes on every render because it carries the api, and a
 * nested surface has no business re-rendering for that.
 */
export function LayerProvider({ layerId, children }: LayerProviderProps): ReactNode {
  const value = useMemo(() => ({ layerId }), [layerId]);
  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>;
}

/** `undefined` at the top level — which is how a surface knows it is a root layer. */
export function useParentLayerId(): string | undefined {
  return LayerContext.useOptional()?.layerId;
}
