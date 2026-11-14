import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  // The opt-in modules are listed one by one rather than globbed: there are a
  // handful and the published surface should be readable here.
  entry: [
    "src/index.ts",
    "src/reactivity.ts",
    "src/components/*/index.ts",
    "src/components/color-picker/eyedropper.ts",
    "src/gesture/settle.ts",
  ],
  format: ["esm"],
  platform: "neutral",
  unbundle: true,
  dts: true,
  clean: true,
  publint: true,
  exports: {
    // A component is addressed as `@standarui/core/toggle`, and the gesture
    // module as `@standarui/core/gesture` — not by where the entry file happens
    // to sit (architecture.md — exports map par subpath). Each of those still
    // points at a real module, never at an index of re-exports. The input engines
    // are no longer entries here: they ship as `@standarx/nav` (decision 57).
    customExports(exports) {
      const subpaths: Readonly<Record<string, string>> = {
        "./gesture/settle": "./gesture",
      };
      const renamed: Record<string, string> = {};
      for (const [subpath, target] of Object.entries(exports)) {
        const component = subpath.replace(/^\.\/components\//, "./");
        renamed[subpaths[component] ?? component] = target;
      }
      return renamed;
    },
  },
});

export default config;
