# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-17

### Added

- Styles layer in the registry and the CLI: `files[].layer: "styles"`, an optional `dirs.styles` that defaults to `src/standarui/styles`, `standarui init --styles-dir`, and `standarui add` prints the paths of the styles it copied.
- The `shared.react-base` channels `--sui-virtual-size` and `--sui-virtual-start` in `registry/manifest.json`.
- Anatomy and CSS variable tables in the API reference.
- `standarui init` warns when the app's TypeScript `lib` is below `es2023`.
- Docs site in English and French on GitHub Pages: <https://miralabs-tech.github.io/standarui/>.

### Changed

- `registry/schema.json` accepts `@ns/name` in `registryDependencies` and items with no files (aliases), as [docs/registry.md](./docs/registry.md) already said; the CLI already accepted both.

## [0.1.0] - 2026-11-16

First release. Only the CLI is published, as `@standarx/ui` (its command is `standarui`); core and react are copied by it.

### Added

- Headless engine and React 19 adapter: 43 components (accordion, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, checkbox, checkbox-group, clipboard, collapsible, color-picker, date-field, date-picker, dialog, drawer, empty-state, field, input, link, list, listbox, menu, meter, pagination, popover, progress, radio-group, scroll-area, search-field, select, separator, sidebar, slider, splitter, switch, tabs, toast, toggle, toggle-group, toolbar, tooltip), each as part components and, where it has one, a composed form.
- The `nav` facade over `@standarx/nav`, and `StandaruiNavProvider` for the root of the app. `@standarx/nav` is a peer dependency, `^0.4.1`.
- The registry (`registry/index.json`, one JSON item per component, its manifest and renames) and the generator that builds it (`bun run registry:build`).
- `standarui init`: writes `standarui.json`, then copies `nav`, `core-base` and `react-base`.
- `standarui add <item...>`: copies items and their dependencies, rewrites imports to the app's aliases, and records each file's sha256 in `standarui.lock.json`.
- `standarui diff [item...]`: shows your edits and the registry's changes since you copied, and reports API changes read from the manifest.
- `standarui update [item...]`: plans a three-way merge with `git merge-file`; with `--write` it backs up, merges and writes conflict markers where the merge is not clean.
- Third-party registries by namespace, with headers that read `${VAR}` from the environment and are sent only to their own registry.
- [docs/registry.md](./docs/registry.md): the registry format, how to declare or publish a third-party registry, the lockfile and the security notes.

[Unreleased]: https://github.com/miralabs-tech/standarui/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/miralabs-tech/standarui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/miralabs-tech/standarui/releases/tag/v0.1.0
