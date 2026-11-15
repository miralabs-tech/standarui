/**
 * The date field's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`: the machine mints ids for the group, the segments and the
 * hidden input, and two forms of the same field would otherwise differ on every
 * one of them.
 */

import type { ParityCase } from "../../composed.harness";
import { DateField } from "./composed";
import {
  DateFieldControl,
  DateFieldDecrementTrigger,
  DateFieldHiddenInput,
  DateFieldIncrementTrigger,
  DateFieldRoot,
  DateFieldSegments,
} from "./date-field";

export const parity: readonly ParityCase[] = [
  {
    name: "date-field",
    composed: <DateField id="born" defaultValue={{ year: 1994, month: 3, day: 17 }} />,
    parts: (
      <DateFieldRoot id="born" defaultValue={{ year: 1994, month: 3, day: 17 }}>
        <DateFieldControl>
          <DateFieldSegments />
          <DateFieldIncrementTrigger />
          <DateFieldDecrementTrigger />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DateFieldRoot>
    ),
  },
  /**
   * `granularity` reaches the machine and changes how many segments the strip
   * has — the composed form places `DateFieldSegments`, not a fixed list, so the
   * two sides have to agree on the locale's answer and not on a count written
   * here.
   */
  {
    name: "date-field",
    composed: (
      <DateField
        id="departure"
        name="departure"
        granularity="minute"
        defaultValue={{ year: 2026, month: 4, day: 9, hour: 13, minute: 5 }}
      />
    ),
    parts: (
      <DateFieldRoot
        id="departure"
        name="departure"
        granularity="minute"
        defaultValue={{ year: 2026, month: 4, day: 9, hour: 13, minute: 5 }}
      >
        <DateFieldControl>
          <DateFieldSegments />
          <DateFieldIncrementTrigger />
          <DateFieldDecrementTrigger />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DateFieldRoot>
    ),
  },
  /**
   * `label` is a machine prop, not an element one: it names the `role="group"`
   * and must not land on the root as a bare `label` attribute. The composed form
   * spreads its rest onto `DateFieldRoot`, so `MACHINE_PROPS` is what decides —
   * this row is what proves the spread did not change that.
   */
  {
    name: "date-field",
    composed: <DateField id="reminder" label="Reminder" disabled />,
    parts: (
      <DateFieldRoot id="reminder" label="Reminder" disabled>
        <DateFieldControl>
          <DateFieldSegments />
          <DateFieldIncrementTrigger />
          <DateFieldDecrementTrigger />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DateFieldRoot>
    ),
  },
  /** `parts` is applied last, so it wins over what the layer placed. */
  {
    name: "date-field",
    composed: (
      <DateField
        id="due"
        parts={{
          control: { className: "x" },
          incrementTrigger: { className: "up" },
          decrementTrigger: { tabIndex: -1 },
          hiddenInput: { className: "mirror" },
        }}
      />
    ),
    parts: (
      <DateFieldRoot id="due">
        <DateFieldControl className="x">
          <DateFieldSegments />
          <DateFieldIncrementTrigger className="up" />
          <DateFieldDecrementTrigger tabIndex={-1} />
        </DateFieldControl>
        <DateFieldHiddenInput className="mirror" />
      </DateFieldRoot>
    ),
  },
];
