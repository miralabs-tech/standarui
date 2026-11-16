---
title: Limits
description: What copying the code means for tests, git, nav, styles and accessibility
---

## Limits

- **A modified copy leaves the coverage of this repository's tests.** The parity, axe and size-budget checks run on the sources in the standarui repository, not on your edited files. `update` merges your edits, it does not test them.
- **`diff` and `update` need git**, for the merge (`git merge-file`) and the diff. Without git on the `PATH` they stop with an error.
- **`@standarx/nav` stays an npm dependency.** It carries one state per document (the input modality tracker and the `NavProvider` context), so a second copy would break it.
- **No style is provided.** You write the CSS that reads the `data-scope` and `data-part` attributes and the `--sui-*` properties.
- **`--yes` has no effect.** `init` never prompts; the flag is accepted so that scripts can pass it.

## Accessibility

Components follow the patterns of the WAI-ARIA Authoring Practices Guide, and the repository's tests run axe on them. The focus ring and the `data-snav-*` attributes belong to `@standarx/nav` and are not copied: see its [focus ring](https://github.com/StandarX-miralabs-tech/standarnav/blob/main/docs/en/focus-ring.md) (six `--snav-focus-ring-*` properties) and its [attributes](https://github.com/StandarX-miralabs-tech/standarnav/blob/main/docs/en/attributes.md).
