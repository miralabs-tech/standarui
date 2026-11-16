# standarui

Command line for standarui: copies components into your app, rewrites their imports to your aliases, and records what it copied.

```sh
standarui init
standarui add select dialog
```

## Commands

- `standarui init`: writes `standarui.json`, then adds `nav`, `core-base` and `react-base`. Options: `--core-dir`, `--react-dir`, `--core-alias`, `--react-alias`, `--registry`, `--no-install`, `--yes`.
- `standarui add <item...>`: copies the items and the items they depend on. Options: `--registry`, `--overwrite`, `--no-install`.
- `standarui diff [item...]`: shows your edits and the registry's changes since you copied. Options: `--registry`.
- `standarui update [item...]`: plans a merge of the registry's changes; with `--write` it applies it after a backup. Options: `--registry`, `--write`, `--no-install`, `--no-typecheck`.

## Files it writes

- `standarui.json`: where each layer lives (`dirs`), how it is imported (`aliases`), and extra registries (`registries`). Header values may use `${VAR}`, read from the environment and never written to a file.
- `standarui.lock.json`: every copied item and the sha256 of each file as written.
- `.standarui/base/`: a pristine copy of each written file, the base of a later update.

## Registries

`@standarui` is built in and reads the registry of the matching release on GitHub. A name without a namespace targets it; `@acme/x` targets the `@acme` registry declared in `standarui.json`. `--registry <url|folder>` replaces `@standarui` for one command: pass the base URL or a local folder laid out like `registry/` (`index.json` and `items/<name>.json`).

The registry format, third-party registries and headers are documented in [docs/registry.md](https://github.com/miralabs-tech/standarui/blob/main/docs/registry.md).

Node 20 or later. MIT © miralabs.tech
