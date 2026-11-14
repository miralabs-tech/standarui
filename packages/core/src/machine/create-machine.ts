import type { Machine, MachineConfig, MachineSchema } from "./types";

/**
 * A typed identity. It exists to bind the schema to the config so every state
 * name, event type, guard, action and effect is checked against the same
 * declaration — and for nothing else: a machine must stay inert data so it can
 * be shared between an SSR render and every client instance.
 */
export function createMachine<S extends MachineSchema>(config: MachineConfig<S>): Machine<S> {
  return config;
}
