import { CliError } from "./errors";
import type { CodeLayer, RegistrySpecifier } from "./registry-types";

const PRECEDES_SPECIFIER = /(?<![.\w$])(?:from|import\s*\(?)\s*$/;

export interface SpecifierRange {
  readonly start: number;
  readonly end: number;
}

export function findSpecifiers(text: string): SpecifierRange[] {
  const found: SpecifierRange[] = [];
  const open: number[] = [];
  let depth = 0;
  let i = 0;

  const template = (from: number): number => {
    let j = from;
    while (j < text.length) {
      const c = text[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "`") return j + 1;
      if (c === "$" && text[j + 1] === "{") {
        open.push(depth);
        depth += 1;
        return j + 2;
      }
      j += 1;
    }
    return j;
  };

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const newline = text.indexOf("\n", i);
      i = newline === -1 ? text.length : newline;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (c === "`") {
      i = template(i + 1);
    } else if (c === "{") {
      depth += 1;
      i += 1;
    } else if (c === "}") {
      depth -= 1;
      i += 1;
      if (open.length > 0 && open[open.length - 1] === depth) {
        open.pop();
        i = template(i);
      }
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") {
        j += text[j] === "\\" ? 2 : 1;
      }
      if (text[j] === c && PRECEDES_SPECIFIER.test(text.slice(Math.max(0, i - 24), i))) {
        found.push({ start: i + 1, end: j });
      }
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return found;
}

export function rewriteTarget(
  specifier: string,
  specifiers: Readonly<Record<string, RegistrySpecifier>>,
  aliases: Readonly<Record<CodeLayer, string>>,
): string | undefined {
  const entry = Object.hasOwn(specifiers, specifier) ? specifiers[specifier] : undefined;
  if (entry === undefined) return undefined;
  const stem = entry.path.replace(/\.[cm]?[jt]sx?$/, "").replace(/(^|\/)index$/, "");
  const alias = aliases[entry.layer];
  return stem === "" ? alias : `${alias}/${stem}`;
}

export function rewriteImports(
  content: string,
  file: string,
  specifiers: Readonly<Record<string, RegistrySpecifier>>,
  aliases: Readonly<Record<CodeLayer, string>>,
): string {
  let result = content;
  for (const range of findSpecifiers(content).reverse()) {
    const specifier = content.slice(range.start, range.end);
    if (!specifier.startsWith("@standarui/")) continue;
    const target = rewriteTarget(specifier, specifiers, aliases);
    if (target === undefined) {
      throw new CliError(
        `${file} imports ${specifier}, which the @standarui registry does not export`,
      );
    }
    result = result.slice(0, range.start) + target + result.slice(range.end);
  }
  return result;
}
