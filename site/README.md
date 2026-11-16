# standarui site

Documentation site of standarui, built with standardoc-web (`mdocs`). It stands apart from the root workspace: its own `package.json`, not listed in the root `workspaces`.

## Build locally

```sh
bun run build            # at the repository root, builds packages/core and packages/react
cd site
bun run standardoc       # packs @standardoc/kit and @standardoc/cli from standardoc-web
bun install
bun run build            # writes site/dist
```

`bun run standardoc` reads standardoc-web from `../../standardoc-web` relative to `site/`; set `STANDARDOC_WEB` to another checkout to override it.

Only `content/en` is built. `content/fr` holds the French pages until standardoc-web delivers locales (request standardoc-web#55f4230c05); the site goes online with that request.

`bunfig.toml` sets `peer = false` on purpose: `@standarui/react` is linked from `../packages/react`, which resolves React from the root `node_modules`, so a second React installed here would give two copies and break hooks during prerender. The site reads `react` and `react-dom` from the root install.
