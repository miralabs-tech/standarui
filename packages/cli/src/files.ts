import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_REGISTRY, type StandaruiConfig } from "./config";
import type { RegistryClient } from "./registry";
import type { RegistryItem, RegistrySpecifier } from "./registry-types";
import { rewriteImports } from "./rewrite";

export interface PlannedFile {
  readonly lockKey: string;
  readonly target: string;
  readonly base: string;
  readonly content: string;
  readonly sha256: string;
}

export const BASE_DIR: string = path.join(".standarui", "base");
export const MANIFEST_BASE: string = "manifest.json";
export const RENAMES_BASE: string = "renames.json";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function createFilePlanner(
  cwd: string,
  config: StandaruiConfig,
  client: RegistryClient,
): (key: string, item: RegistryItem) => Promise<PlannedFile[]> {
  let specifiers: Readonly<Record<string, RegistrySpecifier>> | undefined;
  return async (key, item) => {
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
        base: path.join(cwd, BASE_DIR, file.layer, file.path),
        content,
        sha256: sha256(content),
      });
    }
    return files;
  };
}
