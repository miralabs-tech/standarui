/**
 * What the composed dialog owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. What it cannot say is what happens when
 * a slot is left empty — a part the parts form simply does not write has no row to
 * be compared against — which is what the `describe` below is about.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { duplicateIds, OFF } from "../../composed.harness";
import { Dialog } from "./composed";

/** The `id` of the one element carrying `token`, or `""` where the part is absent. */
function idOfPart(html: string, token: string): string {
  const tag = new RegExp(`<button[^>]*data-part="${token}"[^>]*>`).exec(html);
  return /\sid="([^"]+)"/.exec(tag?.[0] ?? "")?.[1] ?? "";
}

/**
 * The close button of a dialog is the library's one part with no accessible name
 * of its own — `getCloseTriggerProps` writes an id, a type, a state and a click
 * handler, and stops. So the composed layer follows the rule `MenuContent`
 * already applies to its Cancel row: the word makes the part appear, and its
 * absence makes the part not exist. A painted, nameless button is the worse of
 * the two failures, which is why there is no default glyph without a default name.
 */
describe("the composed dialog's close button", () => {
  it("renders no close part at all when nothing names it", () => {
    const html = renderToString(<Dialog id="d" defaultOpen parts={OFF} title="Rename file" />);

    expect(html).toContain('data-part="dialog:content"');
    expect(html).not.toContain("dialog:close-trigger");
  });

  it("renders it named and empty, which is what lets the sheet draw the glyph", () => {
    const html = renderToString(
      <Dialog id="d" defaultOpen parts={OFF} title="Rename file" closeLabel="Close" />,
    );
    const close = /<button[^>]*data-part="dialog:close-trigger"[^>]*>(.*?)<\/button>/.exec(html);

    expect(close?.[0]).toContain('aria-label="Close"');
    // Empty, to the character: `_dialog.scss` paints the ✕ under `:empty`, and a
    // consumer's own glyph keeps the cell by reaching `parts.closeTrigger`.
    expect(close?.[1]).toBe("");
  });
});

/**
 * `actions` is an array with no upper bound over parts whose ids are minted per
 * scope. The non-cancel half was keyed on 2026-09-05; the cancel half was not, and
 * two ways out of the same surface still answered to one id. Both halves are asked
 * here, because the second one cannot be keyed the way the first was: an alert
 * opens its focus on the element `getCancelTriggerEl` resolves, and that lookup
 * reads the un-indexed id.
 */
describe("the composed dialog's row of answers", () => {
  const THREE = [
    { label: "Discard", destructive: true },
    { label: "Keep editing", cancel: true },
    { label: "Save instead", cancel: true },
  ];

  it("gives every button its own id, however many ways out the row draws", () => {
    const html = renderToString(
      <Dialog id="d" defaultOpen parts={OFF} title="Discard draft?" actions={THREE} />,
    );

    expect(duplicateIds(html)).toEqual([]);
  });

  it("leaves the first way out on the id an alert opens its focus by", () => {
    // Compared against the single-answer form rather than spelled out: what has to
    // hold is that the row's first cancel keeps the id `getCancelTriggerEl` looks
    // up, and the natural writing order puts it second, so it is not index 0.
    const alone = renderToString(
      <Dialog
        id="d"
        defaultOpen
        parts={OFF}
        title="Discard draft?"
        actions={[{ label: "Keep editing", cancel: true }]}
      />,
    );
    const row = renderToString(
      <Dialog id="d" defaultOpen parts={OFF} title="Discard draft?" actions={THREE} />,
    );

    expect(idOfPart(alone, "dialog:cancel-trigger")).not.toBe("");
    expect(idOfPart(row, "dialog:cancel-trigger")).toBe(idOfPart(alone, "dialog:cancel-trigger"));
  });

  it("lets an action name the event its own documentation promises it", () => {
    // The JSDoc of `actions` publishes the veto `getActionTriggerProps` implements
    // — "a `preventDefault()` inside it keeps the surface open". Under a zero-arg
    // `onPress` that sentence was unwriteable: this fixture is what would not
    // compile, and the typecheck is the gate that says so.
    const html = renderToString(
      <Dialog
        id="d"
        defaultOpen
        parts={OFF}
        title="Discard draft?"
        actions={[
          {
            label: "Delete",
            destructive: true,
            onPress: (event) => {
              event.preventDefault();
            },
          },
          { label: "Keep editing", cancel: true },
        ]}
      />,
    );

    expect(html).toContain('data-part="dialog:action-trigger"');
    expect(duplicateIds(html)).toEqual([]);
  });
});
