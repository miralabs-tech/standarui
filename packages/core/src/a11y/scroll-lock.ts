/**
 * Body scroll lock without the jump.
 *
 * Hiding the overflow removes the scrollbar, the viewport gets wider, and the
 * whole page shifts sideways behind the dialog. The width it took is given back
 * as padding, and published as `--sui-scrollbar-width` so a fixed header can
 * compensate too.
 *
 * Counted per document: a popover inside a dialog inside a drawer locks three
 * times and must unlock once, at the end.
 */

const counts = new WeakMap<Document, number>();
const restores = new WeakMap<Document, VoidFunction>();

const NOOP: VoidFunction = () => {};

function applyLock(doc: Document): VoidFunction {
  const win = doc.defaultView;
  const body = doc.body;
  const root = doc.documentElement;
  if (win === null) return NOOP;

  const scrollbarWidth = win.innerWidth - root.clientWidth;
  const previousOverflow = body.style.overflow;
  const previousPadding = body.style.paddingRight;
  const previousProperty = root.style.getPropertyValue("--sui-scrollbar-width");
  const paddingRight = win.getComputedStyle(body).paddingRight;

  root.style.setProperty("--sui-scrollbar-width", `${scrollbarWidth}px`);
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `calc(${paddingRight} + ${scrollbarWidth}px)`;
  }

  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPadding;
    if (previousProperty === "") root.style.removeProperty("--sui-scrollbar-width");
    else root.style.setProperty("--sui-scrollbar-width", previousProperty);
  };
}

export function lockScroll(doc: Document | null | undefined): VoidFunction {
  if (doc === null || doc === undefined) return NOOP;

  const count = counts.get(doc) ?? 0;
  if (count === 0) restores.set(doc, applyLock(doc));
  counts.set(doc, count + 1);

  let released = false;
  return () => {
    // Idempotent: an effect torn down twice must not unlock somebody else's lock.
    if (released) return;
    released = true;
    const current = (counts.get(doc) ?? 1) - 1;
    if (current > 0) {
      counts.set(doc, current);
      return;
    }
    counts.delete(doc);
    restores.get(doc)?.();
    restores.delete(doc);
  };
}

export function isScrollLocked(doc: Document): boolean {
  return (counts.get(doc) ?? 0) > 0;
}
