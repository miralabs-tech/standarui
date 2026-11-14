import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import { getDocumentEl, type Scope } from "../../machine/scope";

const COMPONENT = "popover";

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getAnchorId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "anchor");
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

export function getArrowId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "arrow");
}

export function getTitleId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "title");
}

export function getDescriptionId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "description");
}

export function getCloseTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "closeTrigger");
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

/**
 * What the surface measures itself against. Falls back to the trigger, which is
 * the anchor in the overwhelming majority of cases — the separate part exists for
 * the ones where it is not, a menu button that opens over a whole toolbar being
 * the usual example.
 */
export function getAnchorEl(scope: Scope): HTMLElement | null {
  return scope.getById(getAnchorId(scope)) ?? getTriggerEl(scope);
}

/**
 * The anchor for the *direction* alone, which has one more fallback than the one
 * for geometry: `composed.tsx` calls a popover with neither trigger nor anchor a
 * real shape — a caret menu, a surface driven from a store — and resolving
 * against nothing answers `"ltr"` flat, the one direction an RTL page did not ask
 * for. Never folded into `getAnchorEl`: that one is also the element
 * `trackPosition` measures, and the document would anchor the surface to the
 * whole page.
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

export function getArrowEl(scope: Scope): HTMLElement | null {
  return scope.getById(getArrowId(scope));
}

/** Same three fallbacks as the dialog, for the same reason: no document, no throw. */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  return getContentEl(scope) ?? getTriggerEl(scope) ?? getDocumentEl(scope);
}

/**
 * Rooted on the **positioner**, unlike `dialog.dom.ts`, because the arrow is not
 * inside the content — a search from the surface would report `hasArrow: false`
 * for every popover that renders one. `observeChildren` is already `subtree: true`,
 * so watching the positioner sees the content's children too.
 */
export function hasPart(scope: Scope, part: string): boolean {
  return query(getPositionerEl(scope), `[data-part~="popover:${part}"]`) !== null;
}
