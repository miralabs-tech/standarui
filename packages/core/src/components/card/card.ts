/**
 * The second component with no machine, on `separator`'s precedent: a card has
 * no state, no events to name, no DOM to reach for and no ids to derive. A grid
 * of thirty project cards each carrying a service is exactly the overhead the
 * size budgets exist to keep out — so `connect` takes the props directly.
 *
 * The ARIA doctrine is held by emitting nothing. No APG pattern exists for
 * "card", and a `role="group"` or a root→title `aria-labelledby` would demand
 * ids — a scope, a service — to buy an association screen readers already get
 * from the heading. The semantics come from what is composed inside.
 *
 * Everything else is the usual contract: an anatomy, pure prop getters, state
 * on data-attributes.
 */

import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";

export type CardPart = "root" | "header" | "title" | "description" | "action" | "body" | "footer";

export const anatomy: Anatomy<CardPart> = createAnatomy("card").parts(
  "root",
  "header",
  "title",
  "description",
  "action",
  "body",
  "footer",
);

export const parts: Record<CardPart, AnatomyPart> = anatomy.build();

/**
 * Two platform-style readings and two library compositions. `inset` is the grouped
 * box (a 3% ink wash), `filled` the grouped table view (opaque, flat), `raised`
 * the library's own shadow-2 surface, `glass` the glass material.
 */
export type CardVariant = "raised" | "filled" | "inset" | "glass";

export interface CardMachineProps {
  /** Defaults to `"raised"`. Each variant's recipe lives in the stylesheet. */
  readonly variant?: CardVariant | undefined;
}

export interface CardApi<T extends PropTypes = PropTypes> {
  readonly variant: CardVariant;
  getRootProps(): T["element"];
  getHeaderProps(): T["element"];
  getTitleProps(): T["element"];
  getDescriptionProps(): T["element"];
  getActionProps(): T["element"];
  getBodyProps(): T["element"];
  getFooterProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: CardMachineProps,
  normalize: NormalizeProps<T>,
): CardApi<T> {
  const variant = props.variant ?? "raised";

  return {
    variant,
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        "data-variant": variant,
        // The surface that applies the glass material is the one that
        // owes its subtree the on-glass palette (architecture.md): a separator,
        // a field or a label composed into a glass card remaps itself.
        "data-sui-on-glass": variant === "glass" ? "" : undefined,
      }),
    getHeaderProps: (): T["element"] => normalize.element({ ...parts.header.attrs }),
    getTitleProps: (): T["element"] => normalize.element({ ...parts.title.attrs }),
    getDescriptionProps: (): T["element"] => normalize.element({ ...parts.description.attrs }),
    getActionProps: (): T["element"] => normalize.element({ ...parts.action.attrs }),
    getBodyProps: (): T["element"] => normalize.element({ ...parts.body.attrs }),
    getFooterProps: (): T["element"] => normalize.element({ ...parts.footer.attrs }),
  };
}
