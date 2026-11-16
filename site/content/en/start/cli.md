---
title: CLI
description: add, diff and update, and the files the CLI keeps in your repository
sidebar:
  order: 3
---

## Commands

```sh
standarui add select dialog
standarui diff
standarui update
standarui update --write
```

Every command exits 0 on success and 1 on an error. `update` also exits 1 when files still have conflicts or when the typecheck after writing fails.

## add

`standarui add <item...>` copies the items and the items they depend on (`dialog` brings `alert-dialog`). At least one name is required.

- `--overwrite`: replace files and items already present.
- `--registry <source>`: base URL or local registry folder replacing `@standarui`.
- `--no-install`: do not run the package manager.

A bare name (`select`) is an item of `@standarui`. `@acme/fancy-button` is the item `fancy-button` of the `@acme` registry declared in `standarui.json`: see [Registries](registries.md).

## diff

`standarui diff [item...]` shows your edits, the registry's changes since you copied, and the API changes. Without a name it covers every installed item. It needs git.

- `--registry <source>`: base URL or local registry folder replacing `@standarui`.

## update

`standarui update [item...]` plans a three-way merge of your files, the base you copied and the registry, with `git merge-file`. It needs git. Without `--write` nothing is written.

- `--write`: back up first, merge, write conflict markers where the merge is not clean, move the base forward.
- `--no-typecheck`: do not run the app's typecheck after writing.
- `--no-install`: do not run the package manager.
- `--registry <source>`: base URL or local registry folder replacing `@standarui`.

## Files it keeps

- `standarui.lock.json`: every copied item, its source and version, and the sha256 of each file as written.
- `.standarui/base/`: a pristine copy of each written file, the base of a later update, plus the saved `manifest.json` and `renames.json`.
- `.standarui/backup/`: created by `update --write`, one timestamped folder with the files it was about to change and the previous lockfile.

`diff` compares your file with its base (your edits) and the registry with the base (its changes). `update` merges the three.

## API changes

The registry publishes a manifest of the public API of each component and a list of renames. `diff` and `update` compare the manifest saved when you copied with the current one, and report a rename instead of a removal plus an addition.
