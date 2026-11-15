# @standarui/react

React 19 adapter of standarui: part components over the headless core, server-renderable, one subpath per component (`@standarui/react/<component>`), plus a composed form (`<Select options={…}/>`) that renders exactly the parts. Keyboard and gamepad grammar come from `@standarui/core`. The components ship no styles: they expose `data-scope`, `data-part` and `--sui-*` custom properties for a theme to read.

Not published to npm. The code is meant to be copied into an app by the standarui registry CLI (to come). `@standarx/nav` is an exact peer of core and react.

The app mounts `NavProvider` (from `@standarx/nav/react`) once, at its root; the components take their intents from it. Rendering into an iframe, `EnvironmentProvider rootNode` goes above it, never below.

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

MIT © miralabs.tech
