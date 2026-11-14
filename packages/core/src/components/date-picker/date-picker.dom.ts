import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "date-picker";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getClearTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "clear-trigger");
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

export function getTitleId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "title");
}

export function getCancelTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "cancel-trigger");
}

export function getCloseTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "close-trigger");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

/**
 * By id and not by a query rooted on the surface: the part is a composition point
 * a consumer may place inside the content or beside it in the positioner, and both
 * are the same close button.
 */
export function getCloseTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getCloseTriggerId(scope));
}

/** The floating element: what gets the translate, never the content. */
export function getPositionerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPositionerId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

/**
 * Rooted on the positioner rather than on the content, the popover's arrangement:
 * a title is inside the surface, but a part probed from the surface alone would
 * miss anything a consumer places beside it in the positioner.
 */
export function hasTitle(scope: Scope): boolean {
  return query(getPositionerEl(scope), '[data-part~="date-picker:title"]') !== null;
}

/**
 * Rooted on the root, not the positioner: the label sits beside the trigger and
 * the field, outside the surface entirely — the mirror of `hasTitle` above.
 */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), '[data-part~="date-picker:label"]') !== null;
}

/**
 * Where the focus goes when the surface opens: the day, which the APG's Date
 * Picker Dialog asks for by name.
 *
 * Asked of ARIA rather than of the calendar's own part vocabulary, and that is the
 * whole reason it works: a `role="grid"` has exactly one roving tab stop, so this
 * selector names "the cell the grid would hand the keyboard" without the picker
 * knowing which component drew the grid — or whether the surface holds one at all.
 */
export function getInitialCellEl(scope: Scope): HTMLElement | null {
  return query(getContentEl(scope), '[role="gridcell"][tabindex="0"]');
}

/** The same three fallbacks as the select's: no document, no throw. */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  const rendered = getRootEl(scope) ?? getContentEl(scope) ?? getTriggerEl(scope);
  if (rendered !== null) return rendered;
  const root = scope.getRootNode();
  if (root === null) return null;
  return (root.ownerDocument ?? (root as Document)).documentElement;
}
