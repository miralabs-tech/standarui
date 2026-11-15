/**
 * `<Pagination count={480}/>` — and the one composed layer whose collection is
 * **not** the consumer's data.
 *
 * Every other composed component takes an array and places a part per entry.
 * Here the entries are `api.pages`, a discriminated union the machine computes
 * from `count`, `pageSize`, `siblingCount` and `boundaryCount`, and the layer
 * reads it back through `PaginationContext` — the render-prop part that exists
 * for exactly this. So there is no `options` prop and no `items` prop at all, and
 * the escape hatch is a single `renderItem` over a value the consumer never
 * supplied.
 *
 * **That is the point, and it is deliberate: this is the prototype of
 * `calendar`.** A calendar's cells are the same kind of collection — computed by
 * the machine from a month and a locale, reshaped whenever either moves, never
 * held by anybody. What this file proves for it is narrow and worth naming: a
 * machine-computed collection needs no eighth slot name (the closed vocabulary
 * of the composed layer holds), it needs one `render*` rather than one per cell
 * kind, and the key of a cell that carries no identity of its own comes from its
 * *position* — never from a neighbour that has one, because the neighbours are
 * exactly what a page turn changes. What it does **not** prove is the part a
 * calendar adds on top — a grid with two axes, a roving focus that moves in two
 * directions, and a collection that changes under the focus rather than beside
 * it.
 *
 * Zero glyph bytes here: `prev` and `next` carry `"previous page"` and
 * `"next page"` from the machine's own translations, and the ellipsis is already
 * drawn by `_pagination.scss` under `:empty`. The two label slots are visible
 * content, not names — a consumer who hands in a chevron gets the chevron and
 * keeps the name the machine wrote.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  PaginationContext,
  PaginationEllipsis,
  type PaginationEllipsisProps,
  PaginationItem,
  type PaginationItemProps,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
  type UsePaginationProps,
} from "./pagination";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 *
 * Four keys for the five parts of `pagination.anatomy.ts`. The fifth, `root`, is
 * absent because it is not reachable through a hatch here — this component *has*
 * a root element, so its props are the composed props themselves, `render`
 * included.
 */
export interface PaginationParts {
  /**
   * Applied to EVERY cell, hence no `page` — it identifies the cell — and no `id`
   * **or IDREF**: one id repeated down a bar is a broken reference per cell, and
   * one `aria-labelledby` repeated gives every cell the same name, which no
   * dangling-IDREF check can see because the id it points at does resolve. `ref`
   * goes for the same reason: a single ref held by N cells holds the last one.
   */
  readonly item?:
    | Omit<
        PaginationItemProps,
        "page" | "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  /** Applied to EVERY gap; `index` is the machine's, one per gap. */
  readonly ellipsis?:
    | Omit<
        PaginationEllipsisProps,
        "index" | "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly prevTrigger?: PartProps<"button"> | undefined;
  readonly nextTrigger?: PartProps<"button"> | undefined;
}

export interface PaginationComposedProps
  extends UsePaginationProps,
    Omit<PartProps<"nav", UsePaginationProps>, "children"> {
  /**
   * What the previous-page control shows. Content, never its name: the machine
   * writes `aria-label="previous page"` whatever is in here, so an inline SVG
   * costs nothing and an empty control is a drawn one rather than a blank.
   */
  readonly prevLabel?: ReactNode;
  /** The same, for the next-page control. */
  readonly nextLabel?: ReactNode;
  /**
   * Replaces the CHILDREN of a page cell, never the cell. `defaults` is what the
   * layer would have rendered — the page number — and it is handed over so that
   * **decorating** is the cheapest thing to do. Replacing it is the consumer's to
   * do and costs nothing this time: the cell's accessible name is `aria-label` on
   * the button, written by the machine, so a cell whose children are a spinner is
   * still "page 4". That is a difference from every other `render*` in the
   * composed layer, and it is worth stating rather than assuming.
   */
  readonly renderItem?: ((page: number, defaults: ReactNode) => ReactNode) | undefined;
  readonly parts?: PaginationParts | undefined;
}

export function Pagination(props: PaginationComposedProps): ReactNode {
  const { prevLabel, nextLabel, renderItem, parts, ...root } = props;

  return (
    <PaginationRoot {...root}>
      <PaginationPrevTrigger {...parts?.prevTrigger}>{prevLabel}</PaginationPrevTrigger>
      <PaginationContext>
        {(api) =>
          api.pages.map((entry, index) => {
            if (entry.type === "ellipsis") {
              // A gap has no identity of its own, and the pages around it are the
              // wrong place to borrow one from: they change on every page turn, so
              // a key made of them unmounts and remounts both ellipses each time.
              // There are exactly two gaps and they are *positions* — one before
              // the window, one after — so that is the key.
              //
              // Ratified 2026-09-05, and this module is why it had to be: three
              // conventions were live in the repo at once (`gap-after-<page>` in
              // `ssr.test.tsx`, `gap-start`/`gap-end` in the story, `gap-<a>-<b>`
              // in the browser test) and the composed layer picks one for every
              // consumer. The story's was the only one backed by a measurement.
              return (
                <PaginationEllipsis
                  key={index < api.pages.length / 2 ? "gap-start" : "gap-end"}
                  index={index}
                  {...parts?.ellipsis}
                />
              );
            }
            return (
              <PaginationItem key={entry.value} page={entry.value} {...parts?.item}>
                {renderItem === undefined ? entry.value : renderItem(entry.value, entry.value)}
              </PaginationItem>
            );
          })
        }
      </PaginationContext>
      <PaginationNextTrigger {...parts?.nextTrigger}>{nextLabel}</PaginationNextTrigger>
    </PaginationRoot>
  );
}
