---
title: Installation
description: Requirements, running the CLI and what standarui init writes
sidebar:
  order: 2
---

## Requirements

- Node >= 20, or bun.
- React 19.
- TypeScript with `lib` es2023 or later. The copied code calls `findLast`, and `init` warns when your `tsconfig.json` targets less.
- `@standarx/nav` `^0.4.1`. `init` adds it to your `package.json`.

## Run the CLI

Without installing it:

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

Or as a development dependency, then call the `standarui` binary:

```sh
bun add -d @standarx/ui
npm install --save-dev @standarx/ui
```

The CLI reads the registry of its own release from GitHub (`https://raw.githubusercontent.com/miralabs-tech/standarui/v<version>/registry`), so a given CLI version always copies the code it was released with.

## What init does

`init` writes `standarui.json`, which says where each layer lives and how it is imported, then copies three items: `nav`, `core-base` and `react-base`.

```json
{
  "dirs": { "core": "src/standarui/core", "react": "src/standarui/react" },
  "aliases": { "core": "@/standarui/core", "react": "@/standarui/react" }
}
```

- The files go to `src/standarui/core` and `src/standarui/react`, imported through `@/standarui/core` and `@/standarui/react`.
- If your `tsconfig.json` does not resolve these aliases, `init` prints the `paths` line to add under `compilerOptions`.
- It adds `@standarx/nav`, `react` and `react-dom` to your `package.json` and runs your package manager, unless you pass `--no-install`.
- An existing `standarui.json` is kept.

Then copy components:

```sh
standarui add select dialog
```

```tsx
import { StandaruiNavProvider } from "@/standarui/react";
import { Select } from "@/standarui/react/components/select";
```

`StandaruiNavProvider` goes once at the root of the app: the components take their intents from it.
