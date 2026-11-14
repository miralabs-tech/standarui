import { contains, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "pagination";

/**
 * Written out rather than read from `parts`: the anatomy builds the same
 * strings, and a component that imports its own anatomy into its DOM helpers
 * pays for the builder in every bundle that only wanted a query — the `tabs`
 * decision, kept.
 */
const ROOT_SELECTOR = '[data-part~="pagination:root"]';
const CONTROL_SELECTOR =
  '[data-part~="pagination:item"], [data-part~="pagination:prev-trigger"], [data-part~="pagination:next-trigger"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getItemId(scope: Scope, page: number): string {
  return getPartId(scope, COMPONENT, "item", String(page));
}

export function getEllipsisId(scope: Scope, index: number): string {
  return getPartId(scope, COMPONENT, "ellipsis", String(index));
}

export function getPrevTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "prev-trigger");
}

export function getNextTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "next-trigger");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/**
 * The focusable controls of the nav in DOM order — the items and the two
 * triggers, ellipses excluded because they are never focusable. Read when it is
 * needed rather than kept in a registry, and filtered to *this* root so a
 * pagination nested in another component's pagination (a table per page of an
 * outer list is an ordinary shape) never hands its controls to the wrong
 * machine.
 */
export function getControlEls(scope: Scope): HTMLElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLElement>(root, CONTROL_SELECTOR).filter(
    (control) => control.closest(ROOT_SELECTOR) === root,
  );
}

/**
 * Whether the focus is inside *this* pagination — the gate LT/RT are consumed
 * behind. Same contract as `tabs.ownsFocus`: the nearest `pagination:root`
 * ancestor decides, and `contains` covers the shadow boundary `closest` stops
 * at.
 */
export function ownsFocus(scope: Scope): boolean {
  const root = getRootEl(scope);
  const active = scope.getActiveElement();
  if (root === null || active === null) return false;
  const owner = active.closest(ROOT_SELECTOR);
  return owner === null ? contains(root, active) : owner === root;
}
