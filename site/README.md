# standarui site

Documentation site of standarui, built with [`@standarx/mdocs`](https://www.npmjs.com/package/@standarx/mdocs). It stands apart from the root workspace: its own `package.json`, not listed in the root `workspaces`.

## Build locally

```sh
bun run build            # at the repository root, builds packages/core and packages/react
cd site
bun install
bun run build            # writes site/dist
```

Both locales are built, under `/en/` and `/fr/`, and served under the base `/standarui/`. `.github/workflows/pages.yml` deploys the site to GitHub Pages.

`bunfig.toml` sets `peer = false` on purpose: `@standarui/react` is linked from `../packages/react` and resolves React from the root `node_modules`, but its own React peer would install a second copy here and break hooks during prerender. The site reads `react` and `react-dom` from the root install.
