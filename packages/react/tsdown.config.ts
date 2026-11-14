import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/index.ts", "src/use-virtualizer.ts", "src/components/*/index.ts"],
  format: ["esm"],
  platform: "neutral",
  unbundle: true,
  dts: true,
  clean: true,
  publint: true,
  exports: {
    // A component is addressed as `@standarui/react/button`, mirroring the core's
    // map — not by where the entry file happens to sit (architecture.md).
    customExports(exports) {
      const renamed: Record<string, string> = {};
      for (const [subpath, target] of Object.entries(exports)) {
        const component = subpath.replace(/^\.\/components\//, "./");
        renamed[component === "./use-virtualizer" ? "./virtualizer" : component] = target;
      }
      // The generated props tables (`bun run docs:api`), which have no entry
      // point and so are not in the map tsdown builds. Added here rather than in
      // `package.json`, because this hook rewrites that field on every build and
      // an entry written by hand there survives exactly until the next one.
      renamed["./api/*.json"] = "./api/*.json";
      return renamed;
    },
  },
});

export default config;
