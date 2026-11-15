/**
 * Every workspace specifier a project typechecks has to resolve to **source**.
 *
 * `tsconfig.base.json` sets no `baseUrl` and each project repeats the workspace
 * specifiers in its own `paths`, because `paths` replaces rather than merges.
 * That leaves the same map written in every project, and nothing held them equal:
 * on 2026-09-05 `packages/react` grew the repo's first adapter-side import of
 * `@standarui/core/input/spatial` and the CI `typecheck` job went red while
 * every local gate stayed green. (The engines have since moved to `@standarx/nav`,
 * decision 57; the mechanism below still holds for `reactivity` and the like.)
 *
 * The mechanism is worth stating, because it is silent by construction:
 *
 *  - `"@standarui/core/*": [".../src/components/*∕index.ts"]` serves the
 *    **component** `input` and cannot serve the **engine** `input/spatial` — the
 *    substitution lands on `components/input/spatial/index.ts`, which is not a
 *    file. The alias table in `vitest.config.ts` no longer carries the four
 *    engine subpaths as exact patterns above the wildcard — they moved into
 *    `@standarx/nav` under decision 57 — and keeps only `reactivity` there now;
 *    `packages/react` was the map that disagreed at the time.
 *  - When a `paths` entry fails to resolve, TypeScript does **not** stop. It
 *    falls through to node resolution, finds the package `exports`, and lands in
 *    `packages/core/dist/**∕*.d.ts`. A developer who has ever run `bun run build`
 *    has that `dist`; the CI `typecheck` job does not build first and does not.
 *
 * So a green local `typecheck` proved nothing about the specifier — it proved a
 * build had happened at some point. That is a gate that cannot fail, and the
 * repo already refuses those elsewhere (`th-has-data-cells` in the axe harness).
 * This read closes it without needing a build: it applies the `paths` rules by
 * hand and asserts the file on the other side exists in `src`.
 *
 * It deliberately does not check that a specifier resolves *at all* — node
 * resolution through `dist` would answer that, and answering it is the bug. It
 * checks that the project's **own** map carries an entry landing on source.
 *
 * The read lives at the root for the reason `component-coverage.test.ts` gives:
 * `tsconfig.base.json` keeps `"types": []` in the packages on purpose.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

/** The workspace roots a project can live under, mirroring `package.json`. */
const WORKSPACE_ROOTS = ["packages"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const NEVER_WALKED = new Set(["node_modules", "dist", "coverage"]);

/** `from "…"`, `import("…")` and bare `import "…"` — every specifier position. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** JSON needs one quote character; TypeScript needs three. */
const JSON_QUOTES = new Set(['"']);
const TS_QUOTES = new Set(['"', "'", "`"]);

type Project = {
  /** Directory holding the tsconfig — `paths` resolve against it, no `baseUrl`. */
  readonly dir: string;
  /** Repo-relative path of the tsconfig, for a failure message that names it. */
  readonly label: string;
  readonly include: readonly string[];
  readonly paths: Readonly<Record<string, readonly string[]>>;
};

type Offender = {
  readonly specifier: string;
  readonly importer: string;
  readonly reason: string;
};

/**
 * Comments out, string literals kept. Every tsconfig here is JSONC, and a source
 * file's comments are just as able to hold a specifier-shaped sentence: the
 * first draft of this guard reported a build script for an
 * `import "@standarui/…"` written inside the comment that explains TS2882. Quote characters differ by language, hence the
 * parameter.
 *
 * A regular-expression literal holding an unbalanced quote would desync this,
 * which is why the guard reports rather than skips: a desync surfaces as a named
 * file to look at, never as a silent pass.
 */
function stripComments(text: string, quotes: ReadonlySet<string>): string {
  let out = "";
  let quote: string | undefined;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 1;
        continue;
      }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c !== undefined && quotes.has(c)) {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlock = true;
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

function readTsconfig(file: string): Record<string, unknown> {
  const raw = stripComments(readFileSync(file, "utf8"), JSON_QUOTES);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${path.relative(root, file)} is not parseable as JSONC: ${String(error)}`);
  }
}

function discoverProjects(): Project[] {
  const projects: Project[] = [];
  for (const workspace of WORKSPACE_ROOTS) {
    const dir = path.join(root, workspace);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(dir, entry.name);
      const tsconfig = path.join(projectDir, "tsconfig.json");
      if (!existsSync(tsconfig)) continue;
      const parsed = readTsconfig(tsconfig);
      const compilerOptions = (parsed.compilerOptions ?? {}) as Record<string, unknown>;
      projects.push({
        dir: projectDir,
        label: path.relative(root, tsconfig).replaceAll("\\", "/"),
        include: (parsed.include as string[] | undefined) ?? ["src"],
        paths: (compilerOptions.paths as Record<string, string[]> | undefined) ?? {},
      });
    }
  }
  return projects.sort((a, b) => a.label.localeCompare(b.label));
}

function walk(target: string, found: string[]): void {
  if (!existsSync(target)) return;
  const stats = statSync(target);
  if (stats.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(target))) found.push(target);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (NEVER_WALKED.has(entry.name)) continue;
    walk(path.join(target, entry.name), found);
  }
}

/**
 * The `include` entries in this repo are plain directories and single files, not
 * globs — a glob would need a matcher, and adding one to a guard would put the
 * guard's own correctness in question. Anything glob-shaped is reported rather
 * than silently skipped, so this stays honest the day one appears.
 */
function sourcesOf(project: Project): { files: string[]; unsupported: string[] } {
  const files: string[] = [];
  const unsupported: string[] = [];
  for (const entry of project.include) {
    if (entry.includes("*")) {
      unsupported.push(entry);
      continue;
    }
    walk(path.join(project.dir, entry), files);
  }
  return { files, unsupported };
}

/**
 * TypeScript's own precedence: an exact pattern wins outright, and among
 * wildcards the longest prefix before the `*` wins. This is the rule that lets a
 * map keep its engine subpaths above `@standarui/core/*`.
 */
function substituteTargets(
  specifier: string,
  paths: Readonly<Record<string, readonly string[]>>,
): readonly string[] | undefined {
  const exact = paths[specifier];
  if (exact !== undefined) return exact;
  let best: { prefix: string; suffix: string; targets: readonly string[] } | undefined;
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (specifier.length < prefix.length + suffix.length) continue;
    if (!specifier.startsWith(prefix)) continue;
    if (suffix.length > 0 && !specifier.endsWith(suffix)) continue;
    if (best !== undefined && prefix.length <= best.prefix.length) continue;
    best = { prefix, suffix, targets };
  }
  if (best === undefined) return undefined;
  const wildcard = specifier.slice(best.prefix.length, specifier.length - best.suffix.length);
  return best.targets.map((target) => target.replace("*", wildcard));
}

function workspaceSpecifiersIn(file: string): string[] {
  const text = stripComments(readFileSync(file, "utf8"), TS_QUOTES);
  const specifiers = new Set<string>();
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[1];
    if (specifier?.startsWith("@standarui/")) {
      specifiers.add(specifier);
    }
  }
  return [...specifiers].sort();
}

function offendersOf(project: Project): { offenders: Offender[]; unsupported: string[] } {
  const { files, unsupported } = sourcesOf(project);
  const offenders: Offender[] = [];
  for (const file of files) {
    for (const specifier of workspaceSpecifiersIn(file)) {
      const importer = path.relative(root, file).replaceAll("\\", "/");
      const targets = substituteTargets(specifier, project.paths);
      if (targets === undefined) {
        offenders.push({
          specifier,
          importer,
          reason: `no \`paths\` entry in ${project.label} — node resolution would answer from \`dist\``,
        });
        continue;
      }
      if (targets.some((target) => existsSync(path.resolve(project.dir, target)))) continue;
      const shown = targets.map((target) => `\`${target}\``).join(", ");
      offenders.push({
        specifier,
        importer,
        reason: `\`paths\` in ${project.label} lands on ${shown}, which does not exist — TypeScript falls through to \`dist\``,
      });
    }
  }
  return { offenders, unsupported };
}

const projects = discoverProjects();

describe("every workspace specifier resolves to source, not to a build", () => {
  it("finds the projects to hold, so a rename cannot empty this file", () => {
    expect(projects.map((project) => project.label)).toContain("packages/react/tsconfig.json");
    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  for (const project of projects) {
    it(`${project.label} maps every \`@standarui/…\` it typechecks onto a real source file`, () => {
      const { offenders, unsupported } = offendersOf(project);
      expect(
        unsupported,
        `\`include\` globs are not matched by this guard, so these directories go unread: ${unsupported.join(", ")}`,
      ).toEqual([]);
      const report = offenders.map(
        (offender) =>
          `  ${offender.specifier}\n    imported by ${offender.importer}\n    ${offender.reason}`,
      );
      expect(report, `\n${report.join("\n")}\n`).toEqual([]);
    });
  }
});
