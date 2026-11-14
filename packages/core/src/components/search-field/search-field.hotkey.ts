/**
 * The activation shortcut, as a predicate the consumer opts into.
 *
 * Taking ⌘F away from the browser is an application's decision, never a
 * library's default: on a page whose search covers the whole content it is
 * exactly right, and on a page with one filter box in a corner it removes
 * find-in-page for no gain. So the machine ships the predicate and installs
 * nothing until it is handed one.
 */

import { isHTMLElement } from "../../dom/query";

/** ⌘F where the Command key exists, Ctrl+F elsewhere — and never both modifiers, which is Emacs. */
export function isSearchHotkey(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) return false;
  // Exactly one of the two: Ctrl+⌘+F is a different chord, and a keyboard event
  // with neither is a plain "f" the user is typing.
  if (event.metaKey === event.ctrlKey) return false;
  return event.key.toLowerCase() === "f";
}

/**
 * Anything a caret can be in. A global shortcut that fires while somebody is
 * typing somewhere else steals their keystroke — Ctrl+F is caret-forward in
 * native desktop text fields and in every Emacs binding — so the listener steps aside for those.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!isHTMLElement(target)) return false;
  if (target.isContentEditable) return true;
  const tag = target.localName;
  return tag === "input" || tag === "textarea" || tag === "select";
}
