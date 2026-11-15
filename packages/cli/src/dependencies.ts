import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CliContext } from "./context";
import { CliError } from "./errors";
import { write } from "./files";
import { detectInstaller, mergeDependencies, type PackageJson } from "./package-json";

export interface MergedDependencies {
  readonly changed: readonly string[];
  readonly apply: (install: boolean) => void;
}

export function planDependencies(
  context: CliContext,
  wanted: Readonly<Record<string, string>>,
): MergedDependencies {
  const { cwd } = context;
  const packageFile = path.join(cwd, "package.json");
  if (!existsSync(packageFile)) throw new CliError(`package.json not found in ${cwd}`);
  const merged = mergeDependencies(
    JSON.parse(readFileSync(packageFile, "utf8")) as PackageJson,
    wanted,
  );
  return {
    changed: merged.changed,
    apply(install) {
      if (merged.changed.length === 0) return;
      write(packageFile, `${JSON.stringify(merged.pkg, null, 2)}\n`);
      if (!install) return;
      const installer = detectInstaller(cwd);
      context.out(`Running ${installer} install`);
      const result = spawnSync(installer, ["install"], {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.status !== 0) throw new CliError(`${installer} install failed`);
    },
  };
}
