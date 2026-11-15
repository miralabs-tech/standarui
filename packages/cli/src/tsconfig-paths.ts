import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { LAYERS, type StandaruiConfig } from "./config";

function stripJsonc(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] as string;
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function readPaths(cwd: string): Record<string, unknown> {
  const file = path.join(cwd, "tsconfig.json");
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(stripJsonc(readFileSync(file, "utf8"))) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    return parsed.compilerOptions?.paths ?? {};
  } catch {
    return {};
  }
}

export function pathsResolve(specifier: string, paths: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(paths).some((pattern) => {
    const star = pattern.indexOf("*");
    if (star === -1) return pattern === specifier;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    return (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    );
  });
}

function suggestion(alias: string, dir: string): string {
  const aliasParts = alias.split("/");
  const dirParts = dir.replace(/^\.\//, "").split("/");
  let shared = 0;
  while (
    shared < aliasParts.length - 1 &&
    shared < dirParts.length - 1 &&
    aliasParts[aliasParts.length - 1 - shared] === dirParts[dirParts.length - 1 - shared]
  ) {
    shared += 1;
  }
  if (shared > 0) {
    const aliasHead = aliasParts.slice(0, aliasParts.length - shared).join("/");
    const dirHead = dirParts.slice(0, dirParts.length - shared).join("/");
    return `"${aliasHead}/*": ["./${dirHead}/*"]`;
  }
  const dirPath = dirParts.join("/");
  return `"${alias}": ["./${dirPath}"], "${alias}/*": ["./${dirPath}/*"]`;
}

export function missingPathLines(cwd: string, config: StandaruiConfig): string[] {
  const paths = readPaths(cwd);
  const lines = new Set<string>();
  for (const layer of LAYERS) {
    const alias = config.aliases[layer];
    if (!pathsResolve(alias, paths) || !pathsResolve(`${alias}/x`, paths)) {
      lines.add(suggestion(alias, config.dirs[layer]));
    }
  }
  return [...lines];
}
