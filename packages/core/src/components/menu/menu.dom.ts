/**
 * **The item collection is read from the DOM, never held in context.** A menu is a
 * transient surface whose items are composition — five call sites, five different
 * lists (CDC parity M1) — and a machine that had to be *told* about its own
 * children goes out of sync the first time one is rendered conditionally.
 *
 * The reading itself is `collection/dom-collection`, shared with every composite
 * that will want the same thing (`select`, `listbox`, `combobox`, `tree`); what is
 * left here is the menu's own selectors and its ids.
 */

import {
  getItemLabel as domItemLabel,
  findItemByValue,
  queryItems,
} from "../../collection/dom-collection";
import { contains } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import { getDocumentEl, type Scope } from "../../machine/scope";

export { getItemValue, isItemDisabled } from "../../collection/dom-collection";

const COMPONENT = "menu";

/**
 * Written out rather than derived from `parts`: the anatomy builds the same
 * strings, and a component that imports its own anatomy into its DOM helpers pays
 * for the builder in every bundle that only wanted a query.
 */
const CONTENT_SELECTOR = '[data-part~="menu:content"]';
/**
 * The three identities of an item. `triggerItem` is a part of its own, and the
 * sheet's Cancel row is one too: it is drawn *inside* a `role="menu"`, so it
 * carries `role="menuitem"` — and a `menuitem` that the roving list does not know
 * about is a control no keyboard and no d-pad can reach. Excluded until
 * 2026-09-02, which made `End` in the sheet presentation stop one row short.
 */
export const ITEM_SELECTOR =
  '[data-part~="menu:item"], [data-part~="menu:trigger-item"], [data-part~="menu:cancel-trigger"]';

/**
 * The Cancel row's value in that collection. Namespaced rather than pretty: it
 * shares a `data-value` space with whatever the consumer names their own items,
 * and a menu with an item called `cancel` must not collide with it.
 */
export const CANCEL_VALUE = "sui:menu:cancel";
const TRIGGER_ITEM_SELECTOR = '[data-part~="menu:trigger-item"]';
const INDICATOR_SELECTOR = '[data-part~="menu:item-indicator"]';
const SYMBOL_SELECTOR = '[data-part~="menu:item-symbol"]';
const ITEM_TEXT_SELECTOR = '[data-part~="menu:item-text"]';

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getContextTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "context-trigger");
}

export function getIndicatorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "indicator");
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

export function getItemDescriptionId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item-description", value);
}

export function getCancelTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "cancel-trigger");
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

export function getContextTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContextTriggerId(scope));
}

/**
 * What the surface measures itself against. The context trigger stands in when
 * there is no button — a right click anchors to the region — and a submenu's
 * anchor falls out of this for free, because `getTriggerItemProps` gives the
 * trigger item the **child's** trigger id.
 */
export function getAnchorEl(scope: Scope): HTMLElement | null {
  return getTriggerEl(scope) ?? getContextTriggerEl(scope);
}

/**
 * The anchor for the *direction* alone, which has one more fallback than the one
 * for geometry: a menu opened from a store renders neither trigger nor context
 * trigger, and resolving against nothing answers `"ltr"` flat — the one direction
 * an RTL page did not ask for. Never folded into `getAnchorEl`: that one is also
 * the element `trackPosition` measures, and the document would anchor the surface
 * to the whole page.
 */
export function getDirAnchorEl(scope: Scope): HTMLElement | null {
  return getAnchorEl(scope) ?? getDocumentEl(scope);
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
 * This menu's own items, in DOM order. The container filter is what a flat query
 * cannot do: in the `sheet` presentation a submenu is *drilled in* rather than
 * cascaded, so a child's `content` is stacked inside its parent's surface and its
 * items would otherwise join the parent's roving list.
 */
export function getItemEls(scope: Scope): HTMLElement[] {
  return queryItems(getContentEl(scope), ITEM_SELECTOR, CONTENT_SELECTOR);
}

export function isTriggerItem(item: HTMLElement): boolean {
  return item.matches(TRIGGER_ITEM_SELECTOR);
}

export function getItemLabel(item: HTMLElement): string {
  return domItemLabel(item, ITEM_TEXT_SELECTOR);
}

export function getItemEl(scope: Scope, value: string): HTMLElement | null {
  return findItemByValue(getItemEls(scope), value);
}

/**
 * Whether **this** surface draws a part, through the same container filter
 * `getItemEls` uses — and for the same reason, which both gutter reads below were
 * missing until 2026-09-02. A bare `querySelector` descends into a drilled-in
 * child, so in the `sheet` presentation a parent with no glyph of its own inherited
 * one from its submenu and opened a 28px column for it on every row, then handed it
 * back when the child closed.
 */
function ownsPart(scope: Scope, selector: string): boolean {
  return queryItems(getContentEl(scope), selector, CONTENT_SELECTOR).length > 0;
}

/**
 * The selection axis is named for the **menu**:
 * the checkmark gutter is a decision of the container, so it is read once for the
 * surface and published on `content`, never on an item.
 */
export function hasSelectionGutter(scope: Scope): boolean {
  return ownsPart(scope, INDICATOR_SELECTOR);
}

/**
 * Whether any row draws a glyph — and therefore whether the symbol track is
 * reserved for **all** of them. Read once for the surface, exactly like the
 * checkmark gutter above, because the alignment it buys is between rows: each row
 * is its own grid, so a track sized from its own content collapses on every row
 * without a symbol and slides that row's label left of its neighbours'.
 */
export function hasSymbolGutter(scope: Scope): boolean {
  return ownsPart(scope, SYMBOL_SELECTOR);
}

/** Whether the real focus is inside this menu's surface — never a virtual one. */
export function ownsFocus(scope: Scope): boolean {
  return contains(getContentEl(scope), scope.getActiveElement());
}

/** Same three fallbacks as the dialog: no document, no throw. */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  return getContentEl(scope) ?? getAnchorEl(scope) ?? getDocumentEl(scope);
}
