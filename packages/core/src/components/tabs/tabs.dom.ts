import { contains, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "tabs";

/**
 * Written out rather than read from `parts`: the anatomy builds the same two
 * strings, and a component that imports its own anatomy into its DOM helpers pays
 * for the builder in every bundle that only wanted a query.
 */
const ROOT_SELECTOR = '[data-part~="tabs:root"]';
const TRIGGER_SELECTOR = '[data-part~="tabs:trigger"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getListId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "list");
}

export function getScrollbarId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "scrollbar");
}

export function getThumbId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "thumb");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
}

export function getTriggerId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "trigger", value);
}

export function getContentId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "content", value);
}

export function getCloseTriggerId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "close-trigger", value);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getListEl(scope: Scope): HTMLElement | null {
  return scope.getById(getListId(scope));
}

export function getScrollbarEl(scope: Scope): HTMLElement | null {
  return scope.getById(getScrollbarId(scope));
}

export function getThumbEl(scope: Scope): HTMLElement | null {
  return scope.getById(getThumbId(scope));
}

export function getTriggerEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getTriggerId(scope, value));
}

export function getContentEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getContentId(scope, value));
}

/**
 * The trigger order is the DOM order, read when it is needed rather than kept in
 * a registry the consumer would have to maintain — the same decision as
 * `toggle-group`, for the same reason: a composite that has to be told about its
 * own children goes out of sync the first time one is rendered conditionally.
 *
 * The filter is what `toggle-group` never needed. A `tabs` inside a panel of
 * another `tabs` is an ordinary shape, and `querySelectorAll` from the outer root
 * would hand the outer machine the inner tabs' triggers — an `activeIndex` and an
 * indicator measured against a list nobody is looking at.
 */
export function getTriggerEls(scope: Scope): HTMLElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLElement>(root, TRIGGER_SELECTOR).filter(
    (trigger) => trigger.closest(ROOT_SELECTOR) === root,
  );
}

export function getTriggerValues(scope: Scope): string[] {
  return getTriggerEls(scope).map((trigger) => trigger.dataset.value ?? "");
}

/**
 * Whether the focus is inside *this* tabs and not inside a `tabs` nested in it.
 *
 * The nearest `tabs:root` ancestor decides, and deliberately not the order of the
 * intent scope stack: React runs a child's effects before its parent's, so a
 * nested `tabs` pushes its scope *under* the one that contains it and the stack
 * would answer with the outer machine. `closest` reads the tree, which is the
 * thing that is actually nested.
 *
 * `contains` is the shadow-aware half: `closest` stops at a shadow boundary, so a
 * focus inside an open shadow root answers `null` and falls back to containment,
 * which is the right answer — a shadow tree with its own `tabs` in it is its own
 * component either way.
 */
export function ownsFocus(scope: Scope): boolean {
  const root = getRootEl(scope);
  const active = scope.getActiveElement();
  if (root === null || active === null) return false;
  const owner = active.closest(ROOT_SELECTOR);
  return owner === null ? contains(root, active) : owner === root;
}

/** Whether the focus is on one of the triggers rather than out in a panel. */
export function isFocusInList(scope: Scope): boolean {
  return contains(getListEl(scope), scope.getActiveElement());
}
