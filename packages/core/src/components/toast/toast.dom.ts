import { queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "toast";

export function getGroupId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "group");
}

/** `toast:{scope}:root:{toast id}` — the repeating part keyed by the record's own id. */
export function getRootId(scope: Scope, id: string): string {
  return getPartId(scope, COMPONENT, "root", id);
}

export function getTitleId(scope: Scope, id: string): string {
  return getPartId(scope, COMPONENT, "title", id);
}

export function getDescriptionId(scope: Scope, id: string): string {
  return getPartId(scope, COMPONENT, "description", id);
}

export function getGroupEl(scope: Scope): HTMLElement | null {
  return scope.getById(getGroupId(scope));
}

export function getToastEl(scope: Scope, id: string): HTMLElement | null {
  return scope.getById(getRootId(scope, id));
}

/** The stack index `connect` writes on every card; its position, for a node without one. */
function readIndex(node: HTMLElement, fallback: number): number {
  const raw = Number.parseInt(node.style.getPropertyValue("--sui-toast-index"), 10);
  return Number.isNaN(raw) ? fallback : raw;
}

/**
 * Front first, which is the context's order — ordered by the `--sui-toast-index`
 * `connect` writes on each card rather than by sibling order. Document order used
 * to *be* the claim, and it is one no adapter is forced to honour: the store is
 * newest-first, so an adapter that appends each arrival to the end of the region
 * paints the stack back to front, and nothing in the DOM says so. The measured
 * offsets and the focus walk would both come out silently inverted. Sorting here
 * costs one pass over a list capped at `max`.
 */
export function getToastEls(scope: Scope): HTMLElement[] {
  return queryAll<HTMLElement>(getGroupEl(scope), '[data-part~="toast:root"]')
    .map((node, position) => ({ node, position, index: readIndex(node, position) }))
    .sort((a, b) => a.index - b.index || a.position - b.position)
    .map((entry) => entry.node);
}
