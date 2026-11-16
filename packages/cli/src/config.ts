import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CliError } from "./errors";
import type { CodeLayer, RegistryLayer } from "./registry-types";

export const CONFIG_FILE = "standarui.json";
export const DEFAULT_REGISTRY = "@standarui";
export const LAYERS: readonly RegistryLayer[] = ["core", "react", "styles"];
export const CODE_LAYERS: readonly CodeLayer[] = ["core", "react"];
export const DEFAULT_STYLES_DIR = "src/standarui/styles";

export interface RegistryDefinition {
  readonly url: string;
  readonly index?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface StandaruiConfig {
  readonly dirs: Readonly<Record<RegistryLayer, string>>;
  readonly aliases: Readonly<Record<CodeLayer, string>>;
  readonly registries: Readonly<Record<string, RegistryDefinition>>;
}

export interface ConfigOverrides {
  readonly coreDir?: string | undefined;
  readonly reactDir?: string | undefined;
  readonly stylesDir?: string | undefined;
  readonly coreAlias?: string | undefined;
  readonly reactAlias?: string | undefined;
}

export function defaultConfig(overrides: ConfigOverrides = {}): StandaruiConfig {
  return {
    dirs: {
      core: overrides.coreDir ?? "src/standarui/core",
      react: overrides.reactDir ?? "src/standarui/react",
      styles: overrides.stylesDir ?? DEFAULT_STYLES_DIR,
    },
    aliases: {
      core: overrides.coreAlias ?? "@/standarui/core",
      react: overrides.reactAlias ?? "@/standarui/react",
    },
    registries: {},
  };
}

export function serializeConfig(config: StandaruiConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError(`${CONFIG_FILE}: "${label}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new CliError(`${CONFIG_FILE}: "${label}" must be a non-empty string`);
  }
  return value;
}

function perCodeLayer(value: unknown, label: string): Record<CodeLayer, string> {
  const record = object(value, label);
  return { core: text(record.core, `${label}.core`), react: text(record.react, `${label}.react`) };
}

function dirsOf(value: unknown): Record<RegistryLayer, string> {
  const record = object(value, "dirs");
  return {
    ...perCodeLayer(record, "dirs"),
    styles: record.styles === undefined ? DEFAULT_STYLES_DIR : text(record.styles, "dirs.styles"),
  };
}

function registryDefinition(value: unknown, label: string): RegistryDefinition {
  const record = object(value, label);
  const headers: Record<string, string> = {};
  if (record.headers !== undefined) {
    for (const [name, header] of Object.entries(object(record.headers, `${label}.headers`))) {
      headers[name] = text(header, `${label}.headers.${name}`);
    }
  }
  return {
    url: text(record.url, `${label}.url`),
    ...(record.index === undefined ? {} : { index: text(record.index, `${label}.index`) }),
    ...(record.headers === undefined ? {} : { headers }),
  };
}

export function readConfig(cwd: string): StandaruiConfig {
  const file = path.join(cwd, CONFIG_FILE);
  if (!existsSync(file)) {
    throw new CliError(`${CONFIG_FILE} not found in ${cwd}: run \`standarui init\` first`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new CliError(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`);
  }
  const record = object(parsed, "root");
  const registries: Record<string, RegistryDefinition> = {};
  if (record.registries !== undefined) {
    for (const [name, definition] of Object.entries(object(record.registries, "registries"))) {
      if (!name.startsWith("@")) {
        throw new CliError(`${CONFIG_FILE}: registry "${name}" must start with "@"`);
      }
      registries[name] = registryDefinition(definition, `registries.${name}`);
    }
  }
  return {
    dirs: dirsOf(record.dirs),
    aliases: perCodeLayer(record.aliases, "aliases"),
    registries,
  };
}
