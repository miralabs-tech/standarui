import type { EngageIntent, IntentScopeHost } from "@standarx/nav";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";
import type { RangeBounds, RangeMarks, RangePointOptions } from "../../utils/range";

export type SliderThumbAlignment = "contain" | "center";

/** Explicit positions, a count of evenly spaced ticks, or one tick per step. */
export type SliderMarks = RangeMarks;

export type SliderAdjustmentKind = "increment" | "decrement" | "min" | "max";

export interface SliderAdjustment {
  readonly kind: SliderAdjustmentKind;
  readonly large: boolean;
}

/**
 * The eight inputs `resolveDirection` mirrors. Spelled as the engage grammar's own
 * union so the keyboard and the d-pad cannot drift apart: an intent the pad can
 * send is an intent this component answers, and the compiler says so.
 */
export type SliderIntent = EngageIntent;

// Spelled here under the component's own names, defined once in `utils/range`:
// the arithmetic belongs to any bounded-range control, the vocabulary to this one.
/** Everything the constraint arithmetic needs, and nothing else. */
export type SliderRange = RangeBounds;

/** `thumbSize` is 0 under `thumbAlignment: "center"`. */
export type SliderPointOptions = RangePointOptions;

/** The four value events, as one union: a keyboard and a pad both produce them. */
export type SliderAdjustEvent =
  | { type: "THUMB.INCREMENT"; index: number; large: boolean }
  | { type: "THUMB.DECREMENT"; index: number; large: boolean }
  | { type: "THUMB.SET_MIN"; index: number }
  | { type: "THUMB.SET_MAX"; index: number };

/** Always an array, whatever shape the props were given in. */
export interface SliderValueChangeDetails {
  readonly value: number[];
}

export interface SliderValueTextDetails {
  readonly value: number;
  readonly index: number;
}

export interface SliderMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Vertical reads from the bottom — the minimum sits at the foot of the track — and `ArrowUp` still raises the value whatever the direction. */
  readonly orientation?: Orientation | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  /**
   * PageUp/PageDown and LT/RT. Defaults to a tenth of the range rather than ten
   * steps: on a 0→1000 slider stepping by 1, ten steps is 10, which is useless.
   */
  readonly largeStep?: number | undefined;
  /** The gap adjacent thumbs must keep, counted in steps. Defaults to 0, which lets two thumbs land on the same value. */
  readonly minStepsBetweenThumbs?: number | undefined;
  /** `"contain"` keeps the thumb inside the control; `"center"` overhangs it. */
  readonly thumbAlignment?: SliderThumbAlignment | undefined;
  readonly disabled?: boolean | undefined;
  /** Blocks the pointer, the arrow keys and the pad's engage mode, and unlike `disabled` leaves the thumb focusable and its value submitted. */
  readonly readOnly?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  /** One hidden input per thumb, so a range slider submits this name once per value. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** A scalar is accepted for ergonomics; the machine only ever holds an array. */
  readonly value?: number | readonly number[] | undefined;
  readonly defaultValue?: number | readonly number[] | undefined;
  readonly marks?: SliderMarks | undefined;
  /** Pinned to `en-US` rather than read from the browser: a locale resolved from the environment formats the same number differently on the server and the client, and hydration says so. */
  readonly locale?: string | undefined;
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  /** Wins over `formatOptions` when present — the whole string, per thumb. */
  readonly getValueText?: ((details: SliderValueTextDetails) => string) | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /**
   * Id of the element naming this control, used only when no `label` part is
   * rendered — a `field` supplies its own label's id, because `<label for>`
   * cannot name a `div[role="slider"]`.
   */
  readonly labelledBy?: string | undefined;
  /** The intent bus engage mode pushes its scope onto. `null` disables the pad. */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onValueChange?: ((details: SliderValueChangeDetails) => void) | undefined;
  /** Once per gesture, with the value the gesture ended on. */
  readonly onValueChangeEnd?: ((details: SliderValueChangeDetails) => void) | undefined;
}

export interface ResolvedSliderMachineProps extends SliderMachineProps {
  readonly orientation: Orientation;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly largeStep: number;
  readonly minStepsBetweenThumbs: number;
  readonly thumbAlignment: SliderThumbAlignment;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly locale: string;
  readonly formatOptions: Intl.NumberFormatOptions;
  readonly intents: IntentScopeHost | null;
}

export interface SliderSchema extends MachineSchema {
  state: "idle" | "focused" | "engaged";
  props: ResolvedSliderMachineProps;
  context: {
    value: number[];
    /** −1 when nothing is focused. */
    focusedIndex: number;
    /**
     * −1 when no drag is in flight. Context and not a state: a drag is concurrent
     * with focus rather than a mode of it, and a flat machine cannot hold both.
     */
    activeIndex: number;
    focusSource: InputModality | null;
    hasLabel: boolean;
  };
  computed: {
    isInteractive: boolean;
    percent: number[];
    valueAsText: string[];
    markValues: number[];
  };
  refs: {
    /** Measured once per gesture, for the `contain` travel. */
    thumbSize: number | null;
    /** The engage snapshot B restores to. */
    entryValue: number[] | null;
  };
  event:
    | SliderAdjustEvent
    | { type: "CONTROL.PRESS"; percent: number; index: number }
    | { type: "THUMB.DRAG"; percent: number }
    | { type: "THUMB.DRAG_END"; moved: boolean }
    | { type: "THUMB.FOCUS"; index: number }
    | { type: "THUMB.BLUR" }
    | { type: "THUMB.ENGAGE"; index: number }
    | { type: "THUMB.RELEASE"; committed: boolean }
    | { type: "VALUE.SET"; value: readonly number[] }
    | { type: "PARTS.SYNC" };
  action:
    | "setValue"
    | "setValueFromPercent"
    | "adjustValue"
    | "startDrag"
    | "endDrag"
    | "setFocusedIndex"
    | "focusThumb"
    | "captureFocusSource"
    | "clearFocusSource"
    | "snapshotValue"
    | "restoreValue"
    | "clearSnapshot"
    | "invokeChangeEnd"
    | "syncParts";
  guard: "isInteractive" | "isDragging" | "canEngage";
  effect:
    | "trackModality"
    | "trackParts"
    | "trackPointer"
    | "captureSelectIntent"
    | "captureEngageIntents";
}

export interface SliderThumbProps {
  readonly index: number;
}

export interface SliderMarkerProps {
  readonly value: number;
}

export interface SliderApi<T extends PropTypes = PropTypes> {
  readonly value: number[];
  /** 0…1 per thumb — the CSS gets the percentage, the consumer gets the ratio. */
  readonly valuePercent: number[];
  readonly valueAsText: string[];
  /** The tick positions `marks` resolves to — what `getMarkerProps` is fed. */
  readonly marks: number[];
  readonly dragging: boolean;
  readonly engaged: boolean;
  readonly disabled: boolean;
  readonly focusedIndex: number;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  readonly focusVisible: boolean;
  setValue(value: number | readonly number[]): void;
  setValueAtIndex(index: number, value: number): void;
  increment(index?: number): void;
  decrement(index?: number): void;
  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getValueTextProps(): T["element"];
  getControlProps(): T["element"];
  getTrackProps(): T["element"];
  getRangeProps(): T["element"];
  getThumbProps(props: SliderThumbProps): T["element"];
  getHiddenInputProps(props: SliderThumbProps): T["input"];
  getMarkerGroupProps(): T["element"];
  getMarkerProps(props: SliderMarkerProps): T["element"];
}
