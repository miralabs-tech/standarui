import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// The adapters import `@standarui/core` by its published specifier, which node
// resolution would send to `dist`. The test jobs do not build first — and a test
// that needs a build is a test that reports on the last build — so the workspace
// specifiers are mapped back to source here, longest first because Vite matches a
// string alias as a prefix.
const core = path.resolve(import.meta.dirname, "packages/core/src");
const react = path.resolve(import.meta.dirname, "packages/react/src");
const alias: { find: RegExp; replacement: string }[] = [
  // The React adapter is mapped to source for the same reason as core: a test
  // must never report on the last build.
  { find: /^@standarui\/react\/virtualizer$/, replacement: `${react}/use-virtualizer.ts` },
  { find: /^@standarui\/react\/([a-z][a-z-]*)$/, replacement: `${react}/components/$1/index.ts` },
  { find: /^@standarui\/react$/, replacement: `${react}/index.ts` },
  { find: /^@standarui\/core\/reactivity$/, replacement: `${core}/reactivity.ts` },
  {
    find: /^@standarui\/core\/color-picker\/eyedropper$/,
    replacement: `${core}/components/color-picker/eyedropper.ts`,
  },
  // Every component subpath, so adding a component is a folder and nothing else.
  { find: /^@standarui\/core\/([a-z][a-z-]*)$/, replacement: `${core}/components/$1/index.ts` },
  { find: /^@standarui\/core$/, replacement: `${core}/index.ts` },
];

// One browser locally, the full matrix in CI (`SUI_BROWSER=firefox bun run test`).
// Browser tests are named `*.browser.test.ts` — the DOM primitives are tested
// against a real engine, machines stay in the node project where they belong.
type PlaywrightBrowser = "chromium" | "firefox" | "webkit";
const browser = (process.env.SUI_BROWSER ?? "chromium") as PlaywrightBrowser;

// Every test file runs in its own page, yet Firefox does not keep the mouse per
// page: a document of one file was seen receiving the press and the moves another
// file sent at the same moment, and losing its own. A real click (`userEvent`) and
// a gesture (`commands.mouse`) both drive that one mouse, so under Firefox the
// files take turns; the other engines keep one mouse per page and run in parallel.
const sharedMouse = browser === "firefox";

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          // `.tsx` is here for one reason: the SSR guard renders real components
          // with `renderToString`, and writing eleven component trees through
          // `createElement` would obscure the thing being asserted. The exclude
          // below keeps every browser test out either way.
          include: [
            "packages/*/src/**/*.test.ts",
            "packages/*/src/**/*.test.tsx",
            "packages/*/scripts/**/*.test.ts",
            "packages/*/tests/**/*.test.ts",
            // Repo-level rules, tested where node types legitimately live —
            // `tsconfig.base.json` keeps `"types": []` everywhere else.
            "scripts/**/*.test.ts",
          ],
          exclude: ["**/*.browser.test.ts", "**/*.browser.test.tsx"],
          benchmark: { include: ["packages/*/src/**/*.bench.ts"] },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          include: ["packages/*/src/**/*.browser.test.ts", "packages/*/src/**/*.browser.test.tsx"],
          // Benchmarks are arithmetic; they have no business booting a browser.
          benchmark: { include: [] },
          fileParallelism: !sharedMouse,
          // Pre-bundled up front: discovering React mid-run makes Vite reload the
          // page under the test that triggered it.
          deps: { optimizer: { web: { include: ["react", "react-dom", "react-dom/client"] } } },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser }],
            // A forced-colours theme is a page setting, out of reach of the test
            // iframe; `null` hands the media feature back to the engine.
            commands: {
              emulateForcedColors: async (context, forcedColors: "active" | null) => {
                await context.page.emulateMedia({ forcedColors });
              },
              emulateReducedMotion: async (context, reducedMotion: "reduce" | null) => {
                await context.page.emulateMedia({ reducedMotion });
              },
              // What a test file starting beside this one does to it under Firefox:
              // another page takes the window's focus, and this document keeps its
              // focused element but loses `document.hasFocus()`.
              takePageFocus: async (context) => {
                const other = await context.page.context().newPage();
                try {
                  await other.setContent("<input>");
                  await other.bringToFront();
                  await other.focus("input");
                } finally {
                  await other.close();
                }
              },
              // A real mouse, in the test iframe's CSS pixels. Synthetic events
              // cannot show what capture does to the click's target: only the
              // engine's own hit-testing and click dispatch can.
              ariaSnapshot: async (context, selector: string) => {
                const frame = await context.frame();
                return frame.locator(selector).ariaSnapshot();
              },
              wheel: async (context, x: number, y: number, deltaX: number, deltaY: number) => {
                const frame = await context.frame();
                const box = await (await frame.frameElement()).boundingBox();
                if (box === null) throw new Error("the test iframe has no box");
                const width = await frame.evaluate(() => window.innerWidth);
                const scale = box.width / width;
                const { mouse } = context.page;
                await mouse.move(box.x + x * scale, box.y + y * scale);
                await mouse.wheel(deltaX, deltaY);
              },
              mouse: async (
                context,
                steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
              ) => {
                const frame = await context.frame();
                const box = await (await frame.frameElement()).boundingBox();
                if (box === null) throw new Error("the test iframe has no box");
                const width = await frame.evaluate(() => window.innerWidth);
                const scale = box.width / width;
                const { mouse } = context.page;
                for (const step of steps) {
                  await mouse.move(box.x + step.x * scale, box.y + step.y * scale);
                  if (step.type === "down") await mouse.down();
                  if (step.type === "up") await mouse.up();
                }
              },
            },
          },
        },
      },
    ],
  },
});

export default config;
