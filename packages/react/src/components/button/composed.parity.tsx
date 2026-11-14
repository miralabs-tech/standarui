/**
 * The button's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { type ParityCase, SAVE, SHORTCUT } from "../../composed.harness";
import { ButtonLoadingIndicator, ButtonRoot } from "./button";
import { Button } from "./composed";

export const parity: readonly ParityCase[] = [
  {
    name: "button",
    composed: <Button id="save">Save</Button>,
    parts: <ButtonRoot id="save">Save</ButtonRoot>,
  },
  {
    name: "button",
    composed: (
      <Button
        id="save"
        variant="filled"
        size="sm"
        loading
        loadingText="Saving your changes"
        icon={SAVE}
        accessory={SHORTCUT}
        render={<a href="/docs" />}
      >
        Save
      </Button>
    ),
    parts: (
      <ButtonRoot
        id="save"
        variant="filled"
        size="sm"
        loading
        loadingText="Saving your changes"
        render={<a href="/docs" />}
      >
        {SAVE}
        Save
        {SHORTCUT}
        <ButtonLoadingIndicator />
      </ButtonRoot>
    ),
  },
];
