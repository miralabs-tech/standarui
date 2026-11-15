import { existsSync } from "node:fs";
import path from "node:path";

export type PackageJson = Record<string, unknown>;

const SECTIONS = ["dependencies", "devDependencies"] as const;

function minVersion(range: string): number[] | undefined {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function isLower(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

export function mergeDependencies(
  pkg: PackageJson,
  wanted: Readonly<Record<string, string>>,
): { pkg: PackageJson; changed: string[] } {
  const next = structuredClone(pkg);
  const changed: string[] = [];
  for (const name of Object.keys(wanted).sort()) {
    const range = wanted[name] as string;
    const section = SECTIONS.find((key) => {
      const entries = next[key] as Record<string, string> | undefined;
      return entries !== undefined && Object.hasOwn(entries, name);
    });
    if (section === undefined) {
      const entries = (next.dependencies ?? {}) as Record<string, string>;
      entries[name] = range;
      next.dependencies = entries;
      changed.push(name);
      continue;
    }
    const entries = next[section] as Record<string, string>;
    const present = minVersion(entries[name] as string);
    const incoming = minVersion(range);
    if (present !== undefined && incoming !== undefined && isLower(present, incoming)) {
      entries[name] = range;
      changed.push(name);
    }
  }
  const dependencies = next.dependencies as Record<string, string> | undefined;
  if (changed.length > 0 && dependencies !== undefined) {
    next.dependencies = Object.fromEntries(
      Object.keys(dependencies)
        .sort()
        .map((key) => [key, dependencies[key]]),
    );
  }
  return { pkg: next, changed };
}

export function detectInstaller(cwd: string): string {
  const lockfiles: ReadonlyArray<readonly [string, string]> = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];
  for (const [file, installer] of lockfiles) {
    if (existsSync(path.join(cwd, file))) return installer;
  }
  return "npm";
}
