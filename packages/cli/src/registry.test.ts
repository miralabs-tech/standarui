import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import type { CliContext } from "./context";
import { createRegistryClient, expandHeaders, parseRef } from "./registry";

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
