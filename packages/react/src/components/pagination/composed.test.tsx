/**
 * What the composed pagination owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. Both sides of a row write the cells out
 * of `api.pages`, so a row cannot say whether *the machine* put the right number
 * of them there — which is what the `describe` below counts.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { danglingIdRefs } from "../../composed.harness";
import { Pagination } from "./composed";

/**
 * The prototype of `calendar`, and the narrow thing it proves: a collection the
 * machine computes needs no eighth slot name and no `options` prop at all. The
 * cells below were never written down by anybody — `count` and the window props
 * are the whole input.
 */
describe("the composed pagination's collection is the machine's", () => {
  it("places one cell per entry of `api.pages`, gaps included", () => {
    const html = renderToString(<Pagination id="pages" count={95} defaultPage={1} />);

    // 95 items at 10 a page, sitting on page 1: 1 2 3 4 5 … 10.
    expect(html.match(/data-part="pagination:item"/g)?.length).toBe(6);
    expect(html.match(/data-part="pagination:ellipsis"/g)?.length).toBe(1);
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("reshapes with the window rather than with anything the consumer holds", () => {
    const middle = renderToString(<Pagination id="pages" count={95} defaultPage={5} />);

    // Two gaps now, and the same props but for the page: the layer maps whatever
    // the machine computed, which is the half a `calendar` will need to trust.
    expect(middle.match(/data-part="pagination:ellipsis"/g)?.length).toBe(2);
    expect(middle).toContain('aria-current="page"');
  });
});
