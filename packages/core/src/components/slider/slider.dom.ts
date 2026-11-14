import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

/**
 * Only the parts something points at get an id. `track`, `range`, `valueText` and
 * the markers are referenced by nothing — not by ARIA, not by the machine — and an
 * id per element the consumer never names is markup nobody reads.
 */
const COMPONENT = "slider";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getThumbId(scope: Scope, index: number): string {
  return getPartId(scope, COMPONENT, "thumb", String(index));
}

export function getHiddenInputId(scope: Scope, index: number): string {
  return getPartId(scope, COMPONENT, "hiddenInput", String(index));
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/** The gesture surface: the pointer listeners and the rect both come from here. */
export function getControlEl(scope: Scope): HTMLElement | null {
  return scope.getById(getControlId(scope));
}

export function getThumbEl(scope: Scope, index: number): HTMLElement | null {
  return scope.getById(getThumbId(scope, index));
}

/**
 * `aria-labelledby` may only point at an id that exists — the rule `progress`,
 * `toggle-group` and `field` all follow, and the one an audit found broken in two
 * components because every fixture happened to render its label.
 */
export function hasPart(scope: Scope, part: string): boolean {
  return query(getRootEl(scope), `[data-part~="slider:${part}"]`) !== null;
}
