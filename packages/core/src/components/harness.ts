/**
 * The thirty-line renderer the toggle's browser test introduced, factored out
 * because every component needs it: apply the prop getters as attributes and
 * listeners, repaint whenever the reactivity root settles.
 *
 * It is deliberately not a framework. Its job is to prove that a machine reaches
 * real DOM with nothing but `connect` and a way to re-read the props — which is
 * also the shape the vanilla adapter will take.
 */

import { createPropsWriter, type DomPropTypes, domNormalizer } from "../dom/apply";
import { queryAll } from "../dom/query";
import type { NormalizeProps } from "../machine/prop-types";
import type { PartIdOverrides } from "../machine/scope";
import { createService } from "../machine/service";
import type { Machine, MachineSchema, PropsInput, Service } from "../machine/types";
import { createReactivityRoot } from "../reactivity";

export { type DomPropTypes, domNormalizer } from "../dom/apply";

export type ApplyProps = (node: Element, props: Record<string, unknown>) => void;

export interface MountOptions<S extends MachineSchema, Api> {
  readonly machine: Machine<S>;
  connect(service: Service<S>, normalize: NormalizeProps<DomPropTypes>): Api;
  /** Markup for the parts, in the shape a consumer would write. */
  readonly html: string;
  readonly id?: string | undefined;
  readonly ids?: PartIdOverrides | undefined;
  readonly props?: PropsInput<S> | undefined;
  /** Mounts the markup inside an open shadow root, which becomes the scope's root. */
  readonly shadow?: boolean | undefined;
  /** Called on every settle: hand each part its prop getter's output. */
  paint(host: HTMLElement, api: Api, apply: ApplyProps): void;
}

export interface MachineHarness<S extends MachineSchema, Api> {
  readonly host: HTMLElement;
  readonly service: Service<S>;
  api(): Api;
  part<T extends HTMLElement = HTMLElement>(name: string): T;
  setProps(next: PropsInput<S>): void;
  destroy(): void;
}

const mounted: { destroy(): void }[] = [];

export function mountMachine<S extends MachineSchema, Api>(
  options: MountOptions<S, Api>,
): MachineHarness<S, Api> {
  let props: PropsInput<S> = { ...options.props } as PropsInput<S>;

  const outer = document.createElement("div");
  document.body.append(outer);
  const root: Document | ShadowRoot =
    options.shadow === true ? outer.attachShadow({ mode: "open" }) : document;
  const host = root === document ? outer : document.createElement("div");
  if (host !== outer) root.appendChild(host);
  host.innerHTML = options.html;

  // The writer is `dom/apply`'s, shared with `@standarui/vanilla` rather than
  // restated here: a harness whose attribute rules drift from the adapter's would
  // prove the wrong thing about every machine it mounts.
  const writer = createPropsWriter();
  const apply: ApplyProps = (node, values) => writer.write(node, values);

  const reactivity = createReactivityRoot();
  const service = createService(options.machine, reactivity.adapter, {
    id: options.id ?? "x1",
    ids: options.ids,
    getRootNode: () => root,
    props: () => props,
  });

  const api = (): Api => options.connect(service, domNormalizer);
  const repaint = (): void => options.paint(host, api(), apply);

  repaint();
  reactivity.subscribe(repaint);
  service.start();
  repaint();

  const harness: MachineHarness<S, Api> = {
    host,
    service,
    api,
    // The bare part name, not the scope-qualified id the element carries: a
    // harness holds one component, so the scope is never the discriminator here,
    // and spelling it at 136 call sites would be noise. Read token by token
    // rather than with `[data-part*=":name"]`, which would also match a longer
    // part whose name merely starts the same way.
    part<T extends HTMLElement = HTMLElement>(name: string): T {
      const node = queryAll<T>(host, "[data-part]").find((candidate) =>
        (candidate.getAttribute("data-part") ?? "")
          .split(" ")
          .some((token) => token === name || token.endsWith(`:${name}`)),
      );
      if (node === undefined) throw new Error(`no part "${name}" in the harness markup`);
      return node;
    },
    setProps(next: PropsInput<S>): void {
      props = { ...props, ...next };
      // The graph cannot see a prop change: it arrives through a getter nothing
      // subscribed to. This is the step a real adapter owes its machine too.
      reactivity.flush();
      repaint();
    },
    destroy(): void {
      // Detach first: removing a focused element fires blur, and a machine that
      // has already stopped would warn about an event it can no longer handle.
      outer.remove();
      service.stop();
      reactivity.dispose();
      writer.destroy();
    },
  };
  mounted.push(harness);
  return harness;
}

export function unmountAll(): void {
  for (const harness of mounted.splice(0, mounted.length)) harness.destroy();
}
