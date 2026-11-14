# @standarui/react

React 19 adapter of standarui: part components over the headless core, server-renderable, one subpath per component (`@standarui/react/<component>`), plus a composed form (`<Select options={…}/>`) that renders exactly the parts. Keyboard and gamepad grammar come from `@standarui/core`; the glass material look from `@standarui/styles`.

Private library, installed from packed tarballs (`bun run pack` at the repo root), never from a registry. The consumer (bun ≥ 1.4) declares the three tarballs and `@standarx/nav`, an exact peer of core and react, at the same version, and pins core through `overrides`:

```jsonc
{
  "dependencies": {
    "@standarui/core": "file:<repo>/tarballs/standarui-core-<version>.tgz",
    "@standarui/styles": "file:<repo>/tarballs/standarui-styles-<version>.tgz",
    "@standarui/react": "file:<repo>/tarballs/standarui-react-<version>.tgz",
    "@standarx/nav": "0.4.0"
  },
  "overrides": {
    "@standarui/core": "file:<repo>/tarballs/standarui-core-<version>.tgz"
  }
}
```

The app mounts `NavProvider` (from `@standarx/nav/react`) once, at its root; the components take their intents from it. Rendering into an iframe, `EnvironmentProvider rootNode` goes above it, never below.

```tsx
import { SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot, SwitchThumb } from "@standarui/react/switch";
import "@standarui/styles";

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

Components: the 39 folders of `src/components/`. Light/dark and densities follow `data-sui-theme` / `data-sui-density` on any subtree.

MIT © miralabs.tech
