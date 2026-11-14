/**
 * **The option collection is read from the live DOM, never held in context** —
 * the menu's doctrine, inherited with the shared reader it was factored into
 * (`collection/dom-collection`, whose header names `select` as the next
 * consumer). What stays here is this component's own selectors and ids.
 */

import {
  getItemLabel as domItemLabel,
  findItemByValue,
  queryItems,
} from "../../collection/dom-collection";
import { contains } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

export { getItemValue, isItemDisabled } from "../../collection/dom-collection";

const COMPONENT = "select";

/**
 * Written out rather than derived from `parts`: the anatomy builds the same
 * strings, and a component that imports its own anatomy into its DOM helpers pays
 * for the builder in every bundle that only wanted a query.
 */
const CONTENT_SELECTOR = '[data-part~="select:content"]';

/**
 * One identity, unlike the menu's three. The sheet's Cancel button is
 * deliberately **not** part of it: an option collection is what a `listbox`
 * owns, the cancel is a sibling of the listbox in the positioner, and folding
 * it in would make `End` land on a control that is not an option.
 */
export const ITEM_SELECTOR = '[data-part~="select:item"]';

const ITEM_TEXT_SELECTOR = '[data-part~="select:item-text"]';
const SYMBOL_SELECTOR = '[data-part~="select:item-symbol"]';

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getValueTextId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "value-text");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
}

export function getHiddenSelectId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "hidden-select");
}

export function getBackdropId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "backdrop");
}

export function getPositionerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "positioner");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getItemGroupId(scope: Scope, key: string): string {
  return getPartId(scope, COMPONENT, "item-group", key);
}

export function getItemGroupLabelId(scope: Scope, key: string): string {
  return getPartId(scope, COMPONENT, "item-group-label", key);
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getCancelTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "cancel-trigger");
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

export function getHiddenSelectEl(scope: Scope): HTMLSelectElement | null {
  return scope.getById<HTMLSelectElement>(getHiddenSelectId(scope));
}

export function getBackdropEl(scope: Scope): HTMLElement | null {
  return scope.getById(getBackdropId(scope));
}

/** The floating element: what gets the translate, never the content. */
export function getPositionerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPositionerId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

export function getCancelTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getCancelTriggerId(scope));
}

/**
 * This select's own options, in DOM order. The container filter is what a flat
 * query cannot do: a select rendered inside another collection surface must not
 * hand its options to the outer machine, nor adopt anything of its own.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  return queryItems(getContentEl(scope), ITEM_SELECTOR, CONTENT_SELECTOR);
}

export function getItemEl(scope: Scope, value: string): HTMLElement | null {
  return findItemByValue(getItemEls(scope), value);
}

export function getItemLabel(item: HTMLElement): string {
  return domItemLabel(item, ITEM_TEXT_SELECTOR);
}

/**
 * Whether any row draws a glyph — and therefore whether the symbol track is
 * reserved for **all** of them. The selection gutter has no twin read: a select
 * always reserves it, because any row can become the checked one.
 */
export function hasSymbolGutter(scope: Scope): boolean {
  return queryItems(getContentEl(scope), SYMBOL_SELECTOR, CONTENT_SELECTOR).length > 0;
}

/** Whether the real focus is inside this select's surface — never a virtual one. */
export function ownsFocus(scope: Scope): boolean {
  return contains(getContentEl(scope), scope.getActiveElement());
}

/** Same three fallbacks as the menu: no document, no throw. */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  const rendered = getContentEl(scope) ?? getTriggerEl(scope);
  if (rendered !== null) return rendered;
  const root = scope.getRootNode();
  if (root === null) return null;
  return (root.ownerDocument ?? (root as Document)).documentElement;
}
