/**
 * The React half of the `ReactivityAdapter` contract. The interpreter stays in the
 * core; this file only says how a value is stored and how a change becomes a
 * render.
 *
 * One deliberate divergence from the roadmap line "bindable sur useState": with a
 * single interpreter created once, the set of bindables is only discovered while
 * `createService` runs, inside the first render — and hooks cannot be allocated
 * from there, because a lazily initialised ref makes the hook count differ
 * between StrictMode's two render passes ("rendered fewer hooks than expected").
 * Zag can put a `useState` behind every bindable precisely because it replays the
 * whole machine setup on every render, which is what the "un seul interpréteur
 * dans le core" decision rules out.
 *
 * So a cell is a plain mutable variable owned by the component, and React state
 * carries nothing but a version counter, bumped once per settled batch. That is
 * strictly fewer renders than one `setState` per context key, and the value the
 * component reads through `connect` is always the one the machine just wrote —
 * there is no store to tear against, because the store belongs to the component
 * doing the reading.
 */

import {
  arrayEquals,
  type Bindable,
  type BindableParams,
  createBindable,
  invariant,
  type ReactivityAdapter,
} from "@standarui/core";
import { useRef, useState } from "react";

const MAX_PASSES = 50;

interface Watcher {
  readonly deps: () => readonly unknown[];
  readonly effect: VoidFunction;
  last: readonly unknown[];
}

export interface ReactivityHandle {
  readonly adapter: ReactivityAdapter;
  /** Runs `machine.watch` until the graph settles. Called after every commit. */
  runWatchers(): void;
  /** Runs what the core registered through `onCleanup`, newest first. */
  runCleanups(): void;
}

const increment = (version: number): number => version + 1;

export function createReactivity(scheduleRender: VoidFunction): ReactivityHandle {
  const watchers: Watcher[] = [];
  const cleanups: VoidFunction[] = [];
  let depth = 0;
  let dirty = false;

  /**
   * Synchronous at depth 0 rather than deferred to a microtask: React 19
   * auto-batches every context there is, so a microtask would buy no coalescing
   * that React does not already do — it would only add a turn of latency and put
   * the write out of reach of `flushSync`.
   */
  const notify = (): void => {
    dirty = true;
    if (depth > 0) return;
    dirty = false;
    scheduleRender();
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

    // Registration records the current deps without firing: a watcher reacts to a
    // change, it does not replay the initial state.
    track: (deps: () => readonly unknown[], effect: VoidFunction): void => {
      watchers.push({ deps, effect, last: deps() });
    },

    batch: (fn: VoidFunction): void => {
      depth += 1;
      try {
        fn();
      } finally {
        depth -= 1;
        if (depth === 0 && dirty) {
          dirty = false;
          scheduleRender();
        }
      }
    },

    onCleanup: (dispose: VoidFunction): void => {
      cleanups.push(dispose);
    },
  };

  return {
    adapter,

    runWatchers(): void {
      let passes = 0;
      let changed = true;
      // A watcher that writes context can make another watcher's deps stale in the
      // same commit; settling here rather than waiting for the next render keeps a
      // derived value from being one frame behind the value it derives from.
      while (changed) {
        changed = false;
        for (const watcher of watchers) {
          const next = watcher.deps();
          if (arrayEquals(watcher.last, next)) continue;
          watcher.last = next;
          changed = true;
          watcher.effect();
        }
        passes += 1;
        invariant(passes <= MAX_PASSES, `watchers did not settle after ${MAX_PASSES} passes`);
      }
    },

    // Kept rather than emptied: StrictMode unmounts and remounts the same handle,
    // and the cleanups the core registered (its `stop`, which is idempotent) have
    // to still be there for the second unmount.
    runCleanups(): void {
      for (let index = cleanups.length - 1; index >= 0; index--) cleanups[index]?.();
    },
  };
}

export function useReactivity(): ReactivityHandle {
  const [, setVersion] = useState(0);
  const handle = useRef<ReactivityHandle | null>(null);
  // `createReactivity` performs no side effect, so StrictMode's second render pass
  // finding the ref already filled is the whole point rather than a hazard.
  handle.current ??= createReactivity(() => setVersion(increment));
  return handle.current;
}
