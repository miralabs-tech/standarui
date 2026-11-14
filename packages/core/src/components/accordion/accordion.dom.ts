import { queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "accordion";

/**
 * Written out rather than read from `parts`, the same call `tabs.dom` makes: the
 * anatomy builds the very same strings, and a component that imported its own
 * anatomy here would pay for the builder in every bundle that only wanted a
 * query.
 */
const ROOT_SELECTOR = '[data-part~="accordion:root"]';
const TRIGGER_SELECTOR = '[data-part~="accordion:trigger"]';
const CONTENT_SELECTOR = '[data-part~="accordion:content"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getItemId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "item", value);
}

export function getTriggerId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "trigger", value);
}

export function getContentId(scope: Scope, value: string): string {
  return getPartId(scope, COMPONENT, "content", value);
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getTriggerEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getTriggerId(scope, value));
}

export function getContentEl(scope: Scope, value: string): HTMLElement | null {
  return scope.getById(getContentId(scope, value));
}

/**
 * Own the descendants and nothing more. An accordion inside a panel of another
 * accordion is an ordinary shape — a tree of settings is exactly that — and a
 * bare `querySelectorAll` from the outer root would hand the outer machine the
 * inner triggers: the arrow keys would walk straight into a nested list, and
 * `End` would land on somebody else's last header.
 */
export function getTriggerEls(scope: Scope): HTMLElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLElement>(root, TRIGGER_SELECTOR).filter(
    (trigger) => trigger.closest(ROOT_SELECTOR) === root,
  );
}

export function getContentEls(scope: Scope): HTMLElement[] {
  const root = getRootEl(scope);
  if (root === null) return [];
  return queryAll<HTMLElement>(root, CONTENT_SELECTOR).filter(
    (content) => content.closest(ROOT_SELECTOR) === root,
  );
}

/**
 * The `content` an event landed in, or `null` when it landed in a nested
 * accordion's. `beforematch` bubbles, so the delegated listener on the root sees
 * a child accordion's panels too.
 */
export function getOwnContentEl(scope: Scope, target: Element | null): HTMLElement | null {
  const root = getRootEl(scope);
  if (root === null || target === null) return null;
  const content = target.closest<HTMLElement>(CONTENT_SELECTOR);
  if (content === null || content.closest(ROOT_SELECTOR) !== root) return null;
  return content;
}
