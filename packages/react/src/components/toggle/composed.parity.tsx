/**
 * The toggle's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { BOLT, NOOP, type ParityCase } from "../../composed.harness";
import { Toggle } from "./composed";
import { ToggleIndicator, ToggleRoot } from "./toggle";

export const parity: readonly ParityCase[] = [
  {
    name: "toggle",
    composed: (
      <Toggle id="bold" defaultPressed>
        Bold
      </Toggle>
    ),
    parts: (
      <ToggleRoot id="bold" defaultPressed>
        <ToggleIndicator>Bold</ToggleIndicator>
      </ToggleRoot>
    ),
  },
  {
    name: "toggle",
    composed: (
      <Toggle
        id="favorite"
        aria-label="Favorite"
        pressed={false}
        disabled
        onPressedChange={NOOP}
        icon={BOLT}
        render={<a href="/favorite" />}
      >
        Favorite
      </Toggle>
    ),
    parts: (
      <ToggleRoot
        id="favorite"
        aria-label="Favorite"
        pressed={false}
        disabled
        onPressedChange={NOOP}
        render={<a href="/favorite" />}
      >
        <ToggleIndicator>
          {BOLT}
          Favorite
        </ToggleIndicator>
      </ToggleRoot>
    ),
  },
];
