import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "drawer";

export function getPositionerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "positioner");
}

export function getBackdropId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "backdrop");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getGrabberId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "grabber");
}

export function getPositionerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPositionerId(scope));
}

export function getBackdropEl(scope: Scope): HTMLElement | null {
  return scope.getById(getBackdropId(scope));
}

/**
 * By id rather than by walking down: the surface this decorates is portalled, so
 * there is no ancestor to walk from. The drawer's own id is distinct from the
 * dialog's even though both land on the same element — two identities, two ids,
 * and each machine finds its own.
 */
export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

export function getGrabberEl(scope: Scope): HTMLElement | null {
  return scope.getById(getGrabberId(scope));
}

/**
 * The node the environment resolves against. Never `scope.getDoc()`, which throws
 * where there is no document — a machine that reaches for one cannot be started in
 * a plain node test, and every machine here has to be.
 */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  const rendered = getContentEl(scope);
  if (rendered !== null) return rendered;
  const root = scope.getRootNode();
  if (root === null) return null;
  return (root.ownerDocument ?? (root as Document)).documentElement;
}
