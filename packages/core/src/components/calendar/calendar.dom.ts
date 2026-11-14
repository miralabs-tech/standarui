import { contains } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";
import { type DateValue, toISO } from "../../utils/plain-date";

const COMPONENT = "calendar";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getCaptionId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "caption");
}

export function getGridId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "grid");
}

/**
 * The full ISO date is the key in every view, including the two where
 * `data-value` is shorter: a month cell is `2026-04-01` here and `2026-04` on the
 * element, because an id has to be unique and an attribute has to be readable.
 */
export function getCellId(scope: Scope, value: DateValue): string {
  return getPartId(scope, COMPONENT, "cell", toISO(value));
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getGridEl(scope: Scope): HTMLElement | null {
  return scope.getById(getGridId(scope));
}

export function getCellEl(scope: Scope, value: DateValue): HTMLElement | null {
  return scope.getById(getCellId(scope, value));
}

/**
 * Whether the focus is on one of this calendar's cells. Read before the machine
 * moves the focus itself: a page change caused by a controlled prop, or by a
 * header button the user clicked, must not drag the caret into the grid.
 */
export function isFocusInGrid(scope: Scope): boolean {
  return contains(getGridEl(scope), scope.getActiveElement());
}

/** Whether the focus is anywhere in this calendar — the header triggers included. */
export function ownsFocus(scope: Scope): boolean {
  return contains(getRootEl(scope), scope.getActiveElement());
}
