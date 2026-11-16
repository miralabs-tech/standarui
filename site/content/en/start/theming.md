---
title: Theming
description: Style the headless parts with data attributes and --sui-* variables, with themes and densities on any subtree
---

standarui ships no style. Every part renders its element with attributes your stylesheet selects, and the engine writes a few custom properties your CSS reads.

## Select a part

Each part carries `data-scope` (the component) and `data-part`. `data-part` is a token list of the form `<scope>:<part>` with the part in kebab-case, so select it with `~=`:

```css
[data-part~="dialog:close-trigger"] {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}
```

The anatomy table of each component page lists every selector (for example `ButtonAnatomy`: `[data-part~="button:root"]`, `[data-part~="button:loading-indicator"]`).

## State attributes

Parts expose their state as attributes, never as class names. The common ones:

- `data-state`: `open` / `closed` on overlays and accordion panels, `checked` / `unchecked` on switches and select items, `active` / `inactive` on tabs.
- `data-disabled`, `data-readonly`, `data-invalid`, `data-loading`, `data-pressed`, `data-dragging`, `data-highlighted`: present (empty value) when true, absent otherwise.
- `data-orientation`: `horizontal` or `vertical`.
- `data-focus-visible`: present when the focus came from the keyboard, so the ring does not show after a click.

Boolean attributes are matched as `[data-disabled]`; valued ones as `[data-state="open"]`. Which attributes a part sets depends on the component.

## Engine-written variables

Some values only the engine knows: the height of a collapsing panel, the width of a select's anchor, the position of a slider thumb. The engine writes them as `--sui-*` custom properties on the part, and your CSS reads them. The `<X>CssVars` table of a component page lists them, with the `written` group for these (see the [Accordion](../components/accordion.md) page, whose content writes `--sui-collapse-height`).

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

Do not set these yourself: the engine overwrites them. The other `--sui-*` names in your stylesheet (colors, radii, spacing) are yours; the engine neither reads nor writes them.

## Themes and densities

`data-sui-theme` and `data-sui-density` can sit on any element and apply to its subtree.

- **`data-sui-theme`** is a convention for your stylesheet. The engine never reads it: `[data-sui-theme="dark"]` is a selector you write to override your tokens (the value `dark` is yours to choose).
- **`data-sui-density`** is read by the engine, with two values: `desktop` and `touch`. It decides presentation switches (a menu that opens on hover or only on tap, a select that becomes a sheet), resolved from the nearest ancestor with the attribute, and from `(pointer: coarse)` when there is none or the value is another. Any other value, such as `compact` below, is ignored by the engine and left to your CSS.

```html
<section data-sui-theme="dark" data-sui-density="touch">...</section>
```

## Example: the demo theme

The demos of this site use a small stylesheet, `site/demo.css` in the repository. It is the docs site's theme, not part of the library. It declares tokens on `:root`, a dark variant and a compact density, then styles each part:

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
