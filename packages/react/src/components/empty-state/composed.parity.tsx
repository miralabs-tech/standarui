/**
 * The empty state's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id` on both sides, as every row of every table does. Here it is
 * belt and braces rather than the mechanism: there is no machine under this
 * component, so no part mints a scope id and nothing derives one. The pin costs a
 * word and keeps the rule uniform across the tables — the day a part here does
 * call `useId`, the rows already say what it should be.
 *
 * No row stands a portal down and none needs to: this component has no surface,
 * and `connect` writes no `aria-labelledby`, `aria-describedby` or `aria-controls`
 * at all, so there is no IDREF here that could dangle.
 *
 * What the rows are really about is which of the five parts exist. That is the one
 * decision the layer makes — the two props it takes are forwarded untouched — and
 * the sheet puts the vertical rhythm on the *optional* parts' own margins
 * (`_empty-state.scss`), so a part placed empty is a gap rather than a no-op.
 */

import { BOLT, type ParityCase, SAVE } from "../../composed.harness";
import { EmptyState } from "./composed";
import {
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIndicator,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./empty-state";

export const parity: readonly ParityCase[] = [
  /**
   * The floor, and the whole of it: a title and nothing else. All three optional
   * parts are withheld at once — no indicator box, no paragraph, no action row —
   * which is what makes `title` the only required slot and the placeholder's only
   * voice.
   */
  {
    name: "empty-state",
    composed: <EmptyState id="favorites" title="No favorites" />,
    parts: (
      <EmptyStateRoot id="favorites">
        <EmptyStateTitle>No favorites</EmptyStateTitle>
      </EmptyStateRoot>
    ),
  },
  /**
   * `variant="circle"` with no `icon`, which is the row that proves the optional
   * parts are not coupled to one another. The root wears `data-variant="circle"`
   * because `getRootProps` writes it unconditionally, while the part that variant
   * actually shapes is not placed at all — the third configuration (title
   * and description alone) is reached by withholding the indicator, never by a
   * `variant` value. A layer that keyed the indicator off `variant` instead of off
   * `icon` would render a sized, empty box here and this row would say so.
   */
  {
    name: "empty-state",
    composed: (
      <EmptyState
        id="caught-up"
        variant="circle"
        title="All caught up"
        description="New activity will show up here."
      />
    ),
    parts: (
      <EmptyStateRoot id="caught-up" variant="circle">
        <EmptyStateTitle>All caught up</EmptyStateTitle>
        <EmptyStateDescription>New activity will show up here.</EmptyStateDescription>
      </EmptyStateRoot>
    ),
  },
  /**
   * Every part at once, and `announce` on top — the machine prop the layer merely
   * forwards, and forwarding is exactly what a parity table checks. What it turns
   * into is worth pinning too: `role="status"` on the root, which is the only mark
   * in the DOM meaning "this placeholder appeared in reaction to something", and
   * the sheet gates the entry animation on it.
   *
   * `actions` holds the consumer's own `<button type="button">` rather than a list
   * of labels, which is where this layer parts company with `dialog`: the anatomy
   * has no action-trigger part for an `onPress` to land on, so the buttons stay
   * theirs and the row lays out around them.
   */
  {
    name: "empty-state",
    composed: (
      <EmptyState
        id="results"
        announce
        icon={SAVE}
        title="No results"
        description="Nothing matches your search."
        actions={<button type="button">Clear search</button>}
      />
    ),
    parts: (
      <EmptyStateRoot id="results" announce>
        <EmptyStateIndicator>{SAVE}</EmptyStateIndicator>
        <EmptyStateTitle>No results</EmptyStateTitle>
        <EmptyStateDescription>Nothing matches your search.</EmptyStateDescription>
        <EmptyStateActions>
          <button type="button">Clear search</button>
        </EmptyStateActions>
      </EmptyStateRoot>
    ),
  },
  /**
   * The rule no row above exercises: `parts` is applied **last**, so it wins over
   * what the machine itself would have written. `parts.indicator` flips
   * `aria-hidden` from `"true"` to `"false"` — `getIndicatorProps` writes that
   * value on every call and the layer never chooses it, which makes it the
   * sharpest witness available. `parts.title` rides along on a plain `className`
   * to say the escape hatch reaches a part the machine leaves bare too.
   *
   * It has to be a *typed* attribute either way: React's element types carry no
   * `data-${string}` index signature, so a `parts` entry cannot spell `data-part`
   * or `data-variant` and a witness written on one would not typecheck.
   */
  {
    name: "empty-state",
    composed: (
      <EmptyState
        id="inbox"
        icon={BOLT}
        title="Inbox zero"
        parts={{
          indicator: { "aria-hidden": "false" },
          title: { className: "headline" },
        }}
      />
    ),
    parts: (
      <EmptyStateRoot id="inbox">
        <EmptyStateIndicator aria-hidden="false">{BOLT}</EmptyStateIndicator>
        <EmptyStateTitle className="headline">Inbox zero</EmptyStateTitle>
      </EmptyStateRoot>
    ),
  },
];
