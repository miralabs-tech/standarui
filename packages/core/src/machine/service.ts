/**
 * The single interpreter. Zag duplicates it inside every framework's `useMachine`;
 * here there is one, parameterised by the injected `ReactivityAdapter` — that is
 * the "Zag v1 amélioré" decision of architecture.md.
 *
 * `createService` performs no side effect: it can run during an SSR render or a
 * React render pass. Effects and entry actions only happen in `start()`, and
 * `stop()` undoes exactly what `start()` did, in reverse — StrictMode's
 * mount/unmount/mount is therefore a no-op on state.
 */

import { isDev } from "../utils/env";
import { invariant, warn } from "../utils/invariant";
import type { Bindable, BindableParams, ReactivityAdapter } from "./reactivity";
import { createScope } from "./scope";
import type {
  ComputedAccessor,
  ContextAccessor,
  EffectCleanup,
  EventAccessor,
  EventOf,
  Machine,
  MachineParams,
  MachineSchema,
  PropAccessor,
  PropsOf,
  RefsAccessor,
  Service,
  ServiceRuntime,
  ServiceStatus,
  StateAccessor,
  StateNode,
  StateOf,
  TagOf,
  Transition,
  TransitionDefinition,
  TransitionMap,
} from "./types";

const INIT_EVENT = { type: "MACHINE.INIT" } as const;

/**
 * Spreading a consumer's props produces explicit `undefined`s, and
 * `{ dir: "ltr", ...props }` would then hand a machine `dir: undefined` — the
 * default silently erased. Stripped here so no machine has to defend itself.
 * The same object comes back when there is nothing to strip, which keeps the
 * memo above from invalidating on identity.
 */
function withoutUndefined<T extends object>(props: T): T {
  let found = false;
  for (const value of Object.values(props)) {
    if (value === undefined) {
      found = true;
      break;
    }
  }
  if (!found) return props;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

export function createService<S extends MachineSchema>(
  machine: Machine<S>,
  reactivity: ReactivityAdapter,
  runtime: ServiceRuntime<S>,
): Service<S> {
  type Params = MachineParams<S>;

  const scope = createScope({
    id: runtime.id,
    ids: runtime.ids,
    getRootNode: runtime.getRootNode,
  });

  const states = machine.states as Readonly<Record<string, StateNode<S> | undefined>>;
  const guards = (machine.implementations?.guards ?? {}) as unknown as Record<
    string,
    ((params: Params) => boolean) | undefined
  >;
  const actionImpls = (machine.implementations?.actions ?? {}) as unknown as Record<
    string,
    ((params: Params) => void) | undefined
  >;
  const effectImpls = (machine.implementations?.effects ?? {}) as unknown as Record<
    string,
    ((params: Params) => EffectCleanup) | undefined
  >;
  const computedImpls = (machine.computed ?? {}) as unknown as Record<
    string,
    ((params: Params) => unknown) | undefined
  >;

  let status: ServiceStatus = "not-started";
  let currentEvent = INIT_EVENT as unknown as EventOf<S>;
  let previousEvent: EventOf<S> | undefined;
  let previousState: StateOf<S> | undefined;
  let transitionActions: readonly string[] | undefined;
  let machineEffects: VoidFunction | undefined;
  const queued: EventOf<S>[] = [];
  const stateEffects = new Map<string, VoidFunction>();

  // --- props ---------------------------------------------------------------

  const resolveProps = reactivity.memo<PropsOf<S>>(
    () => {
      const incoming = withoutUndefined(runtime.props()) as Partial<PropsOf<S>>;
      return machine.props?.({ props: incoming, scope }) ?? (incoming as PropsOf<S>);
    },
    () => [runtime.props()],
  );
  const prop = ((key: string) =>
    (resolveProps() as Record<string, unknown>)[key]) as unknown as PropAccessor<S>;

  // --- context -------------------------------------------------------------

  const contextBindables = (machine.context?.({
    prop,
    scope,
    bindable: <V>(init: () => BindableParams<V>): Bindable<V> => reactivity.bindable(init),
    getContext: () => context,
    getComputed: () => computed,
    getRefs: () => refs,
    getEvent: () => currentEvent,
  }) ?? {}) as unknown as Record<string, Bindable<unknown> | undefined>;

  const contextBindable = (key: string): Bindable<unknown> => {
    const value = contextBindables[key];
    invariant(value !== undefined, `unknown context key "${key}"`);
    return value;
  };

  const context = {
    get: (key: string) => contextBindable(key).get(),
    set: (key: string, value: unknown) => {
      contextBindable(key).set(value as never);
    },
    initial: (key: string) => contextBindable(key).initial(),
  } as unknown as ContextAccessor<S>;

  // --- refs ----------------------------------------------------------------

  const refsValue = (machine.refs?.({ prop, context, scope }) ?? {}) as Record<string, unknown>;
  const refs = {
    get: (key: string) => refsValue[key],
    set: (key: string, value: unknown) => {
      refsValue[key] = value;
    },
  } as unknown as RefsAccessor<S>;

  // --- computed ------------------------------------------------------------

  // Deliberately not memoised: a computed value must be a cheap pure read of
  // context/props, and a cache here would need invalidation the adapter cannot see.
  const computed = ((key: string) => {
    const compute = computedImpls[key];
    invariant(compute !== undefined, `unknown computed key "${key}"`);
    return compute(params);
  }) as unknown as ComputedAccessor<S>;

  // --- state ---------------------------------------------------------------

  // Hoisted so reading the state never allocates: `init` is called on every read.
  const stateParams: BindableParams<StateOf<S>> = {
    defaultValue: machine.initialState({ prop }),
    onChange: (next, prev) => runTransition(next, prev),
  };
  const state = reactivity.bindable<StateOf<S>>(() => stateParams);

  const stateAccessor: StateAccessor<S> = {
    get: (): StateOf<S> => state.get(),
    previous: (): StateOf<S> | undefined => previousState,
    matches: (...values: readonly StateOf<S>[]): boolean => values.includes(state.get()),
    hasTag: (tag: TagOf<S>): boolean =>
      (states[state.get()]?.tags as readonly string[] | undefined)?.includes(tag) ?? false,
  };

  const event: EventAccessor<S> = {
    current: (): EventOf<S> => currentEvent,
    previous: (): EventOf<S> | undefined => previousEvent,
  };

  const params: Params = {
    prop,
    context,
    computed,
    refs,
    scope,
    state: stateAccessor,
    send,
    get event(): EventOf<S> {
      return currentEvent;
    },
  };

  // --- transitions ---------------------------------------------------------

  function transitionsOf(
    map: TransitionMap<S> | undefined,
  ): Record<string, Transition<S> | undefined> {
    return (map ?? {}) as unknown as Record<string, Transition<S> | undefined>;
  }

  const globalOn = transitionsOf(machine.on);

  function evaluateGuard(guard: TransitionDefinition<S>["guard"]): boolean {
    if (guard === undefined) return true;
    if (typeof guard === "function") return guard(params);
    const negated = guard.startsWith("!");
    const name = negated ? guard.slice(1) : guard;
    const predicate = guards[name];
    invariant(predicate !== undefined, `unknown guard "${name}"`);
    const result = predicate(params);
    return negated ? !result : result;
  }

  function pickTransition(entry: Transition<S> | undefined): TransitionDefinition<S> | undefined {
    if (entry === undefined) return undefined;
    if (!Array.isArray(entry)) {
      const single = entry as TransitionDefinition<S>;
      return evaluateGuard(single.guard) ? single : undefined;
    }
    return (entry as readonly TransitionDefinition<S>[]).find((candidate) =>
      evaluateGuard(candidate.guard),
    );
  }

  function runActions(names: readonly string[] | undefined): void {
    if (names === undefined) return;
    for (const name of names) {
      const action = actionImpls[name];
      invariant(action !== undefined, `unknown action "${name}"`);
      action(params);
    }
  }

  function installEffects(names: readonly string[]): VoidFunction {
    const cleanups: VoidFunction[] = [];
    for (const name of names) {
      const effect = effectImpls[name];
      invariant(effect !== undefined, `unknown effect "${name}"`);
      const cleanup = effect(params);
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
    // Reverse order: the last effect installed is the first torn down, so an
    // effect can rely on everything set up before it still being alive.
    return () => {
      for (let index = cleanups.length - 1; index >= 0; index--) cleanups[index]?.();
    };
  }

  function enterState(value: string): void {
    const names = states[value]?.effects;
    if (names !== undefined && names.length > 0) {
      stateEffects.set(value, installEffects(names));
    }
    runActions(states[value]?.entry);
  }

  function exitState(value: string): void {
    const cleanup = stateEffects.get(value);
    if (cleanup !== undefined) {
      stateEffects.delete(value);
      cleanup();
    }
    runActions(states[value]?.exit);
  }

  function runTransition(next: StateOf<S>, prev: StateOf<S>): void {
    previousState = prev;
    exitState(prev);
    runActions(transitionActions);
    transitionActions = undefined;
    enterState(next);
  }

  function deliver(current: EventOf<S>): void {
    previousEvent = currentEvent;
    currentEvent = current;

    const value = state.get();
    const stateOn = transitionsOf(states[value]?.on);
    const transition = pickTransition(stateOn[current.type] ?? globalOn[current.type]);
    if (transition === undefined) return;

    const target = (transition.target ?? value) as StateOf<S>;
    if (target !== value) {
      transitionActions = transition.actions;
      state.set(target);
      return;
    }
    if (transition.reenter === true) {
      transitionActions = transition.actions;
      runTransition(target, value);
      return;
    }
    runActions(transition.actions);
  }

  function send(current: EventOf<S>): void {
    if (status === "not-started") {
      // Adapters connect handlers before their mount effect runs; dropping those
      // events would lose a click landing in the same tick as hydration.
      queued.push(current);
      return;
    }
    if (status === "stopped") {
      warn(isDev(), `event "${current.type}" was sent after the service stopped`);
      return;
    }
    reactivity.batch(() => deliver(current));
  }

  // --- lifecycle -----------------------------------------------------------

  const start = (): void => {
    if (status === "started") return;
    status = "started";
    reactivity.batch(() => {
      if (machine.effects !== undefined) machineEffects = installEffects(machine.effects);
      runActions(machine.entry);
      enterState(state.get());
      const pending = queued.splice(0, queued.length);
      for (const current of pending) deliver(current);
    });
  };

  const stop = (): void => {
    if (status !== "started") return;
    status = "stopped";
    reactivity.batch(() => {
      const cleanup = stateEffects.get(state.get());
      if (cleanup !== undefined) {
        stateEffects.delete(state.get());
        cleanup();
      }
      runActions(machine.exit);
      machineEffects?.();
      machineEffects = undefined;
    });
  };

  // Rebuilt rather than spread from `params`: spreading would freeze the `event`
  // getter to whatever the event was at construction time.
  machine.watch?.({
    prop,
    context,
    computed,
    refs,
    scope,
    state: stateAccessor,
    send,
    get event(): EventOf<S> {
      return currentEvent;
    },
    track: (deps, effect) => reactivity.track(deps, effect),
    action: runActions,
  });
  reactivity.onCleanup(stop);

  return {
    state: stateAccessor,
    context,
    prop,
    computed,
    refs,
    event,
    scope,
    send,
    start,
    stop,
    status: (): ServiceStatus => status,
  };
}
