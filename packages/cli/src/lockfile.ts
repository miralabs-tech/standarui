import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CliError } from "./errors";

export const LOCK_FILE = "standarui.lock.json";

export interface LockedItem {
  source: string;
  version: string;
  files: Record<string, string>;
}

export interface Lockfile {
  lockVersion: 1;
  items: Record<string, LockedItem>;
}

export function emptyLockfile(): Lockfile {
  return { lockVersion: 1, items: {} };
}

function sorted<T>(
  record: Readonly<Record<string, T>>,
  map: (value: T) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = map(record[key] as T);
  return out;
}

export function serializeLockfile(lock: Lockfile): string {
  const body = {
    lockVersion: lock.lockVersion,
    items: sorted(lock.items, (item) => ({
      source: item.source,
      version: item.version,
      files: sorted(item.files, (hash) => hash),
    })),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function readLockfile(cwd: string): Lockfile {
  const file = path.join(cwd, LOCK_FILE);
  if (!existsSync(file)) return emptyLockfile();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new CliError(`${LOCK_FILE} is not valid JSON`);
  }
  const record = parsed as Partial<Lockfile> | null;
  if (record?.lockVersion !== 1 || typeof record.items !== "object" || record.items === null) {
    throw new CliError(`${LOCK_FILE} is not a version 1 lockfile`);
  }
  return { lockVersion: 1, items: record.items };
}

export function lockedFiles(lock: Lockfile): Set<string> {
  const files = new Set<string>();
  for (const item of Object.values(lock.items)) {
    for (const key of Object.keys(item.files)) files.add(key);
  }
  return files;
}
