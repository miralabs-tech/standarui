# standarui

[![CI](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml/badge.svg)](https://github.com/miralabs-tech/standarui/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@standarx/ui)](https://www.npmjs.com/package/@standarx/ui) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

> "Un moteur d'UI headless en TypeScript avec un adaptateur React 19, copié dans votre app par une CLI au lieu d'être installé."

📖 [English](./README.md) · Français

[Démarrage rapide](#-démarrage-rapide) · [Installation](#-installation) · [Fonctionnalités](#-fonctionnalités) · [Limites](#-limites) · [Registres](./docs/registry.md) · [Référence d'API](./packages/react/api) · [Changelog](./CHANGELOG.md)

---

## 🧠 Qu'est-ce que standarui ?

standarui est un moteur d'UI headless : des machines à états écrites en TypeScript, la gestion du focus et les motifs ARIA de l'APG (WAI-ARIA Authoring Practices Guide), posés sur [`@standarx/nav`](https://www.npmjs.com/package/@standarx/nav) pour les intentions d'entrée (clavier, pointeur, manette). Un adaptateur React 19 transforme chaque machine en composants de parties (`SelectTrigger`, `DialogContent`, ...) et en une forme composée (`<Select options={...}/>`) qui rend exactement les mêmes parties.

Le code ne s'installe pas depuis npm. La CLI `standarui` le copie dans votre app, réécrit ses imports vers vos alias et note ce qu'elle a copié, à la manière de shadcn. Les fichiers deviennent les vôtres : vous les modifiez, et `standarui update` fusionne les changements ultérieurs du registre avec vos modifications. Seule la CLI est publiée sur npm ; `core` et `react` ne le sont pas.

**Statut : 0.1.0.**

---

## 🚀 Démarrage rapide

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

`init` écrit `standarui.json` (où vit chaque couche et comment elle est importée), puis copie trois items : `nav`, `core-base` et `react-base`. Par défaut, les fichiers vont dans `src/standarui/core` et `src/standarui/react`, importés par `@/standarui/core` et `@/standarui/react`. Si votre `tsconfig.json` ne résout pas ces alias, `init` affiche la ligne `paths` à ajouter sous `compilerOptions`. Il ajoute aussi `@standarx/nav`, `react` et `react-dom` à votre `package.json` et lance votre gestionnaire de paquets, sauf avec `--no-install`.

```sh
standarui add select dialog
```

`add` copie les items et ceux dont ils dépendent (`dialog` apporte `alert-dialog`), et enregistre chaque fichier avec son sha256 dans `standarui.lock.json`. Les composants s'importent ensuite depuis votre propre arborescence :

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

`StandaruiNavProvider` se pose une seule fois à la racine de l'app : les composants y prennent leurs intentions. Le `<Select/>` et le `<Dialog/>` composés rendent le même balisage que les parties dont ils sont faits (`SelectRoot`, `SelectTrigger`, `DialogRoot`, `DialogContent`, ...) : vous pouvez descendre aux parties quand il vous faut une autre mise en page. Les composants n'apportent aucun style : ils exposent `data-scope`, `data-part` et des propriétés personnalisées `--sui-*` pour votre feuille de style.

Gardez vos copies à jour :

```sh
standarui diff                 # vos modifications, et ce que le registre a changé depuis votre copie
standarui diff select          # la même chose, pour un seul item
standarui update               # planifie une fusion à trois voies, rien n'est écrit
standarui update --write       # sauvegarde, fusionne, écrit des marqueurs de conflit là où la fusion n'est pas propre
```

---

## 📦 Installation

Prérequis : Node >= 20 ou bun, React 19, et `@standarx/nav` `^0.4.1` (`init` l'ajoute à votre `package.json`).

Lancer la CLI sans l'installer :

```sh
bunx @standarx/ui init
npx @standarx/ui init
```

Ou l'ajouter en devDependency, puis appeler le binaire `standarui` :

```sh
bun add -d @standarx/ui
npm install --save-dev @standarx/ui
```

La CLI lit depuis GitHub le registre de sa propre version (`https://raw.githubusercontent.com/miralabs-tech/standarui/v<version>/registry`) : une version donnée de la CLI copie donc toujours le code avec lequel elle a été publiée.

---

## ✨ Fonctionnalités

- **43 composants** : accordion, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, checkbox, checkbox-group, clipboard, collapsible, color-picker, date-field, date-picker, dialog, drawer, empty-state, field, input, link, list, listbox, menu, meter, pagination, popover, progress, radio-group, scroll-area, search-field, select, separator, sidebar, slider, splitter, switch, tabs, toast, toggle, toggle-group, toolbar et tooltip.
- **Headless** : aucun style n'est fourni. Les parties portent les attributs `data-scope` et `data-part` et lisent des propriétés `--sui-*` ; le clair, le sombre et les densités suivent `data-sui-theme` et `data-sui-density` sur n'importe quel sous-arbre.
- **Registres tiers** : `standarui.json` peut déclarer des registres par espace de nom (`@acme`), chacun avec une `url`, un `index` optionnel et des `headers`. Une valeur d'en-tête comme `Bearer ${ACME_TOKEN}` lit la variable dans l'environnement, n'est jamais écrite dans un fichier et n'est envoyée qu'aux URL de son propre registre. `standarui add @acme/fancy-button` installe depuis lui. Voir [docs/registry.md](./docs/registry.md).
- **Lockfile et bases** : `standarui.lock.json` enregistre chaque item, sa source et le sha256 de chaque fichier tel qu'écrit ; `.standarui/base/` garde une copie intacte de chaque fichier. `diff` compare votre fichier à sa base (vos modifications) et le registre à la base (ses changements), et `update` fusionne les trois avec `git merge-file`.
- **Ruptures d'API** : le registre publie un manifeste de l'API publique de chaque composant et une liste de renommages. `diff` et `update` comparent le manifeste enregistré à votre copie avec le manifeste actuel, et signalent un renommage plutôt qu'une suppression suivie d'un ajout.
- **Contenu vérifié** : le sha256 de chaque fichier est vérifié contre son contenu avant toute écriture, et un chemin absolu ou contenant `..` est refusé. La CLI n'exécute jamais un script venu d'un registre.

---

## 🚧 Limites

- **Une copie modifiée sort de la couverture des tests de ce dépôt.** Les contrôles de parité, d'axe et de budget de taille tournent sur les sources d'ici, pas sur vos fichiers modifiés ; `update` fusionne vos modifications, il ne les teste pas.
- **`diff` et `update` ont besoin de git**, pour la fusion (`git merge-file`) et le diff. Sans git dans le `PATH`, ils s'arrêtent avec une erreur.
- **`@standarx/nav` reste une dépendance npm.** Il porte un état par document (le suivi de la modalité d'entrée et le contexte `NavProvider`) : une seconde copie le casserait.
- **Aucun style n'est fourni.** Vous écrivez le CSS qui lit les attributs `data-*` et les propriétés `--sui-*`.
- **`--yes` n'a aucun effet.** `init` ne pose jamais de question ; le drapeau est accepté pour que des scripts puissent le passer.

---

## 📚 Documentation

- [Registres : format d'un item, index, sources tierces, lockfile](./docs/registry.md)
- [Référence de la CLI](./packages/cli/README.md)
- [Adaptateur React](./packages/react/README.md)
- [Référence d'API de chaque composant](./packages/react/api) (`bun run docs:api` la régénère)
- [Changelog](./CHANGELOG.md)

---

## 🛠️ Build & tests

```sh
bun install
bun run lint               # biome
bun run typecheck
bun run test:unit
bun run test:browser
bun run registry:build     # régénère registry/ depuis les sources
bun run ci:local           # rejoue localement les jobs de la CI
```

Les tests navigateur tournent sur Chromium par défaut. Choisissez le moteur avec `SUI_BROWSER` :

```sh
SUI_BROWSER=firefox bun run test:browser
```

---

## 🤝 Contribuer

Les issues et les pull requests sont les bienvenues sur [github.com/miralabs-tech/standarui](https://github.com/miralabs-tech/standarui). Lancez lint, typecheck et les tests (`bun run ci:local`) avant d'ouvrir une pull request.

---

## ❤️ Soutien

Si standarui vous aide :

👉 [Mettre une étoile](https://github.com/miralabs-tech/standarui) · [Ouvrir une issue](https://github.com/miralabs-tech/standarui/issues)

---

## 📜 Licence

[MIT](./LICENSE) - Copyright (c) 2026 miralabs.tech.
