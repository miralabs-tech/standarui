/**
 * `{ dir, locale, density, reducedMotion }` — the context that decides
 * presentation switches (research/components.md §3): a menu that hovers open on
 * desktop and only opens on tap in touch, a select that becomes a sheet.
 *
 * Attributes win over media queries, and that is the whole point. The styles
 * layer resolves density from `[data-sui-density]` first and `(pointer: coarse)`
 * second; if the core asked the media query directly, an app that pins itself to
 * `desktop` would get touch behaviour with desktop styling. One resolution order,
 * shared.
 */

import { isCoarsePointer, prefersReducedMotion } from "../dom/platform";
import { getComputedDir } from "../dom/text-dir";
import type { Density, Direction, EnvironmentContext, MotionMode } from "../types";

export interface EnvironmentOverrides {
  readonly dir?: Direction | undefined;
  readonly locale?: string | undefined;
  readonly density?: Density | undefined;
  readonly motion?: MotionMode | undefined;
  /** Shorthand for `motion: "reduced" | "full"`. `motion` wins when both are set. */
  readonly reducedMotion?: boolean | undefined;
}

export const defaultEnvironment: EnvironmentContext = {
  dir: "ltr",
  locale: "en-US",
  density: "desktop",
  motion: "full",
  reducedMotion: false,
};

function toMotion(value: string | null): MotionMode | null {
  return value === "full" || value === "reduced" || value === "none" ? value : null;
}

/**
 * Overrides, then the attribute, then the media query — the order this whole
 * module resolves in, and the one `_tokens.scss` keeps too, where an explicit
 * `data-motion="full"` vetoes `prefers-reduced-motion`.
 *
 * An unrecognised `data-motion` is not a mode: it falls through to the query
 * rather than being read as "reduced", so a typo cannot quietly slow an app down.
 */
function resolveMotion(
  attribute: string | null,
  overrides: EnvironmentOverrides,
  prefersReduced: boolean,
): MotionMode {
  if (overrides.motion !== undefined) return overrides.motion;
  if (overrides.reducedMotion !== undefined) return overrides.reducedMotion ? "reduced" : "full";
  const declared = toMotion(attribute);
  if (declared !== null) return declared;
  return prefersReduced ? "reduced" : "full";
}

function closestAttribute(node: Element | null | undefined, attribute: string): string | null {
  return node?.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null;
}

export function resolveEnvironment(
  node: HTMLElement | null | undefined,
  overrides: EnvironmentOverrides = {},
): EnvironmentContext {
  const win = node?.ownerDocument.defaultView;
  if (node == null || win === null || win === undefined) {
    // The SSR path: overrides only, never a platform read.
    const motion = resolveMotion(null, overrides, false);
    return {
      dir: overrides.dir ?? defaultEnvironment.dir,
      locale: overrides.locale ?? defaultEnvironment.locale,
      density: overrides.density ?? defaultEnvironment.density,
      motion,
      reducedMotion: motion !== "full",
    };
  }

  const density = closestAttribute(node, "data-sui-density");
  const locale = closestAttribute(node, "lang");
  const motion = resolveMotion(
    closestAttribute(node, "data-motion"),
    overrides,
    prefersReducedMotion(win),
  );

  return {
    dir: overrides.dir ?? getComputedDir(node),
    locale: overrides.locale ?? locale ?? win.navigator.language ?? defaultEnvironment.locale,
    density:
      overrides.density ??
      (density === "touch" || density === "desktop"
        ? density
        : isCoarsePointer(win)
          ? "touch"
          : "desktop"),
    motion,
    reducedMotion: motion !== "full",
  };
}

export interface TrackEnvironmentOptions extends EnvironmentOverrides {
  onChange(environment: EnvironmentContext): void;
}

/**
 * Watches both sources — the media queries and the attributes an app can flip at
 * runtime — and reports only when the resolved value actually differs.
 */
export function trackEnvironment(
  node: HTMLElement | null | undefined,
  options: TrackEnvironmentOptions,
): VoidFunction {
  const win = node?.ownerDocument.defaultView;
  if (node == null || win === null || win === undefined) return () => {};

  const { onChange, ...overrides } = options;
  let current = resolveEnvironment(node, overrides);

  const update = (): void => {
    const next = resolveEnvironment(node, overrides);
    if (
      next.dir === current.dir &&
      next.locale === current.locale &&
      next.density === current.density &&
      // `motion` and not `reducedMotion`: the boolean cannot see a switch from
      // "reduced" to "none", which is exactly the switch that changes whether an
      // exit animation exists at all.
      next.motion === current.motion
    ) {
      return;
    }
    current = next;
    onChange(next);
  };

  return subscribe(node.ownerDocument, win, update);
}

interface EnvironmentHub {
  readonly listeners: Set<VoidFunction>;
  readonly stop: VoidFunction;
}

const hubs = new WeakMap<Document, EnvironmentHub>();

// One observer and one pair of queries per document, whatever the number of
// instances: a list of a thousand selects would otherwise hold a thousand of each.
function subscribe(
  doc: Document,
  win: Window & typeof globalThis,
  listener: VoidFunction,
): VoidFunction {
  let hub = hubs.get(doc);
  if (hub === undefined) {
    const listeners = new Set<VoidFunction>();
    const notify = (): void => {
      for (const each of [...listeners]) each();
    };
    const queries = [
      win.matchMedia("(pointer: coarse)"),
      win.matchMedia("(prefers-reduced-motion: reduce)"),
    ];
    for (const query of queries) query.addEventListener("change", notify);
    const observer = new win.MutationObserver(notify);
    observer.observe(doc.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-sui-density", "data-motion", "dir", "lang"],
    });
    hub = {
      listeners,
      stop: () => {
        for (const query of queries) query.removeEventListener("change", notify);
        observer.disconnect();
      },
    };
    hubs.set(doc, hub);
  }
  const current = hub;
  current.listeners.add(listener);
  return () => {
    if (!current.listeners.delete(listener) || current.listeners.size > 0) return;
    current.stop();
    if (hubs.get(doc) === current) hubs.delete(doc);
  };
}
