# @standarui/react

React 19 adapter of standarui: part components over the headless core, server-renderable, one subpath per component (`@standarui/react/<component>`), plus a composed form (`<Select options={…}/>`) that renders exactly the parts. Keyboard and gamepad grammar come from `@standarui/core`. The components ship no styles: they expose `data-scope`, `data-part` and `--sui-*` custom properties for a theme to read.

Not published to npm: the [`standarui` CLI](../cli/README.md) copies this code into an app (`standarui init`, then `standarui add <component>`). `@standarx/nav` is a peer of core and react, at `^0.4.1`.

The app mounts `StandaruiNavProvider` (from this package's root) once, at its root; the components take their intents from it. Rendering into an iframe, `EnvironmentProvider rootNode` goes above it, never below.

```tsx
import { SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot, SwitchThumb } from "@standarui/react/switch";

export function AirplaneMode() {
  return (
    <SwitchRoot name="airplane">
      <SwitchHiddenInput />
      <SwitchLabel>Airplane mode</SwitchLabel>
      <SwitchControl><SwitchThumb /></SwitchControl>
    </SwitchRoot>
  );
}
```

Components: the folders of `src/components/`. Light/dark and densities follow `data-sui-theme` / `data-sui-density` on any subtree.

API reference: `api/<component>.json` holds the props tables of a component, then its `<X>Anatomy` table (one row per part, with the selector it carries and the React part that renders it) and its `<X>CssVars` table (the `--sui-*` custom properties the engine writes or reads, grouped `written` and `read`). `bun run docs:api` regenerates them.

MIT © miralabs.tech
