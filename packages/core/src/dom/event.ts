/**
 * Every listener the core installs comes back with its own teardown: an effect
 * that cannot be undone is a leak waiting for the first unmount. Global listeners
 * are added natively (and usually in capture) from inside effects, never through
 * an adapter's synthetic system — React's root delegation would otherwise let an
 * outside-click close a layer before the trigger's own handler has run
 * (research/core.md §5, piège 4).
 */

type DOMEventMap = DocumentEventMap & HTMLElementEventMap & WindowEventMap;

export function addDomEvent<K extends keyof DOMEventMap>(
  target: EventTarget | null | undefined,
  type: K,
  listener: (event: DOMEventMap[K]) => void,
  options?: AddEventListenerOptions,
): VoidFunction {
  if (target === null || target === undefined) return () => {};
  const handler = listener as EventListener;
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** IME composition: a keydown mid-composition must never reach a machine. */
export function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export function isModifiedEvent(event: MouseEvent | KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
}

/** A left-button, unmodified press — the only kind that activates a control. */
export function isPrimaryPointer(event: PointerEvent | MouseEvent): boolean {
  return event.button === 0 && !event.ctrlKey;
}
