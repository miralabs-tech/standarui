import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGenerated, LOCALES, pagePath, readComponents, renderPage } from "./site-pages";

const root = path.resolve(import.meta.dirname, "..");
const components = readComponents();

describe("component pages", () => {
  it("covers every manifest component in every locale", () => {
    const missing = components.flatMap((component) =>
      LOCALES.filter((locale) => !existsSync(pagePath(locale, component))).map(
        (locale) => `${locale}/${component}`,
      ),
    );
    expect(missing).toEqual([]);
  });

  it("matches what the generator writes now", () => {
    const stale = components.flatMap((component) =>
      LOCALES.filter((locale) => {
        const file = pagePath(locale, component);
        return isGenerated(file) && readFileSync(file, "utf8") !== renderPage(locale, component);
      }).map((locale) => `${locale}/${component}`),
    );
    expect(stale).toEqual([]);
  });

  it("points every props fence at an existing API table", () => {
    const broken = components.flatMap((component) =>
      LOCALES.flatMap((locale) => {
        const text = readFileSync(pagePath(locale, component), "utf8");
        const names = [...text.matchAll(/^```props (\S+)/gm)].map((match) => match[1] ?? "");
        const bad = names.filter(
          (name) => !existsSync(path.join(root, "packages/react/api", `${name}.json`)),
        );
        return names.length === 0 ? [`${locale}/${component}: no props fence`] : bad;
      }),
    );
    expect(broken).toEqual([]);
  });
});
