// tsdown already runs publint during the build, but only against the source tree:
// it never sees what `files` actually ships, and it does not cover the packages
// tsdown does not build (svelte-package and ng-packagr from Phase 7 on). This
// script packs every publishable workspace with `bun pm pack` and lints the real
// tarball — the only artifact npm ever receives — with publint plus attw
// (`esm-only` profile: the CJS and node10 resolutions are deliberately ignored,
// the library is ESM-only per CDC D5).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(rootDir, "packages");
const shell = process.platform === "win32";

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
}

const publishable: Array<{ dir: string; manifest: Manifest }> = [];
for (const entry of readdirSync(packagesDir)) {
  const manifestPath = path.join(packagesDir, entry, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (!manifest.private) publishable.push({ dir: path.join(packagesDir, entry), manifest });
}

// An empty list is not a pass. The loop below never runs, no failure is ever
// pushed, and the last line prints "passed for 0 packages" on exit 0 — a green
// that says the tarballs are clean when none were built. It is not a far-fetched
// state either: the library is private and never published, so marking a
// manifest `private` reads like housekeeping rather than like disarming a check.
if (publishable.length === 0) {
  console.error(
    `no publishable package under ${path.relative(rootDir, packagesDir)}: every manifest is private, so there is no tarball to lint`,
  );
  process.exit(1);
}

const outDir = mkdtempSync(path.join(tmpdir(), "standarui-pack-"));
const failures: string[] = [];

function run(label: string, command: string, args: readonly string[], cwd: string): boolean {
  const result = spawnSync(command, [...args], { cwd, stdio: "inherit", shell });
  if (result.status !== 0) {
    failures.push(label);
    return false;
  }
  return true;
}

try {
  for (const { dir, manifest } of publishable) {
    // `bun pm pack` refuses --filename together with --destination, so the name is
    // reconstructed the way bun builds it: scope flattened, version appended.
    const slug = manifest.name.replace("@", "").replace("/", "-");
    const tarball = path.join(outDir, `${slug}-${manifest.version}.tgz`);

    console.log(`\n=== ${manifest.name} ===`);
    if (!run(`${manifest.name} (pack)`, "bun", ["pm", "pack", "--destination", outDir], dir)) {
      continue;
    }
    if (!existsSync(tarball)) {
      failures.push(`${manifest.name} (tarball not found at ${tarball})`);
      continue;
    }

    run(`${manifest.name} (publint)`, "bun", ["x", "publint", tarball], rootDir);
    // attw runs from the package directory so it picks up that package's own
    // `.attw.json` — stylesheet entry points have nothing for TypeScript to resolve
    // and are excluded there rather than by a blanket rule here.
    run(`${manifest.name} (attw)`, "bun", ["x", "attw", tarball, "--profile", "esm-only"], dir);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\npackage checks failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\npackage checks passed for ${publishable.length} packages`);
