import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { installItems } from "./add";
import {
  CONFIG_FILE,
  type ConfigOverrides,
  defaultConfig,
  readConfig,
  serializeConfig,
} from "./config";
import type { CliContext } from "./context";
import { libBelowEs2023, missingPathLines } from "./tsconfig-paths";

export interface InitOptions extends ConfigOverrides {
  readonly registry: string | undefined;
  readonly install: boolean;
  readonly version: string;
}

export async function runInit(context: CliContext, options: InitOptions): Promise<void> {
  const file = path.join(context.cwd, CONFIG_FILE);
  if (existsSync(file)) {
    context.out(`${CONFIG_FILE} already exists, keeping it.`);
  } else {
    writeFileSync(file, serializeConfig(defaultConfig(options)));
    context.out(`Wrote ${CONFIG_FILE}.`);
  }
  const config = readConfig(context.cwd);
  await installItems(context, config, ["nav", "core-base", "react-base"], {
    overwrite: false,
    install: options.install,
    registry: options.registry,
    version: options.version,
  });
  const missing = missingPathLines(context.cwd, config);
  if (missing.length > 0) {
    context.out("Your tsconfig.json does not resolve the aliases. Add this to compilerOptions:");
    context.out(`  "paths": { ${missing.join(", ")} }`);
  }
  const level = libBelowEs2023(context.cwd);
  if (level !== undefined) {
    context.out(
      `Your tsconfig.json uses lib ${level}; the copied code needs es2023 or later. Add "es2023" to compilerOptions.lib.`,
    );
  }
}
