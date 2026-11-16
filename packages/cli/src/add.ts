import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_REGISTRY, type StandaruiConfig } from "./config";
import type { CliContext } from "./context";
import { planDependencies } from "./dependencies";
import { CliError } from "./errors";
import {
  BASE_DIR,
  createFilePlanner,
  MANIFEST_BASE,
  type PlannedFile,
  RENAMES_BASE,
  write,
} from "./files";
import { LOCK_FILE, lockedFiles, readLockfile, serializeLockfile } from "./lockfile";
import { createRegistryClient } from "./registry";
import { resolveItems } from "./resolve";

export interface InstallOptions {
  readonly overwrite: boolean;
  readonly install: boolean;
  readonly registry: string | undefined;
  readonly version: string;
}

export async function installItems(
  context: CliContext,
  config: StandaruiConfig,
  names: readonly string[],
  options: InstallOptions,
): Promise<void> {
  const { cwd } = context;
  const lock = readLockfile(cwd);
  const client = createRegistryClient(context, config, options.version, options.registry);

  const resolved = await resolveItems(names, {
    installed: new Set(Object.keys(lock.items)),
    overwrite: options.overwrite,
    defaultRegistry: DEFAULT_REGISTRY,
    load: (ref) => client.loadItem(ref.registry, ref.name),
  });
  if (resolved.length === 0) {
    context.out("Nothing to add: every requested item is already installed.");
    return;
  }

  const planFiles = createFilePlanner(cwd, config, client);
  const planned = new Map<string, PlannedFile[]>();
  for (const { key, item } of resolved) planned.set(key, await planFiles(key, item));

  if (!options.overwrite) {
    const owned = lockedFiles(lock);
    const conflicts = [...planned.values()]
      .flat()
      .filter((file) => existsSync(file.target) && !owned.has(file.lockKey))
      .map((file) => path.relative(cwd, file.target).split(path.sep).join("/"));
    if (conflicts.length > 0) {
      throw new CliError(
        `refusing to overwrite files standarui did not write (pass --overwrite to replace them):\n${conflicts.map((file) => `  ${file}`).join("\n")}`,
      );
    }
  }

  const wanted: Record<string, string> = {};
  for (const { item } of resolved) Object.assign(wanted, item.dependencies ?? {});
  const dependencies = planDependencies(context, wanted);

  const manifestBase = path.join(cwd, BASE_DIR, MANIFEST_BASE);
  const api =
    resolved.some(({ ref }) => ref.registry === DEFAULT_REGISTRY) && !existsSync(manifestBase)
      ? await client.loadApi(DEFAULT_REGISTRY)
      : undefined;

  let fileCount = 0;
  for (const { key, ref, item } of resolved) {
    const locked: Record<string, string> = {};
    for (const file of planned.get(key) ?? []) {
      write(file.target, file.content);
      write(file.base, file.content);
      locked[file.lockKey] = file.sha256;
      fileCount += 1;
    }
    lock.items[key] = { source: ref.registry, version: item.version, files: locked };
  }
  if (api !== undefined) {
    write(manifestBase, api.manifest);
    write(path.join(cwd, BASE_DIR, RENAMES_BASE), api.renames);
  }
  write(path.join(cwd, LOCK_FILE), serializeLockfile(lock));
  dependencies.apply(options.install);

  const styles = resolved
    .flatMap(({ key }) => planned.get(key) ?? [])
    .filter((file) => file.lockKey.startsWith("styles/"))
    .map((file) => path.relative(cwd, file.target).split(path.sep).join("/"));
  context.out(`Added ${resolved.length} item(s), ${fileCount} file(s).`);
  context.out(`  items: ${resolved.map(({ key }) => key).join(", ")}`);
  if (dependencies.changed.length > 0) {
    const shown = dependencies.changed.map((name) => `${name}@${wanted[name]}`).join(", ");
    context.out(`  dependencies: ${shown}`);
  }
  if (styles.length > 0) {
    context.out("Styles files copied (import them in your app):");
    for (const file of styles) context.out(`  ${file}`);
  }
}
