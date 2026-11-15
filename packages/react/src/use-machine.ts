/**
 * The whole React lifecycle of a machine, in one hook.
 *
 * `createService` runs during render on purpose: the core guarantees it performs
 * no side effect, and that is what lets `connect` be called in the same render
 * pass and produce the markup the server would have produced. Everything that
 * actually happens — effects, entry actions — waits for `start()` in a layout
 * effect, and `stop()` undoes exactly that, so StrictMode's mount/unmount/mount
 * settles back on the same state.
 */

import {
  createService,
  type Machine,
  type MachineSchema,
  type PartIdOverrides,
  type PropsInput,
  type RootNode,
  type Service,
} from "@standarui/core";
import { useId, useRef } from "react";
import { useRootNode } from "./environment";
import { useReactivity } from "./reactivity";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

export interface MachineRuntimeProps {
  /**
   * Defaults to `useId()`. Pass one when the markup has to match a server render.
   * It also becomes the root part's DOM id — see the note in `useMachine`.
   */
  readonly id?: string | undefined;
  /** Overrides for individual part ids, keyed by part name. */
  readonly ids?: PartIdOverrides | undefined;
  /** Defaults to the nearest `EnvironmentProvider`, then to the document. */
  readonly getRootNode?: (() => RootNode) | undefined;
}

export type UseMachineProps<S extends MachineSchema> = PropsInput<S> & MachineRuntimeProps;

export function useMachine<S extends MachineSchema>(
  machine: Machine<S>,
  props: UseMachineProps<S>,
): Service<S> {
  const fallbackId = useId();
  const reactivity = useReactivity();
  const inheritedRootNode = useRootNode();

  // Written during render, and it has to be: `connect` reads props through the
  // service in this very pass, so a value parked in an effect would render one
  // pass stale. The ref belongs to this component and nothing else reads it, which
  // is what keeps a discarded concurrent render from being observable.
  const latest = useRef(props);
  latest.current = props;

  const service = useRef<Service<S> | null>(null);
  service.current ??= createService(machine, reactivity.adapter, {
    id: props.id ?? fallbackId,
    // An `id` arriving from outside is a DOM id, not a scope id. A machine root
    // used as another part's `render` target is handed that part's own id, and it
    // has to wear it: the composer looks its element up by that id and finds
    // nothing if the root quietly derives `{component}:{id}:root` instead. Seeding
    // `ids.root` makes both lookups land on the same element — the composer finds
    // it, and this machine still finds itself. An explicit `ids` still wins.
    ids: props.id === undefined ? props.ids : { root: props.id, ...props.ids },
    getRootNode: props.getRootNode ?? inheritedRootNode,
    props: (): PropsInput<S> => latest.current as PropsInput<S>,
  });
  const instance = service.current;

  useSafeLayoutEffect(() => {
    instance.start();
    return () => {
      instance.stop();
      reactivity.runCleanups();
    };
  }, [instance, reactivity]);

  // No dependency array: a prop change and a context write both reach the machine
  // through a commit, so "after every commit" is exactly when a watcher is due.
  // Before paint, like `start`, so a machine that reacts to a controlled value
  // coming down never shows the frame it was still out of sync for.
  useSafeLayoutEffect(() => {
    reactivity.runWatchers();
  });

  return instance;
}
