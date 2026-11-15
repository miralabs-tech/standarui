/**
 * What the composed menu owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. What the `describe` below adds is a
 * count over that tree — how many surfaces, how many checkmarks — which no
 * comparison of two strings that are equal can express.
 *
 * The engine-level half is `composed.browser.test.tsx`: this file renders on the
 * server and reads attributes, that one opens a submenu for real.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { danglingIdRefs, OFF, partsOf, subtreeOf } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { Menu } from "./composed";

/**
 * The menu's two shapes that no other composed component has: a recursive branch,
 * and a leading track the *surface* owns rather than the row.
 */
describe("the composed menu's tree", () => {
  it("writes a submenu as a trigger item followed by a second surface, inside the parent's", () => {
    const html = renderToString(
      <Menu
        id="file"
        defaultOpen
        keepMounted
        parts={OFF}
        trigger={<ButtonRoot />}
        items={[
          { value: "open", label: "Open" },
          {
            id: "share",
            value: "share",
            label: "Share",
            items: [{ value: "copy-link", label: "Copy link" }],
          },
        ]}
      />,
    );
    const surface = subtreeOf(html, "menu:content");

    // One token, not two: `triggerItem` is a part of its own precisely so the
    // element does not read as a composition and lose every `:not([data-part*=" "])`
    // rule the sheet hangs on a row.
    expect(partsOf(html, "menu:trigger-item")).toEqual(["menu:trigger-item"]);
    expect(surface).toContain('data-part="menu:trigger-item"');
    // The nested surface is inside the parent's, which is what the disabled portal
    // does here and what the sheet's drill-in does for real.
    expect(surface).toContain('role="menu"');
    expect(html.match(/role="menu"/g)?.length).toBe(2);
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("gives the checkmark cell to checkable rows and to no others", () => {
    const html = renderToString(
      <Menu
        id="view"
        defaultOpen
        label="View"
        parts={OFF}
        items={[
          { value: "open", label: "Open" },
          { value: "wrap", label: "Wrap lines", type: "checkbox", checked: false },
        ]}
      />,
    );

    // The gutter is read off the DOM by the machine and published on the *surface*,
    // so one indicator on a plain row would open the leading track on every row of
    // a menu with nothing to check.
    expect(html.match(/menu:item-indicator/g)?.length).toBe(1);
    expect(subtreeOf(html, "menu:item")).not.toContain("menu:item-indicator");
    expect(html.match(/data-part="menu:item"/g)?.length).toBe(2);
  });

  it("refuses both anchors at once, at the type level rather than at runtime", () => {
    const both = (
      // @ts-expect-error — exactly one of `trigger` and `contextTrigger`.
      <Menu id="m" parts={OFF} items={[]} trigger={<ButtonRoot />} contextTrigger="region" />
    );

    expect(both).toBeTruthy();
  });
});
