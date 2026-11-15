/**
 * Focus trap without sentinel nodes.
 *
 * The usual implementation injects two tabbable spans around the container. They
 * work, and they also break `:first-child` styling, show up in the accessibility
 * tree of some screen readers, and get stripped by frameworks that reconcile
 * children. Intercepting Tab in capture is fewer moving parts and leaves the DOM
 * the author wrote intact.
 *
 * Traps nest: only the last one activated reacts, so a popover inside a dialog
 * traps within the popover and hands control back on close.
 */

import { addDomEvent, isComposingEvent } from "../dom/event";
import { contains, DOCUMENT_POSITION_FOLLOWING, DOCUMENT_POSITION_PRECEDING } from "../dom/query";
import { rafs } from "../dom/raf";
import { focusElement, getTabbableEdges, getTabbables } from "../nav";
import { restoreFocus } from "./restore-focus";
import { holdTab, isClaimedTab } from "./tab-handoff";

export interface FocusTrapOptions {
  /** Where focus goes on activation. Defaults to the first tabbable, then the container. */
  readonly initialFocus?: (() => HTMLElement | null | undefined) | undefined;
  /** Where focus returns on teardown. Defaults to whatever had it before. */
  readonly finalFocus?: (() => HTMLElement | null | undefined) | undefined;
  readonly loop?: boolean | undefined;
  readonly restoreFocus?: boolean | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
  /**
   * Widens "inside" past the container's DOM subtree — a menu portalled out of a
   * dialog is not a descendant of it, and is still part of it. Focus that this
   * accepts is neither pulled back nor taken on activation. A Tab from it whose
   * native step stays in the child layer is left to the browser, unless a
   * handler moves the focus back into the surface first; any other is prevented
   * in capture. Either way, once the child layer has answered, the trap moves
   * the focus one stop on from wherever that left it — unless the layer placed
   * it itself through `proxyTabFocus`.
   *
   * One limit: the first case is only seen in the bubble phase. A handler that
   * moves the focus back into the surface and also stops the propagation leaves
   * the trap nothing to answer, and the browser steps on from the surface.
   */
  readonly owns?: ((target: Node | null) => boolean) | undefined;
}

const NOOP: VoidFunction = () => {};
const active = new WeakMap<Document, HTMLElement[]>();

function activeTraps(doc: Document): HTMLElement[] {
  const existing = active.get(doc);
  if (existing !== undefined) return existing;
  const created: HTMLElement[] = [];
  active.set(doc, created);
  return created;
}

export function trapFocus(
  node: HTMLElement | null | undefined,
  options: FocusTrapOptions = {},
): VoidFunction {
  const doc = node?.ownerDocument;
  const win = doc?.defaultView;
  if (
    node === null ||
    node === undefined ||
    doc === undefined ||
    win === null ||
    win === undefined
  ) {
    return NOOP;
  }

  const traps = activeTraps(doc);
  traps.push(node);
  const restoreTo =
    options.restoreFocus === false ? null : (doc.activeElement as HTMLElement | null);
  const enabled = (): boolean => options.isDisabled?.() !== true && traps.at(-1) === node;
  const inChildLayer = (target: Node | null): boolean =>
    !contains(node, target) && options.owns?.(target) === true;
  const isInside = (target: Node | null): boolean => contains(node, target) || inChildLayer(target);

  // Two frames: an adapter can portal the content in after `connect` returns, so
  // the first tabbable may not exist yet (research/core.md §1.4).
  const cancelInitial = rafs(win, () => {
    if (!enabled()) return;
    if (inChildLayer(doc.activeElement)) return;
    const target = options.initialFocus?.() ?? getTabbableEdges(node)[0] ?? node;
    if (target === node && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
    focusElement(target);
  });

  let linkStep: {
    readonly event: KeyboardEvent;
    readonly from: Element;
    readonly link: HTMLElement;
  } | null = null;

  const linkAfter = (
    tabbables: readonly HTMLElement[],
    from: Element | null,
    backward: boolean,
  ): HTMLElement | undefined => {
    const index = tabbables.indexOf(from as HTMLElement);
    const neighbour = index === -1 ? undefined : tabbables[index + (backward ? -1 : 1)];
    return neighbour?.matches("a[href], area[href]") === true ? neighbour : undefined;
  };

  const holdAtEdge = (event: KeyboardEvent, current: Element | null): void => {
    const tabbables = getTabbables(node);
    if (tabbables.length === 0) {
      // Nothing to move to: hold focus on the container rather than let it escape.
      event.preventDefault();
      focusElement(node);
      return;
    }

    const first = tabbables[0] as HTMLElement;
    const last = tabbables.at(-1) as HTMLElement;

    if (!contains(node, current)) {
      event.preventDefault();
      focusElement(event.shiftKey ? last : first);
      return;
    }

    // WebKit leaves links out of its own Tab sequence unless the system asks for
    // them, so its step from a control can cross a link and then leave the
    // surface. When the next stop here is a link, the step is taken instead, but
    // in the bubble phase and only if nothing answered the key and the focus did
    // not move, so a control that handles its own Tab keeps it. A handler that
    // stops the propagation leaves the browser's step as it is, and in WebKit that
    // step can leave the surface.
    const link = linkAfter(tabbables, current, event.shiftKey);
    if (link !== undefined) {
      linkStep = { event, from: current as Element, link };
      return;
    }

    if (options.loop === false) return;
    if (!event.shiftKey && current === last) {
      event.preventDefault();
      focusElement(first);
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      focusElement(last);
    }
  };

  /**
   * Whether the browser's own Tab from `from` stays in a child layer. Landing in
   * the surface does not count: from a portal, the browser lands on the surface's
   * edge and not after the element the layer was opened from.
   */
  const nativeStepStaysInChild = (from: Element, backward: boolean): boolean => {
    const mask = backward ? DOCUMENT_POSITION_PRECEDING : DOCUMENT_POSITION_FOLLOWING;
    const candidates = getTabbables(doc.body).filter(
      (candidate) => (from.compareDocumentPosition(candidate) & mask) !== 0,
    );
    const next = backward ? candidates.at(-1) : candidates[0];
    return next !== undefined && inChildLayer(next);
  };

  /**
   * Moves the focus one stop on from wherever it is now: from a stop of the
   * surface to its neighbour, wrapping unless `loop` is off, and from anywhere
   * else to the surface's edge.
   */
  const stepOn = (backward: boolean): void => {
    const tabbables = getTabbables(node);
    const edge = (backward ? tabbables.at(-1) : tabbables[0]) ?? node;
    const index = tabbables.indexOf(doc.activeElement as HTMLElement);
    if (index === -1) {
      focusElement(edge);
      return;
    }
    const next = tabbables[index + (backward ? -1 : 1)];
    if (next !== undefined) focusElement(next);
    else if (options.loop !== false) focusElement(edge);
  };

  // A Tab held from a child layer, waiting for that layer to answer it — a menu
  // closes and hands the focus back to its trigger, a proxy places it past its
  // anchor — before the trap decides where the focus goes.
  let pending: {
    readonly event: KeyboardEvent;
    readonly held: boolean;
    readonly cancel: VoidFunction;
  } | null = null;

  const settle = (event: KeyboardEvent, fromBubble: boolean): void => {
    if (pending?.event !== event) return;
    const { held, cancel } = pending;
    cancel();
    pending = null;
    if (!enabled() || isClaimedTab(event)) return;
    const backward = event.shiftKey;
    if (!held) {
      // Left to the browser in capture, whose step stayed in the child layer —
      // unless a handler since moved the focus out of it, back into the surface.
      if (!fromBubble || event.defaultPrevented || inChildLayer(doc.activeElement)) return;
      event.preventDefault();
      stepOn(backward);
      return;
    }
    if (fromBubble && inChildLayer(doc.activeElement)) {
      // A child layer that closes on Tab can only hand the focus back once its
      // framework flushes, and under Playwright's Firefox React's flush lands
      // after the whole dispatch rather than between listeners. A microtask
      // queued now runs behind it.
      void Promise.resolve().then(() => {
        if (enabled()) stepOn(backward);
      });
      return;
    }
    stepOn(backward);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.defaultPrevented || !enabled()) return;
    if (event.ctrlKey || event.altKey || event.metaKey || isComposingEvent(event)) return;
    const current = doc.activeElement;
    if (!inChildLayer(current)) {
      holdAtEdge(event, current);
      return;
    }
    if (current !== null && nativeStepStaysInChild(current, event.shiftKey)) {
      pending = { event, held: false, cancel: NOOP };
      return;
    }
    // Prevented here, in capture: a listener further down may stop the event
    // before any bubble-phase check sees it, and the browser's own step from a
    // portal leaves the modal. The bubble listener settles it once the child
    // layer has answered; the task is for when nothing let it get that far.
    holdTab(event);
    const timer = win.setTimeout(() => settle(event, false), 0);
    pending = { event, held: true, cancel: () => win.clearTimeout(timer) };
  };

  const onKeyDownSettled = (event: KeyboardEvent): void => {
    settle(event, true);
    if (linkStep?.event !== event) return;
    const { from, link } = linkStep;
    linkStep = null;
    if (event.defaultPrevented || !enabled() || doc.activeElement !== from) return;
    if (linkAfter(getTabbables(node), from, event.shiftKey) !== link) return;
    event.preventDefault();
    focusElement(link);
  };

  // Focus can also arrive from outside the keyboard — a click on the page behind,
  // or a screen reader moving the virtual cursor.
  const onFocusIn = (event: FocusEvent): void => {
    if (!enabled()) return;
    const target = event.target as HTMLElement | null;
    if (isInside(target)) return;
    focusElement(getTabbableEdges(node)[0] ?? node);
  };

  const disposers = [
    addDomEvent(doc, "keydown", onKeyDown, { capture: true }),
    addDomEvent(win, "keydown", onKeyDownSettled),
    addDomEvent(doc, "focusin", onFocusIn, { capture: true }),
  ];

  return () => {
    cancelInitial();
    pending?.cancel();
    pending = null;
    for (let index = disposers.length - 1; index >= 0; index--) disposers[index]?.();
    const position = traps.lastIndexOf(node);
    if (position !== -1) traps.splice(position, 1);
    const target = options.finalFocus?.() ?? restoreTo;
    // Only restore what is still in the document: the element that opened the
    // layer may have been unmounted with it.
    if (target != null && contains(doc, target)) restoreFocus(target, node);
  };
}
