import { describe, expect, it } from "vitest";
import {
  type ComponentManifest,
  diffManifests,
  type ManifestComponent,
  restrictDiff,
} from "./manifest-diff";

function component(props: string[]): ManifestComponent {
  return {
    scope: null,
    parts: [],
    imports: [],
    composed: false,
    api: null,
    props: { Props: props },
    aliases: {},
    flows: {},
  };
}

function manifest(version: string, shapes: Record<string, string[]>): ComponentManifest {
  return {
    schema: 1,
    version,
    components: Object.fromEntries(
      Object.entries(shapes).map(([name, props]) => [name, component(props)]),
    ),
  };
}

describe("restrictDiff", () => {
  const before = manifest("0.0.0", { select: ["a?", "b"], tabs: ["x", "y"], menu: ["m"] });
  const after = manifest("0.0.1", { select: ["a?"], tabs: ["x"], toast: ["t"] });
  const full = diffManifests(before, after, []);

  it("is breaking before the restriction", () => {
    expect(full.breaking).toBe(true);
    expect(Object.keys(full.changed)).toEqual(["select", "tabs"]);
    expect(full.components.removed).toEqual(["menu"]);
    expect(full.components.added).toEqual(["toast"]);
  });

  it("keeps only the installed components", () => {
    const kept = restrictDiff(full, new Set(["select"]));
    expect(Object.keys(kept.changed)).toEqual(["select"]);
    expect(kept.components).toEqual({ added: [], removed: [], renamed: [] });
    expect(kept.breaking).toBe(true);
  });

  it("is not breaking when the installed components did not break", () => {
    const kept = restrictDiff(full, new Set(["button"]));
    expect(kept.breaking).toBe(false);
    expect(kept.changed).toEqual({});
  });

  it("reports an installed component that left the registry", () => {
    const kept = restrictDiff(full, new Set(["menu"]));
    expect(kept.components.removed).toEqual(["menu"]);
    expect(kept.breaking).toBe(true);
  });
});
