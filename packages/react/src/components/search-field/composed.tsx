/**
 * `<SearchField icon={…}/>` — six parts, no loop, no state of its own: the row,
 * the capsule inside it, the two decorations the capsule carries, and the
 * cancel button that stands *beside* the capsule rather than in it.
 *
 * Unlike `input`, the two triggers already have names: `clearLabel` and
 * `cancelLabel` are machine props read straight off `search-field.connect.ts`
 * (`"Clear search"` / `"Cancel search"` by default), so they travel through
 * `root` untouched — this layer only places the button, it never invents the
 * word that names it.
 *
 * `cancel` is a boolean and not a `ComposedTrigger`-shaped substitution,
 * because there is nothing to substitute: `SearchFieldCancelTrigger` is
 * already a `<button>`, and what the reference designs disagree on is whether it exists at
 * all — touch layouts draw it beside the capsule, desktop layouts do not draw
 * it at all. The machine already decides *when* it is visible (`hidden` flips
 * on the empty/non-empty edge); `cancel` decides whether it is composed into
 * the tree in the first place, which is a decision the machine has no prop for
 * and should not — a field with no cancel button behaves identically to one
 * whose button happens to render `hidden`, so there is no state to duplicate.
 *
 * `icon` is the one slot: the leading glyph of the capsule, decorative by the
 * indicator's own contract (`aria-hidden`, set by `connect` regardless of
 * whether anything is passed here). Left out, no `SearchFieldIndicator`
 * renders at all, on `SelectItemSymbol`'s precedent — an empty decorative box
 * is not a shape either reference design draws.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  SearchFieldCancelTrigger,
  SearchFieldClearTrigger,
  SearchFieldControl,
  SearchFieldField,
  SearchFieldIndicator,
  SearchFieldRoot,
  type UseSearchFieldProps,
} from "./search-field";

/** The escape hatch, applied last on every part `root` is not reachable through: its own props are the composed props themselves. */
export interface SearchFieldParts {
  readonly field?: PartProps<"div"> | undefined;
  readonly indicator?: PartProps<"span"> | undefined;
  readonly control?: PartProps<"input"> | undefined;
  readonly clearTrigger?: PartProps<"button"> | undefined;
  readonly cancelTrigger?: PartProps<"button"> | undefined;
}

export interface SearchFieldComposedProps
  extends UseSearchFieldProps,
    Omit<PartProps<"div", UseSearchFieldProps>, "children"> {
  /** The leading glyph of the capsule — an inline SVG, never a text character. */
  readonly icon?: ReactNode;
  /** Composes the cancel button beside the capsule. Off by default: desktop layouts draw none. */
  readonly cancel?: boolean | undefined;
  readonly parts?: SearchFieldParts | undefined;
}

export function SearchField(props: SearchFieldComposedProps): ReactNode {
  const { icon, cancel, parts, ...root } = props;

  return (
    <SearchFieldRoot {...root}>
      <SearchFieldField {...parts?.field}>
        {icon === undefined ? null : (
          <SearchFieldIndicator {...parts?.indicator}>{icon}</SearchFieldIndicator>
        )}
        <SearchFieldControl {...parts?.control} />
        <SearchFieldClearTrigger {...parts?.clearTrigger} />
      </SearchFieldField>
      {cancel === true ? <SearchFieldCancelTrigger {...parts?.cancelTrigger} /> : null}
    </SearchFieldRoot>
  );
}
