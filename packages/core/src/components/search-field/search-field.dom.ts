import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "search-field";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getFieldId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "field");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getClearTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "clearTrigger");
}

export function getCancelTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "cancelTrigger");
}

export function getControlEl(scope: Scope): HTMLElement | null {
  return scope.getById(getControlId(scope));
}
