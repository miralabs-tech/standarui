/**
 * The input's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import { Input } from "./composed";
import { InputControl, InputRoot, InputTextarea, InputVisibilityTrigger } from "./input";

export const parity: readonly ParityCase[] = [
  {
    name: "input",
    composed: <Input id="name" placeholder="Ada Lovelace" />,
    parts: (
      <InputRoot id="name" placeholder="Ada Lovelace">
        <InputControl />
      </InputRoot>
    ),
  },
  /**
   * `revealLabel` is the one translation with no default to fall back on:
   * `getVisibilityTriggerProps` writes no `aria-label`, so it is this field, and
   * only this field, that keeps the trigger from shipping as a nameless button.
   */
  {
    name: "input",
    composed: (
      <Input id="password" type="password" defaultValue="hunter2" revealLabel="Show password" />
    ),
    parts: (
      <InputRoot id="password" type="password" defaultValue="hunter2">
        <InputControl />
        <InputVisibilityTrigger aria-label="Show password" />
      </InputRoot>
    ),
  },
  /** `multiline` chooses `InputTextarea` over `InputControl` — nothing else moves. */
  {
    name: "input",
    composed: <Input id="notes" multiline placeholder="Anything else we should know?" />,
    parts: (
      <InputRoot id="notes" placeholder="Anything else we should know?">
        <InputTextarea />
      </InputRoot>
    ),
  },
  /**
   * `parts` is applied **last**, so it wins over what the layer defaults — two
   * collisions at once: `parts.control` reaches the control the way any other
   * attribute would, and `parts.visibilityTrigger` overrides the very
   * `aria-label` `revealLabel` just set. The parts side is written with the
   * value that has to win.
   */
  {
    name: "input",
    composed: (
      <Input
        id="password"
        type="password"
        revealLabel="Show password"
        parts={{ control: { className: "x" }, visibilityTrigger: { "aria-label": "Afficher" } }}
      />
    ),
    parts: (
      <InputRoot id="password" type="password">
        <InputControl className="x" />
        <InputVisibilityTrigger aria-label="Afficher" />
      </InputRoot>
    ),
  },
];
