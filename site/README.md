# standarui site

Documentation site of standarui, built with [`@standarx/mdocs`](https://www.npmjs.com/package/@standarx/mdocs). It stands apart from the root workspace: its own `package.json`, not listed in the root `workspaces`.

## Build locally

```sh
bun run build            # at the repository root, builds packages/core and packages/react
cd site
bun install
bun run build            # writes site/dist
```

Only `content/en` is built. `content/fr` holds the French pages until standardoc-web delivers locales (request standardoc-web#55f4230c05); the site goes online with that request.

`bunfig.toml` sets `peer = false` on purpose: `@standarui/react` is linked from `../packages/react` and resolves React from the root `node_modules`, but its own React peer would install a second copy here and break hooks during prerender. The site reads `react` and `react-dom` from the root install.
