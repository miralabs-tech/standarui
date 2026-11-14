import { query, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "checkbox-group";

/**
 * The one character an attribute value cannot carry — the HTML parser rewrites it
 * to U+FFFD — so two different item lists can never key the same. Written as an
 * escape rather than typed: the raw byte makes ripgrep classify the file as
 * binary and skip it, which once hid two of the ten machines from every grep in
 * the repo.
 */
const SEPARATOR = "\u0000";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

/**
 * Unique by construction, so two groups on one page never submit into each
 * other's field — the same reason `radio-group` derives one.
 */
export function getGroupName(scope: Scope, name: string | undefined): string {
  return name ?? getRootId(scope);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/**
 * `aria-labelledby` may only point at an id that exists.
 *
 * The qualification this used to spell out by hand is now the identity itself:
 * this component contains other components, and every checkbox in it has a
 * `label` part of its own, so a search for a bare `label` finds the first box's
 * and names the group after it.
 */
export function hasLabel(scope: Scope): boolean {
  return query(getRootEl(scope), `[data-part~="${COMPONENT}:label"]`) !== null;
}

/**
 * The items, read from the DOM and never registered — a group that has to be told
 * about its own children goes out of sync the first time one is rendered
 * conditionally (the lesson `toggle-group` and `radio-group` are both built on).
 *
 * An item is a checkbox submitting under this group's name. That is not a
 * convention invented for the lookup: submitting together under one name is what
 * makes several boxes one field. It also settles which box is the tri-state
 * summary without needing a flag — the summary submits nothing, so it carries no
 * name and is not found here.
 *
 * The name is compared in JS rather than in the selector: matching it there needs
 * `CSS.escape`, and reaching a window from a pure DOM helper to get it buys
 * nothing over one string comparison.
 */
export function getItemInputEls(scope: Scope, name: string): HTMLInputElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLInputElement>(root, 'input[type="checkbox"]').filter(
    (input) => input.name === name,
  );
}

/**
 * The dependency a `watch` compares — the items *and* whether each is reachable,
 * because disabling one changes what the summary is a summary of.
 */
export function getItemKey(scope: Scope, name: string): string {
  return getItemInputEls(scope, name)
    .map((input) => `${input.disabled ? "-" : "+"}${input.value}`)
    .join(SEPARATOR);
}
