/**
 * The separator's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Two rows over a single node, trivially equal on purpose — that is the
 * assertion. `<Separator>` is a spread over `SeparatorRoot`, so the day the alias
 * grows a second node — a wrapper for a label, a host for anything — the two
 * strings stop matching and this file is where it is caught. Nothing else in the
 * repository would notice: the part's own suites render `SeparatorRoot`, and a
 * bare name that renders one node too many still renders a rule.
 *
 * Both rows pin `id`, as every row does. Separator mints none of its own — it has
 * no machine, so nothing here calls `useId` — but the rule belongs to the table
 * rather than to a component, and a fixture resting on this one happening to be
 * id-free would have to be revisited the day it is not.
 */

import type { ParityCase } from "../../composed.harness";
import { Separator } from "./composed";
import { SeparatorRoot } from "./separator";

export const parity: readonly ParityCase[] = [
  /** The plain form: `role="separator"`, and the horizontal orientation `connect` defaults to. */
  {
    name: "separator",
    composed: <Separator id="sections" />,
    parts: <SeparatorRoot id="sections" />,
  },
  /**
   * Both machine props on one rule, plus a `className` — the other half of the
   * split: `SeparatorRoot` sorts its props into the machine's and the element's
   * (`separator.tsx:22`), and a row carrying only the first would pass on a layer
   * that dropped the second.
   *
   * The pair suppresses `aria-orientation="vertical"`, which `connect` writes only
   * on a vertical rule that is *not* decorative (`separator.ts:53`) — a decorative
   * one has left the accessibility tree, so an orientation on it would be an
   * orientation for nobody. Pinning the suppression is what a parity row is for:
   * the composed form has to reproduce the markup the parts produce, including the
   * attributes they decline to write.
   */
  {
    name: "separator",
    composed: <Separator id="tools" orientation="vertical" decorative className="rule" />,
    parts: <SeparatorRoot id="tools" orientation="vertical" decorative className="rule" />,
  },
];
