import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  ComponentManifest,
  Flow,
  ManifestComponent,
  ManifestPart,
  SheetNames,
} from "../packages/cli/src/manifest-diff";
import { collect, jsonName } from "./api-reference";

export type { ComponentManifest, Flow, ManifestComponent, ManifestPart, SheetNames };

interface AnatomyModule {
  readonly anatomy: { readonly name: string; keys(): string[] };
  readonly parts: Readonly<Record<string, { readonly attrs: { readonly "data-part": string } }>>;
}

const root = path.resolve(import.meta.dirname, "..");
const coreComponents = path.join(root, "packages/core/src/components");
const reactComponents = path.join(root, "packages/react/src/components");
const apiDir = path.join(root, "packages/react/api");

const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

type ApiTables = ReturnType<typeof collect>[number]["tables"];

function flowsOf(all: ReadonlyMap<string, ApiTables>): Map<string, Record<string, Flow>> {
  const outputs = [...all.values()].flat().filter((table) => table.name.endsWith("Details"));
  const others = [...all.values()].flat().filter((table) => !table.name.endsWith("Details"));
  const cites = (table: ApiTables[number], name: string): boolean => {
    const pattern = new RegExp(`\\b${name}\\b`);
    return pattern.test(table.definition ?? "") || table.rows.some((row) => pattern.test(row.type));
  };
  const flows = new Map<string, Record<string, Flow>>();
  for (const [component, tables] of all) {
    const own: Record<string, Flow> = {};
    for (const table of tables) {
      if (table.name.endsWith("Details")) own[table.name] = "out";
      else if (table.definition !== undefined) {
        const out = outputs.some((entry) => cites(entry, table.name));
        const into = others.some((entry) => entry.name !== table.name && cites(entry, table.name));
        if (out) own[table.name] = into ? "both" : "out";
      }
    }
    flows.set(component, own);
  }
  return flows;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.(test|parity)\./.test(entry.name),
    )
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function readImports(component: string, known: ReadonlySet<string>): string[] {
  const dir = path.join(reactComponents, component);
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const file of sourceFiles(dir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']\.\.\/([a-z0-9-]+)\//g)) {
      const other = match[1] as string;
      if (other !== component && known.has(other)) found.push(other);
    }
  }
  return sortedUnique(found);
}

export async function collectManifest(): Promise<ComponentManifest> {
  const anatomyFile = (name: string): string | undefined =>
    [`${name}.anatomy.ts`, `${name}.ts`].find((file) => {
      const full = path.join(coreComponents, name, file);
      return existsSync(full) && /^export const anatomy\b/m.test(readFileSync(full, "utf8"));
    });
  const names = readdirSync(reactComponents, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const known = new Set(names);
  const version = (
    JSON.parse(readFileSync(path.join(root, "packages/react/package.json"), "utf8")) as {
      version: string;
    }
  ).version;

  const tablesOf = new Map(collect().map((entry) => [entry.component, entry.tables]));
  const flowsOfComponent = flowsOf(tablesOf);
  const components: Record<string, ManifestComponent> = {};
  for (const name of names) {
    const file = anatomyFile(name);
    let scope: string | null = null;
    let parts: ManifestPart[] = [];
    if (file !== undefined) {
      const loaded = (await import(
        `../packages/core/src/components/${name}/${file}`
      )) as AnatomyModule;
      scope = loaded.anatomy.name;
      parts = loaded.anatomy.keys().map((key) => ({
        key,
        part: (loaded.parts[key] as AnatomyModule["parts"][string]).attrs["data-part"],
      }));
    }
    const tables = tablesOf.get(name) ?? [];
    components[name] = {
      scope,
      parts,
      imports: readImports(name, known),
      composed: existsSync(path.join(reactComponents, name, "composed.tsx")),
      api: existsSync(path.join(apiDir, jsonName(name))) ? jsonName(name) : null,
      props: Object.fromEntries(
        tables.map((table) => [table.name, table.rows.map((row) => row.name).sort()]),
      ),
      aliases: Object.fromEntries(
        tables.flatMap((table) =>
          table.definition === undefined
            ? []
            : [[table.name, table.definition.replace(/\s+/g, " ").trim()]],
        ),
      ),
      flows: flowsOfComponent.get(name) ?? {},
    };
  }
  return { schema: 1, version, components };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

const LINE_WIDTH = 100;

export function renderManifest(manifest: ComponentManifest): string {
  const text = JSON.stringify(sortKeys(manifest), null, 2).replace(
    /^( *"[^"\n]+": )\[\n((?: +"[^"\n]*",?\n)+) *\](,?)$/gm,
    (whole, head: string, body: string, tail: string) => {
      const flat = `${head}[${body
        .trim()
        .split(/,\n\s*/)
        .join(", ")}]${tail}`;
      return flat.length <= LINE_WIDTH ? flat : whole;
    },
  );
  return `${text}\n`;
}

export const MANIFEST_FILE: string = path.join(apiDir, "manifest.json");
export const RENAMES_FILE = "renames.json";
