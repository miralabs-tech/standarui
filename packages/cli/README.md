# standarui

[![CI](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml/badge.svg)](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@standarx/ui)](https://www.npmjs.com/package/@standarx/ui) [![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/miralabs-tech/standarui/blob/main/LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

> "The command line of standarui: copies headless components into your app, rewrites their imports to your aliases, and records what it copied."

📖 English · [Français](https://github.com/miralabs-tech/standarui/blob/main/README.fr.md)

[Quickstart](#-quickstart) · [Install](#-install) · [Commands](#-commands) · [Files it writes](#-files-it-writes) · [Registries](#-registries) · [Limits](#-limits) · [Changelog](https://github.com/miralabs-tech/standarui/blob/main/CHANGELOG.md)

---

## 🧠 What is the standarui CLI?

standarui is a headless UI engine (state machines in TypeScript, focus and ARIA patterns, a React 19 adapter) built on `@standarx/nav`. Its code is not installed from npm: this CLI copies it into your app, rewrites its imports to your aliases, and records every file with its sha256. The files then belong to your app, and `standarui update` merges the registry's later changes into your edits. Only this CLI is published on npm. The project is described in the [main README](https://github.com/miralabs-tech/standarui/blob/main/README.md).

**Status: 0.1.0.**

---

## 🚀 Quickstart

```sh
standarui init
standarui add select dialog
standarui diff
standarui update --write
```

`init` writes `standarui.json`, then copies `nav`, `core-base` and `react-base` into `src/standarui/core` and `src/standarui/react`. If your `tsconfig.json` does not resolve the aliases, it prints the `paths` line to add. `add` then copies the items and the items they depend on, and the components are imported from your tree:

```tsx
import { Select } from "@/standarui/react/components/select";
```

---

## 📦 Install

Node >= 20, or bun. Run it without installing:

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

Or as a development dependency:

```sh
bun add -d @standarx/ui
npm install --save-dev @standarx/ui
```

The components need React 19 and `@standarx/nav` `^0.4.1`, which `init` adds to your `package.json`.

---

## 🧰 Commands

Every command exits 0 when it succeeded and 1 on an error. `update` also exits 1 when files still have conflicts or when the typecheck after writing fails. `standarui` with no command prints the help and exits 1; `--help` and `--version` exit 0.

### `standarui init`

Writes `standarui.json` (an existing one is kept), then adds `nav`, `core-base` and `react-base`.

| Option | Meaning |
| --- | --- |
| `--core-dir <dir>` | Where the core layer is written (default `src/standarui/core`) |
| `--react-dir <dir>` | Where the react layer is written (default `src/standarui/react`) |
| `--core-alias <alias>` | Import alias of the core layer (default `@/standarui/core`) |
| `--react-alias <alias>` | Import alias of the react layer (default `@/standarui/react`) |
| `--registry <source>` | Base URL or local registry folder replacing `@standarui` |
| `--no-install` | Do not run the package manager |
| `--yes` | Accepted for scripts; `init` never prompts, so it changes nothing |

### `standarui add <item...>`

Copies the items, and the items they depend on, into the app. At least one name is required.

| Option | Meaning |
| --- | --- |
| `--registry <source>` | Base URL or local registry folder replacing `@standarui` |
| `--overwrite` | Replace files and items already present |
| `--no-install` | Do not run the package manager |

A bare name (`select`) is an item of `@standarui`; `@acme/fancy-button` is the item `fancy-button` of the `@acme` registry declared in `standarui.json`.

### `standarui diff [item...]`

Shows your edits, the registry's changes since you copied, and the API changes read from the saved manifest. Without a name it covers every installed item. It needs git.

| Option | Meaning |
| --- | --- |
| `--registry <source>` | Base URL or local registry folder replacing `@standarui` |

### `standarui update [item...]`

Plans a three-way merge of your files, the base you copied and the registry, with `git merge-file`. Without `--write` it writes nothing.

| Option | Meaning |
| --- | --- |
| `--registry <source>` | Base URL or local registry folder replacing `@standarui` |
| `--write` | Apply the plan: back up first, merge, write conflict markers where the merge is not clean, move the base forward |
| `--no-install` | Do not run the package manager |
| `--no-typecheck` | Do not run the app's typecheck after writing |

---

## 📁 Files it writes

- `standarui.json`: where each layer lives (`dirs`), how it is imported (`aliases`) and the extra registries (`registries`). Header values may use `${VAR}`, read from the environment and never written to a file.
- `standarui.lock.json`: every copied item, its source and version, and the sha256 of each file as written.
- `.standarui/base/`: a pristine copy of each written file, the base of a later update, plus the saved `manifest.json` and `renames.json`.
- `.standarui/backup/`: created by `update --write`, one timestamped folder with the files it was about to change and the previous lockfile.
- The copied sources, under `dirs.core` and `dirs.react`, and the dependencies added to your `package.json`.

---

## 🌐 Registries

`@standarui` is built in and reads the registry of the matching release on GitHub (`https://raw.githubusercontent.com/miralabs-tech/standarui/v<version>/registry`). A name without a namespace targets it; `@acme/x` targets the `@acme` registry declared in `standarui.json`:

```json
{
  "registries": {
    "@acme": {
      "url": "https://registry.acme.test/r/{name}.json",
      "headers": { "Authorization": "Bearer ${ACME_TOKEN}" }
    }
  }
}
```

`--registry <url|folder>` replaces `@standarui` for one command: pass the base URL or a local folder laid out like `registry/` (`index.json` and `items/<name>.json`). The sha256 of every file is checked against its content before anything is written.

The registry format, third-party registries and headers are documented in [docs/registry.md](https://github.com/miralabs-tech/standarui/blob/main/docs/registry.md).

---

## 🚧 Limits

- `diff` and `update` need git on the `PATH`.
- A copied file you edit is no longer covered by the tests of the standarui repository.
- No style is provided; `@standarx/nav` stays an npm dependency of your app.

---

## 📜 License

[MIT](https://github.com/miralabs-tech/standarui/blob/main/LICENSE) - Copyright (c) 2026 miralabs.tech.
