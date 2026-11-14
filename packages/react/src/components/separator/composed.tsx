/**
 * `<Separator>` — the bare name over a one-part anatomy, and the whole of the
 * module: `SeparatorRoot` with nothing added, nothing reordered and nothing
 * hidden.
 *
 * One part is where a composed layer looks like pure ceremony. What it publishes
 * is the rule instead — *the bare name is the thing, `<X>Root` and its siblings
 * are the pieces* — and a rule with exceptions in it is not one a reader can
 * hold. Somebody who has written `<Card>` and `<Collapsible>` reaches for
 * `<Separator>`, and a library where that name does not exist is asking them to
 * remember which components were big enough to deserve one, which is a table
 * rather than a rule. `badge` is the other component in this position and states
 * what the two of them cost.
 *
 * **A function that spreads, never a re-export.** The spec writes this alias as
 * `export { SeparatorRoot as Separator }`; it cannot be one.
 * `scripts/composed-demo.test.ts` reads a composed module's exports by matching
 * `export function` followed by a capitalised name, so a re-export publishes a
 * name that guard cannot see — it reports "no export found" and the layer becomes
 * invisible to the one check that asks whether a reader is ever shown it. The
 * function is also what gives `SeparatorComposedProps` somewhere to live, which
 * is what puts the composed name in `bun run docs:api`.
 *
 * **The rule inside a collection is not this component.** A reader meets the same
 * idea at two altitudes: `<Separator>` here, and `{ separator: true }` — the
 * `ComposedSeparator` of `composed.ts` — as an entry in a menu's, a select's or a
 * toolbar's list. They are one idea and not one component. A rule between two
 * menu items is `MenuSeparator`, the menu's own part, because the surface that is
 * being divided owns the geometry and writes its own `role="separator"`
 * (`menu.connect.ts:502`); this component is the rule a consumer places in a
 * layout that belongs to them. The collections narrow on the word structurally
 * for the same reason the name is spelled the same: it is the concept that
 * repeats, never the module.
 *
 * **There is no `parts` escape hatch, and there is nothing for one to reach.**
 * Every other composed layer applies `parts` last so a consumer's entry beats the
 * layer's default; here the consumer's props already land on the only part there
 * is. A `parts` bag would be a second spelling of the props above it, and the
 * second spelling is what the closed vocabulary exists to prevent.
 */

import type { ReactNode } from "react";
import { SeparatorRoot, type SeparatorRootProps } from "./separator";

/**
 * Empty, and the emptiness is the claim: the alias adds no prop, renames none and
 * withholds none. The name is declared anyway so `bun run docs:api` tables it
 * beside `SeparatorMachineProps` and says exactly that — a composed name absent
 * from the reference reads as a component that has none.
 */
export interface SeparatorComposedProps extends SeparatorRootProps {}

export function Separator(props: SeparatorComposedProps): ReactNode {
  return <SeparatorRoot {...props} />;
}
