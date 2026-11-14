import { queryItems } from "../../collection/dom-collection";
import { contains, query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "radio-group";
const ROOT_SELECTOR = '[data-part~="radio-group:root"]';
const ITEM_SELECTOR = '[data-part~="radio-group:item"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getItemInputId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "itemHiddenInput", value);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/** `aria-labelledby` may only point at an id that exists. */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), '[data-part~="radio-group:label"]') !== null;
}

/** The box the indicator is measured onto. The root is its containing block. */
export function getItemEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getItemId(scope, value));
}

/**
 * The items, in DOM order — which is the order the arrows rove in.
 *
 * Bounded by the container, not by a bare `querySelectorAll`: a group nested in
 * another group's item would otherwise hand its rows to the outer one, whose
 * scope would then focus and check a radio it does not own. That mattered less
 * when this list only keyed a remeasure; it drives the d-pad now.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  return queryItems(getRootEl(scope), ITEM_SELECTOR, ROOT_SELECTOR);
}

/** The item order, in DOM order. */
export function getItemValues(scope: Scope): string[] {
  return getItemEls(scope).map((item) => item.dataset.value ?? "");
}

/** The radio itself: what a move has to focus, the item being only its label. */
export function getItemInputEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getItemInputId(scope, value));
}

/** The values whose radio exists and is enabled, in DOM order: the candidate tab stops. */
export function getEnabledItemValues(scope: Scope): string[] {
  return getItemValues(scope).filter((value) => {
    const input = getItemInputEl(scope, value);
    return input !== null && !input.hasAttribute("disabled");
  });
}

/**
 * Whether the group holds the focus, and so whether a directional intent is
 * addressed to it at all. Shadow-aware through `contains`, because a consumer
 * may well have put the group inside a custom element.
 */
export function ownsFocus(scope: Scope): boolean {
  return contains(getRootEl(scope), scope.getActiveElement());
}
