/**
 * The measured half of a disclosure: how tall the panel is, and when its exit is
 * really over.
 *
 * Shared from day one by `accordion` and `collapsible`, with `tree-view` next.
 * It is a module rather than a sibling import because every component budget
 * marks `../../*` external: a component that imported a brother would be
 * measured nowhere at all (the 2026-08-28 rule, eight precedents in
 * `scripts/size-budget.ts`).
 *
 * **The two custom properties are written straight onto the node**, never
 * published through a bindable — the same arbitrage `data-scroll` makes
 * (architecture.md L47): a measurement is not a state, and routing it through
 * the machine would turn every open into a second render for a number no
 * transition depends on.
 *
 * `scrollHeight` in both directions, and it is an integer, so a panel may pop by
 * up to a pixel at the end of an open. A close that interrupts an open restarts
 * from the natural height rather than the current one. Both are Radix's
 * behaviour and both are accepted here rather than papered over.
 */

import { resolveEnvironment } from "../environment/environment";
import { createPresence, type Presence } from "../presence/presence";

export interface CollapseOptions {
  /** The node may take `hidden` — the machine drops the value from `exitingValues`. */
  onExitComplete(): void;
  /** Ceiling on the wait. Defaults to the presence's own. */
  readonly timeout?: number | undefined;
}

export interface Collapse {
  /**
   * Measures the node, writes `--sui-collapse-height` / `--sui-collapse-width`
   * on it, then hands the state to the presence. Measuring in both directions is
   * deliberate: the close needs the height the panel actually grew to, which is
   * not the one the open was measured at.
   */
  setOpen(open: boolean, node: HTMLElement | null | undefined): void;
  isExiting(): boolean;
  destroy(): void;
}

export function createCollapse(options: CollapseOptions): Collapse {
  // Read at each call and handed to the presence through a getter, exactly as
  // the vanilla adapter does: no paint pays for the resolution until an exit
  // actually starts, and a `data-motion` an app flips at runtime is obeyed by
  // the very next close instead of by the mode this instance was built with.
  let immediate = false;

  const presence: Presence = createPresence({
    onExitComplete: (): void => options.onExitComplete(),
    timeout: options.timeout,
    get immediate(): boolean {
      return immediate;
    },
  });

  return {
    setOpen(open: boolean, node: HTMLElement | null | undefined): void {
      if (node !== null && node !== undefined) {
        immediate = resolveEnvironment(node).motion === "none";
        node.style.setProperty("--sui-collapse-height", `${node.scrollHeight}px`);
        node.style.setProperty("--sui-collapse-width", `${node.scrollWidth}px`);
      }
      presence.setPresent(open, node);
    },
    isExiting: (): boolean => presence.isExiting(),
    destroy: (): void => presence.destroy(),
  };
}
