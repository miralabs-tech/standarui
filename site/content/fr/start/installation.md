---
title: Installation
description: Prérequis, lancement de la CLI et ce que standarui init écrit
sidebar:
  order: 2
---

## Prérequis

- Node >= 20, ou bun.
- React 19.
- TypeScript avec `lib` es2023 ou plus récent. Le code copié appelle `findLast`, et `init` avertit quand votre `tsconfig.json` vise moins.
- `@standarx/nav` `^0.4.1`. `init` l'ajoute à votre `package.json`.

## Lancer la CLI

Sans l'installer :

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

Ou en dépendance de développement, puis appel du binaire `standarui` :

```sh
bun add -d @standarx/ui
npm install --save-dev @standarx/ui
```

La CLI lit le registre de sa propre version sur GitHub (`https://raw.githubusercontent.com/miralabs-tech/standarui/v<version>/registry`) : une version donnée de la CLI copie donc toujours le code avec lequel elle a été publiée.

## Ce que fait init

`init` écrit `standarui.json`, qui dit où vit chaque couche et comment elle est importée, puis copie trois items : `nav`, `core-base` et `react-base`.

```json
{
  "dirs": { "core": "src/standarui/core", "react": "src/standarui/react" },
  "aliases": { "core": "@/standarui/core", "react": "@/standarui/react" }
}
```

- Les fichiers vont dans `src/standarui/core` et `src/standarui/react`, importés par `@/standarui/core` et `@/standarui/react`.
- Si votre `tsconfig.json` ne résout pas ces alias, `init` affiche la ligne `paths` à ajouter sous `compilerOptions`.
- Elle ajoute `@standarx/nav`, `react` et `react-dom` à votre `package.json` et lance votre gestionnaire de paquets, sauf avec `--no-install`.
- Un `standarui.json` existant est conservé.

Copiez ensuite des composants :

```sh
standarui add select dialog
```

```tsx
import { StandaruiNavProvider } from "@/standarui/react";
import { Select } from "@/standarui/react/components/select";
```

`StandaruiNavProvider` se place une seule fois à la racine de l'app : les composants y prennent leurs intentions.
