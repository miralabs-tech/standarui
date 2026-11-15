/**
 * Writes one JSON table set per component into `packages/react/api/`, which the
 * documentation site reads out of the installed tarball. Data and not markup: the
 * site that renders it does not live in this repository, and a table shaped for one
 * renderer is a table the next one has to undo.
 *
 * The output is committed on purpose. It costs a diff on every type change, and
 * that diff is the point — an API change becomes visible in review instead of
 * appearing on a site after a deploy. `api-reference.test.ts` fails when the
 * committed JSON and the source disagree, so the cost cannot be forgotten.
 *
 * Reading lives in `api-reference.ts` and writing lives here, so the test can
 * collect the whole repo without this file's side effects.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { collect, JSON_OUTPUT_DIR, jsonName, renderJson } from "./api-reference";
import { collectManifest, MANIFEST_FILE, RENAMES_FILE, renderManifest } from "./component-manifest";

const collected = collect();

// Emptied first, except `renames.json`, which is written by hand and never
// generated: a component that loses its types file must lose its table too, and an
// orphan left behind would keep serving props that no longer exist. `manifest.json`
// goes with the rest and is rewritten below.
mkdirSync(JSON_OUTPUT_DIR, { recursive: true });
for (const name of readdirSync(JSON_OUTPUT_DIR)) {
  if (name !== RENAMES_FILE)
    rmSync(path.join(JSON_OUTPUT_DIR, name), { recursive: true, force: true });
}

let written = 0;
let tables = 0;
let rows = 0;
const missing: string[] = [];
const shared = new Map<string, string[]>();
for (const entry of collected) {
  for (const name of entry.missing) missing.push(`${entry.component}: ${name}`);
  // Cited by a table, declared somewhere else in the library. Named here rather
  // than dropped quietly: these are the types a reader meets on a page that
  // cannot define them, and this list is the only thing that says a shared
  // vocabulary section is owed.
  for (const name of entry.shared) shared.set(name, [...(shared.get(name) ?? []), entry.component]);
  if (entry.tables.length === 0) continue;
  writeFileSync(
    path.join(JSON_OUTPUT_DIR, jsonName(entry.component)),
    renderJson(entry.tables),
    "utf8",
  );
  written += 1;
  tables += entry.tables.length;
  for (const table of entry.tables) rows += table.rows.length;
}

console.log(`api reference: ${written} components, ${tables} tables, ${rows} rows`);

const manifest = await collectManifest();
writeFileSync(MANIFEST_FILE, renderManifest(manifest), "utf8");
console.log(`manifest: ${Object.keys(manifest.components).length} components`);
if (missing.length > 0) {
  console.log(`\ninterfaces not found (reported, not fatal):\n  ${missing.join("\n  ")}`);
}
if (shared.size > 0) {
  const lines = [...shared]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, users]) => `${name} (${users.length}: ${users.slice(0, 4).join(", ")}…)`);
  console.log(`\nshared vocabulary — cited across components, defined on no page (${shared.size}):
  ${lines.join("\n  ")}`);
}
