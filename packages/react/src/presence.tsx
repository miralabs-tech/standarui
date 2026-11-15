/**
 * Keeps a node in the tree until its exit animation has actually finished. The
 * timing logic is the core's `createPresence` (one frame for the transition to
 * exist, `getAnimations()`, a one second ceiling); this is only its React
 * lifecycle.
 *
 * The node is needed to ask what is animating, so the child gets a ref — composed
 * with whatever ref the consumer already put on it.
 */

import { createPresence, type Presence as PresenceCore } from "@standarui/core";
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { composeRefs } from "./compose-refs";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

export interface UsePresenceOptions {
  /** The machine's open state. */
  readonly present: boolean;
  /** Skip the wait — reduced motion, or a first render. */
  readonly immediate?: boolean | undefined;
  readonly timeout?: number | undefined;
}

export interface PresenceApi {
  /** True while the node must stay in the tree, exit animation included. */
  readonly present: boolean;
  readonly exiting: boolean;
  readonly ref: (node: HTMLElement | null) => void;
}

interface PresenceState {
  readonly present: boolean;
  readonly exiting: boolean;
}

export function usePresence(options: UsePresenceOptions): PresenceApi {
  const [state, setState] = useState<PresenceState>(() => ({
    present: options.present,
    exiting: false,
  }));
  const node = useRef<HTMLElement | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const settling = useRef(false);
  const presence = useRef<PresenceCore | null>(null);
  presence.current ??= createPresence({
    // Outside the layout effect an exit ends on the core's own clock — the
    // `finished` microtask, the frame that found nothing animating, or the
    // timeout — and each is committed synchronously. The first is the one that
    // matters: it runs before the frame the exit ended in is painted, and a
    // deferred render would paint that frame with the node back at its resting
    // style — full height, full opacity, for any exit declared without a fill
    // mode (R127). Inside the layout effect (`immediate`, no node) React is
    // already committing and flushSync may not run.
    onExitComplete: (): void => {
      const next: PresenceState = { present: false, exiting: false };
      if (settling.current) setState(next);
      else flushSync(() => setState(next));
    },
    // Getters, so a `reducedMotion` that flips mid-session is honoured by the very
    // next exit instead of the one after the component remounts.
    get immediate(): boolean | undefined {
      return latest.current.immediate;
    },
    get timeout(): number | undefined {
      return latest.current.timeout;
    },
  });
  const instance = presence.current;

  useSafeLayoutEffect(() => {
    settling.current = true;
    try {
      instance.setPresent(options.present, node.current);
    } finally {
      settling.current = false;
    }
    setState({ present: instance.isPresent(), exiting: instance.isExiting() });
  }, [instance, options.present]);

  useSafeLayoutEffect(() => () => instance.destroy(), [instance]);

  const ref = useCallback((next: HTMLElement | null): void => {
    node.current = next;
  }, []);

  return useMemo(
    () => ({ present: state.present, exiting: state.exiting, ref }),
    [state.present, state.exiting, ref],
  );
}

export interface PresenceProps extends UsePresenceOptions {
  /** Keeps the node rendered while closed — the consumer hides it in CSS. */
  readonly keepMounted?: boolean | undefined;
  readonly children: ReactElement;
}

export function Presence(props: PresenceProps): ReactNode {
  const { children, keepMounted, ...options } = props;
  const presence = usePresence(options);

  if (!presence.present && keepMounted !== true) return null;

  const childRef = (children.props as { ref?: Ref<HTMLElement> }).ref;
  return cloneElement(children, { ref: composeRefs(presence.ref, childRef) } as object);
}
