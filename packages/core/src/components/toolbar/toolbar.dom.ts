import { queryItems } from "../../collection/dom-collection";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "toolbar";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/**
 * The item order is the DOM order, read when it is needed rather than kept in a
 * registry the consumer would have to maintain. The container filter is what makes
 * a toolbar nested inside another one harmless: an item answers to the toolbar it
 * is closest to, and to no other.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  return queryItems(getRootEl(scope), '[data-part~="toolbar:item"]', '[data-part~="toolbar:root"]');
}

export function getItemValues(scope: Scope): string[] {
  return getItemEls(scope).map((item) => item.dataset.value ?? "");
}

export function getCurrentValue(scope: Scope): string | null {
  const current = getItemEls(scope).find(
    (item) => item.getAttribute("aria-current") === "page" && !item.hasAttribute("disabled"),
  );
  return current === undefined ? null : (current.dataset.value ?? "");
}
