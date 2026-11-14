/** `Node.DOCUMENT_POSITION_*`, named rather than imported: the core reads no DOM globals. */
export const DOCUMENT_POSITION_PRECEDING = 2;
export const DOCUMENT_POSITION_FOLLOWING = 4;

export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as HTMLElement).nodeName === "string"
  );
}

export function query<T extends Element = HTMLElement>(
  root: ParentNode | null | undefined,
  selector: string,
): T | null {
  return root?.querySelector<T>(selector) ?? null;
}

export function queryAll<T extends Element = HTMLElement>(
  root: ParentNode | null | undefined,
  selector: string,
): T[] {
  return root === null || root === undefined ? [] : [...root.querySelectorAll<T>(selector)];
}

/**
 * Shadow-aware containment. `Node.contains` stops at a shadow boundary, so a
 * popover rendered inside a web component would read as "outside" its own trigger
 * and dismiss itself on its first click.
 */
export function contains(parent: Node | null | undefined, child: Node | null | undefined): boolean {
  if (parent === null || parent === undefined || child === null || child === undefined)
    return false;
  if (parent === child || parent.contains(child)) return true;

  let node: Node | null = child;
  while (node !== null) {
    const root: Node = node.getRootNode();
    if (root === parent) return true;
    const host: Element | null = (root as ShadowRoot).host ?? null;
    if (host === null || host === node) return false;
    if (parent.contains(host)) return true;
    node = host;
  }
  return false;
}

/**
 * `composedPath()[0]`, never `event.target`: inside a shadow root the browser
 * retargets `target` to the host, which loses the element actually clicked
 * (research/core.md §5, piège 3).
 */
export function getEventTarget<T extends EventTarget = HTMLElement>(event: Event): T | null {
  const composed = event.composedPath?.();
  return (composed?.[0] as T | undefined) ?? (event.target as T | null) ?? null;
}
