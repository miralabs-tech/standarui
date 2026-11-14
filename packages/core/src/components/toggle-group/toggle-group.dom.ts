import { query, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "toggle-group";

export function getFrameId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "frame");
}

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getScrollbarId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "scrollbar");
}

export function getThumbId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "thumb");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getScrollbarEl(scope: Scope): HTMLElement | null {
  return scope.getById(getScrollbarId(scope));
}

export function getThumbEl(scope: Scope): HTMLElement | null {
  return scope.getById(getThumbId(scope));
}

/**
 * The item order is the DOM order, read when it is needed rather than kept in a
 * registry the consumer would have to maintain. A composite that has to be told
 * about its own children is a composite that goes out of sync the first time one
 * is added conditionally.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLElement>(root, '[data-part~="toggle-group:item"]');
}

export function getItemValues(scope: Scope): string[] {
  return getItemEls(scope).map((item) => item.dataset.value ?? "");
}

export function getItemEl(scope: Scope, value: string): HTMLElement | null {
  return getItemEls(scope).find((item) => item.dataset.value === value) ?? null;
}

/**
 * `aria-labelledby` may only point at an id that exists, so whether the label
 * part was rendered is a fact to read rather than assume.
 */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), '[data-part~="toggle-group:label"]') !== null;
}
