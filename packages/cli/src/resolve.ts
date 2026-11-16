import { parseRef } from "./registry";
import type { RegistryItem } from "./registry-types";

export interface ItemRef {
  readonly registry: string;
  readonly name: string;
}

export interface ResolvedItem {
  readonly ref: ItemRef;
  readonly key: string;
  readonly item: RegistryItem;
}

export interface ResolveOptions {
  readonly installed: ReadonlySet<string>;
  readonly overwrite: boolean;
  readonly defaultRegistry: string;
  readonly load: (ref: ItemRef) => Promise<RegistryItem>;
}

export function refKey(ref: ItemRef, defaultRegistry: string): string {
  return ref.registry === defaultRegistry ? ref.name : `${ref.registry}/${ref.name}`;
}

export async function resolveItems(
  requested: readonly string[],
  options: ResolveOptions,
): Promise<ResolvedItem[]> {
  const visited = new Set<string>();
  const resolved: ResolvedItem[] = [];

  const visit = async (ref: ItemRef): Promise<void> => {
    const key = refKey(ref, options.defaultRegistry);
    if (visited.has(key)) return;
    visited.add(key);
    if (!options.overwrite && options.installed.has(key)) return;
    const item = await options.load(ref);
    for (const dependency of item.registryDependencies) {
      await visit(parseRef(dependency, options.defaultRegistry));
    }
    resolved.push({ ref, key, item });
  };

  for (const name of requested) await visit(parseRef(name, options.defaultRegistry));
  return resolved;
}
