/**
 * The disclosure's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. The trigger's `aria-controls` and the content's `id` are
 * both derived from the root's, so an unpinned row would compare two different
 * `useId` counters and fail on the one thing the two forms genuinely share.
 */

import type { ParityCase } from "../../composed.harness";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "./collapsible";
import { Collapsible } from "./composed";

export const parity: readonly ParityCase[] = [
  /** The minimal form, and the whole of it: a label, a panel, four nodes. */
  {
    name: "collapsible",
    composed: (
      <Collapsible id="considered" label="What the model considered">
        Three candidate routes were scored against the cached plan.
      </Collapsible>
    ),
    parts: (
      <CollapsibleRoot id="considered">
        <CollapsibleTrigger>
          <CollapsibleIndicator />
          What the model considered
        </CollapsibleTrigger>
        <CollapsibleContent>
          Three candidate routes were scored against the cached plan.
        </CollapsibleContent>
      </CollapsibleRoot>
    ),
  },
  /**
   * Open from the first render, which is not the same markup as a closed one: the
   * content ships without `hidden` and the trigger's `aria-expanded` flips. Worth a
   * row of its own because the composed form reaches it through a machine prop it
   * merely forwards, and forwarding is exactly what a parity table checks.
   */
  {
    name: "collapsible",
    composed: (
      <Collapsible id="mounted" defaultOpen label="Opened at mount">
        There at the first paint rather than arriving.
      </Collapsible>
    ),
    parts: (
      <CollapsibleRoot id="mounted" defaultOpen>
        <CollapsibleTrigger>
          <CollapsibleIndicator />
          Opened at mount
        </CollapsibleTrigger>
        <CollapsibleContent>There at the first paint rather than arriving.</CollapsibleContent>
      </CollapsibleRoot>
    ),
  },
  /**
   * The rule neither row above exercises: `parts` is applied **last**, so it wins
   * over what the machine itself would have written. `parts.indicator` flips the
   * machine's own `aria-hidden="true"` to `"false"`, which is the sharpest witness
   * available — it is a value the layer never chooses and the part always does.
   */
  {
    name: "collapsible",
    composed: (
      <Collapsible
        id="billing"
        label="Billing"
        parts={{
          trigger: { className: "row" },
          indicator: { "aria-hidden": "false" },
          content: { className: "panel" },
        }}
      >
        The card ending 4242.
      </Collapsible>
    ),
    parts: (
      <CollapsibleRoot id="billing">
        <CollapsibleTrigger className="row">
          <CollapsibleIndicator aria-hidden="false" />
          Billing
        </CollapsibleTrigger>
        <CollapsibleContent className="panel">The card ending 4242.</CollapsibleContent>
      </CollapsibleRoot>
    ),
  },
];
