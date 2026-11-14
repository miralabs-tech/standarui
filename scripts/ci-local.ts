// Replays `.github/workflows/ci.yml` on the working tree, in a fixed order, and
// stops at the first red step. The browser matrix assumes the playwright engines
// are already installed: `bunx playwright install chromium firefox webkit`.

import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const shell = process.platform === "win32";

const BROWSERS = ["chromium", "firefox", "webkit"] as const;

interface Step {
  readonly label: string;
  readonly command?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** Returns the reason it failed, or null when it passed. */
  readonly check?: () => string | null;
}

interface Job {
  readonly name: string;
  readonly steps: readonly Step[];
}

function trackedDiff(extra: readonly string[]): string {
  const result = spawnSync("git", ["diff", ...extra], { cwd: rootDir, encoding: "utf8", shell });
  return result.stdout ?? "";
}

const driftBaseline = trackedDiff([]);
const driftBaselineFiles = trackedDiff(["--numstat"]);

// A working tree is never clean, so the plain `git diff --exit-code` would report
// the developer's own edits as build drift: the build is measured against the
// patch as it stood before the first step.
function buildDrift(): string | null {
  if (trackedDiff([]) === driftBaseline) return null;
  const before = new Set(driftBaselineFiles.split("\n"));
  const appeared = trackedDiff(["--numstat"])
    .split("\n")
    .filter((line) => line.length > 0 && !before.has(line));
  const detail = appeared.length > 0 ? appeared.join(", ") : "same files, different content";
  return `the build modified tracked files: ${detail}`;
}

const JOBS: readonly Job[] = [
  {
    name: "install",
    steps: [
      { label: "bun install --frozen-lockfile", command: ["bun", "install", "--frozen-lockfile"] },
    ],
  },
  { name: "lint", steps: [{ label: "bun run lint", command: ["bun", "run", "lint"] }] },
  {
    name: "typecheck",
    steps: [{ label: "bun run typecheck", command: ["bun", "run", "typecheck"] }],
  },
  { name: "test", steps: [{ label: "bun run test:unit", command: ["bun", "run", "test:unit"] }] },
  {
    name: "build",
    steps: [
      { label: "bun run build", command: ["bun", "run", "build"] },
      { label: "no build drift", check: buildDrift },
      { label: "bun run check:package", command: ["bun", "run", "check:package"] },
      { label: "bun run check:size", command: ["bun", "run", "check:size"] },
    ],
  },
  {
    name: "browser",
    steps: BROWSERS.map((browser) => ({
      label: `bun run test:browser (${browser})`,
      command: ["bun", "run", "test:browser"],
      env: { SUI_BROWSER: browser },
    })),
  },
];

function runStep(step: Step): string | null {
  if (step.check) return step.check();
  const [bin, ...args] = step.command ?? [];
  if (bin === undefined) return "no command";
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell,
    env: step.env ? { ...process.env, ...step.env } : process.env,
  });
  return result.status === 0 ? null : `exited with ${result.status}`;
}

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !JOBS.some((job) => job.name === name));
if (unknown.length > 0) {
  console.error(`unknown job(s): ${unknown.join(", ")}`);
  console.error(`known jobs: ${JOBS.map((job) => job.name).join(", ")}`);
  process.exit(1);
}

const selected = requested.length > 0 ? JOBS.filter((job) => requested.includes(job.name)) : JOBS;

const results: Array<{ job: string; label: string; failure: string | null; ms: number }> = [];

run: for (const job of selected) {
  for (const step of job.steps) {
    console.log(`\n=== ${job.name}: ${step.label} ===`);
    const started = Date.now();
    const failure = runStep(step);
    results.push({ job: job.name, label: step.label, failure, ms: Date.now() - started });
    if (failure !== null) {
      console.error(`${job.name}: ${step.label} — ${failure}`);
      break run;
    }
  }
}

console.log("");
for (const { job, label, failure, ms } of results) {
  const status = failure === null ? "ok  " : "FAIL";
  console.log(`${status} ${job.padEnd(10)} ${label.padEnd(52)} ${(ms / 1000).toFixed(1)}s`);
}

const failed = results.filter((result) => result.failure !== null);
if (failed.length > 0) {
  console.error(`\n${failed.length} step(s) failed: ${failed.map((r) => r.job).join(", ")}`);
  process.exit(1);
}

console.log(`\nall ${results.length} step(s) passed across ${selected.length} job(s)`);
