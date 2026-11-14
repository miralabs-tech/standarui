/**
 * What the composed checkbox owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. The third row there already shows a
 * checkbox with no `label` matches a parts tree with no `CheckboxLabel` — what it
 * cannot say is that the part is truly absent rather than merely empty, which is
 * what the `describe` below asserts directly.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { partsOf } from "../../composed.harness";
import { Checkbox } from "./composed";

describe("the composed checkbox's label", () => {
  it("renders no label part at all when nothing names it", () => {
    const html = renderToString(<Checkbox id="silent" defaultChecked />);

    expect(html).toContain('data-part="checkbox:control"');
    expect(html).not.toContain("checkbox:label");
  });

  it("renders it once it is given, carrying the text", () => {
    const html = renderToString(<Checkbox id="terms" label="Accept the terms" />);

    expect(partsOf(html, "checkbox:label")).toEqual(["checkbox:label"]);
    expect(html).toContain(">Accept the terms<");
  });
});
