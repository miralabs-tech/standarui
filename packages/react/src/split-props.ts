/**
 * A part component takes two kinds of prop on one object: the machine's, and
 * whatever the consumer wants on the element. This splits them by an explicit key
 * list — explicit because a heuristic ("anything the machine declares") would
 * silently swallow a new DOM attribute the day someone adds a machine prop with
 * the same name.
 */

export function splitProps<T extends object, K extends keyof T>(
  props: T,
  keys: readonly K[],
): [Pick<T, K>, Omit<T, K>] {
  const owned = {} as Pick<T, K>;
  const rest = { ...props } as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in props)) continue;
    owned[key] = props[key];
    delete rest[key as string];
  }
  return [owned, rest as Omit<T, K>];
}
