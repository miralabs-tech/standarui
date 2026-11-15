import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DEFAULT_REGISTRY, type StandaruiConfig } from "./config";
import type { CliContext } from "./context";
import { planDependencies } from "./dependencies";
import {
  BASE_DIR,
  createFilePlanner,
  MANIFEST_BASE,
  type PlannedFile,
  RENAMES_BASE,
  write,
} from "./files";
import { mergeInPlace, mergesCleanly } from "./git";
import { LOCK_FILE, readLockfile, serializeLockfile } from "./lockfile";
import {
  type ComponentManifest,
  diffManifests,
  type ManifestDiff,
  type Rename,
  renderDiff,
  restrictDiff,
} from "./manifest-diff";
import { backupDirName, classifyFile, type FileStatus } from "./plan";
import { createRegistryClient, type RegistryApi } from "./registry";
import type { RegistryLayer } from "./registry-types";
import { resolveItems } from "./resolve";
import { loadTargets, lockedKeys, type TargetItem } from "./targets";

export interface UpdateOptions {
  readonly items: readonly string[];
  readonly write: boolean;
  readonly install: boolean;
  readonly typecheck: boolean;
  readonly registry: string | undefined;
  readonly version: string;
}

interface PlannedChange {
  readonly lockKey: string;
  readonly copy: string;
  readonly baseFile: string;
  readonly status: FileStatus;
  readonly base: string | undefined;
  readonly local: string | undefined;
  readonly target: string | undefined;
}

interface ItemPlan {
  readonly target: TargetItem;
  readonly isNew: boolean;
  readonly from: string | undefined;
  readonly changes: readonly PlannedChange[];
}

function readIfExists(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function relative(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join("/");
}

function qualify(dependency: string, parent: string): string {
  return dependency.startsWith("@") || parent === DEFAULT_REGISTRY
    ? dependency
    : `${parent}/${dependency}`;
}

function breakingChanges(
  base: RegistryApi,
  target: RegistryApi,
  installed: ReadonlySet<string>,
): ManifestDiff {
  const before = JSON.parse(base.manifest) as ComponentManifest;
  const after = JSON.parse(target.manifest) as ComponentManifest;
  const renames = (JSON.parse(target.renames) as { renames?: Rename[] }).renames ?? [];
  return restrictDiff(diffManifests(before, after, renames), installed);
}

function typecheck(context: CliContext): boolean {
  const tsc = path.join(context.cwd, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) {
    context.out("Typecheck skipped: typescript is not installed in the app.");
    return true;
  }
  const result = spawnSync(process.execPath, [tsc, "--noEmit"], {
    cwd: context.cwd,
    encoding: "utf8",
  });
  if (result.status === 0) {
    context.out("Typecheck passed.");
    return true;
  }
  context.out(`Typecheck failed:\n${`${result.stdout}${result.stderr}`.trimEnd()}`);
  return false;
}

export async function runUpdate(
  context: CliContext,
  config: StandaruiConfig,
  options: UpdateOptions,
): Promise<number> {
  const { cwd } = context;
  const lock = readLockfile(cwd);
  const client = createRegistryClient(context, config, options.version, options.registry);
  const targets = await loadTargets(cwd, config, client, lockedKeys(lock, options.items));

  const created = await resolveItems(
    targets.flatMap(({ ref, item }) =>
      item.registryDependencies.map((name) => qualify(name, ref.registry)),
    ),
    {
      installed: new Set(Object.keys(lock.items)),
      overwrite: false,
      defaultRegistry: DEFAULT_REGISTRY,
      load: (ref) => client.loadItem(ref.registry, ref.name),
    },
  );
  const planFiles = createFilePlanner(cwd, config, client);
  const added: TargetItem[] = [];
  for (const { key, ref, item } of created) {
    added.push({ key, ref, item, files: await planFiles(key, item) });
  }

  const plans: ItemPlan[] = [];
  for (const target of [...targets, ...added]) {
    const locked = lock.items[target.key]?.files ?? {};
    const byKey = new Map<string, PlannedFile>(target.files.map((file) => [file.lockKey, file]));
    const changes: PlannedChange[] = [];
    for (const lockKey of [...new Set([...Object.keys(locked), ...byKey.keys()])].sort()) {
      const file = byKey.get(lockKey);
      const [layer, ...rest] = lockKey.split("/");
      const copy = file?.target ?? path.join(cwd, config.dirs[layer as RegistryLayer], ...rest);
      const baseFile = file?.base ?? path.join(cwd, BASE_DIR, ...lockKey.split("/"));
      const state = {
        base: Object.hasOwn(locked, lockKey) ? readIfExists(baseFile) : undefined,
        local: readIfExists(copy),
        target: file?.content,
      };
      changes.push({
        lockKey,
        copy,
        baseFile,
        status: classifyFile(state, mergesCleanly),
        ...state,
      });
    }
    plans.push({
      target,
      isNew: lock.items[target.key] === undefined,
      from: lock.items[target.key]?.version,
      changes,
    });
  }

  const baseManifestFile = path.join(cwd, BASE_DIR, MANIFEST_BASE);
  const baseRenamesFile = path.join(cwd, BASE_DIR, RENAMES_BASE);
  const targetApi = plans.some(({ target }) => target.ref.registry === DEFAULT_REGISTRY)
    ? await client.loadApi(DEFAULT_REGISTRY)
    : undefined;
  const baseManifest = readIfExists(baseManifestFile);
  const breaking =
    targetApi === undefined || baseManifest === undefined
      ? undefined
      : breakingChanges(
          { manifest: baseManifest, renames: readIfExists(baseRenamesFile) ?? "{}" },
          targetApi,
          new Set([...Object.keys(lock.items), ...added.map(({ key }) => key)]),
        );

  const wanted: Record<string, string> = {};
  for (const { target } of plans) Object.assign(wanted, target.item.dependencies ?? {});
  const dependencies = planDependencies(context, wanted);

  const counts = new Map<FileStatus, number>();
  for (const plan of plans) {
    const { key, item } = plan.target;
    context.out(
      `## ${plan.isNew ? `${key} (new, ${item.version})` : `${key} ${plan.from} -> ${item.version}`}`,
    );
    for (const change of plan.changes) {
      counts.set(change.status, (counts.get(change.status) ?? 0) + 1);
      context.out(`  ${change.status.padEnd(10)} ${relative(cwd, change.copy)}`);
    }
  }
  const summary = [...counts].map(([status, count]) => `${count} ${status}`).join(", ");
  context.out(`Plan: ${summary || "nothing to do"}`);
  if (breaking === undefined) {
    context.out("API changes: not compared (no base manifest).");
  } else {
    const text = renderDiff(breaking).trimEnd();
    const none = text === "Aucun changement.";
    context.out(
      none
        ? "API changes for the installed components: none."
        : `API changes for the installed components:\n${text}`,
    );
  }
  if (dependencies.changed.length > 0) {
    const shown = dependencies.changed.map((name) => `${name}@${wanted[name]}`).join(", ");
    context.out(`New dependencies: ${shown}`);
  }

  if (!options.write) {
    context.out("Nothing written. Run again with --write to apply the plan.");
    return 0;
  }

  const changes = plans.flatMap((plan) => plan.changes);
  const backupRoot = path.join(cwd, ".standarui", "backup", backupDirName(new Date()));
  for (const change of changes) {
    const { status, local, base } = change;
    const modified =
      local !== undefined &&
      (status === "update" ||
        status === "added" ||
        status === "merge" ||
        (status === "conflict" && base !== undefined) ||
        (status === "removed" && local === base));
    if (modified) write(path.join(backupRoot, ...change.lockKey.split("/")), local);
  }
  const lockFile = path.join(cwd, LOCK_FILE);
  if (existsSync(lockFile)) {
    write(path.join(backupRoot, LOCK_FILE), readFileSync(lockFile, "utf8"));
  }

  let conflicts = 0;
  const kept: string[] = [];
  for (const change of changes) {
    const shown = relative(cwd, change.copy);
    const { status, base, local, target } = change;
    if (target !== undefined && (status === "update" || status === "added")) {
      write(change.copy, target);
    } else if (target !== undefined && (status === "merge" || status === "conflict")) {
      if (base === undefined || local === undefined) {
        conflicts += 1;
        kept.push(shown);
      } else if (mergeInPlace(change.copy, change.baseFile, target) > 0) {
        conflicts += 1;
        context.out(`  conflict markers written in ${shown}`);
      }
    } else if (status === "removed" && local !== undefined) {
      if (local === base) rmSync(change.copy);
      else kept.push(shown);
    }
  }

  for (const plan of plans) {
    const { target } = plan;
    const files: Record<string, string> = {};
    for (const file of target.files) {
      files[file.lockKey] = file.sha256;
      write(file.base, file.content);
    }
    for (const change of plan.changes) {
      if (change.target === undefined) rmSync(change.baseFile, { force: true });
    }
    lock.items[target.key] = {
      source: target.ref.registry,
      version: target.item.version,
      files,
    };
  }
  if (targetApi !== undefined) {
    write(baseManifestFile, targetApi.manifest);
    write(baseRenamesFile, targetApi.renames);
  }
  write(lockFile, serializeLockfile(lock));
  dependencies.apply(options.install);

  context.out(`Backup: ${relative(cwd, backupRoot)}`);
  for (const file of kept) context.out(`  kept, needs your attention: ${file}`);
  let failed = conflicts > 0;
  if (conflicts > 0) context.out(`${conflicts} file(s) still have conflicts to resolve.`);
  if (options.typecheck) {
    if (!typecheck(context)) failed = true;
  } else {
    context.out("Typecheck skipped (--no-typecheck).");
  }
  return failed ? 1 : 0;
}
