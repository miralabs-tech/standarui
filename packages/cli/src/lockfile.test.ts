import { describe, expect, it } from "vitest";
import { emptyLockfile, type Lockfile, lockedFiles, serializeLockfile } from "./lockfile";

function build(order: readonly string[]): Lockfile {
  const lock = emptyLockfile();
  for (const name of order) {
    lock.items[name] = {
      source: "@standarui",
      version: "0.0.0",
      files: { "react/b.ts": "2", "core/a.ts": "1" },
    };
  }
  return lock;
}

describe("serializeLockfile", () => {
  it("does not depend on insertion order", () => {
    expect(serializeLockfile(build(["select", "nav", "core-base"]))).toBe(
      serializeLockfile(build(["core-base", "select", "nav"])),
    );
  });

  it("sorts the item and file keys and ends with a newline", () => {
    const text = serializeLockfile(build(["select", "nav"]));
    expect(text.endsWith("}\n")).toBe(true);
    const parsed = JSON.parse(text) as Lockfile;
    expect(Object.keys(parsed.items)).toEqual(["nav", "select"]);
    expect(Object.keys(parsed.items.nav?.files ?? {})).toEqual(["core/a.ts", "react/b.ts"]);
    expect(parsed.lockVersion).toBe(1);
  });

  it("lists every locked file", () => {
    expect([...lockedFiles(build(["nav", "select"]))].sort()).toEqual(["core/a.ts", "react/b.ts"]);
  });
});
