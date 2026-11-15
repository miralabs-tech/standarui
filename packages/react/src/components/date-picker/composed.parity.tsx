/**
 * The date picker's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures.
 *
 * Every row pins `id` and `today`: the machine mints ids for the root, the label,
 * the field's segments and the trigger, and a picker with no `today` reads the
 * environment — a render on either side of midnight would differ by a month.
 *
 * **What these rows compare, and what they do not.** The surface is behind
 * `DatePickerPortal`, which returns `null` while the picker is closed — so the
 * markup under test is the label, the segmented field and the trigger, on both
 * sides. That is not a hole in the table: it is what the composed form renders at
 * rest, and what it renders open is compared by `composed-parts.browser.test.tsx`
 * and the component's own suite, which can open it. A row that opened the surface
 * here would compare two empty strings and pass while measuring nothing.
 */

import type { DateValue } from "@standarui/core/date-picker";
import type { ParityCase } from "../../composed.harness";
import {
  DateFieldControl,
  DateFieldHiddenInput,
  DateFieldSegments,
} from "../date-field/date-field";
import { DatePicker } from "./composed";
import {
  DatePickerClearTrigger,
  DatePickerField,
  DatePickerLabel,
  DatePickerRoot,
  DatePickerTrigger,
} from "./date-picker";

const TODAY: DateValue = { year: 2026, month: 9, day: 7 };

export const parity: readonly ParityCase[] = [
  {
    name: "date-picker",
    composed: (
      <DatePicker
        id="due"
        today={TODAY}
        label="Due date"
        prevLabel="Previous month"
        nextLabel="Next month"
        parts={{ field: { id: "due-field" } }}
      />
    ),
    parts: (
      <DatePickerRoot id="due" today={TODAY} label="Due date">
        <DatePickerLabel>Due date</DatePickerLabel>
        <DatePickerField id="due-field">
          <DateFieldControl>
            <DateFieldSegments />
          </DateFieldControl>
          <DateFieldHiddenInput />
        </DatePickerField>
        <DatePickerTrigger />
      </DatePickerRoot>
    ),
  },
  /**
   * `clearable`, which is the union's other branch: the button is mounted from the
   * moment the picker is clearable, `disabled` rather than absent while there is
   * nothing to clear, so `clearLabel` is what keeps it out of the tab order
   * unnamed.
   */
  {
    name: "date-picker",
    composed: (
      <DatePicker
        id="window"
        today={TODAY}
        label="Delivery window"
        clearable
        clearLabel="Clear the date"
        defaultValue={{ year: 2026, month: 9, day: 20 }}
        prevLabel="Previous month"
        nextLabel="Next month"
        parts={{ field: { id: "window-field" } }}
      />
    ),
    parts: (
      <DatePickerRoot
        id="window"
        today={TODAY}
        label="Delivery window"
        clearable
        defaultValue={{ year: 2026, month: 9, day: 20 }}
      >
        <DatePickerLabel>Delivery window</DatePickerLabel>
        <DatePickerField id="window-field">
          <DateFieldControl>
            <DateFieldSegments />
          </DateFieldControl>
          <DateFieldHiddenInput />
        </DatePickerField>
        <DatePickerClearTrigger aria-label="Clear the date" />
        <DatePickerTrigger />
      </DatePickerRoot>
    ),
  },
  /**
   * `parts` is applied last, so it wins over what the layer placed — and the two
   * entries here reach parts that belong to another component's tree, which is
   * this picker's own shape: `control` is the date field's, inside
   * `DatePickerField`.
   */
  {
    name: "date-picker",
    composed: (
      <DatePicker
        id="styled"
        today={TODAY}
        label="Styled"
        prevLabel="Previous month"
        nextLabel="Next month"
        parts={{
          field: { id: "styled-field" },
          label: { className: "lbl" },
          control: { className: "ctl" },
          trigger: { className: "btn" },
        }}
      />
    ),
    parts: (
      <DatePickerRoot id="styled" today={TODAY} label="Styled">
        <DatePickerLabel className="lbl">Styled</DatePickerLabel>
        <DatePickerField id="styled-field">
          <DateFieldControl className="ctl">
            <DateFieldSegments />
          </DateFieldControl>
          <DateFieldHiddenInput />
        </DatePickerField>
        <DatePickerTrigger className="btn" />
      </DatePickerRoot>
    ),
  },
];
