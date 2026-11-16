import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_REGISTRY, type RegistryDefinition, type StandaruiConfig } from "./config";
import type { CliContext } from "./context";
import { CliError } from "./errors";
import { sha256 } from "./files";
import type { RegistryIndex, RegistryItem } from "./registry-types";

export type Place =
  | { readonly kind: "http"; readonly url: string }
  | { readonly kind: "file"; readonly path: string };

export function defaultRegistry(version: string): RegistryDefinition {
  const base = `https://raw.githubusercontent.com/miralabs-tech/standarui/v${version}/registry`;
  return { url: `${base}/items/{name}.json`, index: `${base}/index.json` };
}

export function expandHeaders(
  headers: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const expanded: Record<string, string> = {};
  for (const [name, template] of Object.entries(headers)) {
    expanded[name] = template.replace(/\$\{([^}]*)\}/g, (_match, variable: string) => {
      const value = env[variable];
      if (value === undefined) {
        throw new CliError(
          `header "${name}" needs the environment variable ${variable}, which is not set`,
        );
      }
      return value;
    });
  }
  return expanded;
}

function place(spec: string, cwd: string): Place {
  if (/^https?:\/\//i.test(spec)) return { kind: "http", url: spec };
  if (/^file:/i.test(spec)) return { kind: "file", path: fileURLToPath(spec) };
  return { kind: "file", path: path.resolve(cwd, spec) };
}

function join(target: Place, relative: string): Place {
  return target.kind === "http"
    ? { kind: "http", url: `${target.url.replace(/\/+$/, "")}/${relative}` }
    : { kind: "file", path: path.join(target.path, relative) };
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

export function itemPlace(definition: RegistryDefinition, name: string, cwd: string): Place {
  if (definition.url.includes("{name}")) {
    return place(definition.url.replaceAll("{name}", name), cwd);
  }
  return join(place(definition.url, cwd), `items/${name}.json`);
}

export function indexPlace(definition: RegistryDefinition, cwd: string): Place | undefined {
  if (definition.index === undefined) return undefined;
  const target = place(definition.index, cwd);
  if (target.kind === "http") {
    return target.url.endsWith(".json") ? target : join(target, "index.json");
  }
  return isDirectory(target.path) ? join(target, "index.json") : target;
}

export function parseRef(input: string, parent: string): { registry: string; name: string } {
  if (!input.startsWith("@")) return { registry: parent, name: input };
  const slash = input.indexOf("/");
  if (slash <= 1 || slash === input.length - 1) {
    throw new CliError(`"${input}" is not a valid item name, expected @registry/name`);
  }
  return { registry: input.slice(0, slash), name: input.slice(slash + 1) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkPath(value: unknown, where: string): void {
  if (typeof value !== "string" || value === "") throw new CliError(`${where}: invalid file path`);
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-zA-Z]:/.test(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new CliError(`${where}: refusing the file path "${value}"`);
  }
}

function checkItem(value: unknown, where: string): RegistryItem {
  if (!isRecord(value) || typeof value.name !== "string" || !Array.isArray(value.files)) {
    throw new CliError(`${where}: not a registry item`);
  }
  for (const file of value.files as unknown[]) {
    if (
      !isRecord(file) ||
      (file.layer !== "core" && file.layer !== "react" && file.layer !== "styles") ||
      typeof file.content !== "string"
    ) {
      throw new CliError(`${where}: malformed file entry`);
    }
    checkPath(file.path, where);
    if (typeof file.sha256 !== "string" || file.sha256 !== sha256(file.content)) {
      throw new CliError(`${where}: the sha256 of "${file.path}" does not match its content`);
    }
  }
  const dependencies = value.registryDependencies;
  if (
    dependencies !== undefined &&
    (!Array.isArray(dependencies) || dependencies.some((entry) => typeof entry !== "string"))
  ) {
    throw new CliError(`${where}: malformed registryDependencies`);
  }
  return { registryDependencies: [], version: "0.0.0", ...value } as unknown as RegistryItem;
}

function sibling(target: Place, name: string): Place {
  if (target.kind === "http") return { kind: "http", url: new URL(name, target.url).href };
  return { kind: "file", path: path.join(path.dirname(target.path), name) };
}

function checkIndex(value: unknown, where: string): RegistryIndex {
  if (!isRecord(value) || !isRecord(value.specifiers)) {
    throw new CliError(`${where}: not a registry index`);
  }
  return value as unknown as RegistryIndex;
}

export interface RegistryApi {
  readonly manifest: string;
  readonly renames: string;
}

export interface RegistryClient {
  loadItem(registry: string, name: string): Promise<RegistryItem>;
  loadIndex(registry: string): Promise<RegistryIndex>;
  loadApi(registry: string): Promise<RegistryApi>;
}

export function createRegistryClient(
  context: CliContext,
  config: StandaruiConfig,
  version: string,
  override: string | undefined,
): RegistryClient {
  const definitions: Record<string, RegistryDefinition> = {
    [DEFAULT_REGISTRY]: defaultRegistry(version),
    ...config.registries,
    ...(override === undefined ? {} : { [DEFAULT_REGISTRY]: { url: override, index: override } }),
  };

  const definitionOf = (registry: string): RegistryDefinition => {
    const definition = definitions[registry];
    if (definition === undefined) {
      throw new CliError(
        `unknown registry "${registry}": declare it under "registries" in standarui.json`,
      );
    }
    return definition;
  };

  const read = async (target: Place, definition: RegistryDefinition): Promise<string> => {
    if (target.kind === "file") {
      try {
        return readFileSync(target.path, "utf8");
      } catch {
        throw new CliError(`cannot read ${target.path}`);
      }
    }
    const headers = definition.headers ? expandHeaders(definition.headers, context.env) : {};
    let response: Response;
    try {
      response = await context.fetch(target.url, { headers });
    } catch (error) {
      throw new CliError(`cannot reach ${target.url}: ${(error as Error).message}`);
    }
    if (!response.ok) {
      throw new CliError(`registry answered ${response.status} for ${target.url}`);
    }
    return await response.text();
  };

  const parse = (raw: string, where: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      throw new CliError(`${where}: not valid JSON`);
    }
  };

  const loadIndex = async (registry: string): Promise<RegistryIndex> => {
    const definition = definitionOf(registry);
    const target = indexPlace(definition, context.cwd);
    if (target === undefined) throw new CliError(`registry "${registry}" declares no index`);
    return checkIndex(parse(await read(target, definition), registry), registry);
  };

  return {
    loadIndex,
    async loadApi(registry) {
      const definition = definitionOf(registry);
      const index = await loadIndex(registry);
      const target = indexPlace(definition, context.cwd) as Place;
      if (typeof index.manifest !== "string" || typeof index.renames !== "string") {
        throw new CliError(`registry "${registry}" does not publish its manifest and renames`);
      }
      return {
        manifest: await read(sibling(target, index.manifest), definition),
        renames: await read(sibling(target, index.renames), definition),
      };
    },
    async loadItem(registry, name) {
      const definition = definitionOf(registry);
      const target = itemPlace(definition, name, context.cwd);
      const where = `${registry}/${name}`;
      return checkItem(parse(await read(target, definition), where), where);
    },
  };
}
