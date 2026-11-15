import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  diffManifests,
  type Rename,
  renderDiff,
  sheetsOf,
} from "../packages/cli/src/manifest-diff";
import type { ComponentManifest } from "./component-manifest";

export { diffManifests, type Rename, renderDiff };

export interface RenameContext {
  readonly manifest: ComponentManifest;
}

export function renameProblems(list: unknown, context?: RenameContext): string[] {
  const problems: string[] = [];
  if (!Array.isArray(list)) return ["renames is not a list"];
  const seen = new Set<string>();
  const kinds = ["part", "token", "hook", "prop", "component"];
  const entries = list.map((item) =>
    typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {},
  );
  const renamedComponents = new Map(
    entries
      .filter((item) => item.kind === "component")
      .map((item) => [item.from as string, item.to as string]),
  );
  for (const [index, item] of entries.entries()) {
    const at = `#${index}`;
    const needsComponent = item.kind !== "token";
    for (const field of ["since", "kind", "from", "to", ...(needsComponent ? ["component"] : [])]) {
      if (typeof item[field] !== "string" || item[field] === "") {
        problems.push(`${at}: ${field} is missing`);
      }
    }
    if (!kinds.includes(item.kind as string)) problems.push(`${at}: unknown kind`);
    if (item.kind === "prop" && (typeof item.table !== "string" || item.table === "")) {
      problems.push(`${at}: a prop rename needs its table`);
    }
    if (item.kind !== "prop" && item.table !== undefined)
      problems.push(`${at}: only a prop has a table`);
    if (item.from === item.to) problems.push(`${at}: from equals to`);
    const key = JSON.stringify([item.kind, item.component, item.table ?? null, item.from, item.to]);
    if (seen.has(key)) problems.push(`${at}: duplicate`);
    seen.add(key);
    if (context === undefined) continue;
    const { manifest } = context;
    const owner = typeof item.component === "string" ? item.component : undefined;
    const current = owner === undefined ? undefined : (renamedComponents.get(owner) ?? owner);
    const sheet = current === undefined ? undefined : sheetsOf(manifest)?.[current];
    const holder: { tokens?: readonly string[]; hooks?: readonly string[] } | undefined =
      current === undefined ? undefined : (manifest.components[current] ?? sheet);
    const props = current === undefined ? undefined : manifest.components[current]?.props;
    if (owner !== undefined && holder === undefined && !renamedComponents.has(owner)) {
      problems.push(`${at}: component ${owner} is neither in the manifest nor renamed`);
    }
    if (item.since !== manifest.version || typeof item.to !== "string") continue;
    const target = item.to;
    const name = target.endsWith("?") ? target.slice(0, -1) : target;
    let exists = false;
    if (item.kind === "component") {
      exists = manifest.components[target] !== undefined;
    } else if (item.kind === "part") {
      exists = Object.values(manifest.components).some((entry) =>
        entry.parts.some((part) => part.part === target),
      );
    } else if (item.kind === "token") {
      exists = (holder?.tokens ?? manifest.tokens ?? []).includes(target);
    } else if (item.kind === "hook") {
      exists = holder?.hooks?.includes(target) ?? false;
    } else if (item.kind === "prop" && typeof item.table === "string") {
      exists = (props?.[item.table] ?? []).some((row) => row.replace(/\?$/, "") === name);
    }
    if (!exists) problems.push(`${at}: ${target} does not exist in the current manifest`);
  }
  return problems;
}

const root = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = "packages/react/api/manifest.json";
const RENAMES_PATH = "packages/react/api/renames.json";

class Unreadable extends Error {}

interface Source {
  readonly manifest: ComponentManifest;
  readonly renames: Rename[];
}

function run(command: string, args: string[], cwd: string): string | null {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

function parseManifest(text: string, label: string): ComponentManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Unreadable(`${label} is not valid JSON`);
  }
  const candidate = parsed as Partial<ComponentManifest> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.schema !== 1 ||
    typeof candidate.components !== "object" ||
    candidate.components === null
  ) {
    throw new Unreadable(`${label} is not a schema 1 component manifest`);
  }
  return candidate as ComponentManifest;
}

function parseRenames(text: string | null, label: string, manifest: ComponentManifest): Rename[] {
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Unreadable(`${label} is not valid JSON`);
  }
  const list = (parsed as { renames?: unknown } | null)?.renames;
  if (!Array.isArray(list)) throw new Unreadable(`${label} has no renames list`);
  const problems = renameProblems(list, { manifest });
  if (problems.length > 0) {
    throw new Unreadable(
      `${label} is invalid:\n${problems.map((entry) => `  ${entry}`).join("\n")}`,
    );
  }
  return list as Rename[];
}

function load(spec: string): Source {
  if (spec.startsWith("git:")) {
    const ref = spec.slice(4);
    const text = run("git", ["show", `${ref}:${MANIFEST_PATH}`], root);
    if (text === null) throw new Unreadable(`no ${MANIFEST_PATH} at git ref ${ref}`);
    const manifest = parseManifest(text, `${MANIFEST_PATH} at ${ref}`);
    return {
      manifest,
      renames: parseRenames(
        run("git", ["show", `${ref}:${RENAMES_PATH}`], root),
        `${RENAMES_PATH} at ${ref}`,
        manifest,
      ),
    };
  }
  const file = path.resolve(spec);
  if (!existsSync(file)) throw new Unreadable(`${spec} does not exist`);
  if (spec.endsWith(".tgz")) {
    const cwd = path.dirname(file);
    const name = path.basename(file);
    const text = run("tar", ["-xzOf", name, "package/api/manifest.json"], cwd);
    if (text === null) throw new Unreadable(`${spec} has no package/api/manifest.json`);
    const manifest = parseManifest(text, `${spec}:package/api/manifest.json`);
    return {
      manifest,
      renames: parseRenames(
        run("tar", ["-xzOf", name, "package/api/renames.json"], cwd),
        `${spec}:package/api/renames.json`,
        manifest,
      ),
    };
  }
  const sibling = path.join(path.dirname(file), "renames.json");
  const manifest = parseManifest(readFileSync(file, "utf8"), spec);
  return {
    manifest,
    renames: parseRenames(
      existsSync(sibling) ? readFileSync(sibling, "utf8") : null,
      sibling,
      manifest,
    ),
  };
}

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runCli(args: readonly string[]): CliResult {
  const json = args.includes("--json");
  const specs = args.filter((arg) => arg !== "--json");
  if (specs.length !== 2) {
    return {
      code: 2,
      stdout: "",
      stderr:
        "usage: manifest-diff <old> <new> [--json]  (manifest.json, react .tgz or git:<ref>)\n",
    };
  }
  const [oldSpec, newSpec] = specs as [string, string];
  let before: Source;
  let after: Source;
  try {
    before = load(oldSpec);
  } catch (error) {
    if (error instanceof Unreadable) {
      return { code: 2, stdout: "", stderr: `old side: ${error.message}\n` };
    }
    throw error;
  }
  try {
    after = load(newSpec);
  } catch (error) {
    if (error instanceof Unreadable) {
      return { code: 2, stdout: "", stderr: `new side: ${error.message}\n` };
    }
    throw error;
  }
  const diff = diffManifests(before.manifest, after.manifest, after.renames);
  return {
    code: 0,
    stdout: json ? `${JSON.stringify(diff, null, 2)}\n` : renderDiff(diff),
    stderr: "",
  };
}

if (import.meta.main) {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
