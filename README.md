# standarui

[![CI](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml/badge.svg)](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@standarx/ui)](https://www.npmjs.com/package/@standarx/ui) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

> "A headless UI engine in TypeScript with a React 19 adapter, copied into your app by a CLI instead of installed."

📖 English · [Français](./README.fr.md)

[Quickstart](#-quickstart) · [Install](#-install) · [Features](#-features) · [Limits](#-limits) · [Registries](./docs/registry.md) · [API reference](./packages/react/api) · [Changelog](./CHANGELOG.md)

---

## 🧠 What is standarui?

standarui is a headless UI engine: state machines written in TypeScript, focus management and the ARIA patterns of the WAI-ARIA Authoring Practices Guide, built on [`@standarx/nav`](https://www.npmjs.com/package/@standarx/nav) for input intents (keyboard, pointer, gamepad). A React 19 adapter turns each machine into part components (`SelectTrigger`, `DialogContent`, ...) and into a composed form (`<Select options={...}/>`) that renders exactly the same parts.

The code is not installed from npm. The `standarui` CLI copies it into your app, rewrites its imports to your aliases and records what it copied, the way shadcn does. From then on the files are yours: you edit them, and `standarui update` merges later changes of the registry into your edits. Only the CLI is published on npm; `core` and `react` are not.

**Status: 0.1.0.**

---

## 🚀 Quickstart

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

`init` writes `standarui.json` (where each layer lives and how it is imported), then copies three items: `nav`, `core-base` and `react-base`. By default the files go to `src/standarui/core` and `src/standarui/react`, imported through `@/standarui/core` and `@/standarui/react`. If your `tsconfig.json` does not resolve these aliases, `init` prints the `paths` line to add under `compilerOptions`. It also adds `@standarx/nav`, `react` and `react-dom` to your `package.json` and runs your package manager, unless you pass `--no-install`.

```sh
standarui add select dialog
```

`add` copies the items and the items they depend on (`dialog` brings `alert-dialog`), and records each file with its sha256 in `standarui.lock.json`. The components are then imported from your own tree:

```tsx
import { StandaruiNavProvider } from "@/standarui/react";
import { Dialog } from "@/standarui/react/components/dialog";
import { Select } from "@/standarui/react/components/select";

export function App() {
  return (
    <StandaruiNavProvider>
      <Select
        id="sort"
        label="Sort by"
        defaultValue="name"
        onValueChange={({ value }) => console.log(value)}
        options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
        ]}
      />
      <Dialog
        id="export"
        trigger={<button type="button">Export</button>}
        title="Export settings"
        description="Choose a format for the export."
        closeLabel="Close"
        actions={[
          { label: "Export", onPress: () => console.log("export") },
          { label: "Cancel", cancel: true },
        ]}
      >
        <p>Every file in the selection.</p>
      </Dialog>
    </StandaruiNavProvider>
  );
}
```

`StandaruiNavProvider` goes once at the root of the app: the components take their intents from it. The composed `<Select/>` and `<Dialog/>` render the same markup as the parts they are made of (`SelectRoot`, `SelectTrigger`, `DialogRoot`, `DialogContent`, ...), so you can drop to the parts when you need a different layout. The components ship no styles: they expose `data-scope`, `data-part` and `--sui-*` custom properties for your stylesheet.

Keep your copies up to date:

```sh
standarui diff                 # your edits, and what the registry changed since you copied
standarui diff select          # the same, for one item
standarui update               # plan a three-way merge, nothing is written
standarui update --write       # back up, merge, write conflict markers where the merge is not clean
```

---

## 📦 Install

Requirements: Node >= 20 or bun, React 19, and `@standarx/nav` `^0.4.1` (`init` adds it to your `package.json`).

Run the CLI without installing it:

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

Or add it as a development dependency, then call the `standarui` binary:

```sh
bun add -d @standarx/ui
npm install --save-dev @standarx/ui
```

The CLI reads the registry of its own release from GitHub (`https://raw.githubusercontent.com/miralabs-tech/standarui/v<version>/registry`), so a given CLI version always copies the code it was released with.

---

## ✨ Features

- **43 components**: accordion, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, checkbox, checkbox-group, clipboard, collapsible, color-picker, date-field, date-picker, dialog, drawer, empty-state, field, input, link, list, listbox, menu, meter, pagination, popover, progress, radio-group, scroll-area, search-field, select, separator, sidebar, slider, splitter, switch, tabs, toast, toggle, toggle-group, toolbar and tooltip.
- **Headless**: no style is shipped. Parts carry `data-scope` and `data-part` attributes and read `--sui-*` custom properties; light, dark and densities follow `data-sui-theme` and `data-sui-density` on any subtree.
- **Third-party registries**: `standarui.json` can declare registries by namespace (`@acme`), each with a `url`, an optional `index` and `headers`. A header value such as `Bearer ${ACME_TOKEN}` reads the variable from the environment, is never written to a file and is sent only to the URLs of its own registry. `standarui add @acme/fancy-button` installs from it. See [docs/registry.md](./docs/registry.md).
- **Lockfile and bases**: `standarui.lock.json` records each item, its source and the sha256 of each file as written; `.standarui/base/` keeps a pristine copy of each file. `diff` compares your file with its base (your edits) and the registry with the base (its changes), and `update` merges the three with `git merge-file`.
- **API changes**: the registry publishes a manifest of the public API of each component and a list of renames. `diff` and `update` compare the manifest saved when you copied with the current one, and report a rename instead of a removal plus an addition.
- **Checked content**: the sha256 of every file is verified against its content before anything is written, and a path that is absolute or contains `..` is refused. The CLI never runs a script that comes from a registry.

---

## 🚧 Limits

- **A modified copy leaves the coverage of this repository's tests.** The parity, axe and size-budget checks run on the sources here, not on your edited files; `update` merges your edits, it does not test them.
- **`diff` and `update` need git**, for the merge (`git merge-file`) and the diff. Without git on the `PATH` they stop with an error.
- **`@standarx/nav` stays an npm dependency.** It carries one state per document (the input modality tracker and the `NavProvider` context), so a second copy would break it.
- **No style is provided.** You write the CSS that reads the `data-*` attributes and the `--sui-*` properties.
- **`--yes` has no effect.** `init` never prompts; the flag is accepted so that scripts can pass it.

---

## 📚 Documentation

- [Registries: item format, index, third-party sources, lockfile](./docs/registry.md)
- [CLI reference](./packages/cli/README.md)
- [React adapter](./packages/react/README.md)
- [API reference of each component](./packages/react/api) (`bun run docs:api` regenerates it)
- [Changelog](./CHANGELOG.md)

---

## 🛠️ Build & tests

```sh
bun install
bun run lint               # biome
bun run typecheck
bun run test:unit
bun run test:browser
bun run registry:build     # regenerate registry/ from the sources
bun run ci:local           # replays the CI jobs locally
```

Browser tests run on Chromium by default. Pick the engine with `SUI_BROWSER`:

```sh
SUI_BROWSER=firefox bun run test:browser
```

---

## 🤝 Contributing

Issues and pull requests are welcome at [github.com/miralabs-tech/standarui](https://github.com/miralabs-tech/standarui). Run lint, typecheck and the tests (`bun run ci:local`) before opening a pull request.

---

## ❤️ Support

If standarui helps you:

👉 [Star the repo](https://github.com/miralabs-tech/standarui) · [Open an issue](https://github.com/miralabs-tech/standarui/issues)

---

## 📜 License

[MIT](./LICENSE) - Copyright (c) 2026 miralabs.tech.
