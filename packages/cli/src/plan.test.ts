import { describe, expect, it } from "vitest";
import { backupDirName, classifyFile } from "./plan";

const clean = (): boolean => true;
const dirty = (): boolean => false;

describe("classifyFile", () => {
  it("reports unchanged when nothing moved", () => {
    expect(classifyFile({ base: "a", local: "a", target: "a" }, clean)).toBe("unchanged");
  });

  it("reports update when only the registry changed", () => {
    expect(classifyFile({ base: "a", local: "a", target: "b" }, clean)).toBe("update");
  });

  it("reports local-only when only the copy changed", () => {
    expect(classifyFile({ base: "a", local: "c", target: "a" }, clean)).toBe("local-only");
  });

  it("reports merge when both changed and the merge is clean", () => {
    expect(classifyFile({ base: "a", local: "c", target: "b" }, clean)).toBe("merge");
  });

  it("reports conflict when both changed and the merge is not clean", () => {
    expect(classifyFile({ base: "a", local: "c", target: "b" }, dirty)).toBe("conflict");
  });

  it("reports added and removed upstream", () => {
    expect(classifyFile({ base: undefined, local: undefined, target: "b" }, clean)).toBe("added");
    expect(classifyFile({ base: "a", local: "a", target: undefined }, clean)).toBe("removed");
  });

  it("never probes a merge when one side is missing", () => {
    const fail = (): boolean => {
      throw new Error("probed");
    };
    expect(classifyFile({ base: "a", local: undefined, target: "b" }, fail)).toBe("conflict");
    expect(classifyFile({ base: "a", local: undefined, target: "a" }, fail)).toBe("local-only");
    expect(classifyFile({ base: undefined, local: "x", target: "b" }, fail)).toBe("conflict");
  });
});

describe("backupDirName", () => {
  it("is the ISO timestamp without colons", () => {
    expect(backupDirName(new Date("2026-11-15T10:20:30.456Z"))).toBe("2026-11-15T102030.456Z");
  });
});
