import { describe, expect, it } from "vitest";
import type { RegistrySpecifier } from "./registry-types";
import { rewriteImports } from "./rewrite";

const specifiers: Record<string, RegistrySpecifier> = {
  "@standarui/core": { layer: "core", path: "index.ts" },
  "@standarui/core/select": { layer: "core", path: "components/select/index.ts" },
  "@standarui/core/reactivity": { layer: "core", path: "reactivity.ts" },
  "@standarui/react": { layer: "react", path: "index.ts" },
};
const aliases = { core: "@/standarui/core", react: "@/standarui/react" } as const;

const quoted = (spec: string): string => `'${spec}'`;
const from = (spec: string): string => `import { a } from "${spec}";\n`;

function rewrite(content: string): string {
  return rewriteImports(content, "file.ts", specifiers, aliases);
}

describe("rewriteImports", () => {
  it("maps a layer root to its alias", () => {
    expect(rewrite(from("@standarui/core"))).toBe(from("@/standarui/core"));
    expect(rewrite(from("@standarui/react"))).toBe(from("@/standarui/react"));
  });

  it("maps a subpath to the alias plus the file path, without extension or index", () => {
    expect(rewrite(from("@standarui/core/select"))).toBe(
      from("@/standarui/core/components/select"),
    );
    expect(rewrite(from("@standarui/core/reactivity"))).toBe(from("@/standarui/core/reactivity"));
  });

  it("rewrites export from, side-effect imports and dynamic imports", () => {
    const quote = '"';
    const source = [
      `export * from ${quote}@standarui/core${quote};`,
      `import ${quote}@standarui/core/reactivity${quote};`,
      `const m = await import(${quote}@standarui/core/select${quote});`,
      "import {",
      "  a,",
      `} from ${quote}@standarui/react${quote};`,
    ].join("\n");
    expect(rewrite(source)).toBe(
      [
        `export * from ${quote}@/standarui/core${quote};`,
        `import ${quote}@/standarui/core/reactivity${quote};`,
        `const m = await import(${quote}@/standarui/core/components/select${quote});`,
        "import {",
        "  a,",
        `} from ${quote}@/standarui/react${quote};`,
      ].join("\n"),
    );
  });

  it("leaves relative imports, other packages, comments and plain strings alone", () => {
    const unknown = quoted("@standarui/core/nothing");
    const source = [
      from("./select.machine"),
      from("react"),
      `// import { a } from ${unknown}\n`,
      `/* from ${unknown} */\n`,
      `const text = ${quoted("see @standarui/core/nothing")};\n`,
      `const template = \`\${value} from ${unknown}\`;\n`,
    ].join("");
    expect(rewrite(source)).toBe(source);
  });

  it("fails on a specifier the registry does not export, naming the file", () => {
    expect(() => rewrite(from("@standarui/core/nothing"))).toThrow(
      /file\.ts.*@standarui\/core\/nothing/,
    );
  });
});
