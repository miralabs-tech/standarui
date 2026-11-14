/**
 * **The item collection is read from the live DOM, never held in context.** The
 * items are composition — a filtered list rewrites them on every keystroke — and a
 * machine that had to be *told* about its own children goes out of sync the first
 * time one is rendered conditionally. The reading itself is
 * `collection/dom-collection`, shared with `menu` and `select`; what is left here
 * is this component's own selectors, its ids, and the one measurement a page
 * jump needs.
 */

import {
  getItemLabel as domItemLabel,
  findItemByValue,
  queryItems,
} from "../../collection/dom-collection";
import { contains, query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";
import type { Orientation } from "../../types";

export { getItemValue, isItemDisabled } from "../../collection/dom-collection";

const COMPONENT = "listbox";

/**
 * Written out rather than derived from `parts`: the anatomy builds the same
 * strings, and a component that imports its own anatomy into its DOM helpers pays
 * for the builder in every bundle that only wanted a query.
 */
const CONTENT_SELECTOR = '[data-part~="listbox:content"]';
export const ITEM_SELECTOR = '[data-part~="listbox:item"]';
const ITEM_TEXT_SELECTOR = '[data-part~="listbox:item-text"]';
const LABEL_SELECTOR = '[data-part~="listbox:label"]';

/** What a page jump falls back to when nothing can be measured yet. */
export const DEFAULT_PAGE_SIZE = 10;

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getItemGroupId(scope: Scope, key: string): string {
  return getPartId(scope, COMPONENT, "item-group", key);
}

export function getItemGroupLabelId(scope: Scope, key: string): string {
  return getPartId(scope, COMPONENT, "item-group-label", key);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

/** `aria-labelledby` may only point at an id that exists. */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), LABEL_SELECTOR) !== null;
}

/**
 * This listbox's own items, in DOM order. The container filter is the half a flat
 * query cannot do: a listbox inside a dialog inside a listbox nests one collection
 * in another, and the outer machine must not adopt the inner items.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  return queryItems(getContentEl(scope), ITEM_SELECTOR, CONTENT_SELECTOR);
}

export function getItemValues(scope: Scope): string[] {
  return getItemEls(scope).map((item) => item.dataset.value ?? "");
}

export function getItemEl(scope: Scope, value: string): HTMLElement | null {
  return findItemByValue(getItemEls(scope), value);
}

export function getItemLabel(item: HTMLElement): string {
  return domItemLabel(item, ITEM_TEXT_SELECTOR);
}

/** Whether the real focus is inside this listbox — never a virtual one. */
export function ownsFocus(scope: Scope): boolean {
  return contains(getContentEl(scope), scope.getActiveElement());
}

/**
 * How many rows a page jump is worth, given a viewport and a row. Pure so the
 * clamp and the fallback can be asserted without a layout: a row of zero height —
 * a list that has not been laid out yet, or one inside a collapsed container —
 * would otherwise divide into an infinity of rows.
 */
export function getPageStep(viewport: number, row: number): number {
  if (!Number.isFinite(viewport) || !Number.isFinite(row)) return DEFAULT_PAGE_SIZE;
  if (viewport <= 0 || row <= 0) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.floor(viewport / row));
}

/**
 * Measured rather than assumed: PageDown means "a screenful", and a screenful of
 * a list is whatever the scroller can show of it. The first item stands in for
 * every row, which is what a list of equal rows makes true.
 */
export function getPageSize(scope: Scope, orientation: Orientation): number {
  const content = getContentEl(scope);
  const first = getItemEls(scope)[0];
  if (content === null || first === undefined) return DEFAULT_PAGE_SIZE;
  const rect = first.getBoundingClientRect();
  return orientation === "horizontal"
    ? getPageStep(content.clientWidth, rect.width)
    : getPageStep(content.clientHeight, rect.height);
}
