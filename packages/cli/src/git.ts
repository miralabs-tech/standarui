import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError } from "./errors";

interface GitResult {
  readonly status: number | null;
  readonly stdout: string;
}

function git(args: readonly string[], cwd: string): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT";
    throw new CliError(
      missing
        ? "git was not found: diff and update need git on the PATH"
        : `git failed: ${result.error.message}`,
    );
  }
  return { status: result.status, stdout: result.stdout };
}

export function withTempDir<T>(use: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "standarui-"));
  try {
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function unifiedDiff(
  before: string,
  after: string,
  labels: { readonly before: string; readonly after: string },
  cwd: string,
): string {
  const { status, stdout } = git(
    ["diff", "--no-index", "--no-color", "--no-prefix", "--", before, after],
    cwd,
  );
  if (status === 0) return "";
  if (status !== 1) throw new CliError(`git diff failed for ${labels.after}`);
  return stdout
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) return `diff --git ${labels.before} ${labels.after}`;
      if (line.startsWith("--- ")) return `--- ${labels.before}`;
      if (line.startsWith("+++ ")) return `+++ ${labels.after}`;
      return line;
    })
    .join("\n")
    .trimEnd();
}

function mergeFile(args: readonly string[], cwd: string): number {
  const { status } = git(
    ["merge-file", "-L", "local", "-L", "base", "-L", "upstream", ...args],
    cwd,
  );
  if (status === null || status < 0 || status > 127) throw new CliError("git merge-file failed");
  return status;
}

export function mergesCleanly(local: string, base: string, target: string): boolean {
  return withTempDir((dir) => {
    const files = [local, base, target].map((text, index) => {
      const file = path.join(dir, String(index));
      writeFileSync(file, text);
      return file;
    });
    return mergeFile(["-p", ...files], dir) === 0;
  });
}

export function mergeInPlace(localFile: string, baseFile: string, target: string): number {
  return withTempDir((dir) => {
    const file = path.join(dir, "upstream");
    writeFileSync(file, target);
    return mergeFile([localFile, baseFile, file], dir);
  });
}
