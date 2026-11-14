import type { Scope } from "./scope";

/**
 * Part ids are derived, never generated: `{component}:{scope id}:{part}`, with the
 * scope id coming from the adapter (`useId` and friends). No `Math.random()`, no
 * module-level counter — that is the whole hydration-safety story (research/core.md
 * §1.4). Any part can be overridden through the machine's `ids` prop, which is how
 * a consumer wires a label rendered outside the component.
 */
export function getPartId(scope: Scope, component: string, part: string, key?: string): string {
  const overrideKey = key === undefined ? part : `${part}:${key}`;
  const override = scope.ids?.[overrideKey];
  if (override !== undefined) return override;
  const base = `${component}:${scope.id}:${part}`;
  return key === undefined ? base : `${base}:${key}`;
}
