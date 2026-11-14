/**
 * The escape hatch the public page documents, exercised.
 *
 * `date-picker.md` now tells a consumer that clicking inside the field can open
 * the grid without a prop for it: control `open` and hand the field an `onClick`
 * through `parts`. That sentence had no gate under it, and a documented hatch
 * with no witness is the way `breadcrumb`'s `setExpanded(false)` stayed
 * half-delivered for three phases — a paragraph promising an API that nothing
 * anywhere exercises.
 *
 * It is also narrower than it reads, and the narrow part is what is pinned here.
 * `DatePickerField` spreads the picker's machine props *after* the consumer's, so
 * on a collision the picker wins: `parts={{ field: { locale } }}` is overwritten
 * by the locale the picker resolved, deliberately, because one locale has to
 * decide both children. The `onClick` survives only because the picker writes no
 * handler onto the field at all. Both halves are asserted, so the day the picker
 * starts wiring a click there, this file says so instead of the page quietly
 * becoming false.
 */

import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fire, mount, queryPart, settle, unmountAll, waitFor } from "../../render-harness";
import { DatePicker } from "./composed";

/**
 * By its own data-part, not through `queryPart`'s suffix match: `DatePickerField`
 * is not an anatomy part of the picker — it is a `DateFieldRoot`, so there is no
 * `date-picker:field` to find, and `"root"` would match the picker's own root
 * first. The page says as much; this is what saying it costs a test.
 */
const field = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-part~="date-field:root"]');

afterEach(() => {
  unmountAll();
});

const TODAY = { year: 2026, month: 9, day: 7 } as const;

function OpenOnFieldClick(): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <DatePicker
      id="ship"
      label="Ship on"
      today={TODAY}
      defaultValue={{ year: 2026, month: 9, day: 20 }}
      prevLabel="Previous month"
      nextLabel="Next month"
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      parts={{ field: { onClick: () => setOpen(true) } }}
    />
  );
}

describe("opening the grid from the field", () => {
  it("is not what a click does by default", async () => {
    mount(
      <DatePicker
        id="due"
        label="Due date"
        today={TODAY}
        prevLabel="Previous month"
        nextLabel="Next month"
      />,
    );
    await settle();

    expect(field()).not.toBeNull();

    fire(() => field()?.click());
    await settle();

    // The native combo box reading: the field and the button are two click zones
    // of one control, and only the button opens.
    expect(queryPart(document.body, "content")).toBeNull();
  });

  it("is what the documented hatch does", async () => {
    mount(<OpenOnFieldClick />);
    await settle();

    fire(() => field()?.click());

    await waitFor(() => {
      expect(queryPart(document.body, "content")).not.toBeNull();
    });
  });

  /**
   * The half that keeps the page honest: the hatch is open for an event the picker
   * does not wire, and shut for a prop it does. If `parts.field` ever started
   * winning, the paragraph would need rewriting rather than celebrating.
   */
  it("does not let `parts.field` win over a prop the picker resolves", async () => {
    mount(
      <DatePicker
        id="locale"
        label="Due date"
        today={TODAY}
        locale="en-GB"
        prevLabel="Previous month"
        nextLabel="Next month"
        parts={{ field: { locale: "ar-EG" } }}
      />,
    );
    await settle();

    // en-GB orders the segments day-month-year; ar-EG would not, and would also
    // bring its own numbering system. The picker's resolved locale is what stands.
    const segments = [
      ...document.querySelectorAll<HTMLElement>('[data-part~="date-field:segment"]'),
    ]
      .map((node) => node.dataset.segment)
      .filter((name) => name !== undefined && name !== "literal");

    expect(segments).toEqual(["day", "month", "year"]);
  });
});
