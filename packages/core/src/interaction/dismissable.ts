/**
 * A dismissable layer is `interact-outside` plus Escape plus a place in the stack.
 *
 * Only the top-most layer reacts to Escape — otherwise one key press would close
 * a menu, its popover and the dialog holding both. Outside-membership is answered
 * by the stack, not by `contains`, so a portalled child never dismisses its own
 * parent. And the trigger is excluded by default: without that, clicking a trigger
 * to close would dismiss on pointerdown and reopen on the click that follows.
 */

import { addDomEvent } from "../dom/event";
import { contains } from "../dom/query";
import { trackInteractOutside } from "./interact-outside";
import { type DismissReason, getLayerStack, type Layer, type LayerType } from "./layer-stack";

export interface DismissableOptions {
  readonly id: string;
  readonly type: LayerType;
  readonly modal?: boolean | undefined;
  /** The layer this one opened from — required once either end is portalled. */
  readonly parentId?: string | undefined;
  onDismiss(reason: DismissReason): void;
  readonly onEscapeKeyDown?: ((event: KeyboardEvent) => void) | undefined;
  readonly onPointerDownOutside?: ((event: PointerEvent) => void) | undefined;
  readonly onFocusOutside?: ((event: FocusEvent) => void) | undefined;
  /** Nodes that are logically part of the layer — the trigger, an anchor. */
  readonly exclude?: (() => readonly (HTMLElement | null | undefined)[]) | undefined;
  readonly dismissOnEscape?: boolean | undefined;
  readonly dismissOnOutsidePointer?: boolean | undefined;
  readonly dismissOnFocusOutside?: boolean | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
}

const NOOP: VoidFunction = () => {};

export function trackDismissableLayer(
  node: HTMLElement | null | undefined,
  options: DismissableOptions,
): VoidFunction {
  const doc = node?.ownerDocument;
  if (node === null || node === undefined || doc === undefined) return NOOP;

  const stack = getLayerStack(doc);
  const layer: Layer = {
    id: options.id,
    node,
    type: options.type,
    modal: options.modal ?? false,
    parentId: options.parentId,
    dismiss: (reason) => {
      stack.dismissals += 1;
      options.onDismiss(reason);
    },
  };
  stack.add(layer);

  const isExcluded = (target: HTMLElement): boolean =>
    (options.exclude?.() ?? []).some((excluded) => contains(excluded, target));

  const disposeOutside = trackInteractOutside(node, {
    isDisabled: options.isDisabled,
    isOutside: (target) => !stack.containsTarget(options.id, target) && !isExcluded(target),
    onPointerDownOutside: options.onPointerDownOutside,
    onFocusOutside: (event) => {
      options.onFocusOutside?.(event);
      if (options.dismissOnFocusOutside !== true) return;
      // Same guard as the pointer path, and now that focus has a channel of its own
      // it needs its own copy: a layer under a modal cannot be reached, and the
      // focus that just left it went *into* the modal above.
      if (stack.hasModalAbove(options.id)) return;
      layer.dismiss("focus-outside");
    },
    onInteractOutside: () => {
      if (options.dismissOnOutsidePointer === false) return;
      // A layer under a modal cannot be reached by a pointer anyway; dismissing it
      // would close the wrong surface.
      if (stack.hasModalAbove(options.id)) return;
      layer.dismiss("outside-pointer");
    },
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (options.isDisabled?.() === true || !stack.isTopMost(options.id)) return;
    options.onEscapeKeyDown?.(event);
    if (event.defaultPrevented || options.dismissOnEscape === false) return;
    layer.dismiss("escape");
  };

  const disposeEscape = addDomEvent(doc, "keydown", onKeyDown, { capture: true });

  return () => {
    disposeEscape();
    disposeOutside();
    stack.remove(options.id);
  };
}
