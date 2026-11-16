---
title: CLI
description: add, diff et update, et les fichiers que la CLI garde dans votre dépôt
sidebar:
  order: 3
---

## Commandes

```sh
standarui add select dialog
standarui diff
standarui update
standarui update --write
```

Chaque commande sort avec 0 en cas de succès et 1 en cas d'erreur. `update` sort aussi avec 1 s'il reste des conflits ou si le typecheck après écriture échoue.

## add

`standarui add <item...>` copie les items et ceux dont ils dépendent (`dialog` apporte `alert-dialog`). Au moins un nom est requis.

- `--overwrite` : remplace les fichiers et items déjà présents.
- `--registry <source>` : URL de base ou dossier de registre local remplaçant `@standarui`.
- `--no-install` : ne lance pas le gestionnaire de paquets.

Un nom nu (`select`) est un item de `@standarui`. `@acme/fancy-button` est l'item `fancy-button` du registre `@acme` déclaré dans `standarui.json` : voir [Registres](registries.md).

## diff

`standarui diff [item...]` montre vos modifications, les changements du registre depuis votre copie et les changements d'API. Sans nom, il couvre tous les items installés. Il a besoin de git.

- `--registry <source>` : URL de base ou dossier de registre local remplaçant `@standarui`.

## update

`standarui update [item...]` planifie une fusion à trois voies entre vos fichiers, la base que vous avez copiée et le registre, avec `git merge-file`. Il a besoin de git. Sans `--write`, rien n'est écrit.

- `--write` : sauvegarde d'abord, fusionne, écrit des marqueurs de conflit quand la fusion n'est pas propre, avance la base.
- `--no-typecheck` : ne lance pas le typecheck de l'app après l'écriture.
- `--no-install` : ne lance pas le gestionnaire de paquets.
- `--registry <source>` : URL de base ou dossier de registre local remplaçant `@standarui`.

## Fichiers conservés

- `standarui.lock.json` : chaque item copié, sa source et sa version, et le sha256 de chaque fichier tel qu'écrit.
- `.standarui/base/` : une copie intacte de chaque fichier écrit, base d'une mise à jour ultérieure, avec les `manifest.json` et `renames.json` enregistrés.
- `.standarui/backup/` : créé par `update --write`, un dossier horodaté avec les fichiers sur le point d'être modifiés et l'ancien lockfile.

`diff` compare votre fichier à sa base (vos modifications) et le registre à la base (ses changements). `update` fusionne les trois.

## Changements d'API

Le registre publie un manifeste de l'API publique de chaque composant et une liste de renommages. `diff` et `update` comparent le manifeste enregistré à la copie avec le manifeste actuel, et signalent un renommage plutôt qu'une suppression suivie d'un ajout.
