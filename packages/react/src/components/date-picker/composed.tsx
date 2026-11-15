/**
 * `<DatePicker label="…" prevLabel="…" nextLabel="…"/>` — the segmented field, the
 * button that opens the surface, and the month grid inside it.
 *
 * Thirteen parts in the anatomy and ten keys in `parts`; `root` is not one, for the
 * reason it never is. What this layer places that no other does is **two other
 * components' parts**: `DatePickerField` is a `DateFieldRoot` driven by the picker's
 * props, and `DatePickerCalendar` is a `CalendarRoot` driven the same way — so the
 * field's control and the calendar's header and grid are written here, inside them.
 *
 * **The calendar's two plural placers are what make the grid possible.** `api.weeks`
 * and `api.weekdays` are cut by the machine from the page it computed, so a composed
 * layer — which may call no hook — cannot loop over either. `CalendarWeekdays` and
 * `CalendarWeeks` do the looping; this file poses them and calls nothing.
 *
 * **The header is the reference arrangement, and the sheet is what holds it together.**
 * The caption comes first and the two arrows follow it, which is what the picker
 * draws where a bare `<Calendar>` straddles its caption instead. No wrapper holds
 * the pair: `_calendar.scss` gives a `prev-trigger` that is not the header's first
 * child an auto inline-start margin, so the two travel to the end together. That is
 * the doctrine settled on 2026-09-10 — the sheet pairs, the layer renders bare parts
 * — and it is why the delivered demo's `<span style>` is gone.
 *
 * **`prevLabel` and `nextLabel` are required for the reason they are on `Calendar`:**
 * neither paging getter writes an `aria-label`, and the sheet now fills both buttons
 * with a chevron drawn under `:empty`. The picker's own trigger needs none — it takes
 * its name from `label` through the machine — and `clearLabel` is required only where
 * the button exists, which is what the union below says.
 */

import { isDev, warn } from "@standarui/core";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  CalendarCaption,
  CalendarGrid,
  CalendarHeader,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarWeekdayRow,
  CalendarWeekdays,
  CalendarWeeks,
} from "../calendar/calendar";
import {
  DateFieldControl,
  DateFieldHiddenInput,
  type DateFieldRootProps,
  DateFieldSegments,
} from "../date-field/date-field";
import {
  DatePickerBackdrop,
  DatePickerCalendar,
  DatePickerClearTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerLabel,
  DatePickerPortal,
  DatePickerPositioner,
  DatePickerRoot,
  DatePickerTrigger,
  type UseDatePickerProps,
} from "./date-picker";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface DatePickerParts {
  readonly label?: PartProps<"span"> | undefined;
  /**
   * The `DateFieldRoot` the picker drives. Its own id is the one part of this
   * tree the picker's machine does not mint — the field runs a machine of its
   * own — so this is where a consumer pins it, and where the parity table has to.
   */
  readonly field?: DateFieldRootProps | undefined;
  readonly control?: PartProps<"div"> | undefined;
  readonly clearTrigger?: PartProps<"button"> | undefined;
  readonly trigger?: PartProps<"button"> | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  /** The calendar's header, inside the surface — not the picker's own row. */
  readonly calendarHeader?: PartProps<"div"> | undefined;
  readonly caption?: PartProps<"div"> | undefined;
  readonly prevTrigger?: PartProps<"button"> | undefined;
  readonly nextTrigger?: PartProps<"button"> | undefined;
  readonly grid?: PartProps<"table"> | undefined;
  readonly weekdayRow?: PartProps<"tr"> | undefined;
}

export interface DatePickerBaseComposedProps
  extends Omit<UseDatePickerProps, "clearable">,
    Omit<PartProps<"div", UseDatePickerProps>, "children"> {
  /** Names the button that pages backwards, and it is required: see the header. */
  readonly prevLabel: string;
  /** Names the button that pages forwards, and it is required: see the header. */
  readonly nextLabel: string;
  readonly parts?: DatePickerParts | undefined;
}

/**
 * The pair no single `interface` can hold: `clearLabel` is absent wherever there is
 * no clear button, and required the one place there is. `getClearTriggerProps` emits
 * no accessible name of its own, and the button stays mounted and merely `disabled`
 * when there is nothing to clear — a control that vanished as it was pressed would
 * move everything beside it — so an unnamed one would sit in the tab order forever.
 */
type DatePickerClearProps =
  | { readonly clearable?: false | undefined; readonly clearLabel?: undefined }
  | { readonly clearable: true; readonly clearLabel: string };

export type DatePickerComposedProps = DatePickerBaseComposedProps & DatePickerClearProps;

export function DatePicker(props: DatePickerComposedProps): ReactNode {
  const { parts, prevLabel, nextLabel, clearLabel, ...root } = props;
  const clearable = root.clearable === true;

  // The half the union and the signature cannot state: an empty string is a
  // `string`, a `clearable` read from a variable is plain `boolean` and lands in
  // the loose branch, and a caller with no type checker met neither.
  warn(
    isDev() && clearable && (clearLabel === undefined || clearLabel === ""),
    'DatePicker: `clearLabel` names the clear button and is required under `clearable` — `getClearTriggerProps` writes no accessible name of its own, and the button stays in the tab order even with nothing to clear. Pass the word, or it ships as a button called "button".',
  );
  warn(
    isDev() &&
      (prevLabel === undefined || prevLabel === "" || nextLabel === undefined || nextLabel === ""),
    'DatePicker: `prevLabel` and `nextLabel` name the calendar\'s two paging buttons and are required — the sheet fills both with a chevron drawn in CSS, so nothing else can name them. Pass the words, or they ship as buttons called "button".',
  );

  return (
    <DatePickerRoot {...root}>
      {root.label == null ? null : (
        <DatePickerLabel {...parts?.label}>{root.label}</DatePickerLabel>
      )}
      <DatePickerField {...parts?.field}>
        <DateFieldControl {...parts?.control}>
          <DateFieldSegments />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DatePickerField>
      {clearable ? (
        <DatePickerClearTrigger aria-label={clearLabel} {...parts?.clearTrigger} />
      ) : null}
      <DatePickerTrigger {...parts?.trigger} />
      <DatePickerPortal>
        <DatePickerBackdrop {...parts?.backdrop} />
        <DatePickerPositioner {...parts?.positioner}>
          <DatePickerContent {...parts?.content}>
            <DatePickerCalendar>
              <CalendarHeader {...parts?.calendarHeader}>
                <CalendarCaption {...parts?.caption} />
                <CalendarPrevTrigger aria-label={prevLabel} {...parts?.prevTrigger} />
                <CalendarNextTrigger aria-label={nextLabel} {...parts?.nextTrigger} />
              </CalendarHeader>
              <CalendarGrid {...parts?.grid}>
                <CalendarWeekdayRow {...parts?.weekdayRow}>
                  <CalendarWeekdays />
                </CalendarWeekdayRow>
                <CalendarWeeks />
              </CalendarGrid>
            </DatePickerCalendar>
          </DatePickerContent>
        </DatePickerPositioner>
      </DatePickerPortal>
    </DatePickerRoot>
  );
}
