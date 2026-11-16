---
title: Registries
description: Declare third-party registries by namespace and what the CLI checks
sidebar:
  order: 4
---

## Declare a registry

`@standarui` is built in. A name without a namespace targets it. Other registries are declared by namespace in `standarui.json`:

```json
{
  "registries": {
    "@acme": {
      "url": "https://registry.acme.test/r/{name}.json",
      "index": "https://registry.acme.test/index.json",
      "headers": { "Authorization": "Bearer ${ACME_TOKEN}" }
    }
  }
}
```

- `url`: contains `{name}`, or is a base folder or URL with `index.json` and `items/<name>.json`.
- `index`: optional; a URL, a folder or a file.
- `headers`: optional. `${VAR}` is read from the environment when the command runs. The value is never written to a file, and is sent only to the URLs of this registry.

If a variable is missing the command fails and names it, before any request.

## Install from it

```sh
standarui add @acme/fancy-button
```

`--registry <url|folder>` replaces `@standarui` for one command.

## Security

- The sha256 of every file is checked against its content before anything is written.
- A path that is absolute or contains `..` is refused, so a registry cannot write outside your `dirs` folders.
- The CLI never runs a script that comes from a registry. It writes files, updates `package.json` dependencies and, unless `--no-install`, runs your package manager.
- Header values stay in the environment: they are not stored and not printed in errors.

## Item format

An item is one JSON file with `name`, `type`, `version`, optional `dependencies` and `registryDependencies`, and `files[]` (`layer`, `path`, `sha256`, `content`). The full format, the index and how to serve a registry are in [docs/registry.md](https://github.com/miralabs-tech/standarui/blob/main/docs/registry.md).
