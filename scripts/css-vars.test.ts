import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";
import { readInterface } from "./api-reference";

const root = path.resolve(import.meta.dirname, "..");
const NAME = /--sui-[a-z0-9]+(?:-[a-z0-9]+)*/g;

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Declared {
  readonly interfaceName: string;
  readonly file: string;
  readonly members: readonly { readonly name: string; readonly group: string | undefined }[];
}

function sourceFiles(): string[] {
  return ["packages/core/src", "packages/react/src"].flatMap((dir) =>
    readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
      .filter(
        (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name),
      )
      .map((entry) => path.join(entry.parentPath, entry.name)),
  );
}

function cssVarsSpans(program: { readonly body: readonly unknown[] }): Span[] {
  const spans: Span[] = [];
  for (const statement of program.body) {
    const outer = statement as { type: string; declaration?: unknown };
    const node = (outer.type === "ExportNamedDeclaration" ? outer.declaration : outer) as
      | { type: string; start: number; end: number; id?: { name?: string } }
      | null
      | undefined;
    if (node?.type === "TSInterfaceDeclaration" && node.id?.name?.endsWith("CssVars")) {
      spans.push({ start: node.start, end: node.end });
    }
  }
  return spans;
}

function literalsOutsideComments(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("--sui-")) continue;
    const parsed = parseSync(file, source);
    const characters = [...source];
    const blank = (span: Span): void => {
      for (let index = span.start; index < span.end; index += 1) {
        if (characters[index] !== "\n") characters[index] = " ";
      }
    };
    for (const comment of parsed.comments) blank(comment);
    for (const span of cssVarsSpans(parsed.program)) blank(span);
    for (const match of characters.join("").matchAll(NAME)) {
      found.set(match[0], [...(found.get(match[0]) ?? []), path.relative(root, file)]);
    }
  }
  return found;
}

function declaredInterfaces(): Declared[] {
  const declared: Declared[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/export interface (\w+CssVars)\b/g)) {
      const interfaceName = match[1] as string;
      const api = readInterface(source, file, interfaceName);
      declared.push({
        interfaceName,
        file: path.relative(root, file),
        members: (api?.members ?? []).map((member) => ({
          name: member.name,
          group: member.group,
        })),
      });
    }
  }
  return declared;
}

describe("the --sui-* custom properties the engine writes or reads", () => {
  const literals = literalsOutsideComments();
  const declared = declaredInterfaces();
  const declaredNames = new Set(declared.flatMap((entry) => entry.members.map((m) => m.name)));

  it("finds the interfaces and the literals it checks", () => {
    expect(declared.length).toBeGreaterThan(20);
    expect(literals.size).toBeGreaterThan(50);
  });

  it("declares every name found in the sources in a CssVars interface", () => {
    const missing = [...literals]
      .filter(([name]) => !declaredNames.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("declares no name the sources never use", () => {
    const unused = declared.flatMap((entry) =>
      entry.members
        .filter((member) => !literals.has(member.name))
        .map((member) => `${entry.interfaceName}: ${member.name}`),
    );
    expect(unused, `\n${unused.join("\n")}\n`).toEqual([]);
  });

  it("puts every member under a written or read banner", () => {
    const loose = declared.flatMap((entry) =>
      entry.members
        .filter((member) => member.group !== "written" && member.group !== "read")
        .map((member) => `${entry.interfaceName}: ${member.name} (${member.group ?? "no banner"})`),
    );
    expect(loose, `\n${loose.join("\n")}\n`).toEqual([]);
  });
});
