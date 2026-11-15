import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { IntentScopeHost } from "../../nav";
import type { Direction, InputModality } from "../../types";
import type { DateValue } from "../../utils/plain-date";

/**
 * The finest unit the field edits. It is the whole of `time-field`: the same
 * machine with `granularity: "minute"` grows an hour and a minute segment and
 * nothing else changes.
 */
export type DateGranularity = "day" | "hour" | "minute" | "second";

/** `h11`/`h24` are not offered: a 0-11 clock has no reading a spinbutton can show. */
export type DateHourCycle = "h12" | "h23";

/** The units a segment can hold. `dayPeriod` is derived from the hour, not stored. */
export type DateSegmentUnit = "year" | "month" | "day" | "hour" | "minute" | "second";

export type DateSegmentType = DateSegmentUnit | "dayPeriod";

/** What the machine holds: one number per unit, `null` while that unit is unfilled. */
export type DateSegmentValues = { readonly [K in DateSegmentUnit]: number | null };

/**
 * `DateValue` plus the time a granularity finer than a day asks for. Structurally
 * a subset of `Temporal.PlainDateTime` — same keys, same 1-based month — for the
 * same reason `DateValue` is one of `PlainDate`.
 */
export interface DateFieldValue extends DateValue {
  readonly hour?: number | undefined;
  readonly minute?: number | undefined;
  readonly second?: number | undefined;
}

/**
 * One rendered piece of the field, in display order — including the literals
 * between them, because `/` and `.` are as much a part of what a locale says as
 * the numbers are. A literal carries no value and no bounds.
 */
export interface DateSegment {
  readonly type: DateSegmentType | "literal";
  /** What to render: the formatted number, or the dashes of an unfilled unit. */
  readonly text: string;
  /** `null` while unfilled, and always `null` on a literal. */
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  /** The unit's name in the field's locale — the spinbutton's accessible name. */
  readonly label: string;
  readonly isPlaceholder: boolean;
}

export interface DateFieldValueChangeDetails {
  readonly value: DateFieldValue | null;
}

export interface DateFieldMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly value?: DateFieldValue | null | undefined;
  readonly defaultValue?: DateFieldValue | null | undefined;
  /** Compared on the date alone: a bound finer than a day is not a v1 promise. */
  readonly min?: DateValue | undefined;
  readonly max?: DateValue | undefined;
  readonly granularity?: DateGranularity | undefined;
  readonly hourCycle?: DateHourCycle | undefined;
  /**
   * The date an empty segment steps from, and the one whose month decides how
   * many days the day segment holds. Defaults to today, read once at init.
   */
  readonly placeholder?: DateFieldValue | undefined;
  /**
   * Pinned rather than read from the environment, the way `slider` and `progress`
   * pin theirs: the locale decides the *order* of the segments here, so a locale
   * resolved from the browser would have the server and the client render
   * different children and hydration would say so.
   */
  readonly locale?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /**
   * The group's own accessible name, for a field standing outside a `field`. The
   * segments each name their unit and none of them names the whole, so without
   * this — and without `labelledBy` — the `role="group"` had no seam to be named
   * through at all. `labelledBy` wins where both are given, which is what the
   * accessible-name computation does anyway.
   */
  readonly label?: string | undefined;
  /**
   * Id of the element naming the group. A `div[role="group"]` is not labelable,
   * so `<label for>` cannot reach it and the field hands its own label's id here.
   */
  readonly labelledBy?: string | undefined;
  /** The intent bus engage mode pushes its scope onto. `null` disables the pad. */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onValueChange?: ((details: DateFieldValueChangeDetails) => void) | undefined;
}

export interface ResolvedDateFieldMachineProps extends DateFieldMachineProps {
  readonly granularity: DateGranularity;
  readonly hourCycle: DateHourCycle;
  readonly locale: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface DateFieldSchema extends MachineSchema {
  state: "idle" | "focused" | "engaged";
  props: ResolvedDateFieldMachineProps;
  context: {
    /** The one source of truth. `value` is composed from it, never held beside it. */
    parts: DateSegmentValues;
    focusedSegment: DateSegmentType | null;
    /** The digits typed into the focused segment, while they are still fresh. */
    typeBuffer: string;
    focusSource: InputModality | null;
  };
  computed: {
    value: DateFieldValue | null;
    segments: DateSegment[];
    isEditable: boolean;
    isOutOfRange: boolean;
  };
  refs: {
    /** The snapshot B restores to. */
    entryParts: DateSegmentValues | null;
    /** When the last digit landed — the buffer's own clock, with no timer to leak. */
    lastDigitAt: number;
    /**
     * True for the length of a focus move the machine ordered itself. A blur that
     * arrives inside one is not the user leaving the field, and an engaged field
     * must not let go of the value because a d-pad walked to the next segment.
     */
    movingFocus: boolean;
    /**
     * The default placeholder, read from the clock the first time an arrow needs
     * one and held from then on. `null` until that happens — which is never on a
     * server, and never before a keypress on a client, so no rendered attribute
     * can depend on it.
     */
    today: DateFieldValue | null;
  };
  event:
    | { type: "SEGMENT.FOCUS"; segment: DateSegmentType }
    | { type: "SEGMENT.BLUR" }
    | { type: "SEGMENT.MOVE"; action: RovingAction }
    | { type: "SEGMENT.INPUT"; segment: DateSegmentType; digit: number }
    | { type: "SEGMENT.INCREMENT"; segment: DateSegmentType; large: boolean }
    | { type: "SEGMENT.DECREMENT"; segment: DateSegmentType; large: boolean }
    | { type: "SEGMENT.CLEAR"; segment: DateSegmentType }
    | { type: "TRIGGER.INCREMENT" }
    | { type: "TRIGGER.DECREMENT" }
    | { type: "VALUE.SET"; value: DateFieldValue | null }
    | { type: "VALUE.CLEAR" }
    | { type: "ENGAGE.START" }
    | { type: "ENGAGE.END"; committed: boolean }
    | { type: "FORM.RESET" };
  action:
    | "setValue"
    | "clearValue"
    | "setFocusedSegment"
    | "clearFocusedSegment"
    | "moveSegment"
    | "adjustSegment"
    | "adjustFocusedSegment"
    | "appendDigit"
    | "clearSegment"
    | "captureFocusSource"
    | "clearFocusSource"
    | "fillFromPlaceholder"
    | "snapshotParts"
    | "restoreParts"
    | "clearSnapshot"
    | "restoreInitialValue";
  guard: "isEditable" | "canEngage" | "isMovingFocus";
  effect: "trackModality" | "trackFormReset" | "captureSelectIntent" | "captureEngageIntents";
}

export interface DateFieldApi<T extends PropTypes = PropTypes> {
  readonly value: DateFieldValue | null;
  /** What the hidden input submits: `YYYY-MM-DD`, plus a time past `granularity: "day"`. */
  readonly valueAsString: string;
  /** In display order, literals included — the list a consumer maps over. */
  readonly segments: DateSegment[];
  readonly disabled: boolean;
  readonly invalid: boolean;
  /** A complete value outside `min`/`max`. Reported, never silently clamped. */
  readonly outOfRange: boolean;
  readonly engaged: boolean;
  readonly focusedSegment: DateSegmentType | null;
  /** The modality focus arrived under, or `null` while no segment holds it. */
  readonly focusSource: InputModality | null;
  readonly focusVisible: boolean;
  setValue(value: DateFieldValue | null): void;
  clear(): void;
  increment(): void;
  decrement(): void;
  getRootProps(): T["element"];
  getControlProps(): T["element"];
  getSegmentProps(segment: DateSegment): T["element"];
  getIncrementTriggerProps(): T["button"];
  getDecrementTriggerProps(): T["button"];
  getHiddenInputProps(): T["input"];
}
