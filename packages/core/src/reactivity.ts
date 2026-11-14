/**
 * The reference `ReactivityAdapter`: no framework, no scheduler, no dependency.
 *
 * It exists to let the core be tested the way the exit criterion of Phase 2
 * demands: a machine driving real DOM attributes with no framework in the room.
 *
 * Propagation is synchronous and coalesced by `batch`: one event in, one
 * notification out. An adapter that needs microtask coalescing wraps this rather
 * than forking it.
 *
 * **It is not the store `@standarui/vanilla` builds on**, which this header
 * claimed until the vanilla adapter was written and measured the order. `flush`
 * runs the trackers first and notifies its listeners after, so a listener that
 * paints the DOM paints it *after* `watch` has already moved the machine's state
 * — and moving to `open` installs effects that resolve their node eagerly
 * (`trapFocus(getContentEl(scope))`). An overlay would install its focus trap,
 * its scroll lock and `hideOthers` against a surface that is not in the document
 * yet. React does not hit this because its watchers run in a layout effect, i.e.
 * after the commit that mounted the surface; the vanilla store reproduces that
 * order deliberately. The harness is safe because it mounts its whole markup up
 * front and never adds a part.
 */

import {
  type Bindable,
  type BindableParams,
  createBindable,
  type ReactivityAdapter,
} from "./machine/reactivity";
import { arrayEquals } from "./utils/equality";
import { invariant } from "./utils/invariant";

const MAX_PASSES = 50;

interface Tracker {
  readonly deps: () => readonly unknown[];
  readonly effect: VoidFunction;
  last: readonly unknown[];
}

export interface ReactivityRoot {
  readonly adapter: ReactivityAdapter;
  /** Called once per settled batch, after trackers have run. */
  subscribe(listener: VoidFunction): VoidFunction;
  /**
   * Re-runs the trackers and notifies. This is how an adapter reports a change the
   * graph cannot see for itself — new props coming down. Context writes flush on
   * their own; a prop is read through a getter the root never observed.
   */
  flush(): void;
  dispose(): void;
}

export function createReactivityRoot(): ReactivityRoot {
  const listeners = new Set<VoidFunction>();
  const trackers: Tracker[] = [];
  const cleanups: VoidFunction[] = [];
  let depth = 0;
  let dirty = false;
  let flushing = false;

  // Re-entrancy is the norm here, not the exception: trackers and listeners write.
  // A write during a flush marks the graph dirty and buys another pass instead of
  // recursing, and listeners only fire on a pass that settled.
  const flush = (): void => {
    if (flushing) return;
    flushing = true;
    try {
      let passes = 0;
      while (dirty) {
        dirty = false;
        for (const tracker of trackers) {
          const next = tracker.deps();
          if (arrayEquals(tracker.last, next)) continue;
          tracker.last = next;
          tracker.effect();
        }
        if (!dirty) {
          for (const listener of [...listeners]) listener();
        }
        passes += 1;
        invariant(passes <= MAX_PASSES, `reactivity did not settle after ${MAX_PASSES} passes`);
      }
    } finally {
      flushing = false;
    }
  };

  const notify = (): void => {
    dirty = true;
    if (depth === 0) flush();
  };

  const adapter: ReactivityAdapter = {
    bindable: <V>(init: () => BindableParams<V>): Bindable<V> =>
      createBindable(init, (initial) => {
        let value = initial;
        return {
          get: (): V => value,
          set: (next: V): void => {
            value = next;
            notify();
          },
        };
      }),

    memo: <V>(compute: () => V, deps: () => readonly unknown[]): (() => V) => {
      let cache: { deps: readonly unknown[]; value: V } | undefined;
      return (): V => {
        const next = deps();
        if (cache === undefined || !arrayEquals(cache.deps, next)) {
          cache = { deps: next, value: compute() };
        }
        return cache.value;
      };
    },

    // Registration does not fire the effect: a watcher reacts to changes, it does
    // not replay the initial state (that is what entry actions are for).
    track: (deps: () => readonly unknown[], effect: VoidFunction): void => {
      trackers.push({ deps, effect, last: deps() });
    },

    batch: (fn: VoidFunction): void => {
      depth += 1;
      try {
        fn();
      } finally {
        depth -= 1;
        if (depth === 0 && dirty) flush();
      }
    },

    onCleanup: (dispose: VoidFunction): void => {
      cleanups.push(dispose);
    },
  };

  return {
    adapter,
    subscribe: (listener: VoidFunction): VoidFunction => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: notify,
    dispose: (): void => {
      for (let index = cleanups.length - 1; index >= 0; index--) cleanups[index]?.();
      cleanups.length = 0;
      trackers.length = 0;
      listeners.clear();
    },
  };
}
