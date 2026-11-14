/**
 * The switch's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import { Switch } from "./composed";
import { SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot, SwitchThumb } from "./switch";

export const parity: readonly ParityCase[] = [
  {
    name: "switch",
    composed: <Switch id="wifi" label="Wi-Fi" />,
    parts: (
      <SwitchRoot id="wifi">
        <SwitchHiddenInput />
        <SwitchLabel>Wi-Fi</SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </SwitchRoot>
    ),
  },
  /**
   * The one non-trivial translation this component has: the order the layer
   * writes is `hiddenInput`, `label`, `control` — the `Toggle` helper of
   * `switch.stories.tsx`, not `switch.anatomy.ts`'s declaration order, which
   * lists `hiddenInput` last. Every machine prop travels straight to the
   * root untouched, disabled included, which is what a fuller fixture proves
   * that the minimal one cannot.
   */
  {
    name: "switch",
    composed: (
      <Switch
        id="bluetooth"
        label="Bluetooth"
        name="bluetooth"
        value="on"
        defaultChecked
        required
        invalid
        draggable={false}
        size="sm"
      />
    ),
    parts: (
      <SwitchRoot
        id="bluetooth"
        name="bluetooth"
        value="on"
        defaultChecked
        required
        invalid
        draggable={false}
        size="sm"
      >
        <SwitchHiddenInput />
        <SwitchLabel>Bluetooth</SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </SwitchRoot>
    ),
  },
];
