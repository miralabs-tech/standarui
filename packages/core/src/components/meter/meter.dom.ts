import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "meter";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getValueTextId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "valueText");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/**
 * `aria-labelledby` may only point at an id that exists. A gauge rendered
 * without the optional label part — the commonest way one ships — would
 * otherwise have no accessible name at all, and axe is right to call that a
 * violation.
 */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), '[data-part~="meter:label"]') !== null;
}
