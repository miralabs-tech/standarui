import { DEFAULT_REGISTRY, type StandaruiConfig } from "./config";
import { CliError } from "./errors";
import { createFilePlanner, type PlannedFile } from "./files";
import type { Lockfile } from "./lockfile";
import { parseRef, type RegistryClient } from "./registry";
import type { RegistryItem } from "./registry-types";
import { type ItemRef, refKey } from "./resolve";

export interface TargetItem {
  readonly key: string;
  readonly ref: ItemRef;
  readonly item: RegistryItem;
  readonly files: readonly PlannedFile[];
}

export function lockedKeys(lock: Lockfile, requested: readonly string[]): string[] {
  if (requested.length === 0) {
    const all = Object.keys(lock.items);
    if (all.length === 0) throw new CliError("nothing is installed yet, run standarui add first");
    return all;
  }
  return requested.map((name) => {
    const key = refKey(parseRef(name, DEFAULT_REGISTRY), DEFAULT_REGISTRY);
    if (lock.items[key] === undefined) throw new CliError(`"${name}" is not installed`);
    return key;
  });
}

export async function loadTargets(
  cwd: string,
  config: StandaruiConfig,
  client: RegistryClient,
  keys: readonly string[],
): Promise<TargetItem[]> {
  const planFiles = createFilePlanner(cwd, config, client);
  const targets: TargetItem[] = [];
  for (const key of keys) {
    const ref = parseRef(key, DEFAULT_REGISTRY);
    const item = await client.loadItem(ref.registry, ref.name);
    targets.push({ key, ref, item, files: await planFiles(key, item) });
  }
  return targets;
}
