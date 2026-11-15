import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { installItems } from "./add";
import { readConfig } from "./config";
import type { CliContext } from "./context";
import { CliError } from "./errors";
import { runInit } from "./init";

export interface MainContext {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

const HELP = `Usage: standarui <command> [options]

Commands:
  init                  Write standarui.json and add nav, core-base and react-base
  add <item...>         Copy items, and the items they depend on, into the app

Options for init:
  --core-dir <dir>      Where the core layer is written (src/standarui/core)
  --react-dir <dir>     Where the react layer is written (src/standarui/react)
  --core-alias <alias>  Import alias of the core layer (@/standarui/core)
  --react-alias <alias> Import alias of the react layer (@/standarui/react)
  --registry <source>   Base URL or local registry folder replacing @standarui
  --no-install          Do not run the package manager
  --yes                 Accepted for scripts; init never prompts

Options for add:
  --registry <source>   Base URL or local registry folder replacing @standarui
  --overwrite           Replace files and items already present
  --no-install          Do not run the package manager

  --help, --version`;

function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return manifest.version;
}

export async function main(argv: readonly string[], overrides: MainContext = {}): Promise<number> {
  const context: CliContext = {
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? process.env,
    fetch: overrides.fetch ?? globalThis.fetch,
    out: overrides.out ?? ((line) => console.log(line)),
    err: overrides.err ?? ((line) => console.error(line)),
  };
  const [command, ...rest] = argv;

  try {
    if (command === undefined) {
      context.err(HELP);
      return 1;
    }
    if (command === "--help" || command === "-h" || command === "help") {
      context.out(HELP);
      return 0;
    }
    if (command === "--version" || command === "-v") {
      context.out(readVersion());
      return 0;
    }

    if (command === "init") {
      const { values } = parseArgs({
        args: rest,
        options: {
          "core-dir": { type: "string" },
          "react-dir": { type: "string" },
          "core-alias": { type: "string" },
          "react-alias": { type: "string" },
          registry: { type: "string" },
          "no-install": { type: "boolean" },
          yes: { type: "boolean" },
          help: { type: "boolean", short: "h" },
        },
        allowPositionals: false,
      });
      if (values.help) {
        context.out(HELP);
        return 0;
      }
      await runInit(context, {
        coreDir: values["core-dir"],
        reactDir: values["react-dir"],
        coreAlias: values["core-alias"],
        reactAlias: values["react-alias"],
        registry: values.registry,
        install: !values["no-install"],
        version: readVersion(),
      });
      return 0;
    }

    if (command === "add") {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          registry: { type: "string" },
          overwrite: { type: "boolean" },
          "no-install": { type: "boolean" },
          help: { type: "boolean", short: "h" },
        },
        allowPositionals: true,
      });
      if (values.help) {
        context.out(HELP);
        return 0;
      }
      if (positionals.length === 0) throw new CliError("add needs at least one item name");
      await installItems(context, readConfig(context.cwd), positionals, {
        overwrite: values.overwrite === true,
        install: !values["no-install"],
        registry: values.registry,
        version: readVersion(),
      });
      return 0;
    }

    throw new CliError(`unknown command "${command}", run standarui --help`);
  } catch (error) {
    context.err(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
