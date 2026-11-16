import { spawnSync } from "node:child_process";
import {
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
const tsc = path.join(repo, "node_modules", "typescript", "bin", "tsc");

let app = "";
const logs: string[] = [];
const errors: string[] = [];

function run(args: readonly string[]): Promise<number> {
  return main(args, {
    cwd: app,
    env: {},
    out: (line) => logs.push(line),
    err: (line) => errors.push(line),
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const read = (file: string): string => readFileSync(path.join(app, file), "utf8");

beforeAll(() => {
  app = mkdtempSync(path.join(tmpdir(), "standarui-e2e-"));
  writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify({ name: "fixture", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
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
  mkdirSync(path.join(app, "src"));
  writeFileSync(path.join(app, "src", "app.tsx"), "export const App = () => <main />;\n");
  symlinkSync(path.join(repo, "node_modules"), path.join(app, "node_modules"), "junction");
});

afterAll(() => {
  rmSync(app, { recursive: true, force: true });
});

describe("init then add against the committed registry", () => {
  it("initialises the app", async () => {
    expect(await run(["init", "--yes", "--no-install", "--registry", registry])).toBe(0);
    expect(errors).toEqual([]);
    const config = JSON.parse(read("standarui.json")) as Record<string, unknown>;
    expect(config.dirs).toEqual({
      core: "src/standarui/core",
      react: "src/standarui/react",
      styles: "src/standarui/styles",
    });
    expect(config.aliases).toEqual({ core: "@/standarui/core", react: "@/standarui/react" });
    expect(logs.join("\n")).not.toContain("does not resolve the aliases");
  });

  it("adds select and its dependencies", async () => {
    expect(await run(["add", "select", "--no-install", "--registry", registry])).toBe(0);
    expect(errors).toEqual([]);
  });

  it("writes the files, the bases and the lockfile", () => {
    const lock = JSON.parse(read("standarui.lock.json")) as Lockfile;
    expect(Object.keys(lock.items)).toEqual(["core-base", "nav", "react-base", "select"]);
    const select = lock.items.select;
    expect(select?.source).toBe("@standarui");
    for (const [key, hash] of Object.entries(select?.files ?? {})) {
      const [layer, ...rest] = key.split("/");
      const relative = rest.join("/");
      const written = read(`src/standarui/${layer}/${relative}`);
      expect(read(`.standarui/base/${layer}/${relative}`)).toBe(written);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(
      existsSync(path.join(app, "src/standarui/core/components/select/select.machine.ts")),
    ).toBe(true);
  });

  it("rewrites every workspace import", () => {
    const importOfWorkspace = /(?:from|import)\s*\(?\s*["']@standarui\//;
    const copied = walk(path.join(app, "src", "standarui")).filter((file) => /\.tsx?$/.test(file));
    expect(copied.length).toBeGreaterThan(0);
    for (const file of copied) {
      expect(importOfWorkspace.test(readFileSync(file, "utf8")), file).toBe(false);
    }
    expect(read("src/standarui/react/components/select/select.tsx")).toContain(
      "@/standarui/core/components/select",
    );
  });

  it("declares the dependencies", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(
      expect.arrayContaining(["@standarx/nav", "react", "react-dom"]),
    );
  });

  it("typechecks the copied sources", () => {
    const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", app], {
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toBe("");
    expect(result.status).toBe(0);
  });

  it("skips what is already installed", async () => {
    logs.length = 0;
    expect(await run(["add", "select", "--no-install", "--registry", registry])).toBe(0);
    expect(logs.join("\n")).toContain("Nothing to add");
  });

  it("refuses to overwrite a file it did not write, with exit 1", async () => {
    const target = path.join(app, "src/standarui/core/components/button/button.machine.ts");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "export const mine = 1;\n");
    errors.length = 0;
    expect(await run(["add", "button", "--no-install", "--registry", registry])).toBe(1);
    expect(errors.join("\n")).toContain("components/button/button.machine.ts");
    expect(readFileSync(target, "utf8")).toBe("export const mine = 1;\n");
    expect(
      await run(["add", "button", "--overwrite", "--no-install", "--registry", registry]),
    ).toBe(0);
  });
});

describe("usage", () => {
  it("exits 1 on an unknown command and 0 on --version", async () => {
    expect(await run(["nope"])).toBe(1);
    expect(await run(["--version"])).toBe(0);
    expect(await run(["add"])).toBe(1);
  });
});
