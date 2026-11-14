import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "clipboard";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "input");
}

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

export function getInputEl(scope: Scope): HTMLInputElement | null {
  return scope.getById<HTMLInputElement>(getInputId(scope));
}
