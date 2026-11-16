import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Lockfile } from "./lockfile";
import { main } from "./main";

const repo = path.resolve(import.meta.dirname, "../../..");
const registry = path.join(repo, "registry");
const tsc = path.join(repo, "node_modules", "typescript", "bin", "tsc");
const TOKEN = "s3cret-test";

const SCOPE = ["@standarui"].join("");

const FANCY = `import { visuallyHiddenStyle } from "${SCOPE}/core";
import { Button, type ButtonComposedProps } from "${SCOPE}/react/button";

export const hidden = visuallyHiddenStyle;

export function FancyButton(props: ButtonComposedProps) {
  return <Button {...props} />;
}
`;

let app = "";
let server: Server;
let port = 0;
let authorizedRequests = 0;
let requests = 0;
const requestedUrls: string[] = [];
const logs: string[] = [];
const errors: string[] = [];

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function item(name: string, filePath: string, content: string, hash = sha256(content)): string {
  return JSON.stringify({
    $schema: "https://github.com/miralabs-tech/standarui/registry/schema.json",
    name,
    type: "registry:component",
    version: "1.0.0",
    registryDependencies: ["button"],
    files: [{ layer: "react", path: filePath, sha256: hash, content }],
  });
}

const items: Record<string, string> = {
  "fancy-button": item("fancy-button", "components/fancy-button/fancy-button.tsx", FANCY),
  "bad-hash": item("bad-hash", "components/bad-hash/bad-hash.tsx", FANCY, "0".repeat(64)),
  evil: item("evil", "../evil.ts", "export const evil = 1;\n"),
};

function run(args: readonly string[], env: Record<string, string>): Promise<number> {
  return main(args, {
    cwd: app,
    env,
    out: (line) => logs.push(line),
    err: (line) => errors.push(line),
  });
}

function reset(): void {
  logs.length = 0;
  errors.length = 0;
  requests = 0;
  authorizedRequests = 0;
  requestedUrls.length = 0;
}

const output = (): string => `${logs.join("\n")}\n${errors.join("\n")}`;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const read = (file: string): string => readFileSync(path.join(app, file), "utf8");

beforeAll(async () => {
  app = mkdtempSync(path.join(tmpdir(), "standarui-third-party-"));
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

  server = createServer((request, response) => {
    requests += 1;
    requestedUrls.push(request.url ?? "");
    if (request.headers.authorization !== undefined) authorizedRequests += 1;
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401).end("unauthorized");
      return;
    }
    const match = /^\/r\/([a-z-]+)\.json$/.exec(request.url ?? "");
    const body = match?.[1] === undefined ? undefined : items[match[1]];
    if (body === undefined) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(app, { recursive: true, force: true });
});

describe("a third-party registry behind a header", () => {
  it("initialises the app and declares @acme", async () => {
    expect(await run(["init", "--yes", "--no-install", "--registry", registry], {})).toBe(0);
    const config = JSON.parse(read("standarui.json")) as Record<string, unknown>;
    config.registries = {
      "@acme": {
        url: `http://127.0.0.1:${port}/r/{name}.json`,
        headers: { Authorization: ["Bearer ", "$", "{ACME_TOKEN}"].join("") },
      },
    };
    writeFileSync(path.join(app, "standarui.json"), `${JSON.stringify(config, null, 2)}\n`);
  });

  it("fails on a missing variable, names it, and sends nothing", async () => {
    reset();
    const code = await run(
      ["add", "@acme/fancy-button", "--no-install", "--registry", registry],
      {},
    );
    expect(code).toBe(1);
    expect(output()).toContain("ACME_TOKEN");
    expect(requests).toBe(0);
  });

  it("reports the 401 without echoing the header", async () => {
    reset();
    const code = await run(["add", "@acme/fancy-button", "--no-install", "--registry", registry], {
      ACME_TOKEN: "wrong",
    });
    expect(code).toBe(1);
    expect(output()).toContain("401");
    expect(output()).not.toContain("wrong");
    expect(output()).not.toContain("Bearer");
  });

  it("refuses an item whose sha256 is wrong", async () => {
    reset();
    const code = await run(["add", "@acme/bad-hash", "--no-install", "--registry", registry], {
      ACME_TOKEN: TOKEN,
    });
    expect(code).toBe(1);
    expect(output()).toContain("sha256");
    expect(existsSync(path.join(app, "src/standarui/react/components/bad-hash"))).toBe(false);
  });

  it("refuses an item whose path leaves the folders", async () => {
    reset();
    const code = await run(["add", "@acme/evil", "--no-install", "--registry", registry], {
      ACME_TOKEN: TOKEN,
    });
    expect(code).toBe(1);
    expect(output()).toContain("refusing the file path");
    expect(existsSync(path.join(app, "src/standarui/evil.ts"))).toBe(false);
    expect(existsSync(path.join(app, "src/evil.ts"))).toBe(false);
  });

  it("adds the item and sends the header only to its own URLs", async () => {
    reset();
    const code = await run(["add", "@acme/fancy-button", "--no-install", "--registry", registry], {
      ACME_TOKEN: TOKEN,
    });
    expect(errors).toEqual([]);
    expect(code).toBe(0);
    expect(requests).toBeGreaterThan(0);
    expect(authorizedRequests).toBe(requests);
    expect(requestedUrls.every((url) => url === "/r/fancy-button.json")).toBe(true);

    const file = read("src/standarui/react/components/fancy-button/fancy-button.tsx");
    expect(file).toContain('from "@/standarui/core"');
    expect(file).toContain('from "@/standarui/react/components/button"');
    expect(file).not.toContain("@standarui/");
    expect(existsSync(path.join(app, "src/standarui/react/components/button/composed.tsx"))).toBe(
      true,
    );

    const lock = JSON.parse(read("standarui.lock.json")) as Lockfile;
    expect(lock.items["@acme/fancy-button"]?.source).toBe("@acme");
    expect(lock.items.button?.source).toBe("@standarui");
  });

  it("writes the secret nowhere in the app", () => {
    const files = [
      path.join(app, "standarui.json"),
      path.join(app, "standarui.lock.json"),
      ...walk(path.join(app, ".standarui")),
    ];
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toContain(TOKEN);
  });

  it("typechecks the copied sources", () => {
    const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", app], {
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toBe("");
    expect(result.status).toBe(0);
  });
});
