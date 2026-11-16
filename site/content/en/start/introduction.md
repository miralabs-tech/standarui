---
title: Introduction
description: A headless UI engine in TypeScript with a React 19 adapter, copied into your app by a CLI
---

standarui is a headless UI engine: state machines written in TypeScript, focus management and the ARIA patterns of the WAI-ARIA Authoring Practices Guide, built on `@standarx/nav` for input intents (keyboard, pointer, gamepad). A React 19 adapter turns each machine into part components (`SelectTrigger`, `DialogContent`, ...) and into a composed form (`<Select options={...}/>`) that renders exactly the same parts.

The code is not installed from npm. The `standarui` CLI copies it into your app, rewrites its imports to your aliases and records what it copied, the way shadcn does. From then on the files are yours: you edit them, and `standarui update` merges later changes of the registry into your edits. Only the CLI is published on npm; `core` and `react` are not.

## Next

- [Installation](installation.md)
- [CLI](cli.md)
- [Registries](registries.md)
- [Theming](theming.md)
- [Limits](limits.md)
