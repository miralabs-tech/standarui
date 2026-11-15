import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StandaruiConfig } from "./config";
import type { CliContext } from "./context";
import { BASE_DIR, type PlannedFile } from "./files";
import { unifiedDiff, withTempDir } from "./git";
import { readLockfile } from "./lockfile";
import { createRegistryClient } from "./registry";
import type { RegistryLayer } from "./registry-types";
import { loadTargets, lockedKeys } from "./targets";

export interface DiffOptions {
  readonly items: readonly string[];
  readonly registry: string | undefined;
  readonly version: string;
}

function readIfExists(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function relative(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join("/");
}

export async function runDiff(
  context: CliContext,
  config: StandaruiConfig,
  options: DiffOptions,
): Promise<void> {
  const { cwd } = context;
  const lock = readLockfile(cwd);
  const client = createRegistryClient(context, config, options.version, options.registry);
  const targets = await loadTargets(cwd, config, client, lockedKeys(lock, options.items));
  let differences = 0;

  for (const { key, files } of targets) {
    const locked = lock.items[key]?.files ?? {};
    const byKey = new Map<string, PlannedFile>(files.map((file) => [file.lockKey, file]));
    const keys = [...new Set([...Object.keys(locked), ...byKey.keys()])].sort();
    const local: string[] = [];
    const upstream: string[] = [];

    for (const lockKey of keys) {
      const file = byKey.get(lockKey);
      const [layer, ...rest] = lockKey.split("/");
      const baseFile = path.join(cwd, BASE_DIR, ...lockKey.split("/"));
      const copy = file?.target ?? path.join(cwd, config.dirs[layer as RegistryLayer], ...rest);
      const copyLabel = relative(cwd, copy);
      const baseLabel = relative(cwd, baseFile);
      const base = readIfExists(baseFile);
      const isLocked = Object.hasOwn(locked, lockKey);

      if (isLocked) {
        const text = readIfExists(copy);
        if (text === undefined) local.push(`deleted locally: ${copyLabel}`);
        else if (base !== undefined && text !== base) {
          local.push(unifiedDiff(baseFile, copy, { before: baseLabel, after: copyLabel }, cwd));
        }
      }

      if (file === undefined) {
        upstream.push(`removed upstream: ${copyLabel}`);
      } else if (!isLocked) {
        upstream.push(`added upstream: ${copyLabel}`);
      } else if (base !== undefined && base !== file.content) {
        upstream.push(
          withTempDir((dir) => {
            const incoming = path.join(dir, "upstream");
            writeFileSync(incoming, file.content);
            return unifiedDiff(
              baseFile,
              incoming,
              { before: baseLabel, after: `upstream/${lockKey}` },
              cwd,
            );
          }),
        );
      }
    }

    if (local.length === 0 && upstream.length === 0) continue;
    differences += 1;
    context.out(`## ${key}`);
    if (local.length > 0) context.out(`local changes (base -> your copy):\n${local.join("\n")}`);
    if (upstream.length > 0) {
      context.out(`upstream changes (base -> registry):\n${upstream.join("\n")}`);
    }
  }

  if (differences === 0) context.out("No differences.");
}
