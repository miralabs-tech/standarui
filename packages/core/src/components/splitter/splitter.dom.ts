import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "splitter";

export function getPanelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "panel");
}

export function getHandleId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "handle");
}

export function getPanelEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPanelId(scope));
}

export function getHandleEl(scope: Scope): HTMLElement | null {
  return scope.getById(getHandleId(scope));
}
