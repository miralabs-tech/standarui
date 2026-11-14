import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "button";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLoadingIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "loadingIndicator");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}
