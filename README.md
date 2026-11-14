# standarui

A headless UI engine: state machines in TypeScript, focus management and ARIA
patterns following the APG, built on `@standarx/nav`. It ships with a React 19
adapter.

The code is meant to be copied into your app by a registry CLI, still to come,
rather than installed from npm.

## Status

Version `0.0.0`, pre-release. The packages are not published.

## Layout

- `packages/core`: the engine, framework-free.
- `packages/react`: the React 19 adapter.

Both packages arrive in follow-up pull requests; this repository currently holds
the root tooling only.

## Development

```sh
bun install
bun run lint        # biome
bun run typecheck
bun run test:unit
bun run test:browser
bun run ci:local    # replays the CI jobs locally
```

Browser tests run on Chromium by default. Pick the engine with `SUI_BROWSER`:

```sh
SUI_BROWSER=firefox bun run test:browser
```

## License

MIT
