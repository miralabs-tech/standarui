/**
 * One stack of open surfaces per document, and the single source of truth for
 * "who closes first".
 *
 * `element.contains()` cannot answer that question. A popover portalled to the
 * body out of a dialog is not a DOM descendant of the dialog, so a click inside
 * it reads as outside and closes the dialog underneath it (research/core.md §5,
 * piège 2). Membership is therefore logical: a layer declares its parent, and
 * "inside" means inside that layer or inside any layer descending from it.
 *
 * The gamepad B button pops this same stack (CDC §4.4), which is why dismissal
 * order lives here rather than inside each component.
 */

import { contains } from "../dom/query";

export type LayerType = "dialog" | "drawer" | "popover" | "menu" | "listbox" | "tooltip";

/**
 * `"drag"` is the one a decorator sends: a sheet thrown past its smallest detent is
 * a dismissal, and it has to travel the same path as the others so `canDismiss`
 * gets its say and `onDismiss` is told why.
 */
export type DismissReason = "escape" | "outside-pointer" | "focus-outside" | "back" | "drag";

/**
 * The three a surface locks together, and the reason they are one question rather
 * than three clauses repeated in every machine that answers it.
 *
 * `closeOnEscape` already documents the pair: B and Escape share one lock. A drag
 * past the smallest detent joins them because it is the same kind of act — the
 * person saying "take this away", deliberately, from inside the surface. What it is
 * *not* is a click in the gutter: `closeOnInteractOutside` is about attention
 * landing elsewhere, and a thumb on the sheet never left.
 *
 * Stated once here so the eighth overlay gets it right by importing it. When
 * `"drag"` was added to the union, six of the seven machines carrying a
 * `canDismiss` compiled unchanged and silently routed it to the wrong branch —
 * only the three with an exhaustive `Record<DismissReason, …>` table said a word.
 */
export function isEscapeLikeDismissal(reason: DismissReason): boolean {
  return reason === "escape" || reason === "back" || reason === "drag";
}

export interface Layer {
  readonly id: string;
  readonly node: HTMLElement;
  readonly type: LayerType;
  /** Modal layers make everything below them inert and lock the scroll. */
  readonly modal: boolean;
  /** Declared parenthood — the part the DOM cannot tell us once portalled. */
  readonly parentId?: string | undefined;
  dismiss(reason: DismissReason): void;
}

export interface LayerStack {
  add(layer: Layer): void;
  remove(id: string): void;
  layers(): readonly Layer[];
  get(id: string): Layer | undefined;
  isTopMost(id: string): boolean;
  /** Layers descending from `id`, however deeply nested. */
  descendantsOf(id: string): Layer[];
  /** True when the target sits inside this layer or one of its descendants. */
  containsTarget(id: string, target: Node | null): boolean;
  /** Dismisses the top layer and reports whether there was one — the B button. */
  dismissTop(reason: DismissReason): boolean;
  hasModalAbove(id: string): boolean;
  /**
   * Bumped by every dismissal a layer of this document asks for, accepted or
   * not: a Tab held across a close reads it to tell its own close from one an
   * Escape, a pad's B or a press outside asked for since.
   */
  dismissals: number;
}

const stacks = new WeakMap<Document, LayerStack>();

export function getLayerStack(doc: Document): LayerStack {
  const existing = stacks.get(doc);
  if (existing !== undefined) return existing;

  const layers: Layer[] = [];
  const indexOf = (id: string): number => layers.findIndex((layer) => layer.id === id);
  const get = (id: string): Layer | undefined => layers.find((layer) => layer.id === id);

  const descendsFrom = (layer: Layer, ancestorId: string): boolean => {
    let parentId = layer.parentId;
    const seen = new Set<string>([layer.id]);
    while (parentId !== undefined && !seen.has(parentId)) {
      if (parentId === ancestorId) return true;
      seen.add(parentId);
      parentId = get(parentId)?.parentId;
    }
    return false;
  };

  const descendantsOf = (id: string): Layer[] =>
    layers.filter((layer) => layer.id !== id && descendsFrom(layer, id));

  const stack: LayerStack = {
    /**
     * A layer can arrive *after* its own descendants. React runs layout effects
     * child-first, so two dialogs that mount open in the same commit register
     * inner-then-outer, and a plain push would land the parent on top of its own
     * children: Escape would then dismiss the outer surface and unmount the inner
     * one with it — one key press, both gone. Declared parenthood outranks arrival
     * order, so a layer lands underneath anything that already descends from it.
     */
    add(layer: Layer): void {
      const existingIndex = indexOf(layer.id);
      if (existingIndex !== -1) layers.splice(existingIndex, 1);
      const firstDescendant = layers.findIndex((other) => descendsFrom(other, layer.id));
      if (firstDescendant === -1) layers.push(layer);
      else layers.splice(firstDescendant, 0, layer);
    },
    remove(id: string): void {
      const index = indexOf(id);
      if (index !== -1) layers.splice(index, 1);
      if (layers.length === 0) stacks.delete(doc);
    },
    layers: (): readonly Layer[] => layers,
    get,
    isTopMost: (id: string): boolean => layers.at(-1)?.id === id,
    descendantsOf,
    containsTarget(id: string, target: Node | null): boolean {
      const layer = get(id);
      if (layer === undefined || target === null) return false;
      if (contains(layer.node, target)) return true;
      return descendantsOf(id).some((child) => contains(child.node, target));
    },
    dismissTop(reason: DismissReason): boolean {
      const top = layers.at(-1);
      if (top === undefined) return false;
      top.dismiss(reason);
      return true;
    },
    hasModalAbove(id: string): boolean {
      const index = indexOf(id);
      if (index === -1) return false;
      return layers.slice(index + 1).some((layer) => layer.modal);
    },
    dismissals: 0,
  };

  stacks.set(doc, stack);
  return stack;
}
