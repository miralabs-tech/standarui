import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "switch";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getHiddenInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "hiddenInput");
}

export function getControlEl(scope: Scope): HTMLElement | null {
  return scope.getById(getControlId(scope));
}
