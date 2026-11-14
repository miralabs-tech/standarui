import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "checkbox";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getHiddenInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "hiddenInput");
}

export function getHiddenInputEl(scope: Scope): HTMLInputElement | null {
  return scope.getById<HTMLInputElement>(getHiddenInputId(scope));
}
