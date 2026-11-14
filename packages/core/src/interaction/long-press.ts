/**
 * Long press — the touch equivalent of a right click, and the gesture that opens
 * a context menu on iOS. The gamepad reaches the same machines through the Y
 * button (CDC §4.4), so a component never learns the gesture, only the intent.
 *
 * The pointer has to stay put: a long press that drifts is a scroll, and stealing
 * it would make a list unscrollable. `preventDefault` is never called — the native
 * callout is suppressed in CSS with `touch-action` / `-webkit-touch-callout`,
 * where it belongs.
 */

import { isPrimaryPointer } from "../dom/event";
import { timeout } from "../dom/raf";

export interface LongPressEvent {
  readonly target: HTMLElement;
  readonly pointerType: string;
  readonly x: number;
  readonly y: number;
  readonly originalEvent: PointerEvent;
}

export interface LongPressOptions {
  readonly onLongPress: (event: LongPressEvent) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
  /** Milliseconds before it fires. 500 is the iOS context-menu delay. */
  readonly threshold?: number | undefined;
  /** Movement in px that turns the gesture into a scroll. */
  readonly tolerance?: number | undefined;
  /** Mouse long-press is off by default: on a pointer device it is a right click. */
  readonly allowMouse?: boolean | undefined;
}

const NOOP: VoidFunction = () => {};
const DEFAULT_THRESHOLD = 500;
const DEFAULT_TOLERANCE = 10;

export function trackLongPress(
  node: HTMLElement | null | undefined,
  options: LongPressOptions,
): VoidFunction {
  const win = node?.ownerDocument.defaultView;
  if (node === null || node === undefined || win === null || win === undefined) return NOOP;

  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  let cancelTimer: VoidFunction | undefined;
  let origin: { x: number; y: number; pointerId: number } | null = null;

  const cancel = (): void => {
    if (origin === null) return;
    origin = null;
    cancelTimer?.();
    cancelTimer = undefined;
    options.onCancel?.();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (options.isDisabled?.() === true || !isPrimaryPointer(event)) return;
    if (event.pointerType === "mouse" && options.allowMouse !== true) return;

    origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    cancelTimer = timeout(
      win,
      () => {
        origin = null;
        cancelTimer = undefined;
        options.onLongPress({
          target: node,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          originalEvent: event,
        });
      },
      threshold,
    );
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (origin === null || event.pointerId !== origin.pointerId) return;
    const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (moved > tolerance) cancel();
  };

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", cancel);
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("pointerleave", cancel);

  return () => {
    cancel();
    node.removeEventListener("pointerdown", onPointerDown);
    node.removeEventListener("pointermove", onPointerMove);
    node.removeEventListener("pointerup", cancel);
    node.removeEventListener("pointercancel", cancel);
    node.removeEventListener("pointerleave", cancel);
  };
}
