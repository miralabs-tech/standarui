import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "collapsible";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}
