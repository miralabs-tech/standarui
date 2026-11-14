/**
 * Content unavailable — the empty-state family (SwiftUI's `ContentUnavailableView`). Four slots: symbol, title, description,
 * actions.
 *
 * No machine, on `separator`'s precedent: the variants differ only by
 * added children and spacing between configurations — no hover, no pressed, no
 * disabled — so there is no state, no events, no DOM to reach for and no ids to
 * derive (no `aria-labelledby` wiring: the semantics is a heading element). A
 * service per placeholder would be exactly the overhead the size budgets exist
 * to keep out, so `connect` takes the props directly and stays pure.
 */

import { ariaAttr } from "../../dom/attrs";
import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";

export type EmptyStatePart = "root" | "indicator" | "title" | "description" | "actions";

export const anatomy: Anatomy<EmptyStatePart> = createAnatomy("empty-state").parts(
  "root",
  "indicator",
  "title",
  "description",
  "actions",
);

export const parts: Record<EmptyStatePart, AnatomyPart> = anatomy.build();

export type EmptyStateVariant = "symbol" | "circle";

export interface EmptyStateMachineProps {
  /**
   * How the indicator presents: `"symbol"` is the
   * bare large symbol (the default), `"circle"` is a title-sized glyph in a
   * tinted disc. The third configuration — title and subtitle alone — is
   * obtained by not rendering the indicator part, not by a prop value.
   */
  readonly variant?: EmptyStateVariant | undefined;
  /**
   * Puts `role="status"` on the root so a screen reader announces the
   * placeholder when it appears — an emptied search result, a cleared list.
   * Off by default: a static page-level empty state is not a live region.
   */
  readonly announce?: boolean | undefined;
}

export interface EmptyStateApi<T extends PropTypes = PropTypes> {
  readonly variant: EmptyStateVariant;
  getRootProps(): T["element"];
  getIndicatorProps(): T["element"];
  getTitleProps(): T["element"];
  getDescriptionProps(): T["element"];
  getActionsProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: EmptyStateMachineProps,
  normalize: NormalizeProps<T>,
): EmptyStateApi<T> {
  const variant = props.variant ?? "symbol";
  const announce = props.announce === true;

  return {
    variant,
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        role: announce ? "status" : undefined,
        "data-variant": variant,
      }),
    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        // Always decorative: the symbol repeats what the title says, and a
        // screen reader has no use for hearing it twice.
        "aria-hidden": ariaAttr(true),
        "data-variant": variant,
      }),
    getTitleProps: (): T["element"] =>
      // No ARIA on purpose: the semantics IS the heading element the adapter
      // renders, and the consumer corrects the level through composition.
      normalize.element({ ...parts.title.attrs }),
    getDescriptionProps: (): T["element"] => normalize.element({ ...parts.description.attrs }),
    getActionsProps: (): T["element"] =>
      // No role either: the children are ordinary buttons and links, reached
      // in document order — their keyboard is theirs, not the empty state's.
      normalize.element({ ...parts.actions.attrs }),
  };
}
