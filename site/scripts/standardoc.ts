import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const siteDir = path.resolve(import.meta.dirname, "..");
const engineDir = path.resolve(siteDir, process.env.STANDARDOC_WEB ?? "../../standardoc-web");
const outDir = path.join(siteDir, ".standardoc");
const shell = process.platform === "win32";

const packages = [
  { dir: "kit", name: "standardoc-kit.tgz" },
  { dir: "cli", name: "standardoc-cli.tgz" },
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(path.join(engineDir, "packages"))) {
  fail(`standardoc-web not found at ${engineDir}; set STANDARDOC_WEB to its checkout`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const { dir, name } of packages) {
  const staging = path.join(outDir, `pack-${dir}`);
  mkdirSync(staging, { recursive: true });
  const result = spawnSync("bun", ["pm", "pack", "--destination", staging], {
    cwd: path.join(engineDir, "packages", dir),
    stdio: "inherit",
    shell,
  });
  if (result.status !== 0) fail(`bun pm pack failed in packages/${dir}`);
  const tarballs = readdirSync(staging).filter((file) => file.endsWith(".tgz"));
  const [tarball] = tarballs;
  if (tarballs.length !== 1 || tarball === undefined) {
    fail(`expected one tarball from packages/${dir}, found ${tarballs.length}`);
  }
  renameSync(path.join(staging, tarball), path.join(outDir, name));
  rmSync(staging, { recursive: true, force: true });
  console.log(`${name} <- ${tarball}`);
}
