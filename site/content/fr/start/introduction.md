---
title: Introduction
description: Un moteur d'UI headless en TypeScript avec un adaptateur React 19, copié dans votre app par une CLI
sidebar:
  order: 1
---

standarui est un moteur d'UI headless : des machines à états écrites en TypeScript, la gestion du focus et les motifs ARIA de l'APG (WAI-ARIA Authoring Practices Guide), posés sur `@standarx/nav` pour les intentions d'entrée (clavier, pointeur, manette). Un adaptateur React 19 transforme chaque machine en composants de parties (`SelectTrigger`, `DialogContent`, ...) et en une forme composée (`<Select options={...}/>`) qui rend exactement les mêmes parties.

Le code ne s'installe pas depuis npm. La CLI `standarui` le copie dans votre app, réécrit ses imports vers vos alias et note ce qu'elle a copié, à la manière de shadcn. Les fichiers deviennent les vôtres : vous les modifiez, et `standarui update` fusionne les changements ultérieurs du registre avec vos modifications. Seule la CLI est publiée sur npm ; `core` et `react` ne le sont pas.

## Suite

- [Installation](installation.md)
- [CLI](cli.md)
- [Registres](registries.md)
- [Thèmes](theming.md)
- [Limites](limits.md)
