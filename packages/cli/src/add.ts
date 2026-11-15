import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_REGISTRY, type StandaruiConfig } from "./config";
import type { CliContext } from "./context";
import { CliError } from "./errors";
import { LOCK_FILE, lockedFiles, readLockfile, serializeLockfile } from "./lockfile";
import { detectInstaller, mergeDependencies, type PackageJson } from "./package-json";
import { createRegistryClient } from "./registry";
import type { RegistrySpecifier } from "./registry-types";
import { resolveItems } from "./resolve";
import { rewriteImports } from "./rewrite";

export interface InstallOptions {
  readonly overwrite: boolean;
  readonly install: boolean;
  readonly registry: string | undefined;
  readonly version: string;
}

interface PlannedFile {
  readonly lockKey: string;
  readonly target: string;
  readonly base: string;
  readonly content: string;
  readonly sha256: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
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

  let specifiers: Readonly<Record<string, RegistrySpecifier>> | undefined;
  const planned = new Map<string, PlannedFile[]>();
  for (const { key, item } of resolved) {
    const files: PlannedFile[] = [];
    for (const file of item.files) {
      const label = `${key}:${file.layer}/${file.path}`;
      let content = file.content;
      if (content.includes("@standarui/")) {
        specifiers ??= (await client.loadIndex(DEFAULT_REGISTRY)).specifiers;
        content = rewriteImports(content, label, specifiers, config.aliases);
      }
      files.push({
        lockKey: `${file.layer}/${file.path}`,
        target: path.join(cwd, config.dirs[file.layer], file.path),
        base: path.join(cwd, ".standarui", "base", file.layer, file.path),
        content,
        sha256: sha256(content),
      });
    }
    planned.set(key, files);
  }

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

  const packageFile = path.join(cwd, "package.json");
  if (!existsSync(packageFile)) throw new CliError(`package.json not found in ${cwd}`);
  const wanted: Record<string, string> = {};
  for (const { item } of resolved) Object.assign(wanted, item.dependencies ?? {});
  const merged = mergeDependencies(
    JSON.parse(readFileSync(packageFile, "utf8")) as PackageJson,
    wanted,
  );

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
  write(path.join(cwd, LOCK_FILE), serializeLockfile(lock));

  if (merged.changed.length > 0) {
    write(packageFile, `${JSON.stringify(merged.pkg, null, 2)}\n`);
    if (options.install) {
      const installer = detectInstaller(cwd);
      context.out(`Running ${installer} install`);
      const result = spawnSync(installer, ["install"], {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.status !== 0) throw new CliError(`${installer} install failed`);
    }
  }

  context.out(`Added ${resolved.length} item(s), ${fileCount} file(s).`);
  context.out(`  items: ${resolved.map(({ key }) => key).join(", ")}`);
  if (merged.changed.length > 0) {
    const shown = merged.changed.map((name) => `${name}@${wanted[name]}`).join(", ");
    context.out(`  dependencies: ${shown}`);
  }
}
