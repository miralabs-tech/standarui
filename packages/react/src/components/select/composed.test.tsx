/**
 * What the composed select owes beyond the markup its rows already pin.
 *
 * The rows live in `composed.parity.tsx` beside this file and are run by the loop
 * in `packages/react/src/composed.test.tsx`; string equality is the whole proof
 * that the two forms place the same tree. What a string comparison cannot say is
 * anything about a tree the *parts* form does not write down — which is what the
 * `describe` below is about.
 *
 * The engine-level half is `composed.browser.test.tsx`: this file renders on the
 * server and reads attributes, that one drives a keyboard and a pad.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { danglingIdRefs, OFF } from "../../composed.harness";
import { FieldLabel, FieldRoot } from "../field/field";
import { Select } from "./composed";

/**
 * `role="combobox"` takes no name from its contents — the contents are the
 * *value* — so a select with no `label` of its own has exactly one other way to
 * get one, and the parity row in `composed.parity.tsx` proves the markup. This
 * proves the wiring: the field's `label[for]` has to land on the element carrying
 * `select:trigger`, or the name is a `for` pointing into the void that axe would
 * only ever report as `incomplete` (`ROADMAP.md`, the lesson).
 */
describe("the composed form inside a field", () => {
  it("wears the field's control id on the trigger, so `label[for]` resolves", () => {
    const html = renderToString(
      <FieldRoot id="weather">
        <FieldLabel>Condition</FieldLabel>
        <Select
          id="condition"
          parts={OFF}
          options={[
            { value: "clear", label: "Clear" },
            { value: "cloudy", label: "Cloudy" },
          ]}
        />
      </FieldRoot>,
    );

    const control = /<label[^>]*\sfor="([^"]+)"/.exec(html)?.[1];
    const trigger = /<button[^>]*\sdata-part="select:trigger"[^>]*>/.exec(html)?.[0] ?? "";

    expect(control).toBe("field:weather:control");
    expect(/\sid="([^"]+)"/.exec(trigger)?.[1]).toBe(control);
    // Named natively, and only once: no `aria-label` and no IDREF on the trigger,
    // which would be a second voice over the label the field already renders.
    expect(trigger).not.toContain("aria-label");
    // The listbox still names itself after the trigger, and the trigger is now the
    // field's control — so the IDREF resolves through the same id.
    expect(html).toContain(`aria-labelledby="${control}"`);
    expect(danglingIdRefs(html)).toEqual([]);
  });
});
