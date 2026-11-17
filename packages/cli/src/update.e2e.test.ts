import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Lockfile } from "./lockfile";
import { main } from "./main";

const repo = path.resolve(import.meta.dirname, "../../..");
const registry = path.join(repo, "registry");
const ANATOMY = "core/components/select/select.anatomy.ts";
const ORIGINAL = "No `root`, the same divergence as";
const UPSTREAM = "Without a `root`, the same divergence as";
const LOCAL = "Lacking a `root`, the same divergence as";
const BASE = (
  JSON.parse(readFileSync(path.join(registry, "items", "select.json"), "utf8")) as {
    version: string;
  }
).version;
const NEXT = BASE.replace(/\d+$/, (patch) => String(Number(patch) + 1));

let workdir = "";
let registryV2 = "";
const apps: Record<"clean" | "conflict", string> = { clean: "", conflict: "" };

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function run(app: string, args: readonly string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, {
    cwd: app,
    env: {},
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else files[path.relative(dir, full)] = readFileSync(full, "utf8");
    }
  };
  visit(dir);
  return files;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildRegistryV2(target: string): void {
  cpSync(registry, target, { recursive: true });
  const itemFile = path.join(target, "items", "select.json");
  const item = JSON.parse(readFileSync(itemFile, "utf8")) as {
    version: string;
    files: { layer: string; path: string; sha256: string; content: string }[];
  };
  item.version = NEXT;
  const file = item.files.find((entry) => `${entry.layer}/${entry.path}` === ANATOMY);
  if (file === undefined) throw new Error("select.anatomy.ts is not in the select item");
  file.content = file.content.replace(ORIGINAL, UPSTREAM);
  file.sha256 = sha256(file.content);
  writeFileSync(itemFile, json(item));

  const manifestFile = path.join(target, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
    version: string;
    components: Record<string, { props: Record<string, string[]> }>;
  };
  manifest.version = NEXT;
  const tables = manifest.components.select?.props;
  const props = tables?.SelectComposedProps;
  if (tables === undefined || props === undefined) {
    throw new Error("SelectComposedProps is not in the manifest");
  }
  tables.SelectComposedProps = props.map((name) =>
    name === "cancelLabel?" ? "dismissLabel?" : name,
  );
  writeFileSync(manifestFile, json(manifest));
  writeFileSync(
    path.join(target, "renames.json"),
    json({
      schema: 1,
      renames: [
        {
          since: NEXT,
          kind: "prop",
          component: "select",
          table: "SelectComposedProps",
          from: "cancelLabel?",
          to: "dismissLabel?",
        },
      ],
    }),
  );
}

async function createApp(name: string): Promise<string> {
  const app = path.join(workdir, name);
  mkdirSync(path.join(app, "src"), { recursive: true });
  writeFileSync(
    path.join(app, "package.json"),
    json({ name: "fixture", version: "0.0.0", private: true, type: "module" }),
  );
  writeFileSync(
    path.join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "es2022",
        lib: ["es2023", "dom", "dom.iterable"],
        module: "preserve",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
    }),
  );
  writeFileSync(path.join(app, "src", "app.tsx"), "export const App = () => <main />;\n");
  symlinkSync(path.join(repo, "node_modules"), path.join(app, "node_modules"), "junction");
  const init = await run(app, ["init", "--yes", "--no-install", "--registry", registry]);
  const add = await run(app, ["add", "select", "--no-install", "--registry", registry]);
  expect([init.code, add.code]).toEqual([0, 0]);
  return app;
}

const anatomyOf = (app: string): string => path.join(app, "src/standarui", ANATOMY);

beforeAll(async () => {
  workdir = mkdtempSync(path.join(tmpdir(), "standarui-update-"));
  registryV2 = path.join(workdir, "registry-v2");
  buildRegistryV2(registryV2);
  apps.clean = await createApp("clean");
  apps.conflict = await createApp("conflict");
  writeFileSync(
    anatomyOf(apps.clean),
    `${readFileSync(anatomyOf(apps.clean), "utf8")}export const localTweak = 1;\n`,
  );
  writeFileSync(
    anatomyOf(apps.conflict),
    readFileSync(anatomyOf(apps.conflict), "utf8").replace(ORIGINAL, LOCAL),
  );
}, 120_000);

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("the base of the manifest", () => {
  it("is copied from the registry by init and add", () => {
    for (const name of ["manifest.json", "renames.json"]) {
      expect(readFileSync(path.join(apps.clean, ".standarui/base", name), "utf8")).toBe(
        readFileSync(path.join(registry, name), "utf8"),
      );
    }
  });
});

describe("diff", () => {
  it("shows the local and the upstream differences and exits 0", async () => {
    const result = await run(apps.clean, ["diff", "select", "--registry", registryV2]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("local changes");
    expect(result.out).toContain("+export const localTweak = 1;");
    expect(result.out).toContain("upstream changes");
    expect(result.out).toContain(`+ * ${UPSTREAM}`);
    expect(result.out).toContain("--- .standarui/base/core/components/select/select.anatomy.ts");
    expect(result.out).toContain("+++ src/standarui/core/components/select/select.anatomy.ts");
  });
});

describe("update without --write", () => {
  it("prints the plan and writes nothing", async () => {
    const before = snapshot(apps.clean);
    const result = await run(apps.clean, ["update", "select", "--registry", registryV2]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(snapshot(apps.clean)).toEqual(before);
    expect(result.out).toContain(`select ${BASE} -> ${NEXT}`);
    expect(result.out).toMatch(
      /merge\s+src\/standarui\/core\/components\/select\/select\.anatomy\.ts/,
    );
    expect(result.out).toMatch(
      /unchanged\s+src\/standarui\/core\/components\/select\/select\.dom\.ts/,
    );
    expect(result.out).toContain("API changes for the installed components");
    expect(result.out).toContain("**Rupture**");
    expect(result.out).toContain("`cancelLabel` → `dismissLabel`");
    expect(result.out).toContain("Nothing written");
  });

  it("plans a conflict on the same line", async () => {
    const result = await run(apps.conflict, ["update", "select", "--registry", registryV2]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(
      /conflict\s+src\/standarui\/core\/components\/select\/select\.anatomy\.ts/,
    );
  });
});

describe("update --write", () => {
  it("merges a clean edit, backs up, refreshes the bases and the lockfile, and typechecks", async () => {
    const localBefore = readFileSync(anatomyOf(apps.clean), "utf8");
    const result = await run(apps.clean, [
      "update",
      "select",
      "--write",
      "--no-install",
      "--registry",
      registryV2,
    ]);
    expect(result.err).toBe("");
    expect(result.out).toContain("Typecheck passed.");
    expect(result.code).toBe(0);

    const merged = readFileSync(anatomyOf(apps.clean), "utf8");
    expect(merged).toContain(UPSTREAM);
    expect(merged).toContain("export const localTweak = 1;");
    expect(merged).not.toContain("<<<<<<<");

    const backups = readdirSync(path.join(apps.clean, ".standarui/backup"));
    expect(backups).toHaveLength(1);
    const backup = path.join(apps.clean, ".standarui/backup", backups[0] as string);
    expect(readFileSync(path.join(backup, ANATOMY), "utf8")).toBe(localBefore);
    expect(existsSync(path.join(backup, "standarui.lock.json"))).toBe(true);

    const base = readFileSync(path.join(apps.clean, ".standarui/base", ANATOMY), "utf8");
    expect(base).toContain(UPSTREAM);
    expect(base).not.toContain("localTweak");
    expect(readFileSync(path.join(apps.clean, ".standarui/base/manifest.json"), "utf8")).toBe(
      readFileSync(path.join(registryV2, "manifest.json"), "utf8"),
    );
    const lock = JSON.parse(
      readFileSync(path.join(apps.clean, "standarui.lock.json"), "utf8"),
    ) as Lockfile;
    expect(lock.items.select?.version).toBe(NEXT);
    expect(lock.items.select?.files[ANATOMY]).toBe(sha256(base));
  });

  it("leaves markers on a conflict, backs up the local version and exits 1", async () => {
    const localBefore = readFileSync(anatomyOf(apps.conflict), "utf8");
    const result = await run(apps.conflict, [
      "update",
      "select",
      "--write",
      "--no-install",
      "--no-typecheck",
      "--registry",
      registryV2,
    ]);
    expect(result.code).toBe(1);
    const conflicted = readFileSync(anatomyOf(apps.conflict), "utf8");
    expect(conflicted).toContain("<<<<<<<");
    expect(conflicted).toContain(LOCAL);
    expect(conflicted).toContain(UPSTREAM);

    const backups = readdirSync(path.join(apps.conflict, ".standarui/backup"));
    const backup = path.join(apps.conflict, ".standarui/backup", backups[0] as string);
    expect(readFileSync(path.join(backup, ANATOMY), "utf8")).toBe(localBefore);
  });
});
