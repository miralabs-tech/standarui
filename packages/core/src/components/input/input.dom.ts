import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "input";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getVisibilityTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "visibilityTrigger");
}

export function getControlEl(scope: Scope): HTMLElement | null {
  return scope.getById(getControlId(scope));
}
