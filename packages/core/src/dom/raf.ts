/**
 * Frame helpers take the window explicitly: the core never reaches for a global,
 * and a component mounted in an iframe or a popup schedules on the right clock.
 */

export function raf(win: Window, fn: VoidFunction): VoidFunction {
  const id = win.requestAnimationFrame(fn);
  return () => win.cancelAnimationFrame(id);
}

/**
 * Two frames, not one. An adapter can mount portalled content after `connect`
 * returns, so initial focus and first measurement have to wait for the frame
 * *after* the one that inserted the node (research/core.md §1.4).
 */
export function rafs(win: Window, fn: VoidFunction): VoidFunction {
  let cancelInner: VoidFunction | undefined;
  const cancelOuter = raf(win, () => {
    cancelInner = raf(win, fn);
  });
  return () => {
    cancelOuter();
    cancelInner?.();
  };
}

export function nextTick(fn: VoidFunction): VoidFunction {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) fn();
  });
  return () => {
    cancelled = true;
  };
}

export function timeout(win: Window, fn: VoidFunction, ms: number): VoidFunction {
  const id = win.setTimeout(fn, ms);
  return () => win.clearTimeout(id);
}
