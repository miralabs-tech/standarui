import { contains, query, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "breadcrumb";

/**
 * Written out rather than read from `parts`: the anatomy builds the same
 * strings, and a component that imports its own anatomy into its DOM helpers
 * pays for the builder in every bundle that only wanted a query — the `tabs`
 * decision, kept.
 */
const LIST_SELECTOR = '[data-part~="breadcrumb:list"]';
const COLLAPSED_ITEM_SELECTOR = '[data-part~="breadcrumb:item"][data-collapsed]';
const LINK_SELECTOR = '[data-part~="breadcrumb:link"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getListId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "list");
}

export function getEllipsisTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "ellipsis-trigger");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getListEl(scope: Scope): HTMLElement | null {
  return scope.getById(getListId(scope));
}

export function getEllipsisTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getEllipsisTriggerId(scope));
}

/**
 * The first link inside a collapsed item of *this* list, in DOM order — where
 * the focus lands after a keyboard or gamepad reveal. Filtered to this list the
 * way `tabs` filters its triggers: a breadcrumb nested in another component's
 * markup is an ordinary shape, and `querySelectorAll` from the list would
 * otherwise hand back a stranger's crumbs.
 */
export function getFirstCollapsedLinkEl(scope: Scope): HTMLElement | null {
  const list = getListEl(scope);
  if (list === null) return null;
  for (const item of queryAll<HTMLElement>(list, COLLAPSED_ITEM_SELECTOR)) {
    if (item.closest(LIST_SELECTOR) !== list) continue;
    const link = query<HTMLElement>(item, LINK_SELECTOR);
    if (link !== null) return link;
  }
  return null;
}

/**
 * Whether the focus currently sits inside a collapsed item of this list — read
 * *before* the render that hides it, because after that render the browser has
 * already ejected the focus to `body` and the fact is unrecoverable.
 */
export function isActiveElementInCollapsedRun(scope: Scope): boolean {
  const list = getListEl(scope);
  const active = scope.getActiveElement();
  if (list === null || active === null) return false;
  const item = active.closest(COLLAPSED_ITEM_SELECTOR);
  return item !== null && contains(list, item);
}
