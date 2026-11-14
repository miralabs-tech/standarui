/**
 * Every DOM read a machine performs goes through a `Scope`. Nothing in the core
 * ever touches `document` or `window` directly (architecture.md, règles dures):
 * that is what makes shadow roots, iframes and SSR work without a single special
 * case. The lookups stay lazy — a `Scope` can be built during render, it only
 * reaches for a document when an effect actually asks.
 *
 * The methods fall in two groups, and the split is the SSR contract:
 *
 * - **Render-safe** — `getRootNode`, `getById`, `getActiveElement`,
 *   `isActiveElement`. A machine reads these from its `watch` dependencies, and
 *   an adapter records those dependencies while it renders, so they are reached
 *   before any element exists. They answer "nothing" then, which is exactly what
 *   they already answer on the first client render, before the mount effect.
 * - **Effect-time** — `getDoc`, `getWin`, `getComputedStyle`. These exist to
 *   install listeners and to measure; they are only reachable after `start()`,
 *   which no server render performs. They throw rather than invent a document,
 *   with the same message `createInputSystem` uses, so the mistake names itself
 *   instead of surfacing as a bare `ReferenceError` from the wrong layer.
 */

import { invariant } from "../utils/invariant";

export type RootNode = Document | ShadowRoot;

/** `{ [part]: id }`, or `{ [`${part}:${key}`]: id }` for parts that repeat. */
export type PartIdOverrides = Readonly<Record<string, string | undefined>>;

export interface ScopeInit {
  readonly id: string;
  readonly ids?: PartIdOverrides | undefined;
  readonly getRootNode?: (() => RootNode) | undefined;
}

export interface Scope {
  readonly id: string;
  readonly ids: PartIdOverrides | undefined;
  /** `null` on the server, and on the client until the tree is mounted. */
  getRootNode(): RootNode | null;
  getDoc(): Document;
  getWin(): Window & typeof globalThis;
  getById<T extends Element = HTMLElement>(id: string): T | null;
  getActiveElement(): HTMLElement | null;
  isActiveElement(node: Element | null): boolean;
  getComputedStyle(node: Element): CSSStyleDeclaration;
}

export function createScope(init: ScopeInit): Scope {
  // `globalThis.document` rather than the bare identifier: on the server the
  // latter is a ReferenceError, not `undefined`, so there is nothing to fall
  // back from. This was the single global access left in the core, and the one
  // that stopped five components from rendering on a server.
  const getRootNode = (): RootNode | null => init.getRootNode?.() ?? globalThis.document ?? null;

  // A Document has a null `ownerDocument` and is its own document; a ShadowRoot
  // points at the one that owns it.
  const getDoc = (): Document => {
    const root = getRootNode();
    invariant(
      root !== null,
      "scope.getDoc() needs a document — call it from an effect, not during render or on the server",
    );
    return root.ownerDocument ?? (root as Document);
  };

  const getWin = (): Window & typeof globalThis => {
    const win = getDoc().defaultView;
    invariant(
      win !== null,
      "scope.getWin() needs a window — the document this scope belongs to has no view",
    );
    return win;
  };

  const getActiveElement = (): HTMLElement | null =>
    (getRootNode()?.activeElement as HTMLElement | null) ?? null;

  return {
    id: init.id,
    ids: init.ids,
    getRootNode,
    getDoc,
    getWin,
    getActiveElement,
    getById: <T extends Element = HTMLElement>(id: string): T | null =>
      (getRootNode()?.getElementById(id) as T | null) ?? null,
    isActiveElement: (node: Element | null): boolean =>
      node !== null && getActiveElement() === node,
    getComputedStyle: (node: Element): CSSStyleDeclaration => getWin().getComputedStyle(node),
  };
}

/**
 * The document's own root, for the effects that still have to resolve something
 * when no part of the component is rendered — a surface opened from a store has
 * no trigger and no anchor to read.
 *
 * Render-safe by construction: it goes through `getRootNode`, never `getDoc`,
 * which throws where there is no document (a plain node test, the server). The
 * answer there is `null`, and a caller that passes it on gets the same "nothing
 * to read" it already got from a missing part.
 */
export function getDocumentEl(scope: Scope): HTMLElement | null {
  const root = scope.getRootNode();
  if (root === null) return null;
  return (root.ownerDocument ?? (root as Document)).documentElement;
}
