/**
 * `<Switch label="Wi-Fi"/>` — five parts, one loop-free tree, and the fork's
 * other minimal end (`Button`, no collection, no `parts` hatch): `SwitchRoot`
 * is already the `<label>`, so the layer only has to place the four children
 * in the order `switch.stories.tsx`'s own `Toggle` helper settled on —
 * `SwitchHiddenInput`, `SwitchLabel`, `SwitchControl > SwitchThumb` — rather
 * than the anatomy's declaration order, which lists `hiddenInput` last.
 *
 * No `parts` escape hatch: this layer sets no attribute of its own on any
 * part for one to win against — `label` only ever reaches `SwitchLabel` as
 * its JSX children, which a spread placed either side of it can never
 * override (React's third `createElement` argument always wins). A consumer
 * who needs to reach `SwitchThumb` or `SwitchHiddenInput` directly still has
 * the parts themselves.
 *
 * `label` is text here and nowhere reads it back: unlike `SelectValueText` or
 * `SliderValueText`, no field of `SwitchApi` is derived from it, so there is
 * no part to teach a default to and no hook for this file to avoid.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  SwitchControl,
  SwitchHiddenInput,
  SwitchLabel,
  SwitchRoot,
  SwitchThumb,
  type UseSwitchProps,
} from "./switch";

export interface SwitchComposedProps
  extends UseSwitchProps,
    Omit<PartProps<"label", UseSwitchProps>, "children"> {
  /** The visible text beside the control. */
  readonly label?: ReactNode;
}

export function Switch(props: SwitchComposedProps): ReactNode {
  const { label, ...root } = props;

  return (
    <SwitchRoot {...root}>
      <SwitchHiddenInput />
      <SwitchLabel>{label}</SwitchLabel>
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}
