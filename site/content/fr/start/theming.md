---
title: Thèmes
description: Styler les parties headless avec les attributs data et les variables --sui-*, avec thèmes et densités sur n'importe quel sous-arbre
sidebar:
  order: 5
---

standarui ne fournit aucun style. Chaque partie rend son élément avec des attributs que votre feuille de style sélectionne, et le moteur écrit quelques propriétés personnalisées que votre CSS lit.

## Sélectionner une partie

Chaque partie porte `data-scope` (le composant) et `data-part`. `data-part` est une liste de jetons de la forme `<scope>:<partie>`, la partie en kebab-case : on la sélectionne avec `~=` :

```css
[data-part~="dialog:close-trigger"] {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}
```

Le tableau d'anatomie de chaque page de composant liste tous les sélecteurs (par exemple `ButtonAnatomy` : `[data-part~="button:root"]`, `[data-part~="button:loading-indicator"]`).

## Attributs d'état

Les parties exposent leur état par des attributs, jamais par des noms de classe. Les plus courants :

- `data-state` : `open` / `closed` sur les surcouches et les panneaux d'accordéon, `checked` / `unchecked` sur les switchs et les items de select, `active` / `inactive` sur les onglets.
- `data-disabled`, `data-readonly`, `data-invalid`, `data-loading`, `data-pressed`, `data-dragging`, `data-highlighted` : présents (valeur vide) quand c'est vrai, absents sinon.
- `data-orientation` : `horizontal` ou `vertical`.
- `data-focus-visible` : présent quand le focus vient du clavier, pour que l'anneau ne s'affiche pas après un clic.

Un attribut booléen se cible par `[data-disabled]`, un attribut à valeur par `[data-state="open"]`. Les attributs posés dépendent du composant.

## Variables écrites par le moteur

Certaines valeurs, seul le moteur les connaît : la hauteur d'un panneau qui se replie, la largeur de l'ancre d'un select, la position d'un curseur de slider. Le moteur les écrit en propriétés personnalisées `--sui-*` sur la partie, et votre CSS les lit. Le tableau `<X>CssVars` d'une page de composant les liste, dans le groupe `written` (voir la page [Accordion](../components/accordion.md), dont le contenu écrit `--sui-collapse-height`).

```css
[data-part~="accordion:content"][data-state="open"] {
  animation: expand 200ms ease-out;
}

@keyframes expand {
  from {
    height: 0;
  }
  to {
    height: var(--sui-collapse-height);
  }
}
```

Ne les définissez pas vous-même : le moteur les réécrit. Les autres noms `--sui-*` de votre feuille (couleurs, rayons, espacements) sont les vôtres : le moteur ne les lit ni ne les écrit.

## Thèmes et densités

`data-sui-theme` et `data-sui-density` peuvent se poser sur n'importe quel élément et valent pour son sous-arbre.

- **`data-sui-theme`** est une convention pour votre feuille de style. Le moteur ne le lit jamais : `[data-sui-theme="dark"]` est un sélecteur que vous écrivez pour surcharger vos jetons (la valeur `dark` est à votre choix).
- **`data-sui-density`** est lu par le moteur, avec deux valeurs : `desktop` et `touch`. Il décide des bascules de présentation (un menu qui s'ouvre au survol ou seulement au toucher, un select qui devient une feuille), résolu depuis l'ancêtre le plus proche qui porte l'attribut, puis depuis `(pointer: coarse)` s'il n'y en a pas ou si la valeur est autre. Toute autre valeur, comme `compact` ci-dessous, est ignorée par le moteur et laissée à votre CSS.

```html
<section data-sui-theme="dark" data-sui-density="touch">...</section>
```

## Exemple : le thème des démos

Les démos de ce site utilisent une petite feuille de style, `site/demo.css` dans le dépôt. C'est le thème du site de docs, pas une partie de la bibliothèque. Elle déclare des jetons sur `:root`, une variante sombre et une densité compacte, puis style chaque partie :

```css
:root {
  --sui-color-bg: #ffffff;
  --sui-color-accent: #1f4fd8;
  --sui-space-2: 0.5rem;
  --sui-control-height: 2.25rem;
}

[data-sui-theme="dark"] {
  --sui-color-bg: #0f131a;
  --sui-color-accent: #5b86f5;
}

[data-sui-density="compact"] {
  --sui-space-2: 0.375rem;
  --sui-control-height: 1.875rem;
}

[data-part~="button:root"] {
  min-height: var(--sui-control-height);
  padding: 0 var(--sui-space-2);
  background: var(--sui-color-accent);
}

[data-part~="select:content"] {
  min-width: var(--sui-anchor-width);
}
```
