/**
 * What the composed alert dialog owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. What the `describe` below adds is the
 * reading of that markup — which of the two answers the machine will focus, and
 * which attribute the sheet paints.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { danglingIdRefs, OFF, partsOf } from "../../composed.harness";
import { AlertDialog } from "./composed";

/**
 * What the alert adds over the dialog, read in the markup: the role, the row of
 * answers, and the attribute that tells the two answers apart before either is
 * pressed. `destructive` is styling and deliberately not behaviour — the button
 * that deletes and the button that saves close the surface the same way.
 */
describe("the composed alert dialog", () => {
  const ANSWERS = [
    { label: "Delete", destructive: true },
    { label: "Cancel", cancel: true },
  ] as const;

  it("pins the role, so the machine opens the focus on the least destructive answer", () => {
    const html = renderToString(
      <AlertDialog
        id="a"
        defaultOpen
        parts={OFF}
        title="Delete 12 files?"
        description="This cannot be undone."
        actions={ANSWERS}
      />,
    );

    expect(html).toContain('role="alertdialog"');
    // The cancel button is what the machine looks up by id for its initial focus,
    // so `cancel: true` has to reach *that* part and not a second action.
    expect(partsOf(html, "dialog:cancel-trigger")).toEqual(["dialog:cancel-trigger"]);
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("carries `destructive` to the attribute the sheet paints, and only there", () => {
    const html = renderToString(
      <AlertDialog
        id="a"
        defaultOpen
        parts={OFF}
        title="Delete 12 files?"
        description="This cannot be undone."
        actions={ANSWERS}
      />,
    );
    const action = /<button[^>]*data-part="dialog:action-trigger"[^>]*>/.exec(html)?.[0] ?? "";
    const cancel = /<button[^>]*data-part="dialog:cancel-trigger"[^>]*>/.exec(html)?.[0] ?? "";

    expect(action).toContain('data-destructive=""');
    expect(cancel).not.toContain("data-destructive");
    // Same event on both: neither the attribute nor the part changes what a press
    // does, which is the contract `getActionTriggerProps` publishes.
    expect(action).toContain('type="button"');
    expect(cancel).toContain('type="button"');
  });
});
