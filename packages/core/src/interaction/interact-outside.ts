/**
 * The raw plumbing for "the user interacted somewhere else". It deliberately does
 * NOT decide what "elsewhere" means: that answer belongs to the layer stack, so a
 * popover portalled out of a dialog is not treated as outside its own parent
 * (research/core.md §5, piège 2). The predicate is injected.
 *
 * Listeners are native and in capture, never routed through an adapter's
 * synthetic system — React's root delegation would otherwise let the outside
 * pointerdown land before the trigger's own handler and reopen what it just
 * closed (piège 4).
 *
 * A pointer that goes down inside and comes up outside is a drag, not an outside
 * interaction: the decision is taken on pointerdown and confirmed on pointerup.
 */

import { addDomEvent } from "../dom/event";
import { contains, getEventTarget, isHTMLElement } from "../dom/query";

export interface InteractOutsideOptions {
  readonly onPointerDownOutside?: ((event: PointerEvent) => void) | undefined;
  readonly onFocusOutside?: ((event: FocusEvent) => void) | undefined;
  readonly onInteractOutside?: ((event: Event) => void) | undefined;
  /** Extra exclusions — the layer stack, a portalled subtree, a trigger. */
  readonly isOutside?: ((target: HTMLElement) => boolean) | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
}

const NOOP: VoidFunction = () => {};

export function trackInteractOutside(
  node: HTMLElement | null | undefined,
  options: InteractOutsideOptions,
): VoidFunction {
  const doc = node?.ownerDocument;
  if (node === null || node === undefined || doc === undefined) return NOOP;

  let pointerDownWasOutside = false;

  const outside = (event: Event): boolean => {
    const target = getEventTarget(event);
    if (!isHTMLElement(target)) return false;
    if (contains(node, target)) return false;
    // A target already detached from the document is the remains of the click
    // that removed it, not a click somewhere else.
    if (!contains(doc, target)) return false;
    return options.isOutside?.(target) ?? true;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (options.isDisabled?.() === true) {
      pointerDownWasOutside = false;
      return;
    }
    pointerDownWasOutside = outside(event);
    if (pointerDownWasOutside) options.onPointerDownOutside?.(event);
  };

  const onPointerUp = (event: PointerEvent): void => {
    const wasOutside = pointerDownWasOutside;
    pointerDownWasOutside = false;
    if (!wasOutside || !outside(event)) return;
    options.onInteractOutside?.(event);
  };

  // Focus leaving is reported on its own channel and never on the pointer's. It
  // used to call both, which made "dismiss on an outside click but not when focus
  // leaves" — what a popover anchored to a field wants — inexpressible, and closed
  // a non-modal surface with `outside-pointer` when nobody had pointed at anything.
  // Nobody saw it because a dialog is modal by default and traps the focus.
  const onFocusIn = (event: FocusEvent): void => {
    if (options.isDisabled?.() === true || !outside(event)) return;
    options.onFocusOutside?.(event);
  };

  const disposers = [
    addDomEvent(doc, "pointerdown", onPointerDown, { capture: true }),
    addDomEvent(doc, "pointerup", onPointerUp, { capture: true }),
    addDomEvent(doc, "focusin", onFocusIn, { capture: true }),
  ];

  return () => {
    for (let index = disposers.length - 1; index >= 0; index--) disposers[index]?.();
  };
}
