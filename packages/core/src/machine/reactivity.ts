/**
 * The contract every adapter implements (architecture.md: ~100-150 lines per
 * framework). There is a single interpreter in the core; frameworks only inject
 * their reactivity.
 *
 * `bindable` carries the controlled/uncontrolled semantics, and those semantics
 * are the behavioural parity promise of the library — so they are NOT reimplemented
 * per adapter. `createBindable` below is the one implementation; an adapter's
 * `bindable` supplies nothing but a mutable cell and delegates. The cell has to
 * notify on every write, an identical one included (see `Cell`), so a framework
 * primitive that drops those (useState, shallowRef, $state, signal) cannot be the
 * cell itself. The adapters here hold a plain variable and notify on each write.
 */

import { isDev } from "../utils/env";
import { warn } from "../utils/invariant";

export interface BindableParams<V> {
  readonly defaultValue?: V | undefined;
  /** Present (even as `null`) means controlled: the core reports, never writes. */
  readonly value?: V | undefined;
  readonly isEqual?: ((a: V, b: V) => boolean) | undefined;
  readonly onChange?: ((next: V, prev: V) => void) | undefined;
  readonly debugLabel?: string | undefined;
}

export interface Bindable<V> {
  /** The value the bindable was created with — survives later writes. */
  initial(): V;
  get(): V;
  set(next: V | ((prev: V) => V)): void;
  controlled(): boolean;
}

/**
 * The single reactive primitive an adapter has to provide. `set` notifies even
 * when the value is identical: a controlled write the parent absorbs — rejected,
 * or answered with the value it already held — reaches the adapter through
 * nothing else.
 */
export interface Cell<V> {
  get(): V;
  set(value: V): void;
}

export interface ReactivityAdapter {
  bindable<V>(init: () => BindableParams<V>): Bindable<V>;
  memo<V>(compute: () => V, deps: () => readonly unknown[]): () => V;
  track(deps: () => readonly unknown[], effect: VoidFunction): void;
  batch(fn: VoidFunction): void;
  onCleanup(dispose: VoidFunction): void;
}

/**
 * `init` is re-invoked on every read: that is how a controlled value stays fresh
 * when the consumer passes a new prop. Keep it allocation-cheap.
 */
export function createBindable<V>(
  init: () => BindableParams<V>,
  createCell: (initial: V) => Cell<V>,
): Bindable<V> {
  const first = init();
  const initialValue = (first.value ?? first.defaultValue) as V;
  const cell = createCell(initialValue);
  const controlledAtInit = first.value !== undefined;
  let warned = false;

  const controlled = (): boolean => {
    const isControlled = init().value !== undefined;
    if (isDev() && !warned && isControlled !== controlledAtInit) {
      warned = true;
      const label = first.debugLabel ?? "a bindable";
      const from = controlledAtInit ? "controlled" : "uncontrolled";
      warn(
        true,
        `${label} switched from ${from} to ${controlledAtInit ? "un" : ""}controlled. \
Decide once and keep it for the lifetime of the component.`,
      );
    }
    return isControlled;
  };

  const get = (): V => (controlled() ? (init().value as V) : cell.get());

  const set = (next: V | ((prev: V) => V)): void => {
    const params = init();
    const prev = get();
    const value = typeof next === "function" ? (next as (prev: V) => V)(prev) : next;
    const equal = params.isEqual ?? Object.is;
    // Without this guard a value that round-trips back identical re-emits onChange
    // forever (research/core.md §5, piège 1).
    if (equal(value, prev)) return;
    if (params.value === undefined) cell.set(value);
    params.onChange?.(value, prev);
    // A parent may answer with the value it already held, which a framework drops
    // without rendering; touching the cell is the only way the adapter hears of it.
    if (params.value !== undefined) cell.set(cell.get());
  };

  return { initial: (): V => initialValue, get, set, controlled };
}
