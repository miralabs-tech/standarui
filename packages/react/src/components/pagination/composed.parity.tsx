/**
 * The pagination's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { BOLT, type ParityCase, SAVE } from "../../composed.harness";
import { Pagination } from "./composed";
import {
  PaginationContext,
  PaginationEllipsis,
  PaginationItem,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "./pagination";

export const parity: readonly ParityCase[] = [
  /**
   * The one collection nobody supplied. There is no `options` prop here: the cells
   * are `api.pages`, which the machine computes from `count` and the window props,
   * and the parts side has to reach for the same render-prop context to write them
   * out. Both sides key the gap on its *position* — `gap-start` before the window,
   * `gap-end` after — because a gap has no identity of its own and its neighbours
   * are exactly what a page turn changes. That is the shape `calendar` needs too.
   */
  {
    name: "pagination",
    composed: <Pagination id="pages" count={95} defaultPage={5} />,
    parts: (
      <PaginationRoot id="pages" count={95} defaultPage={5}>
        <PaginationPrevTrigger />
        <PaginationContext>
          {(api) =>
            api.pages.map((entry, index) => {
              if (entry.type === "page") {
                return (
                  <PaginationItem key={entry.value} page={entry.value}>
                    {entry.value}
                  </PaginationItem>
                );
              }
              return (
                <PaginationEllipsis
                  key={index < api.pages.length / 2 ? "gap-start" : "gap-end"}
                  index={index}
                />
              );
            })
          }
        </PaginationContext>
        <PaginationNextTrigger />
      </PaginationRoot>
    ),
  },
  /**
   * The two label slots and the escape hatch. `prevLabel` and `nextLabel` are
   * content and never a name — the machine wrote `"previous page"` before either
   * arrived — and `renderItem` decorates the number rather than replacing the
   * cell, which is why the cell keeps its own `aria-label` whatever goes in it.
   */
  {
    name: "pagination",
    composed: (
      <Pagination
        id="pages"
        count={480}
        defaultPage={12}
        siblingCount={0}
        prevLabel={SAVE}
        nextLabel={BOLT}
        renderItem={(page, defaults) => (
          <>
            <span aria-hidden="true">#</span>
            {defaults}
            <span aria-hidden="true">{page}</span>
          </>
        )}
      />
    ),
    parts: (
      <PaginationRoot id="pages" count={480} defaultPage={12} siblingCount={0}>
        <PaginationPrevTrigger>{SAVE}</PaginationPrevTrigger>
        <PaginationContext>
          {(api) =>
            api.pages.map((entry, index) => {
              if (entry.type === "page") {
                return (
                  <PaginationItem key={entry.value} page={entry.value}>
                    <span aria-hidden="true">#</span>
                    {entry.value}
                    <span aria-hidden="true">{entry.value}</span>
                  </PaginationItem>
                );
              }
              return (
                <PaginationEllipsis
                  key={index < api.pages.length / 2 ? "gap-start" : "gap-end"}
                  index={index}
                />
              );
            })
          }
        </PaginationContext>
        <PaginationNextTrigger>{BOLT}</PaginationNextTrigger>
      </PaginationRoot>
    ),
  },
  /**
   * Precedence on a bar with no trigger to substitute, so the collision is with
   * the *machine's* default rather than the layer's: `getPrevTriggerProps` writes
   * `aria-label="previous page"`, `parts` is applied after it, and the consumer's
   * word is what the parts side carries. `parts.item` reaches every cell of a
   * collection the consumer never wrote down.
   */
  {
    name: "pagination",
    composed: (
      <Pagination
        id="pages"
        count={95}
        defaultPage={5}
        parts={{
          prevTrigger: { "aria-label": "Older" },
          nextTrigger: { "aria-label": "Newer" },
          item: { className: "cell" },
          ellipsis: { className: "gap" },
        }}
      />
    ),
    parts: (
      <PaginationRoot id="pages" count={95} defaultPage={5}>
        <PaginationPrevTrigger aria-label="Older" />
        <PaginationContext>
          {(api) =>
            api.pages.map((entry, index) => {
              if (entry.type === "page") {
                return (
                  <PaginationItem key={entry.value} page={entry.value} className="cell">
                    {entry.value}
                  </PaginationItem>
                );
              }
              return (
                <PaginationEllipsis
                  key={index < api.pages.length / 2 ? "gap-start" : "gap-end"}
                  index={index}
                  className="gap"
                />
              );
            })
          }
        </PaginationContext>
        <PaginationNextTrigger aria-label="Newer" />
      </PaginationRoot>
    ),
  },
];
