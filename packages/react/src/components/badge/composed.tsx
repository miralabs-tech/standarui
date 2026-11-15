/**
 * `<Badge>` — the bare name over a one-part anatomy, and the whole of the module:
 * `BadgeRoot` with nothing added, nothing reordered and nothing hidden.
 *
 * A component with one part looks like the one place a composed layer earns
 * nothing. It earns the rule instead. What this layer publishes is *the bare name
 * is the thing, `<X>Root` and its siblings are the pieces* — and a rule with
 * exceptions in it is not a rule a reader can hold. Someone who has written
 * `<Button>` and `<Collapsible>` reaches for `<Badge>`, and a library where that
 * name does not exist is asking them to remember which components were big enough
 * to deserve one. Removing that costs a function and roughly ten bytes gzipped;
 * keeping it costs a table nobody can state out loud.
 *
 * **A function that spreads, never a re-export**, and that is a gate rather than a
 * preference. `scripts/composed-demo.test.ts` reads a composed module's exports by
 * matching `export function` followed by a capitalised name, so an
 * `export const Badge = BadgeRoot` publishes a name the guard cannot see: it
 * reports "no export found" and the layer becomes invisible to the one check that
 * asks whether a reader is ever shown it. Writing the function also gives
 * `BadgeComposedProps` somewhere to live, which is what puts the composed name in
 * `bun run docs:api`.
 *
 * **There is no `parts` escape hatch, and there is nothing for one to reach.**
 * Every other composed layer applies `parts` last so a consumer's entry beats the
 * layer's default; here the consumer's props already land on the only part there
 * is. A `parts` bag would be a second spelling of the props above it, and the
 * second spelling is the thing the closed vocabulary exists to prevent.
 *
 * **The accessibility is the part's, untouched, because nothing moved.** `connect`
 * writes `role="img"` with `aria-label` as soon as `label` is set — the truthful
 * reading of a display value that lies, `"99+"` for a count of 120 — and
 * `aria-hidden` on an unlabelled `kind="dot"`, which is decoration whose meaning
 * belongs in its host's accessible name. A `count` with nothing to say carries the
 * real `hidden` attribute rather than a `data-*` twin, so `[hidden]` selects it as
 * written. None of that is re-implemented here; it could not be, since this module
 * holds no state and calls no hook of its own.
 */

import type { ReactNode } from "react";
import { BadgeRoot, type BadgeRootProps } from "./badge";

export interface BadgeComposedProps extends BadgeRootProps {
  /**
   * The badge's content, re-declared rather than inherited so the one surprise in
   * the part is written down: explicit children **win** over the value the
   * derivation computes. `kind="count"` fills in the truncated digits on its own,
   * and passing children replaces them — localised numerals, a glyph beside a
   * label. Left out, `label` and `dot` render nothing at all rather than an empty
   * text node (`badge.tsx:43`), which is what keeps the dot exactly
   * `--sui-badge-dot-size` across instead of one text node wider.
   */
  readonly children?: ReactNode;
}

export function Badge(props: BadgeComposedProps): ReactNode {
  return <BadgeRoot {...props} />;
}
