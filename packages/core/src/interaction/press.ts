/**
 * Unified press tracking over pointer events.
 *
 * Two rules, both learned from React Aria's 2025 rewrite of `usePress`: never
 * call `preventDefault` on a pointer event, and never move focus by hand. The
 * browser already does both correctly, and fighting it is what breaks text
 * selection, drag-and-drop and the iOS keyboard.
 *
 * Pointer capture is what makes press feel native: the finger can slide off the
 * control and come back, and `press-end` / `press-start` fire as it crosses the
 * bounds, so `data-pressed` follows the finger. A press that ends outside the
 * bounds is cancelled, exactly like a native button.
 *
 * A control uses either this or `onClick` — never both, or a touch will fire the
 * machine twice through the compatibility click.
 */

import { isPrimaryPointer } from "../dom/event";

export type PressPointerType = "mouse" | "touch" | "pen" | "keyboard" | "virtual";

export interface PressEvent {
  readonly type: "press-start" | "press-end" | "press" | "press-cancel";
  readonly pointerType: PressPointerType;
  readonly target: HTMLElement;
  readonly originalEvent: Event;
}

export interface PressOptions {
  readonly onPressStart?: ((event: PressEvent) => void) | undefined;
  readonly onPressEnd?: ((event: PressEvent) => void) | undefined;
  readonly onPress?: ((event: PressEvent) => void) | undefined;
  readonly onPressCancel?: ((event: PressEvent) => void) | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
  /**
   * Enter and Space activate the way a native button does. Leave it off on a real
   * `<button>`, which already turns both into a click.
   */
  readonly keyboard?: boolean | undefined;
}

const NOOP: VoidFunction = () => {};

function isWithin(node: HTMLElement, x: number, y: number): boolean {
  const rect = node.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function trackPress(
  node: HTMLElement | null | undefined,
  options: PressOptions,
): VoidFunction {
  if (node === null || node === undefined) return NOOP;

  let pointerId: number | null = null;
  let pointerType: PressPointerType = "mouse";
  let within = false;
  let keyDown = false;

  const disabled = (): boolean => options.isDisabled?.() ?? false;

  const emit = (type: PressEvent["type"], originalEvent: Event): void => {
    const event: PressEvent = { type, pointerType, target: node, originalEvent };
    if (type === "press-start") options.onPressStart?.(event);
    else if (type === "press-end") options.onPressEnd?.(event);
    else if (type === "press") options.onPress?.(event);
    else options.onPressCancel?.(event);
  };

  const release = (event: Event): void => {
    if (pointerId !== null && node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
    pointerId = null;
    if (!within) return;
    within = false;
    emit("press-end", event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (disabled() || pointerId !== null || !isPrimaryPointer(event)) return;
    pointerId = event.pointerId;
    // `pointerType` is "" for some assistive-technology clicks; treat those as
    // virtual so a control can tell a real finger from a screen-reader activation.
    pointerType = (event.pointerType || "virtual") as PressPointerType;
    within = true;
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone, and a programmatic activation has no
      // real pointer to capture. Neither is a reason to drop the press.
    }
    emit("press-start", event);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    const inside = isWithin(node, event.clientX, event.clientY);
    if (inside === within) return;
    within = inside;
    emit(inside ? "press-start" : "press-end", event);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    const activated = within && !disabled();
    release(event);
    if (activated) emit("press", event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    release(event);
    emit("press-cancel", event);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (disabled() || (event.key !== "Enter" && event.key !== " ")) return;
    // Space would scroll the page. This is the one `preventDefault` press makes,
    // and only when it is standing in for a button that is not a `<button>`.
    if (event.key === " ") event.preventDefault();
    if (event.repeat) return;
    pointerType = "keyboard";
    keyDown = true;
    within = true;
    emit("press-start", event);
    // Enter activates on keydown, Space on keyup — APG, and what a native button does.
    if (event.key === "Enter") {
      keyDown = false;
      within = false;
      emit("press-end", event);
      emit("press", event);
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!keyDown || event.key !== " ") return;
    keyDown = false;
    within = false;
    emit("press-end", event);
    if (!disabled()) emit("press", event);
  };

  const onBlur = (event: FocusEvent): void => {
    if (!keyDown) return;
    keyDown = false;
    within = false;
    emit("press-end", event);
    emit("press-cancel", event);
  };

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerCancel);
  if (options.keyboard === true) {
    node.addEventListener("keydown", onKeyDown);
    node.addEventListener("keyup", onKeyUp);
    node.addEventListener("blur", onBlur);
  }

  return () => {
    node.removeEventListener("pointerdown", onPointerDown);
    node.removeEventListener("pointermove", onPointerMove);
    node.removeEventListener("pointerup", onPointerUp);
    node.removeEventListener("pointercancel", onPointerCancel);
    node.removeEventListener("keydown", onKeyDown);
    node.removeEventListener("keyup", onKeyUp);
    node.removeEventListener("blur", onBlur);
    if (pointerId !== null && node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
  };
}
