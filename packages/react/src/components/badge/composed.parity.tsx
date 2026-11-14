/**
 * The badge's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Two rows over a one-node component, and they are trivially equal on purpose —
 * that is the assertion. `<Badge>` is a spread over `BadgeRoot`, so the day the
 * alias grows a second node — a positioned host for `overlap`, a live region for
 * the count, a wrapper for anything — the two strings stop matching and this file
 * is where it is caught. Nothing else in the repository would notice: the part's
 * own suites render `BadgeRoot`, and a bare name that renders one node too many
 * still renders a badge.
 *
 * Both rows pin `id`, as every row does. Badge mints none of its own — it has no
 * machine, so nothing here calls `useId` — but the rule is the table's rather than
 * a component's, and a fixture that relied on this component happening to be
 * id-free would have to be revisited the day it is not.
 */

import type { ParityCase } from "../../composed.harness";
import { BadgeRoot } from "./badge";
import { Badge } from "./composed";

export const parity: readonly ParityCase[] = [
  /** The plain form: children, and the text label `kind` defaults to. */
  {
    name: "badge",
    composed: <Badge id="new">New</Badge>,
    parts: <BadgeRoot id="new">New</BadgeRoot>,
  },
  /**
   * Every machine prop that says something on one badge — `kind`, `tone`,
   * `variant`, `count`, `max`, `overlap` and `label` — plus a `className`, which
   * is the other half of the split: `BadgeRoot` sorts its props into the machine's
   * and the element's (`badge.tsx:15`), and a row carrying only the first would
   * pass on a layer that dropped the second.
   *
   * `showZero` is the one left out. It speaks only when `count` is 0, and this
   * count is 120; a fixture setting a prop that cannot change its own markup
   * proves the spread it was written to prove and reads as though it proved more.
   *
   * The count is also the row where the two attributes a reader cares about
   * appear: `max` truncates the visible text to `"99+"`, and `label` is what makes
   * `role="img"` and the true number reach a screen reader anyway.
   */
  {
    name: "badge",
    composed: (
      <Badge
        id="alerts"
        kind="count"
        tone="danger"
        variant="solid"
        count={120}
        max={99}
        overlap
        label="120 notifications"
        className="pill"
      />
    ),
    parts: (
      <BadgeRoot
        id="alerts"
        kind="count"
        tone="danger"
        variant="solid"
        count={120}
        max={99}
        overlap
        label="120 notifications"
        className="pill"
      />
    ),
  },
];
