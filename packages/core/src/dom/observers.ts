/**
 * Observers are created inside state effects and destroyed by their teardown —
 * the core holds no element refs of its own (research/core.md §1.4). Each one is
 * built from the node's own window so an iframe or popup gets the right
 * constructor.
 */

function windowOf(node: Node): (Window & typeof globalThis) | null {
  return node.ownerDocument?.defaultView ?? null;
}

const NOOP: VoidFunction = () => {};

export function observeAttributes(
  node: Element | null | undefined,
  attributes: readonly string[],
  callback: (node: Element) => void,
): VoidFunction {
  if (node === null || node === undefined) return NOOP;
  const win = windowOf(node);
  if (win === null) return NOOP;

  const observer = new win.MutationObserver(() => callback(node));
  observer.observe(node, { attributes: true, attributeFilter: [...attributes] });
  return () => observer.disconnect();
}

export function observeChildren(
  node: Element | null | undefined,
  callback: (node: Element, records: readonly MutationRecord[]) => void,
  attributes?: readonly string[],
): VoidFunction {
  if (node === null || node === undefined) return NOOP;
  const win = windowOf(node);
  if (win === null) return NOOP;

  const observer = new win.MutationObserver((records) => callback(node, records));
  observer.observe(
    node,
    attributes === undefined
      ? { childList: true, subtree: true }
      : {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [...attributes],
          attributeOldValue: true,
        },
  );
  return () => observer.disconnect();
}

export function observeResize(
  node: Element | null | undefined,
  callback: (rect: DOMRectReadOnly) => void,
): VoidFunction {
  if (node === null || node === undefined) return NOOP;
  const win = windowOf(node);
  if (win === null || !("ResizeObserver" in win)) return NOOP;

  const observer = new win.ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry !== undefined) callback(entry.contentRect);
  });
  observer.observe(node);
  return () => observer.disconnect();
}
