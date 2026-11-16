---
title: Registres
description: Déclarer des registres tiers par espace de noms, et ce que la CLI vérifie
---

## Déclarer un registre

`@standarui` est intégré. Un nom sans espace de noms le vise. Les autres registres se déclarent par espace de noms dans `standarui.json` :

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

- `url` : contient `{name}`, ou est un dossier ou une URL de base avec `index.json` et `items/<name>.json`.
- `index` : facultatif ; une URL, un dossier ou un fichier.
- `headers` : facultatif. `${VAR}` est lu dans l'environnement à l'exécution de la commande. La valeur n'est jamais écrite dans un fichier et n'est envoyée qu'aux URL de ce registre.

Si une variable manque, la commande échoue en la nommant, avant toute requête.

## Installer depuis un registre

```sh
standarui add @acme/fancy-button
```

`--registry <url|dossier>` remplace `@standarui` pour une seule commande.

## Sécurité

- Le sha256 de chaque fichier est vérifié contre son contenu avant toute écriture.
- Un chemin absolu ou contenant `..` est refusé : un registre ne peut pas écrire hors de vos dossiers `dirs`.
- La CLI n'exécute jamais un script venant d'un registre. Elle écrit des fichiers, met à jour les dépendances de `package.json` et, sauf avec `--no-install`, lance votre gestionnaire de paquets.
- Les valeurs d'en-tête restent dans l'environnement : elles ne sont ni stockées ni affichées dans les erreurs.

## Format d'un item

Un item est un fichier JSON avec `name`, `type`, `version`, des `dependencies` et `registryDependencies` facultatives, et `files[]` (`layer`, `path`, `sha256`, `content`). Le format complet, l'index et la manière de servir un registre sont dans [docs/registry.md](https://github.com/miralabs-tech/standarui/blob/main/docs/registry.md) (en anglais).
