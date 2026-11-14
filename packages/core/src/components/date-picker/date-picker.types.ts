import type { IntentScopeHost } from "@standarx/nav";
import type { DismissReason } from "../../interaction/layer-stack";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Placement } from "../../positioner/compute-position";
import type { Density, Direction, Rect } from "../../types";
import type { DateValue } from "../../utils/plain-date";

/** What the surface actually is once the density has had its say. */
export type DatePickerPresentation = "popup" | "sheet";

export type DatePickerPresentationProp = "auto" | DatePickerPresentation;

export interface DatePickerValueChangeDetails {
  readonly value: DateValue | null;
}

export interface DatePickerOpenChangeDetails {
  readonly open: boolean;
}

export interface DatePickerFocusChangeDetails {
  readonly value: DateValue;
}

export interface DatePickerDismissDetails {
  readonly reason: DismissReason;
}

/**
 * The machine props this picker hands its calendar. **Props, never merged
 * attributes**: a merge would let the picker's
 * `disabled: false` talk over a calendar that disabled itself, which is the rule
 * `field` imposed on every control below it.
 *
 * Assignability to `CalendarMachineProps` is what the adapter checks by spreading it onto
 * a calendar root — stated structurally here so the picker's types do not have to
 * reach into a sibling component's module.
 */
export interface DatePickerCalendarProps {
  readonly value: DateValue | null;
  readonly onValueChange: (details: DatePickerValueChangeDetails) => void;
  /**
   * The page, controlled from here — a calendar's anchor *is* the month it shows.
   * The picker holds it because it is the only one that sees both children: a date
   * typed in the field has to move the grid, and a grid that paged itself has to be
   * where the next open starts.
   */
  readonly focusedValue: DateValue;
  readonly onFocusChange: (details: DatePickerFocusChangeDetails) => void;
  readonly today: DateValue | undefined;
  readonly min: DateValue | null | undefined;
  readonly max: DateValue | null | undefined;
  readonly isDateUnavailable: ((value: DateValue) => boolean) | undefined;
  readonly locale: string | undefined;
  readonly dir: Direction | undefined;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly intents: IntentScopeHost | null | undefined;
}

/**
 * The machine props this picker hands its date field — the same descent, and the
 * one that carries the form: the picker's anatomy has no hidden input, so `name`
 * and `form` are the field's to submit.
 */
export interface DatePickerFieldProps {
  readonly value: DateValue | null;
  readonly onValueChange: (details: DatePickerValueChangeDetails) => void;
  readonly min: DateValue | undefined;
  readonly max: DateValue | undefined;
  readonly locale: string | undefined;
  readonly dir: Direction | undefined;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly name: string | undefined;
  readonly form: string | undefined;
  readonly labelledBy: string | undefined;
  readonly describedBy: string | undefined;
  readonly intents: IntentScopeHost | null | undefined;
}

export interface DatePickerMachineProps {
  // --- value -----------------------------------------------------------------
  /**
   * A civil date and nothing finer: `commit` narrows every value to year, month
   * and day, whichever child reported it, so the grid and the field cannot report
   * two shapes of the same date.
   *
   * The consequence, stated because it used to be stated the other way round: a
   * `date-field` given a time `granularity` inside a picker does **not** keep its
   * own time. The picker *controls* the field's value, so the narrowed date is
   * handed straight back and the time segments are cleared on every commit. A
   * picker is a day picker; a time belongs to a field standing on its own, and to
   * the `time-field` presentation the spec defers.
   */
  readonly value?: DateValue | null | undefined;
  readonly defaultValue?: DateValue | null | undefined;
  readonly onValueChange?: ((details: DatePickerValueChangeDetails) => void) | undefined;
  /** Renders the `clearTrigger`; without it the part is inert furniture. */
  readonly clearable?: boolean | undefined;

  // --- openness --------------------------------------------------------------
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((details: DatePickerOpenChangeDetails) => void) | undefined;
  readonly presentation?: DatePickerPresentationProp | undefined;
  /** A chosen day closes the surface. `false` keeps it out for a second choice. */
  readonly closeOnSelect?: boolean | undefined;

  // --- positioning, handed straight to the positioner ------------------------
  readonly placement?: Placement | undefined;
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  /**
   * `false` by default — the divergence from `select`, whose surface is a widened
   * trigger. A month is seven cells wide whatever the field beside it measures.
   */
  readonly matchWidth?: boolean | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;
  readonly getAnchorRect?: (() => Rect) | undefined;

  // --- relayed to the children ------------------------------------------------
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /**
   * Pinned rather than read from the environment, for `date-field`'s reason: the
   * locale decides the *order* of the segments and the wording of the trigger's
   * caption, so a locale resolved from the browser would have the server and the
   * client render different markup and hydration would say so.
   */
  readonly locale?: string | undefined;
  readonly today?: DateValue | undefined;
  readonly min?: DateValue | null | undefined;
  readonly max?: DateValue | null | undefined;
  readonly isDateUnavailable?: ((value: DateValue) => boolean) | undefined;
  readonly readOnly?: boolean | undefined;

  // --- dismissal (the select's defaults) ---------------------------------------
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  readonly preventOutsideActivation?: boolean | undefined;
  readonly modal?: boolean | undefined;
  /** Defaults to the `sheet` presentation and is ignored in `popup`. */
  readonly preventScroll?: boolean | undefined;
  readonly onDismiss?: ((details: DatePickerDismissDetails) => void) | undefined;
  /**
   * The layer this picker opened from — required once either end is portalled, or
   * a click inside the portalled surface reads as outside the layer that holds the
   * trigger. Adapters default it from their layer context.
   */
  readonly parentId?: string | undefined;

  // --- focus -----------------------------------------------------------------
  readonly restoreFocus?: boolean | undefined;
  readonly finalFocus?: (() => HTMLElement | null) | undefined;
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;

  // --- form (the field's, relayed) --------------------------------------------
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly required?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly disabled?: boolean | undefined;

  // --- naming ------------------------------------------------------------------
  /** `aria-label` for the trigger when nothing in it says what it opens. */
  readonly label?: string | undefined;
  /** `aria-labelledby` for the trigger and the field — what a `field` wires in. */
  readonly labelledBy?: string | undefined;
  readonly describedBy?: string | undefined;
  readonly intents?: IntentScopeHost | null | undefined;
}

export interface ResolvedDatePickerMachineProps extends DatePickerMachineProps {
  readonly defaultValue: DateValue | null;
  readonly defaultOpen: boolean;
  readonly presentation: DatePickerPresentationProp;
  readonly closeOnSelect: boolean;
  readonly clearable: boolean;
  readonly placement: Placement;
  readonly gap: number;
  readonly offset: number;
  readonly flip: boolean;
  readonly shift: boolean;
  readonly padding: number;
  readonly matchWidth: boolean;
  readonly strategy: "absolute" | "fixed";
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly preventOutsideActivation: boolean;
  readonly modal: boolean;
  readonly restoreFocus: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface DatePickerSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedDatePickerMachineProps;
  context: {
    /** The single source of truth; the state is a projection of it. */
    open: boolean;
    /** The app's date. Both children are controlled from it, so nothing drifts. */
    value: DateValue | null;
    /**
     * The month on screen, and the grid's roving anchor — one and the same thing,
     * which is the calendar's own founding decision. Held here rather than left to
     * the calendar because the picker is the only one that sees both children.
     */
    focusedValue: DateValue;
    density: Density;
    /**
     * The direction the portalled surface is drawn in, resolved from the anchor
     * when it opens. `null` until then — and on the server — which is what keeps
     * the first client render agreeing with the markup it hydrates.
     */
    surfaceDir: Direction | null;
    /** Where the surface landed — the preferred placement may have flipped. */
    currentPlacement: Placement;
    /** Whether a `title` is rendered; a `role="dialog"` names itself from one. */
    hasTitle: boolean;
    /**
     * Whether a `label` part is rendered. The field's `role="group"` is what
     * carries the accessible name, and it only
     * ever got one from a consumer's `labelledBy` — so a picker that rendered the
     * label part the anatomy gives it stayed anonymous.
     */
    hasLabel: boolean;
  };
  computed: {
    presentation: DatePickerPresentation;
    hasValue: boolean;
    /**
     * Modality is one question, so it is answered once. `modal` alone is not it:
     * an anchored popup leaves the page live behind it whatever the prop says.
     */
    isModal: boolean;
  };
  refs: {
    finalFocusEl: HTMLElement | null;
  };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "CLEAR.CLICK" }
    /** A day chosen in the calendar — the one path `closeOnSelect` answers. */
    | { type: "CALENDAR.SELECT"; value: DateValue | null }
    /** The grid paged itself: an arrow off the edge, a header button, a trigger. */
    | { type: "CALENDAR.PAGE"; value: DateValue }
    /** A date typed in the field. Never closes: the typing is not finished. */
    | { type: "FIELD.CHANGE"; value: DateValue | null }
    /** `api.setValue`/`clearValue` — never touches `open`. */
    | { type: "VALUE.SET"; value: DateValue | null }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CANCEL.CLICK" }
    | { type: "CLOSE.CLICK" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "PRESENTATION.SYNC" }
    | { type: "PARTS.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density };
  action:
    | "openPicker"
    | "closePicker"
    | "setOpen"
    | "captureFinalFocus"
    | "focusInitialCell"
    | "commitValue"
    | "setValue"
    | "clearValue"
    | "setPage"
    | "syncPage"
    | "invokeOnDismiss"
    | "syncEnvironment"
    | "syncPlacement"
    | "syncParts";
  guard: "isEnabled" | "isOpen" | "isClearable" | "shouldCloseOnSelect" | "canDismiss";
  effect:
    | "trackEnvironment"
    | "trackSurfaceDir"
    | "trackDismissable"
    | "lockPageScroll"
    | "trackAnchorPosition"
    | "focusContent"
    | "proxyTabs"
    | "hideOutside"
    | "captureIntents"
    | "warnCloseTriggerName";
}

export interface DatePickerApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly value: DateValue | null;
  readonly hasValue: boolean;
  /**
   * The value written out for a trigger that has no field in it — the touch chip,
   * whose whole content is the date. Empty string when there is none.
   */
  readonly valueText: string;
  readonly presentation: DatePickerPresentation;
  /** Where the surface landed, which is not necessarily what was asked for. */
  readonly placement: Placement;
  readonly triggerId: string;
  readonly contentId: string;

  setOpen(open: boolean): void;
  setValue(value: DateValue | null): void;
  /** Sugar for `setValue(null)`. */
  clearValue(): void;

  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getTriggerProps(): T["button"];
  getClearTriggerProps(): T["button"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getTitleProps(): T["element"];
  getCancelTriggerProps(): T["button"];
  getCloseTriggerProps(): T["button"];
  /** Machine props for the calendar this picker holds — spread, never merged. */
  getCalendarProps(): DatePickerCalendarProps;
  /** Machine props for the date field beside the trigger — spread, never merged. */
  getFieldProps(): DatePickerFieldProps;
}
