# @standarui/core

Headless engine of standarui: pure TypeScript state machines, focus management, APG-complete ARIA, built on `@standarx/nav` for its intent layer (arrow keys and d-pad produce the same events), spatial navigation and modality. That package is its one runtime requirement, taken as an exact peer the app declares at the same version. ESM-only, server-renderable, one subpath per component.

Private library, installed from a packed tarball (`bun run pack` at the repo root, then `bun add <repo>/tarballs/standarui-core-<version>.tgz`, bun ≥ 1.4), never from a registry.

## Entry points

- `@standarui/core/<component>`: machine + `connect` + anatomy, one per folder of `src/components/`
- `@standarui/core/color-picker/eyedropper`: the colour picker's screen picker, opt-in; passed as its `eyedropper` prop
- `@standarui/core/gesture`: the settle recipes, opt-in
- `@standarui/core/reactivity`: the reference reactivity adapter
- `@standarui/core`: the machine interpreter and shared primitives (dom, focus, collection, a11y, positioner, presence)
- The input engines are `@standarx/nav`: `createInputSystem` at its root, `@standarx/nav/gamepad`, `/spatial`, `/focus-ring`, `/debug`, and `@standarx/nav/react` for the provider and the hooks. Nothing here re-exports them, bar four types that were public before the move: `InputModality`, `IntentEvent`, `IntentSource`, `NavigationIntent`.
- Gone with the input layer: `isHidden` and `isInert`, with no equivalent here or in the module's public API; and the subpaths `./input/focus-ring`, `./input/gamepad`, `./input/spatial` and `./input/spatial/debug`, now `@standarx/nav/focus-ring`, `/gamepad`, `/spatial` and `/debug`.

State is exposed as `data-*` attributes; `@standarui/styles` is the stylesheet that binds to them. Every subpath is size-budgeted (`bun run check:size`).

MIT © miralabs.tech
