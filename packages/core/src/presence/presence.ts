/**
 * Keeps a node mounted until its exit animation has actually finished.
 *
 * `data-state="closed"` alone is not enough: the adapter would unmount on the
 * same tick and the animation would never be seen (research/core.md §5, piège 7).
 * So the state is applied, one frame is allowed to pass for the transition to
 * start, and `getAnimations()` is asked what is running.
 *
 * The timeout is not paranoia. A tab that goes to the background never fires
 * `finish`, and neither does an animation whose element gets `display: none` mid
 * flight — without a ceiling the node stays mounted for the rest of the session.
 */

export interface PresenceOptions {
  /** Fired when the node may leave the DOM. */
  onExitComplete(): void;
  /** Ceiling on how long an exit is allowed to take. */
  readonly timeout?: number | undefined;
  /** Skip the wait entirely — reduced motion, or a first render. */
  readonly immediate?: boolean | undefined;
}

export interface Presence {
  /** `present` is the machine's open state; `node` is the surface, if mounted. */
  setPresent(present: boolean, node: HTMLElement | null | undefined): void;
  isPresent(): boolean;
  /** True while an exit animation is still running. */
  isExiting(): boolean;
  destroy(): void;
}

const DEFAULT_TIMEOUT = 1000;

/**
 * Endless animations are dropped rather than awaited. A spinner still turning
 * inside the surface has a `finished` that never settles, so waiting on it would
 * turn every close into the full timeout ceiling.
 */
function finite(animations: readonly Animation[]): Animation[] {
  return animations.filter(
    (animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
  );
}

/**
 * The node's own animations decide when the exit is over; the subtree answers
 * only when the node itself has none.
 *
 * Reading the subtree unconditionally was the first shape of this, and it cannot
 * tell an exit from anything else finite that happens to be running inside the
 * surface at the moment it closes — a close trigger releasing its press spring
 * outlasts the surface's own fade by twice, and the node would leave on a
 * stranger's clock. Filtering the infinite ones was never the whole hazard: it
 * only stopped a spinner from pinning the node to the ceiling.
 *
 * The fallback is what keeps the case the subtree read was written for: an exit
 * is not always on the surface itself — a sheet that slides its own inner panel
 * animates a descendant, and asking the content node alone would measure that
 * exit as zero-length and cut it on the very next frame. Every surface this
 * library ships today animates its own content node, so the fallback is for a
 * shape that does not exist yet rather than one being taken away.
 */
function exitAnimations(node: HTMLElement): Animation[] {
  const own = finite(node.getAnimations?.() ?? []);
  if (own.length > 0) return own;
  return finite(node.getAnimations?.({ subtree: true }) ?? []);
}

export function createPresence(options: PresenceOptions): Presence {
  let present = false;
  let exiting = false;
  let generation = 0;
  let cancelFrame: VoidFunction | undefined;
  let cancelTimeout: VoidFunction | undefined;

  const stopWaiting = (): void => {
    cancelFrame?.();
    cancelFrame = undefined;
    cancelTimeout?.();
    cancelTimeout = undefined;
  };

  const complete = (): void => {
    stopWaiting();
    exiting = false;
    present = false;
    options.onExitComplete();
  };

  return {
    setPresent(next: boolean, node: HTMLElement | null | undefined): void {
      generation += 1;
      const current = generation;

      if (next) {
        // Re-opening mid-exit: cancel the teardown, the node never left.
        stopWaiting();
        exiting = false;
        present = true;
        return;
      }

      if (!present) return;
      const win = node?.ownerDocument.defaultView;
      if (options.immediate === true || node == null || win === null || win === undefined) {
        complete();
        return;
      }

      exiting = true;
      // One frame: the transition triggered by `data-state="closed"` does not
      // exist yet at the moment the attribute is written.
      const frame = win.requestAnimationFrame(() => {
        if (current !== generation) return;
        cancelFrame = undefined;
        const animations = exitAnimations(node);
        if (animations.length === 0) {
          complete();
          return;
        }
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (current === generation) complete();
        });
      });
      cancelFrame = () => win.cancelAnimationFrame(frame);

      const timer = win.setTimeout(() => {
        if (current === generation) complete();
      }, options.timeout ?? DEFAULT_TIMEOUT);
      cancelTimeout = () => win.clearTimeout(timer);
    },

    isPresent: (): boolean => present || exiting,
    isExiting: (): boolean => exiting,
    destroy(): void {
      generation += 1;
      stopWaiting();
      present = false;
      exiting = false;
    },
  };
}
