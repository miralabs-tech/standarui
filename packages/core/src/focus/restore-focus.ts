/**
 * Hands the focus back when a layer closes.
 *
 * The element the focus goes back to can have stopped taking it while the layer
 * was open: a picker disabled while open (decision 61) has a `disabled` trigger,
 * and focusing it is a silent no-op. The focus then stays in the content, which
 * unmounts and takes it down to `body` (R58). So the browser is asked, not a
 * selector: when the focus did not land, it goes to the tab stop after the
 * target in the document, else the one before, never one inside the layer that
 * is closing. A target no longer in the document is left alone, as before.
 *
 * The fallback reads the document, not a shadow root: inside one, the guard sees
 * the host and the tab stops stay out of reach, so it never runs there.
 */

import { contains, DOCUMENT_POSITION_FOLLOWING, DOCUMENT_POSITION_PRECEDING } from "../dom/query";
import { focusElement, getTabbables } from "../nav";

export function restoreFocus(
  target: HTMLElement | null | undefined,
  leaving?: Node | null | undefined,
): void {
  if (target?.isConnected !== true) return;
  focusElement(target);
  // The root's own answer, not `:focus`, which an unfocused window can withhold.
  if ((target.getRootNode() as Document | ShadowRoot).activeElement === target) return;
  // A focus that already left the layer was put there by someone: left alone.
  const doc = target.ownerDocument;
  if (focusWentElsewhere(doc, leaving, doc.activeElement)) return;
  // Never inside the target either: `body` as a target is no trigger to stand in for.
  const stops = getTabbables(doc).filter(
    (node) => !contains(leaving, node) && !contains(target, node),
  );
  const at =
    (mask: number) =>
    (node: HTMLElement): boolean =>
      (target.compareDocumentPosition(node) & mask) !== 0;
  const fallback =
    stops.find(at(DOCUMENT_POSITION_FOLLOWING)) ?? stops.findLast(at(DOCUMENT_POSITION_PRECEDING));
  if (fallback !== undefined) focusElement(fallback);
}

/**
 * The focus left `leaving` for an element someone chose: not `body`, which is
 * nowhere, and not `active` inside `leaving`. "Nowhere" is read on the document:
 * a shadow root answers `null` for a focus anywhere outside it. `active` is the
 * caller's, so a layer inside a shadow root can pass the root's own answer.
 */
export function focusWentElsewhere(
  doc: Document,
  leaving: Node | null | undefined,
  active: Element | null,
): boolean {
  return doc.activeElement !== null && doc.activeElement !== doc.body && !contains(leaving, active);
}
