import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import type {
  CodeLayer,
  RegistryFile,
  RegistryIndex,
  RegistryItem,
  RegistrySpecifier,
} from "../packages/cli/src/registry-types";

const LAYERS: readonly CodeLayer[] = ["core", "react"];
const NAV_FILES: Readonly<Record<CodeLayer, string>> = { core: "nav.ts", react: "nav.tsx" };
const API_FILES: readonly string[] = ["manifest.json", "renames.json"];
const HARNESS_FILES: ReadonlySet<string> = new Set([
  "core:components/harness.ts",
  "core:components/node-harness.ts",
]);

export interface SourceFile {
  readonly key: string;
  readonly layer: CodeLayer;
  readonly path: string;
  readonly content: string;
}

export interface CollectedRegistry {
  readonly items: readonly RegistryItem[];
  readonly index: RegistryIndex;
  readonly sources: readonly SourceFile[];
  readonly excluded: ReadonlySet<string>;
  readonly onlyImportedByExcluded: readonly string[];
  readonly movedIntoComponents: ReadonlyMap<string, string>;
  readonly baseImportsOfComponents: readonly string[];
}

export function isExcludedByName(layer: CodeLayer, relPath: string): boolean {
  const base = path.posix.basename(relPath);
  return (
    /\.test\./.test(base) ||
    /\.parity\.tsx$/.test(base) ||
    /\.typecheck\.ts$/.test(base) ||
    /\.bench\.ts$/.test(base) ||
    base === "composed.harness.tsx" ||
    base === "render-harness.tsx" ||
    HARNESS_FILES.has(`${layer}:${relPath}`)
  );
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readPackage(root: string, layer: CodeLayer): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(root, "packages", layer, "package.json"), "utf8"),
  ) as Record<string, unknown>;
}

function readSources(root: string, layer: CodeLayer): SourceFile[] {
  const srcDir = path.join(root, "packages", layer, "src");
  const found: SourceFile[] = [];
  for (const entry of readdirSync(srcDir, { recursive: true, encoding: "utf8" })) {
    if (!statSync(path.join(srcDir, entry)).isFile()) continue;
    const rel = entry.split(path.sep).join("/");
    found.push({
      key: `${layer}:${rel}`,
      layer,
      path: rel,
      content: toLf(readFileSync(path.join(srcDir, entry), "utf8")),
    });
  }
  return found.sort((a, b) => compare(a.key, b.key));
}

function requestsOf(file: SourceFile): string[] {
  const parsed = parseSync(file.path, file.content);
  const requests: string[] = [];
  for (const entry of parsed.module.staticImports) requests.push(entry.moduleRequest.value);
  for (const statement of parsed.module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest !== null) requests.push(entry.moduleRequest.value);
    }
  }
  for (const entry of parsed.module.dynamicImports) {
    const raw = file.content.slice(entry.moduleRequest.start, entry.moduleRequest.end).trim();
    const literal = /^(["'`])(.*)\1$/.exec(raw);
    if (literal?.[2] !== undefined) requests.push(literal[2]);
  }
  return requests;
}

interface ExportsMap {
  readonly specifiers: Map<string, RegistrySpecifier>;
  readonly roots: Set<string>;
}

function readExports(root: string, sourceKeys: ReadonlySet<string>): ExportsMap {
  const specifiers = new Map<string, RegistrySpecifier>();
  const roots = new Set<string>();
  for (const layer of LAYERS) {
    const exportsField = readPackage(root, layer).exports as Record<string, unknown>;
    for (const [subpath, target] of Object.entries(exportsField)) {
      if (typeof target !== "string" || !target.startsWith("./dist/") || !target.endsWith(".js")) {
        continue;
      }
      if (subpath.includes("*")) throw new Error(`pattern export ${subpath} in packages/${layer}`);
      const stem = target.slice("./dist/".length, -".js".length);
      const rel = [`${stem}.ts`, `${stem}.tsx`].find((candidate) =>
        sourceKeys.has(`${layer}:${candidate}`),
      );
      if (rel === undefined)
        throw new Error(`export ${subpath} of packages/${layer} has no source`);
      const specifier =
        subpath === "." ? `@standarui/${layer}` : `@standarui/${layer}/${subpath.slice(2)}`;
      specifiers.set(specifier, { layer, path: rel });
      roots.add(`${layer}:${rel}`);
    }
  }
  return { specifiers, roots };
}

function resolveRequest(
  from: SourceFile,
  request: string,
  sourceKeys: ReadonlySet<string>,
  specifiers: ReadonlyMap<string, RegistrySpecifier>,
): string | null {
  if (request.startsWith(".")) {
    const base = path.posix
      .join(path.posix.dirname(from.path), request)
      .replace(/\.(?:js|jsx)$/, "");
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    const hit = candidates.find((candidate) => sourceKeys.has(`${from.layer}:${candidate}`));
    if (hit === undefined) throw new Error(`${from.key} imports ${request}, which does not exist`);
    return `${from.layer}:${hit}`;
  }
  if (request.startsWith("@standarui/")) {
    const target = specifiers.get(request);
    if (target === undefined)
      throw new Error(`${from.key} imports ${request}, which is not exported`);
    return `${target.layer}:${target.path}`;
  }
  return null;
}

function componentOf(relPath: string): string | null {
  const match = /^components\/([^/]+)\//.exec(relPath);
  return match?.[1] ?? null;
}

function item(
  version: string,
  name: string,
  type: RegistryItem["type"],
  files: readonly SourceFile[],
  registryDependencies: readonly string[],
  dependencies: Readonly<Record<string, string>>,
): RegistryItem {
  const entries: RegistryFile[] = files
    .map((file) => ({
      layer: file.layer,
      path: file.path,
      sha256: sha256(file.content),
      content: file.content,
    }))
    .sort((a, b) => compare(a.layer, b.layer) || compare(a.path, b.path));
  return {
    $schema: "../schema.json",
    name,
    type,
    version,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    registryDependencies,
    files: entries,
  };
}

function peerRanges(
  root: string,
  layer: CodeLayer,
  names: readonly string[],
): Record<string, string> {
  const peers = readPackage(root, layer).peerDependencies as Record<string, string>;
  const picked: Record<string, string> = {};
  for (const name of names) {
    const range = peers[name];
    if (range === undefined) throw new Error(`packages/${layer} has no peer dependency ${name}`);
    picked[name] = range;
  }
  return picked;
}

export function collectRegistry(root: string): CollectedRegistry {
  const sources = LAYERS.flatMap((layer) => readSources(root, layer));
  const sourceKeys = new Set(sources.map((file) => file.key));
  const { specifiers, roots } = readExports(root, sourceKeys);

  const imports = new Map<string, Set<string>>();
  const importers = new Map<string, Set<string>>();
  for (const file of sources) {
    const targets = new Set<string>();
    for (const request of requestsOf(file)) {
      const target = resolveRequest(file, request, sourceKeys, specifiers);
      if (target !== null && target !== file.key) targets.add(target);
    }
    imports.set(file.key, targets);
    for (const target of targets) {
      const set = importers.get(target) ?? new Set<string>();
      set.add(file.key);
      importers.set(target, set);
    }
  }

  const excluded = new Set(
    sources.filter((file) => isExcludedByName(file.layer, file.path)).map((file) => file.key),
  );
  const onlyImportedByExcluded: string[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const file of sources) {
      if (excluded.has(file.key) || roots.has(file.key)) continue;
      const from = importers.get(file.key);
      if (from === undefined || from.size === 0) continue;
      if ([...from].every((key) => excluded.has(key))) {
        excluded.add(file.key);
        onlyImportedByExcluded.push(file.key);
        changed = true;
      }
    }
  }

  const kept = sources.filter((file) => !excluded.has(file.key));
  const version = readPackage(root, "core").version as string;
  const navDependency = peerRanges(root, "core", ["@standarx/nav"]);
  const reactDependencies = peerRanges(root, "react", ["react", "react-dom"]);
  const isNav = (file: SourceFile): boolean => file.path === NAV_FILES[file.layer];

  const pathOf = (key: string): string => key.slice(key.indexOf(":") + 1);
  const isBase = (file: SourceFile): boolean =>
    !isNav(file) && !file.path.startsWith("components/");

  const movedIntoComponents = new Map<string, string>();
  for (const file of kept.filter(isBase)) {
    const components = new Set<string>();
    for (const target of imports.get(file.key) ?? []) {
      if (excluded.has(target)) continue;
      const component = componentOf(pathOf(target));
      if (component !== null) components.add(component);
    }
    if (components.size === 0) continue;
    const from = [...(importers.get(file.key) ?? [])].filter((key) => !excluded.has(key));
    if (from.length === 0 || from.some((key) => componentOf(pathOf(key)) === null)) {
      throw new Error(
        `${file.key} imports a component but is also used outside components, so it cannot move into one`,
      );
    }
    if (components.size > 1) {
      throw new Error(
        `${file.key} imports several components (${[...components].sort(compare).join(", ")}), so it has no single item to move into`,
      );
    }
    movedIntoComponents.set(file.key, [...components][0] as string);
  }
  const ownerOf = (key: string): string | null =>
    movedIntoComponents.get(key) ?? componentOf(pathOf(key));
  const isBaseItemFile = (file: SourceFile): boolean =>
    isBase(file) && !movedIntoComponents.has(file.key);

  const baseImportsOfComponents: string[] = [];
  for (const file of kept.filter((entry) => isNav(entry) || isBaseItemFile(entry))) {
    for (const target of imports.get(file.key) ?? []) {
      if (!excluded.has(target) && ownerOf(target) !== null) {
        baseImportsOfComponents.push(`${file.key} -> ${target}`);
      }
    }
  }

  const componentNames = new Set<string>();
  for (const file of sources) {
    const name = componentOf(file.path);
    if (name !== null) componentNames.add(name);
  }

  const items: RegistryItem[] = [
    item(version, "nav", "registry:nav", kept.filter(isNav), [], navDependency),
    item(
      version,
      "core-base",
      "registry:base",
      kept.filter((file) => file.layer === "core" && isBaseItemFile(file)),
      ["nav"],
      {},
    ),
    item(
      version,
      "react-base",
      "registry:base",
      kept.filter((file) => file.layer === "react" && isBaseItemFile(file)),
      ["core-base", "nav"],
      reactDependencies,
    ),
  ];

  for (const name of [...componentNames].sort(compare)) {
    const own = kept.filter((file) => ownerOf(file.key) === name);
    const others = new Set<string>();
    for (const file of own) {
      for (const target of imports.get(file.key) ?? []) {
        if (excluded.has(target)) continue;
        const other = ownerOf(target);
        if (other !== null && other !== name) others.add(other);
      }
    }
    items.push(
      item(
        version,
        name,
        "registry:component",
        own,
        ["core-base", "react-base", ...[...others].sort(compare)],
        {},
      ),
    );
  }

  const sortedSpecifiers: Record<string, RegistrySpecifier> = {};
  for (const key of [...specifiers.keys()].sort(compare)) {
    sortedSpecifiers[key] = specifiers.get(key) as RegistrySpecifier;
  }

  const index: RegistryIndex = {
    $schema: "./schema.json",
    name: "standarui",
    version,
    manifest: "manifest.json",
    renames: "renames.json",
    specifiers: sortedSpecifiers,
    items: [...items]
      .sort((a, b) => compare(a.name, b.name))
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        registryDependencies: entry.registryDependencies,
        files: entry.files.length,
      })),
  };

  return {
    items,
    index,
    sources,
    excluded,
    onlyImportedByExcluded: onlyImportedByExcluded.sort(compare),
    movedIntoComponents,
    baseImportsOfComponents,
  };
}

export function buildRegistry(root: string): Map<string, string> {
  const { items, index, baseImportsOfComponents } = collectRegistry(root);
  if (baseImportsOfComponents.length > 0) {
    throw new Error(`a base file imports a component: ${baseImportsOfComponents.join(", ")}`);
  }
  const output = new Map<string, string>();
  output.set("registry/index.json", json(index));
  for (const name of API_FILES) {
    output.set(
      `registry/${name}`,
      toLf(readFileSync(path.join(root, "packages", "react", "api", name), "utf8")),
    );
  }
  for (const entry of items) output.set(`registry/items/${entry.name}.json`, json(entry));
  return output;
}

export function readCommittedRegistry(root: string): Map<string, string> {
  const committed = new Map<string, string>();
  const indexFile = path.join(root, "registry", "index.json");
  if (existsSync(indexFile))
    committed.set("registry/index.json", toLf(readFileSync(indexFile, "utf8")));
  for (const name of API_FILES) {
    const file = path.join(root, "registry", name);
    if (existsSync(file)) committed.set(`registry/${name}`, toLf(readFileSync(file, "utf8")));
  }
  const itemsDir = path.join(root, "registry", "items");
  if (existsSync(itemsDir)) {
    for (const name of readdirSync(itemsDir).filter((file) => file.endsWith(".json"))) {
      committed.set(
        `registry/items/${name}`,
        toLf(readFileSync(path.join(itemsDir, name), "utf8")),
      );
    }
  }
  return committed;
}

export function outdatedRegistryMessage(
  committed: ReadonlyMap<string, string>,
  generated: ReadonlyMap<string, string>,
): string | null {
  const differing = [...new Set([...committed.keys(), ...generated.keys()])]
    .filter((file) => committed.get(file) !== generated.get(file))
    .sort(compare);
  if (differing.length === 0) return null;
  const shown = differing.slice(0, 5).join(", ");
  const more = differing.length > 5 ? ` and ${differing.length - 5} more` : "";
  return `registry/ differs from what \`bun run registry:build\` generates from the source (${shown}${more}): run \`bun run registry:build\` and commit the result`;
}

function writeRegistry(root: string): void {
  const output = buildRegistry(root);
  const itemsDir = path.join(root, "registry", "items");
  mkdirSync(itemsDir, { recursive: true });
  for (const name of readdirSync(itemsDir)) {
    if (name.endsWith(".json") && !output.has(`registry/items/${name}`)) {
      rmSync(path.join(itemsDir, name));
    }
  }
  for (const [rel, content] of output) writeFileSync(path.join(root, rel), content);
  console.log(`registry: wrote ${output.size} file(s)`);
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  writeRegistry(path.resolve(import.meta.dirname, ".."));
}
