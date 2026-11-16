---
title: Limites
description: Ce que la copie du code implique pour les tests, git, nav, les styles et l'accessibilité
sidebar:
  order: 6
---

## Limites

- **Une copie modifiée sort de la couverture des tests de ce dépôt.** Les contrôles de parité, d'axe et de budget de taille tournent sur les sources du dépôt standarui, pas sur vos fichiers modifiés. `update` fusionne vos modifications, il ne les teste pas.
- **`diff` et `update` ont besoin de git**, pour la fusion (`git merge-file`) et le diff. Sans git dans le `PATH`, ils s'arrêtent avec une erreur.
- **`@standarx/nav` reste une dépendance npm.** Il porte un état par document (le suivi de modalité d'entrée et le contexte `NavProvider`) : une seconde copie le casserait.
- **Aucun style n'est fourni.** Vous écrivez le CSS qui lit les attributs `data-scope` et `data-part` et les propriétés `--sui-*`.
- **`--yes` est sans effet.** `init` ne pose jamais de question ; le drapeau est accepté pour que les scripts puissent le passer.

## Accessibilité

Les composants suivent les motifs de l'APG (WAI-ARIA Authoring Practices Guide), et les tests du dépôt font tourner axe dessus. L'anneau de focus et les attributs `data-snav-*` appartiennent à `@standarx/nav` et ne sont pas copiés : voir son [anneau de focus](https://github.com/StandarX-miralabs-tech/standarnav/blob/main/docs/en/focus-ring.md) (six propriétés `--snav-focus-ring-*`) et ses [attributs](https://github.com/StandarX-miralabs-tech/standarnav/blob/main/docs/en/attributes.md).
