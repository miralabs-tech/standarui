/**
 * Tab through a portal as if it were still where the author wrote it.
 *
 * A non-modal popover portalled to `<body>` is last in the DOM, so tabbing out of
 * it lands wherever the document ends instead of after its trigger. This restores
 * the visual order: forward out of the content goes to the element after the
 * trigger, backward goes to the trigger itself.
 *
 * A modal surface has no "after the trigger" while the rest of the page is
 * inert. One whose Tab also closes it passes `placeOnDispose`: while its trigger
 * is inert the key is held, and the step is placed by the disposer, once the
 * inert layer is released. Without `placeOnDispose`, a surface that says it is
 * modal (`aria-modal="true"`) wraps instead, while its trigger is inert: from
 * the last stop to the first, and back.
 *
 * A menu's submenus are portalled apart from it, so the tree is read from the
 * layer stack: the root answers Tab for every open submenu, a submenu for none.
 */

import { addDomEvent, isComposingEvent } from "../dom/event";
import { contains, DOCUMENT_POSITION_FOLLOWING, DOCUMENT_POSITION_PRECEDING } from "../dom/query";
import { getLayerStack } from "../interaction/layer-stack";
import { FOCUSABLE_SELECTOR, focusElement, getTabbables } from "../nav";
import { claimTab, isHeldTab } from "./tab-handoff";

export interface ProxyTabFocusOptions {
  readonly triggerNode: () => HTMLElement | null | undefined;
  readonly onFocusOut?: ((target: HTMLElement | null) => void) | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
  /**
   * Hold the step until the disposer runs instead of placing it on the key,
   * whenever the trigger is inert. For a modal surface whose Tab also closes it:
   * while open, everything after the trigger — and the trigger itself — is
   * inert, so the step can only be placed once the layer that made them inert
   * has been released.
   *
   * Read at dispose: the step is placed only when it answers yes, so a teardown
   * that keeps the surface open, or a close the Tab did not cause, places
   * nothing. Any later keydown or click drops the held step, and so does any
   * dismissal a layer asks for since (`LayerStack.dismissals`): an Escape or a
   * press outside closes the surface from a document listener that runs before
   * this one, and a pad's B has no DOM event at all. A close that comes
   * later with no input in between cannot be told from a close accepted late,
   * so it places the step too. When the close is refused the Tab is swallowed
   * and the focus stays inside — unlike the non-modal path, which lets it
   * leave; with the page inert there is nowhere to go.
   */
  readonly placeOnDispose?: (() => boolean) | undefined;
}

const NOOP: VoidFunction = () => {};

export function proxyTabFocus(
  node: HTMLElement | null | undefined,
  options: ProxyTabFocusOptions,
): VoidFunction {
  const doc = node?.ownerDocument;
  if (node === null || node === undefined || doc === undefined) return NOOP;

  let held: "forward" | "backward" | null = null;
  // The stack's dismissal count when the step was held: any dismissal since —
  // Escape, a pad's B, a press outside — closed the surface for another reason.
  let heldAt = 0;

  // A menu tree answers Tab at its root, read from the layer stack: a submenu's
  // anchor is an item that goes with the tree, and the focus in any open submenu
  // is on the root's edge. `null` for a submenu, which leaves the key to the root.
  const stack = getLayerStack(doc);
  const getTree = (): Node[] | null => {
    const own = stack.layers().find((layer) => layer.node === node);
    if (own?.type !== "menu") return [node];
    if (stack.get(own.parentId ?? "")?.type === "menu") return null;
    return [
      node,
      ...stack
        .descendantsOf(own.id)
        .filter((layer) => layer.type === "menu")
        .map((layer) => layer.node),
    ];
  };
  const inside = (tree: readonly Node[], target: Node | null): boolean =>
    tree.some((part) => contains(part, target));

  const placeHeld = (): void => {
    const direction = held;
    held = null;
    if (direction === null || heldAt !== stack.dismissals) return;
    if (options.placeOnDispose?.() !== true) return;
    const tree = getTree() ?? [node];
    const current = doc.activeElement as HTMLElement | null;
    if (current !== null && current !== doc.body && !inside(tree, current)) return;
    const trigger = options.triggerNode() ?? null;
    if (trigger === null || !trigger.isConnected) return;
    const reachable = trigger.matches(FOCUSABLE_SELECTOR) ? trigger : null;
    const target =
      direction === "backward"
        ? reachable
        : (getTabbables(doc.body).find(
            (candidate) =>
              (trigger.compareDocumentPosition(candidate) & DOCUMENT_POSITION_FOLLOWING) !== 0 &&
              !inside(tree, candidate),
          ) ?? reachable);
    if (target === null) return;
    focusElement(target);
    options.onFocusOut?.(target);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    held = null;
    if (event.key !== "Tab" || options.isDisabled?.() === true) return;
    if (event.ctrlKey || event.altKey || event.metaKey || isComposingEvent(event)) return;
    // A trap that owns this layer has already prevented the key so that nothing
    // can carry it out of the modal; the step is still this module's to place.
    if (event.defaultPrevented && !isHeldTab(event)) return;

    const current = doc.activeElement as HTMLElement | null;
    const tree = getTree();
    if (tree === null || !inside(tree, current)) return;
    const trigger = options.triggerNode() ?? null;
    const inert = (trigger?.closest("[inert]") ?? null) !== null;

    // Held only while the trigger is inert: anywhere else the step is placed now.
    if (options.placeOnDispose !== undefined && inert) {
      event.preventDefault();
      claimTab(event);
      held = event.shiftKey ? "backward" : "forward";
      heldAt = stack.dismissals;
      return;
    }

    const tabbables = getTabbables(node);
    const first = tabbables[0] ?? null;
    const last = tabbables.at(-1) ?? null;

    // A trigger inert under any other layer, or in a region the consumer made
    // inert, still steps past: only a modal surface owns the inert page.
    if (inert && node.getAttribute("aria-modal") === "true") {
      if (current !== (event.shiftKey ? first : last)) return;
      event.preventDefault();
      claimTab(event);
      focusElement(event.shiftKey ? last : first);
      return;
    }
    if (trigger === null) return;

    // A popover opened from a store hands over its anchor, which can be a plain
    // box that focusing does nothing to: the step then goes to its tabbable
    // neighbour, and with none the key is left alone rather than swallowed. Read
    // from the selector, not from `isFocusable`, which also answers no for a
    // trigger a modal layer has made inert — and the focus returns there on close.
    const reachable = trigger.matches(FOCUSABLE_SELECTOR) ? trigger : null;

    // The document order the author sees, skipping anything that lives inside
    // the portalled content. Ordered by document position and not by index in
    // the list: an anchor that is only programmatically focusable — a context
    // menu's region, which carries `tabindex="-1"` — is filtered out of
    // `getTabbables`, so `indexOf` returned -1 and `slice(0)` handed back the
    // whole document. Tab then landed on the first tabbable of the page instead
    // of on the one after the anchor.
    const outside = (mask: number): HTMLElement[] =>
      getTabbables(doc.body).filter(
        (candidate) =>
          (trigger.compareDocumentPosition(candidate) & mask) !== 0 && !inside(tree, candidate),
      );

    const nested = !contains(node, current);

    if (event.shiftKey && (current === first || nested)) {
      const target = reachable ?? outside(DOCUMENT_POSITION_PRECEDING).at(-1) ?? null;
      if (target === null) return;
      event.preventDefault();
      claimTab(event);
      focusElement(target);
      options.onFocusOut?.(target);
      return;
    }

    if (!event.shiftKey && (current === last || nested)) {
      const next = outside(DOCUMENT_POSITION_FOLLOWING)[0] ?? null;
      if (next === null && reachable === null) return;
      event.preventDefault();
      claimTab(event);
      focusElement(next ?? reachable);
      options.onFocusOut?.(next);
    }
  };

  const remove = addDomEvent(doc, "keydown", onKeyDown, { capture: true });
  if (options.placeOnDispose === undefined) return remove;
  const removeClick = addDomEvent(
    doc,
    "click",
    () => {
      held = null;
    },
    { capture: true },
  );
  return () => {
    remove();
    removeClick();
    placeHeld();
  };
}
