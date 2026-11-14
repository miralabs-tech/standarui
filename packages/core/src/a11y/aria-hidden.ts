/**
 * Hide everything except a modal surface from assistive technology.
 *
 * A focus trap keeps the Tab key inside; it does nothing for a screen reader's
 * virtual cursor, which walks the whole document. Both are needed, and they are
 * separate primitives because a non-modal popover wants neither.
 *
 * Only the siblings along the ancestor chain are marked, not every node in the
 * document: `aria-hidden` on a subtree hides its descendants too, so marking
 * O(depth) elements does the job of marking O(n). A sibling that a kept element
 * contains is never marked: a sheet's cancel and backdrop beside its content stay
 * live when the positioner is kept (R60). Nor is a sibling that contains a kept
 * element: a persistent widget portalled elsewhere keeps its container live, and
 * the walk from it does not mark the surface's own ancestors. For a target inside
 * `body`, the walk stops there and `<head>` is never touched (R65).
 *
 * Counted, not flagged: nested dialogs mark the same siblings, and the inner one
 * closing must not reveal the page to the outer one still open.
 */

const counts = new WeakMap<Element, number>();
const previous = new WeakMap<Element, string | null>();

export interface AriaHiddenOptions {
  /**
   * Also set `inert`, which takes focus and pointer events away as well.
   * Off by default: it changes behaviour, not only the accessibility tree.
   */
  readonly inert?: boolean | undefined;
  readonly layer?: string | undefined;
}

const NOOP: VoidFunction = () => {};

function shouldSkip(node: Element): boolean {
  // Live regions must keep announcing from under a modal, and a script or style
  // tag has nothing to hide.
  if (node.hasAttribute("aria-live") || node.hasAttribute("data-sui-live-region")) return true;
  const tag = node.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "TEMPLATE";
}

export function hideOthers(
  targets: readonly (HTMLElement | null | undefined)[],
  options: AriaHiddenOptions = {},
): VoidFunction {
  const kept = targets.filter((node): node is HTMLElement => node != null);
  const root = kept[0]?.ownerDocument.body;
  if (root === undefined || kept.length === 0) return NOOP;

  const marked = new Set<Element>();

  for (const target of kept) {
    let node: Element = target;
    while (node !== root) {
      const parent: Element | null = node.parentElement;
      if (parent === null) break;
      for (const sibling of parent.children) {
        if (sibling === node || marked.has(sibling) || shouldSkip(sibling)) continue;
        if (kept.some((spared) => spared.contains(sibling) || sibling.contains(spared))) continue;
        if (
          options.layer !== undefined &&
          sibling.getAttribute("data-sui-layer-parent") === options.layer
        )
          continue;

        const count = counts.get(sibling) ?? 0;
        if (count === 0) {
          previous.set(sibling, sibling.getAttribute("aria-hidden"));
          sibling.setAttribute("aria-hidden", "true");
          if (options.inert === true) sibling.setAttribute("inert", "");
        }
        counts.set(sibling, count + 1);
        marked.add(sibling);
      }
      node = parent;
    }
  }

  return () => {
    for (const sibling of marked) {
      const count = (counts.get(sibling) ?? 1) - 1;
      if (count > 0) {
        counts.set(sibling, count);
        continue;
      }
      counts.delete(sibling);
      const original = previous.get(sibling) ?? null;
      previous.delete(sibling);
      if (original === null) sibling.removeAttribute("aria-hidden");
      else sibling.setAttribute("aria-hidden", original);
      if (options.inert === true) sibling.removeAttribute("inert");
    }
    marked.clear();
  };
}
