import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: false,
  fixedExtension: false,
  clean: true,
  publint: true,
});

export default config;
