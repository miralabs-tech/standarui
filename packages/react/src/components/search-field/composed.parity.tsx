/**
 * The search field's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * `id` is pinned on every row: the field, the indicator, the control and both
 * triggers all derive their ids from the root's, and an un-pinned `useId()`
 * mints a different one per render — the two forms could never compare equal.
 *
 * The magnifier is the story's own path (`search-field.stories.tsx`), reused
 * through the harness's `glyph()` rather than through a new export: nothing
 * shared belongs in this file.
 */

import { glyph, type ParityCase } from "../../composed.harness";
import { FieldLabel, FieldRoot } from "../field/field";
import { SearchField } from "./composed";
import {
  SearchFieldCancelTrigger,
  SearchFieldClearTrigger,
  SearchFieldControl,
  SearchFieldField,
  SearchFieldIndicator,
  SearchFieldRoot,
} from "./search-field";

const MAGNIFIER = glyph(
  "M7 1a6 6 0 1 0 3.7 10.7l3.3 3.3 1.4-1.4-3.3-3.3A6 6 0 0 0 7 1Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
);

export const parity: readonly ParityCase[] = [
  {
    // The minimal form: no icon, no cancel button — a bare capsule.
    name: "search-field",
    composed: <SearchField id="library" label="Search library" />,
    parts: (
      <SearchFieldRoot id="library" label="Search library">
        <SearchFieldField>
          <SearchFieldControl />
          <SearchFieldClearTrigger />
        </SearchFieldField>
      </SearchFieldRoot>
    ),
  },
  {
    // Everything the layer translates, in one row: the indicator appears
    // because `icon` was given, the cancel button because `cancel` was — and
    // every machine prop, `clearLabel`/`cancelLabel` included, travels through
    // `root` exactly as written, because this component invents neither.
    name: "search-field",
    composed: (
      <SearchField
        id="filter"
        label="Filter components"
        clearLabel="Clear filter"
        cancelLabel="Stop filtering"
        placeholder="Filter"
        shape="soft"
        defaultValue="glass"
        icon={MAGNIFIER}
        cancel
      />
    ),
    parts: (
      <SearchFieldRoot
        id="filter"
        label="Filter components"
        clearLabel="Clear filter"
        cancelLabel="Stop filtering"
        placeholder="Filter"
        shape="soft"
        defaultValue="glass"
      >
        <SearchFieldField>
          <SearchFieldIndicator>{MAGNIFIER}</SearchFieldIndicator>
          <SearchFieldControl />
          <SearchFieldClearTrigger />
        </SearchFieldField>
        <SearchFieldCancelTrigger />
      </SearchFieldRoot>
    ),
  },
  {
    // Nested in a `field`, with no `label` of its own: `SearchFieldRoot` reads
    // the field context for its ids the same way every other control does, so
    // the composed form has to place the capsule exactly where the parts form
    // does rather than default a name nobody asked for (`select`'s precedent
    // for the same row).
    name: "search-field",
    composed: (
      <FieldRoot id="components">
        <FieldLabel>Components</FieldLabel>
        <SearchField id="query" icon={MAGNIFIER} />
      </FieldRoot>
    ),
    parts: (
      <FieldRoot id="components">
        <FieldLabel>Components</FieldLabel>
        <SearchFieldRoot id="query">
          <SearchFieldField>
            <SearchFieldIndicator>{MAGNIFIER}</SearchFieldIndicator>
            <SearchFieldControl />
            <SearchFieldClearTrigger />
          </SearchFieldField>
        </SearchFieldRoot>
      </FieldRoot>
    ),
  },
  {
    // `parts` wins over the layer's own defaults, on two collisions at once: a
    // `placeholder` the layer would otherwise carry through unchanged, and a
    // `cancelLabel` the machine would otherwise turn into the cancel button's
    // own name.
    //
    // Both roots carry `placeholder="Search"`, and dropping it from this side
    // was a real failure rather than noise: `getControlProps` emits the key
    // wherever the machine writes it, so a root that was given one has
    // `placeholder` between `type` and `inputMode`, and a root that was not has
    // it appended by `parts.control` after `aria-label`. Same attributes, same
    // values, different order — which `renderToString` compares and a DOM
    // comparison never would.
    name: "search-field",
    composed: (
      <SearchField
        id="sort"
        label="Search results"
        placeholder="Search"
        cancelLabel="Stop searching"
        cancel
        parts={{
          control: { placeholder: "Filter" },
          cancelTrigger: { "aria-label": "Halt" },
        }}
      />
    ),
    parts: (
      <SearchFieldRoot
        id="sort"
        label="Search results"
        placeholder="Search"
        cancelLabel="Stop searching"
      >
        <SearchFieldField>
          <SearchFieldControl placeholder="Filter" />
          <SearchFieldClearTrigger />
        </SearchFieldField>
        <SearchFieldCancelTrigger aria-label="Halt" />
      </SearchFieldRoot>
    ),
  },
];
