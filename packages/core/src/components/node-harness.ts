/**
 * The DOM-free twin of `harness.ts`.
 *
 * The CDC founds everything on two promises: the core is "du TypeScript pur,
 * testable sans DOM ni framework" (:49) and `connect()` is "pur et rejouable côté
 * serveur" (:51). This is what turns those into facts. It builds a real service
 * with the reference reactivity and calls `connect`, with no document anywhere.
 *
 * It exists because the promises were false for five of the eleven components and
 * nothing could see it. An adapter records a machine's `watch` dependencies while
 * it renders — `track` reads `deps()` at registration, in both the React adapter
 * and the reference one — so a machine that reads the DOM there reaches for a
 * document during a server render. Every component test ran in a page, where one
 * always exists.
 *
 * `start()` is deliberately absent: it is the mount effect, and a server never
 * runs one. What this harness reproduces is the render pass, and nothing else.
 *
 * Not a build entry, so it ships nothing — the same arrangement as `harness.ts`.
 */

import { createNormalizer, type NormalizeProps, type PropTypes } from "../machine/prop-types";
import type { PartIdOverrides } from "../machine/scope";
import { createService } from "../machine/service";
import type { Machine, MachineSchema, PropsInput, Service } from "../machine/types";
import { createReactivityRoot } from "../reactivity";

/** Props come back exactly as `connect` wrote them, with no dialect in the way. */
export type PlainPropTypes = PropTypes<Record<string, unknown>>;

export const plainNormalizer: NormalizeProps<PlainPropTypes> = createNormalizer<PlainPropTypes>(
  (props) => props,
);

export interface NodeHarness<S extends MachineSchema, Api> {
  readonly service: Service<S>;
  /** Re-reads the prop getters, the way an adapter does on every render. */
  api(): Api;
  /** New props coming down, then the settle an adapter owes its machine. */
  setProps(next: PropsInput<S>): void;
}

export interface NodeHarnessOptions<S extends MachineSchema, Api> {
  readonly machine: Machine<S>;
  connect(service: Service<S>, normalize: NormalizeProps<PlainPropTypes>): Api;
  readonly id?: string | undefined;
  readonly ids?: PartIdOverrides | undefined;
  readonly props?: PropsInput<S> | undefined;
}

export function connectWithoutDom<S extends MachineSchema, Api>(
  options: NodeHarnessOptions<S, Api>,
): NodeHarness<S, Api> {
  let props: PropsInput<S> = { ...options.props } as PropsInput<S>;

  const reactivity = createReactivityRoot();
  // No `getRootNode`: that is exactly the runtime an adapter hands the core on a
  // server, and the case the scope has to answer `null` for.
  const service = createService(options.machine, reactivity.adapter, {
    id: options.id ?? "x1",
    ids: options.ids,
    props: () => props,
  });

  return {
    service,
    api: (): Api => options.connect(service, plainNormalizer),
    setProps(next: PropsInput<S>): void {
      props = { ...props, ...next };
      reactivity.flush();
    },
  };
}
