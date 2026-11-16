import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import type { CliContext } from "./context";
import { createRegistryClient, defaultRegistry, expandHeaders, parseRef } from "./registry";

const placeholder = (name: string): string => ["$", "{", name, "}"].join("");

describe("expandHeaders", () => {
  it("fills placeholders from the environment", () => {
    expect(
      expandHeaders(
        { Authorization: `Bearer ${placeholder("ACME_TOKEN")}` },
        { ACME_TOKEN: "secret" },
      ),
    ).toEqual({ Authorization: "Bearer secret" });
  });

  it("names a missing variable and never prints a value", () => {
    let message = "";
    try {
      expandHeaders(
        { Authorization: `Bearer ${placeholder("ACME_TOKEN")}`, "X-Other": placeholder("OTHER") },
        { OTHER: "do-not-print" },
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("ACME_TOKEN");
    expect(message).not.toContain("do-not-print");
  });
});

describe("createRegistryClient", () => {
  it("fails on a missing header variable before any request", async () => {
    let calls = 0;
    const context: CliContext = {
      cwd: process.cwd(),
      env: {},
      fetch: (async () => {
        calls += 1;
        return new Response("{}");
      }) as typeof fetch,
      out: () => {},
      err: () => {},
    };
    const config = {
      ...defaultConfig(),
      registries: {
        "@acme": {
          url: "https://example.com/r/{name}.json",
          headers: { Authorization: `Bearer ${placeholder("ACME_TOKEN")}` },
        },
      },
    };
    const client = createRegistryClient(context, config, "0.0.0", undefined);
    await expect(client.loadItem("@acme", "card")).rejects.toThrow(/ACME_TOKEN/);
    expect(calls).toBe(0);
  });

  it("sends the expanded headers to a remote registry", async () => {
    let seen: Record<string, string> = {};
    let url = "";
    const context: CliContext = {
      cwd: process.cwd(),
      env: { ACME_TOKEN: "t" },
      fetch: (async (input: string, init?: RequestInit) => {
        url = input;
        seen = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ name: "card", files: [] }));
      }) as unknown as typeof fetch,
      out: () => {},
      err: () => {},
    };
    const config = {
      ...defaultConfig(),
      registries: {
        "@acme": {
          url: "https://example.com/r/{name}.json",
          headers: { Authorization: `Bearer ${placeholder("ACME_TOKEN")}` },
        },
      },
    };
    const client = createRegistryClient(context, config, "0.0.0", undefined);
    const loaded = await client.loadItem("@acme", "card");
    expect(url).toBe("https://example.com/r/card.json");
    expect(seen).toEqual({ Authorization: "Bearer t" });
    expect(loaded.registryDependencies).toEqual([]);
  });
});

describe("parseRef", () => {
  it("sends a bare name to the parent and @ns/name to its registry", () => {
    expect(parseRef("select", "@standarui")).toEqual({ registry: "@standarui", name: "select" });
    expect(parseRef("@acme/card", "@standarui")).toEqual({ registry: "@acme", name: "card" });
    expect(() => parseRef("@acme", "@standarui")).toThrow();
  });
});

function localClient(directory: string): ReturnType<typeof createRegistryClient> {
  const context: CliContext = {
    cwd: directory,
    env: {},
    fetch: (async () => new Response("{}")) as typeof fetch,
    out: () => {},
    err: () => {},
  };
  const config = {
    ...defaultConfig(),
    registries: { "@acme": { url: `${directory}/{name}.json` } },
  };
  return createRegistryClient(context, config, "0.0.0", undefined);
}

function acmeItem(file: { path: string; content: string; sha256?: string }): string {
  return JSON.stringify({
    name: "card",
    registryDependencies: [],
    files: [
      {
        layer: "react",
        sha256: createHash("sha256").update(file.content).digest("hex"),
        ...file,
      },
    ],
  });
}

describe("third-party item validation", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "standarui-items-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("accepts an item whose sha256 matches", async () => {
    writeFileSync(path.join(directory, "ok.json"), acmeItem({ path: "a.ts", content: "x\n" }));
    expect((await localClient(directory).loadItem("@acme", "ok")).name).toBe("card");
  });

  it("refuses an item whose sha256 does not match its content", async () => {
    writeFileSync(
      path.join(directory, "bad-hash.json"),
      acmeItem({ path: "a.ts", content: "x\n", sha256: "0".repeat(64) }),
    );
    await expect(localClient(directory).loadItem("@acme", "bad-hash")).rejects.toThrow(/sha256/);
  });

  it.each(["../evil.ts", "a/../../evil.ts", "/abs.ts", "C:/abs.ts", "..\\evil.ts", "\\abs.ts"])(
    "refuses the file path %s",
    async (filePath) => {
      writeFileSync(
        path.join(directory, "bad-path.json"),
        acmeItem({ path: filePath, content: "x\n" }),
      );
      await expect(localClient(directory).loadItem("@acme", "bad-path")).rejects.toThrow(
        /refusing the file path/,
      );
    },
  );
});

describe("defaultRegistry", () => {
  it("points at the tag matching the CLI version", () => {
    const registry = defaultRegistry("0.1.0");
    const base = "https://raw.githubusercontent.com/miralabs-tech/standarui/v0.1.0/registry";
    expect(registry.url).toBe(`${base}/items/{name}.json`);
    expect(registry.index).toBe(`${base}/index.json`);
  });
});
