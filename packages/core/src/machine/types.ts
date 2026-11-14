/**
 * A machine is pure data: `createMachine` is a typed identity, nothing runs at
 * creation (research/core.md §1.1). This file is the whole type surface of that
 * data plus the accessors the interpreter hands to guards, actions and effects.
 *
 * The schema is a type-level bag. Each slot is optional and untyped in the base,
 * and resolved through the `*Of<S>` helpers, so a component declares only what it
 * has:
 *
 *   interface ToggleSchema extends MachineSchema {
 *     state: "off" | "on"
 *     props: ToggleMachineProps
 *     context: { pressed: boolean }
 *     event: { type: "TRIGGER.CLICK" } | { type: "PRESSED.SET"; pressed: boolean }
 *     action: "togglePressed" | "invokeOnChange"
 *   }
 */

import type { Bindable, BindableParams } from "./reactivity";
import type { PartIdOverrides, RootNode, Scope } from "./scope";

/**
 * Events are named `PART.VERB` — a hard rule (architecture.md), enforced by the
 * template literal rather than by review: `{ type: "click" }` does not typecheck.
 */
export interface EventObject {
  readonly type: `${string}.${string}`;
}

export interface MachineSchema {
  readonly state: string;
  readonly tag?: string;
  readonly props?: unknown;
  readonly context?: unknown;
  readonly computed?: unknown;
  readonly refs?: unknown;
  readonly event?: EventObject;
  readonly action?: string;
  readonly guard?: string;
  readonly effect?: string;
}

type Empty = Record<never, never>;

export type StateOf<S extends MachineSchema> = S["state"];
export type TagOf<S extends MachineSchema> = S extends { tag: infer T extends string } ? T : never;
export type PropsOf<S extends MachineSchema> = S extends { props: infer P } ? P : Empty;
export type ContextOf<S extends MachineSchema> = S extends { context: infer C } ? C : Empty;
export type ComputedOf<S extends MachineSchema> = S extends { computed: infer C } ? C : Empty;
export type RefsOf<S extends MachineSchema> = S extends { refs: infer R } ? R : Empty;
export type EventOf<S extends MachineSchema> = S extends { event: infer E extends EventObject }
  ? E
  : EventObject;
export type ActionOf<S extends MachineSchema> = S extends { action: infer A extends string }
  ? A
  : never;
export type GuardOf<S extends MachineSchema> = S extends { guard: infer G extends string }
  ? G
  : never;
export type EffectOf<S extends MachineSchema> = S extends { effect: infer E extends string }
  ? E
  : never;

export type BindableMap<C> = { [K in keyof C]: Bindable<C[K]> };

// --- accessors -------------------------------------------------------------

export type PropAccessor<S extends MachineSchema> = <K extends keyof PropsOf<S>>(
  key: K,
) => PropsOf<S>[K];

export interface ContextAccessor<S extends MachineSchema> {
  get<K extends keyof ContextOf<S>>(key: K): ContextOf<S>[K];
  set<K extends keyof ContextOf<S>>(
    key: K,
    value: ContextOf<S>[K] | ((prev: ContextOf<S>[K]) => ContextOf<S>[K]),
  ): void;
  initial<K extends keyof ContextOf<S>>(key: K): ContextOf<S>[K];
}

export type ComputedAccessor<S extends MachineSchema> = <K extends keyof ComputedOf<S>>(
  key: K,
) => ComputedOf<S>[K];

export interface RefsAccessor<S extends MachineSchema> {
  get<K extends keyof RefsOf<S>>(key: K): RefsOf<S>[K];
  set<K extends keyof RefsOf<S>>(key: K, value: RefsOf<S>[K]): void;
}

export interface StateAccessor<S extends MachineSchema> {
  get(): StateOf<S>;
  matches(...values: readonly StateOf<S>[]): boolean;
  hasTag(tag: TagOf<S>): boolean;
  previous(): StateOf<S> | undefined;
}

export interface EventAccessor<S extends MachineSchema> {
  current(): EventOf<S>;
  previous(): EventOf<S> | undefined;
}

// --- parameter objects -----------------------------------------------------

/** What guards, actions, effects and computed values receive. */
export interface MachineParams<S extends MachineSchema> {
  readonly prop: PropAccessor<S>;
  readonly context: ContextAccessor<S>;
  readonly computed: ComputedAccessor<S>;
  readonly refs: RefsAccessor<S>;
  readonly state: StateAccessor<S>;
  readonly event: EventOf<S>;
  readonly scope: Scope;
  send(event: EventOf<S>): void;
}

export interface PropsParams<S extends MachineSchema> {
  readonly props: Partial<PropsOf<S>>;
  readonly scope: Scope;
}

export interface ContextParams<S extends MachineSchema> {
  readonly prop: PropAccessor<S>;
  readonly scope: Scope;
  bindable<V>(init: () => BindableParams<V>): Bindable<V>;
  getContext(): ContextAccessor<S>;
  getComputed(): ComputedAccessor<S>;
  getRefs(): RefsAccessor<S>;
  getEvent(): EventOf<S>;
}

export interface RefsParams<S extends MachineSchema> {
  readonly prop: PropAccessor<S>;
  readonly context: ContextAccessor<S>;
  readonly scope: Scope;
}

export interface InitialStateParams<S extends MachineSchema> {
  readonly prop: PropAccessor<S>;
}

export interface WatchParams<S extends MachineSchema> extends MachineParams<S> {
  track(deps: () => readonly unknown[], effect: VoidFunction): void;
  action(actions: readonly ActionOf<S>[]): void;
}

// --- transitions -----------------------------------------------------------

export type GuardExpression<S extends MachineSchema> =
  | GuardOf<S>
  | `!${GuardOf<S>}`
  | ((params: MachineParams<S>) => boolean);

export interface TransitionDefinition<S extends MachineSchema> {
  readonly target?: StateOf<S>;
  readonly guard?: GuardExpression<S>;
  readonly actions?: readonly ActionOf<S>[];
  /** Re-run exit and entry even when the target is the current state. */
  readonly reenter?: boolean;
}

export type Transition<S extends MachineSchema> =
  | TransitionDefinition<S>
  | readonly TransitionDefinition<S>[];

export type TransitionMap<S extends MachineSchema> = {
  readonly [E in EventOf<S>["type"]]?: Transition<S>;
};

export interface StateNode<S extends MachineSchema> {
  readonly tags?: readonly TagOf<S>[];
  readonly entry?: readonly ActionOf<S>[];
  readonly exit?: readonly ActionOf<S>[];
  readonly effects?: readonly EffectOf<S>[];
  readonly on?: TransitionMap<S>;
}

// --- the machine -----------------------------------------------------------

/**
 * An effect returns its teardown, or nothing at all. `void` and not `undefined`:
 * with `undefined` every effect without a cleanup would have to `return undefined`
 * explicitly.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: see above — this is the React `useEffect` shape.
export type EffectCleanup = VoidFunction | void;

export interface MachineImplementations<S extends MachineSchema> {
  readonly guards?: Readonly<Record<GuardOf<S>, (params: MachineParams<S>) => boolean>>;
  readonly actions?: Readonly<Record<ActionOf<S>, (params: MachineParams<S>) => void>>;
  /** The interpreter runs the teardowns in reverse order of installation. */
  readonly effects?: Readonly<Record<EffectOf<S>, (params: MachineParams<S>) => EffectCleanup>>;
}

export interface MachineConfig<S extends MachineSchema> {
  props?(params: PropsParams<S>): PropsOf<S>;
  context?(params: ContextParams<S>): BindableMap<ContextOf<S>>;
  refs?(params: RefsParams<S>): RefsOf<S>;
  readonly computed?: {
    readonly [K in keyof ComputedOf<S>]: (params: MachineParams<S>) => ComputedOf<S>[K];
  };
  watch?(params: WatchParams<S>): void;
  /** Pure function of the props — this is what makes SSR render the right markup. */
  initialState(params: InitialStateParams<S>): StateOf<S>;
  readonly entry?: readonly ActionOf<S>[];
  readonly exit?: readonly ActionOf<S>[];
  readonly effects?: readonly EffectOf<S>[];
  readonly on?: TransitionMap<S>;
  readonly states: Readonly<Record<StateOf<S>, StateNode<S>>>;
  readonly implementations?: MachineImplementations<S>;
}

export type Machine<S extends MachineSchema> = MachineConfig<S>;

// --- the service -----------------------------------------------------------

export type ServiceStatus = "not-started" | "started" | "stopped";

/**
 * What an adapter hands in, as opposed to what a machine sees. An explicit
 * `undefined` is allowed here because that is what spreading a consumer's props
 * produces; the interpreter strips those before applying the machine's defaults,
 * so `{ dir: undefined }` cannot erase `dir: "ltr"`.
 */
export type PropsInput<S extends MachineSchema> = {
  [K in keyof PropsOf<S>]?: PropsOf<S>[K] | undefined;
};

export interface ServiceRuntime<S extends MachineSchema> {
  readonly id: string;
  readonly ids?: PartIdOverrides | undefined;
  readonly getRootNode?: (() => RootNode) | undefined;
  props(): PropsInput<S>;
}

export interface Service<S extends MachineSchema> {
  readonly state: StateAccessor<S>;
  readonly context: ContextAccessor<S>;
  readonly prop: PropAccessor<S>;
  readonly computed: ComputedAccessor<S>;
  readonly refs: RefsAccessor<S>;
  readonly event: EventAccessor<S>;
  readonly scope: Scope;
  send(event: EventOf<S>): void;
  /** Installs effects and entry actions. Idempotent, and symmetric with `stop`. */
  start(): void;
  stop(): void;
  status(): ServiceStatus;
}
