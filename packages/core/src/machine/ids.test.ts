import { describe, expect, it } from "vitest";
import { getPartId } from "./ids";
import { createScope, type Scope } from "./scope";

const scopeWith = (ids?: Record<string, string | undefined>): Scope =>
  createScope({ id: "r1", ids, getRootNode: () => ({}) as Document });

describe("getPartId", () => {
  it("derives `{component}:{id}:{part}`", () => {
    expect(getPartId(scopeWith(), "accordion", "root")).toBe("accordion:r1:root");
  });

  it("appends the key for parts that repeat", () => {
    expect(getPartId(scopeWith(), "accordion", "itemTrigger", "a")).toBe(
      "accordion:r1:itemTrigger:a",
    );
  });

  it("lets the consumer override a part id", () => {
    const scope = scopeWith({ root: "my-root", "itemTrigger:a": "my-trigger" });

    expect(getPartId(scope, "accordion", "root")).toBe("my-root");
    expect(getPartId(scope, "accordion", "itemTrigger", "a")).toBe("my-trigger");
    expect(getPartId(scope, "accordion", "itemTrigger", "b")).toBe("accordion:r1:itemTrigger:b");
  });

  it("is deterministic — the same scope always yields the same ids", () => {
    expect(getPartId(scopeWith(), "dialog", "content")).toBe(
      getPartId(scopeWith(), "dialog", "content"),
    );
  });
});
