# Registries

standarui copies source files into your app from a registry: a set of JSON
items, each carrying the files it installs. This page describes the format, so
you can publish your own registry, and what the CLI does with one.

- [Item format](#item-format)
- [Index](#index)
- [Dependency names](#dependency-names)
- [Build and serve your own registry](#build-and-serve-your-own-registry)
- [Declare a source](#declare-a-source)
- [Lockfile and bases](#lockfile-and-bases)
- [Security notes](#security-notes)

## Item format

An item is one JSON file. The shape is described by
[`registry/schema.json`](../registry/schema.json).

| Field                  | Meaning                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `name`                 | Lowercase letters, digits and `-`, starting with a letter.                  |
| `type`                 | `registry:base`, `registry:nav` or `registry:component`.                    |
| `version`              | Free text; recorded in the lockfile.                                        |
| `description`          | Optional.                                                                   |
| `dependencies`         | Optional map of npm package to range, added to the app's `package.json`.    |
| `registryDependencies` | Items to install first (see [Dependency names](#dependency-names)).         |
| `files[]`              | The files to write: `layer`, `path`, `sha256`, `content`.                   |

Each entry of `files[]`:

- `layer`: `core` or `react`.
- `path`: a relative path inside the layer, with `/` separators.
- `sha256`: the hex SHA-256 of `content`, which must use LF line endings.
- `content`: the file text.

There is no `target` field. The CLI computes it as `dirs.<layer>/<path>`, where
`dirs` comes from the app's `standarui.json`.

```json
{
  "$schema": "https://github.com/miralabs-tech/standarui/registry/schema.json",
  "name": "fancy-button",
  "type": "registry:component",
  "version": "1.0.0",
  "registryDependencies": ["button"],
  "files": [
    {
      "layer": "react",
      "path": "components/fancy-button/fancy-button.tsx",
      "sha256": "<hex sha256 of content>",
      "content": "import { Button } from \"@standarui/react/button\";\n\nexport const FancyButton = Button;\n"
    }
  ]
}
```

## Index

`index.json` describes a whole registry. The `@standarui` registry always has
one; a third-party registry needs one only if its files import `@standarui/...`
specifiers (the CLI reads the index of `@standarui`, not yours, to resolve
them) or if it wants `update` to report API changes.

- `specifiers`: a map from a published import specifier, such as
  `@standarui/core/button`, to the `layer` and `path` of the file that backs it.
  When the CLI copies a file it rewrites each `@standarui/...` import to the
  app's alias for that layer plus the path, for example
  `@standarui/core/button` becomes `@/standarui/core/components/button`. An
  `@standarui/...` specifier missing from the table fails the copy.
- `items`: a summary of every item (`name`, `type`, `registryDependencies`,
  number of files).
- `manifest` and `renames`: names of two sibling files. `manifest` describes the
  public API of each component; `renames` lists components or parts that were
  renamed. `standarui update` compares the manifest saved when you copied with
  the current one, and uses `renames` to report a rename instead of a removal
  plus an addition. A registry that does not publish them gets no API report.

## Dependency names

In `registryDependencies` and in `standarui add`:

- a bare name, `button`, always means the `@standarui` registry, including in
  an item that comes from another registry;
- `@ns/name` means the item `name` in the registry `@ns`, declared in
  `standarui.json`.

An item of your registry that needs another item of your registry writes
`@acme/other`.

## Build and serve your own registry

The layout the CLI expects from a base URL or a folder:

```
registry/
  index.json          optional for a third party, see above
  items/
    fancy-button.json
```

Or any URL that contains `{name}`, such as `https://example.com/r/{name}.json`,
where the item name replaces `{name}`.

Ways to serve it:

- a static folder or static host: `"url": "https://example.com/registry"`, or a
  local path for a registry kept in the same repository;
- a git tag, so a version is pinned:
  `https://raw.githubusercontent.com/<owner>/<repo>/<tag>/registry/items/{name}.json`;
- a server that checks a header before answering, see
  [Declare a source](#declare-a-source).

Computing `sha256`: hash the exact `content` string, with LF line endings.

```ts
import { createHash } from "node:crypto";

const sha256 = createHash("sha256").update(content).digest("hex");
```

Imports a file may use: your own relative imports, packages listed in
`dependencies`, and the `@standarui/...` specifiers present in the
`specifiers` table of the `@standarui` index (for example `@standarui/core` or
`@standarui/react/button`). Other `@standarui/...` imports are refused.

## Declare a source

Add the registry to `standarui.json`:

```json
{
  "dirs": { "core": "src/standarui/core", "react": "src/standarui/react" },
  "aliases": { "core": "@/standarui/core", "react": "@/standarui/react" },
  "registries": {
    "@acme": {
      "url": "https://registry.acme.test/r/{name}.json",
      "index": "https://registry.acme.test/index.json",
      "headers": { "Authorization": "Bearer ${ACME_TOKEN}" }
    }
  }
}
```

- `url`: contains `{name}`, or is a base folder or URL laid out as above.
- `index`: optional; a URL, a folder or a file.
- `headers`: optional. `${VAR}` is read from the environment when the command
  runs. The value is never written to a file, and is sent only to the URLs of
  this registry, never to `@standarui` or to another registry.

If a variable is missing the command fails and names the variable, before any
request. A non-2xx answer fails with the status and the URL, never with a
header value.

Then `standarui add @acme/fancy-button`.

## Lockfile and bases

- `standarui.lock.json`: for each installed item, its `source` registry, its
  `version`, and the SHA-256 of each file as written in your app (after the
  imports were rewritten). A third-party item is keyed `@acme/fancy-button`; an
  item of `@standarui` is keyed by its bare name.
- `.standarui/base/`: a pristine copy of each file as written, plus the saved
  `manifest.json` and `renames.json` of `@standarui`.
- `.standarui/backup/`: created by `update --write`; one timestamped folder with
  the files it was about to change and the previous lockfile.

`standarui diff` compares your files with their base (your edits) and the
registry with the base (its changes), and reports API changes from the saved
manifest. `standarui update` plans a three-way merge of the same three versions;
with `--write` it backs up first, merges, writes conflict markers where the
merge is not clean, and moves the base forward.

## Security notes

- Paths are confined. A `files[].path` that is absolute, has a drive letter, or
  contains `..` is refused, so a registry cannot write outside the `dirs`
  folders.
- The `sha256` of every file is checked against its `content`; an item that does
  not match is refused before anything is written.
- The CLI never runs a script that comes from a registry. It writes files,
  updates `package.json` dependencies and, unless `--no-install`, runs your
  package manager.
- Header values stay in the environment: they are not stored, and they are not
  printed in errors.
