/**
 * The core never portals — that is rendering, so it belongs to the adapter
 * (research/core.md §5, piège 2). What the core does instead is make portalling
 * safe: outside-clicks are resolved through the logical layer stack rather than
 * `element.contains`, and Tab is proxied across the portal boundary.
 *
 * **The container is resolved during the render on a client mount, and one commit
 * later while hydrating.** The first half is the original rule and it holds:
 * deferring unconditionally renders nothing on the first pass, and a machine whose
 * surface is portalled then starts against an empty document — the interpreter
 * installs a state's effects in the layout effect of the commit that entered the
 * state, every one of them looks its node up by id, and a node that arrives one
 * commit later finds the focus trap, the dismissable layer and the scroll lock all
 * installed against nothing, with nothing to re-install them. Measured, not
 * feared: deferring in every case failed 27 tests across the eight portalled
 * components.
 *
 * The second half is a correction. What used to stand here — "React never hydrates
 * through a portal, so resolving early costs no mismatch" — was wrong, and the
 * documentation site is where it showed. `select` and `toast`, the two surfaces a
 * page ships *rendered while closed*, logged React #418 on every load: the server
 * has no document and rendered nothing, the client resolved the container in that
 * same first pass and rendered a portal. Trees that differ by a node differ in
 * `useId` too — the markup carried `…R_2_:trigger` where the client wanted
 * `…R_1_:positioner`.
 *
 * `useSyncExternalStore` tells the two situations apart, and no other hook does:
 * React reads `getServerSnapshot` for a tree it is hydrating and `getSnapshot` for
 * one mounted fresh. So a client mount keeps the immediate resolution it always
 * had, and a hydrating tree renders `null`, agrees with the server, then picks the
 * container up in the layout effect of that same commit — before the paint.
 *
 * What is left is inherent to the boundary: a surface that hydrates *already open*
 * still has one commit in which its machine's effects find no node. No portal can
 * be server-rendered, so no arrangement of this file closes that window.
 */

import { type ReactNode, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDocument } from "./environment";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

function unsubscribe(): void {}

function subscribe(): () => void {
  return unsubscribe;
}

function getClientSnapshot(): boolean {
  return false;
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * True for the SSR render and for the hydration render that has to match it; false
 * for a tree mounted fresh on the client. `useSyncExternalStore` is the only hook
 * that tells the two apart — React reads `getServerSnapshot` for a hydrating tree
 * and `getSnapshot` for one mounted fresh.
 */
export function useHydrating(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

export interface PortalProps {
  readonly children?: ReactNode;
  /** Defaults to the body of the nearest root node. */
  readonly container?: Element | null | (() => Element | null) | undefined;
  /** Renders in place instead — the escape hatch for a nested-layout case. */
  readonly disabled?: boolean | undefined;
}

type Container = PortalProps["container"];

function resolve(container: Container): Element | null {
  return (typeof container === "function" ? container() : container) ?? null;
}

export function Portal(props: PortalProps): ReactNode {
  const { children, container, disabled } = props;
  const getDocument = useDocument();
  const hydrating = useHydrating();

  const [mountNode, setMountNode] = useState<Element | null>(() => {
    if (hydrating || disabled === true || typeof document === "undefined") return null;
    const resolved = resolve(container);
    // A container the consumer named but has not mounted yet waits for the effect.
    // Falling back to the body would put the subtree in the wrong place for a
    // commit, which is worse than the frame it costs to be right.
    if (resolved === null && container !== undefined) return null;
    return resolved ?? getDocument().body;
  });

  useSafeLayoutEffect(() => {
    if (disabled === true) return;
    setMountNode(resolve(container) ?? getDocument().body);
  }, [container, disabled, getDocument]);

  if (disabled === true) return children;
  if (mountNode === null) return null;
  return createPortal(children, mountNode);
}
