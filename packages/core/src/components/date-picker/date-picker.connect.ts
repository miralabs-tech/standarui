import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Align, Side } from "../../positioner/compute-position";
import { formatDate } from "../../utils/date-format";
import type { DateValue } from "../../utils/plain-date";
import { parts } from "./date-picker.anatomy";
import {
  getBackdropId,
  getCancelTriggerId,
  getClearTriggerId,
  getCloseTriggerId,
  getContentId,
  getLabelId,
  getPositionerId,
  getRootId,
  getTitleId,
  getTriggerId,
} from "./date-picker.dom";
import type {
  DatePickerApi,
  DatePickerCalendarProps,
  DatePickerFieldProps,
  DatePickerSchema,
} from "./date-picker.types";

/**
 * The caption of a trigger that holds no field — the collapsed chip,
 * whose whole content is the date. Short month, so a chip stays a
 * chip in every locale that spells "September" out.
 */
const CAPTION_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function connect<T extends PropTypes>(
  service: Service<DatePickerSchema>,
  normalize: NormalizeProps<T>,
): DatePickerApi<T> {
  const { context, computed, prop, send, scope } = service;

  const open = context.get("open");
  const value = context.get("value");
  const hasValue = computed("hasValue");
  const hasTitle = context.get("hasTitle");
  const hasLabel = context.get("hasLabel");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  const required = prop("required");
  const dir = prop("dir");
  const locale = prop("locale") ?? "en-US";
  const presentation = computed("presentation");
  const state = open ? "open" : "closed";
  const stateAttrs = { "data-state": state, "data-presentation": presentation };
  const placement = context.get("currentPlacement");
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const rootId = getRootId(scope);
  const labelId = getLabelId(scope);
  const triggerId = getTriggerId(scope);
  const contentId = getContentId(scope);
  const titleId = getTitleId(scope);

  const valueText = value === null ? "" : formatDate(value, locale, CAPTION_FORMAT);
  const canClear = prop("clearable") && hasValue && !disabled && !readOnly;
  const labelledBy = prop("labelledBy");
  const label = prop("label");

  /**
   * The two children, driven by props and never by merged attributes: a merge
   * would let this picker's `disabled: false` talk over a calendar or a field that
   * disabled itself (the rule `field` set).
   *
   * The two handlers are separate on purpose. A day chosen in the grid is a
   * decision and closes the surface; a date typed in the field is a keystroke and
   * must not — the year is nearly always the last unit filled, and a field that
   * closed the picker halfway through a date would be unusable.
   */
  const calendarProps: DatePickerCalendarProps = {
    value,
    onValueChange: (details) => send({ type: "CALENDAR.SELECT", value: details.value }),
    focusedValue: context.get("focusedValue"),
    onFocusChange: (details) => send({ type: "CALENDAR.PAGE", value: details.value }),
    today: prop("today"),
    min: prop("min"),
    max: prop("max"),
    isDateUnavailable: prop("isDateUnavailable"),
    // The resolved locale, not the raw prop. `undefined` does not mean the same
    // thing to the two children: the field pins `en-US` so the segment *order*
    // cannot differ between server and client (date-field.machine.ts:165-169),
    // while the calendar falls through to the document via `ENVIRONMENT.SYNC`
    // (calendar.machine.ts:219). Relaying the raw prop let one picker render a
    // French grid above American segments.
    locale,
    dir,
    readOnly,
    disabled,
    invalid,
    intents: prop("intents"),
  };

  const fieldProps: DatePickerFieldProps = {
    value,
    onValueChange: (details) => send({ type: "FIELD.CHANGE", value: details.value }),
    // The field bounds with `DateValue | undefined`, the picker with a nullable —
    // `null` is how a consumer clears a bound they were passing.
    min: prop("min") ?? undefined,
    max: prop("max") ?? undefined,
    // Resolved, for the reason given on the calendar's line above: one locale
    // decides both children or neither.
    locale,
    dir,
    disabled,
    readOnly,
    required,
    invalid,
    // The form is the field's: this anatomy has no hidden input of its own.
    name: prop("name"),
    form: prop("form"),
    // An explicit `labelledBy` wins — it is what a `field` above hands down, and
    // "inherits the field it sits in" is a contract with a test of its own. The
    // rendered `label` part is the *fallback*, and it is the half that was
    // missing: relaying the prop alone left that part with an id nothing
    // referenced, so a picker standing on its own handed a reader an anonymous
    // group of spinbuttons in every story that rendered one.
    //
    // Note the precedence is the opposite of `color-picker`, which lets its own
    // label part win over `labelledBy`. Only one of the two can be right; this one
    // has the `field` contract behind it.
    labelledBy: labelledBy ?? (hasLabel ? labelId : undefined),
    describedBy: prop("describedBy"),
    intents: prop("intents"),
  };

  return {
    open,
    value,
    hasValue,
    valueText,
    presentation,
    placement,
    triggerId,
    contentId,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    setValue(next: DateValue | null): void {
      send({ type: "VALUE.SET", value: next });
    },

    clearValue(): void {
      send({ type: "VALUE.SET", value: null });
    },

    getCalendarProps: (): DatePickerCalendarProps => calendarProps,
    getFieldProps: (): DatePickerFieldProps => fieldProps,

    /**
     * A real element, unlike `select`'s and `menu`'s: the field is not portalled
     * and has to sit beside the trigger. A native combo box is the
     * precedent — two click zones, one box.
     */
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: rootId,
        dir,
        ...stateAttrs,
        "data-disabled": dataAttr(disabled),
        "data-readonly": dataAttr(readOnly),
        "data-invalid": dataAttr(invalid),
        "data-placeholder": dataAttr(!hasValue),
      }),

    /**
     * An id and nothing else, the calendar's own arrangement: nothing references
     * this automatically. A label written blind into `aria-labelledby` is a
     * dangling IDREF the day a consumer renders no label, so the wiring is
     * `labelledBy` — which is also what a `field` above hands down.
     */
    getLabelProps: (): T["element"] =>
      normalize.element({
        ...parts.label.attrs,
        id: labelId,
        "data-disabled": dataAttr(disabled),
        "data-invalid": dataAttr(invalid),
      }),

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: triggerId,
        type: "button",
        // `readOnly` does not close the surface off: a date nobody may change is
        // still a date somebody may want to look at in context, which is exactly
        // the split `calendar` makes between choosing a cell and walking to one.
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": boolAttr(open),
        // Omitted while the surface is unmounted: an IDREF pointing at nothing is
        // an `aria-valid-attr-value` violation, and this content is portalled and
        // gone between opens.
        "aria-controls": open ? contentId : undefined,
        // The label *and* the date. Both attributes replace the element's text, so
        // either one alone left a chip trigger, whose whole content is the date,
        // announced as "Due date" and never which day it holds. The trigger's own
        // id says "and my contents", the `color-picker` arrangement; a string label
        // cannot be referenced, so `aria-label` writes the caption out instead.
        "aria-labelledby": labelledBy && `${labelledBy} ${triggerId}`,
        // Withheld under `labelledBy` so the control keeps one voice; ARIA would
        // rank them the same way, but two sources is two chances to disagree.
        "aria-label": labelledBy
          ? undefined
          : label && valueText
            ? `${label}, ${valueText}`
            : label,
        "aria-describedby": prop("describedBy"),
        "aria-invalid": ariaAttr(invalid),
        ...stateAttrs,
        "data-placeholder": dataAttr(!hasValue),
        "data-disabled": dataAttr(disabled),
        "data-readonly": dataAttr(readOnly),
        "data-invalid": dataAttr(invalid),
        // The click and nothing else — no press-drag-release, unlike the select's
        // trigger: there is no list to drag onto, and the second press on the same
        // button is a close rather than a re-open.
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
      }),

    /**
     * Opt-in through `clearable`, and `disabled` rather than absent when there is
     * nothing to clear: a control that vanishes as it is pressed moves everything
     * beside it, and the tab order with it.
     */
    getClearTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.clearTrigger.attrs,
        id: getClearTriggerId(scope),
        type: "button",
        disabled: !canClear,
        "data-disabled": dataAttr(!canClear),
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLEAR.CLICK" });
        },
      }),

    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "aria-hidden": ariaAttr(true),
        ...stateAttrs,
      }),

    /**
     * The floating element. `data-side`/`data-align` are deliberately absent here —
     * the position effect writes onto this node directly, and an adapter that also
     * rendered them would fight it over every commit. They are published on
     * `content`, from `currentPlacement`.
     */
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-sui-layer-parent": prop("parentId"),
        ...stateAttrs,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: contentId,
        role: "dialog",
        // The sheet is the only modal presentation: an anchored popup leaves the
        // page live behind it, and claiming otherwise would make every reader
        // believe the app had stopped.
        "aria-modal": computed("isModal") ? "true" : undefined,
        dir: context.get("surfaceDir") ?? dir,
        tabIndex: -1,
        // A rendered title names the surface; failing that the trigger does, which
        // is always in the document. Never both.
        "aria-labelledby": hasTitle ? titleId : triggerId,
        ...stateAttrs,
        "data-side": side,
        "data-align": align,
        "data-placement": placement,
        // The surface applies the glass material, so it owes its contents
        // the on-glass palette (architecture.md).
        "data-sui-on-glass": "",
        "data-snav": "container",
        "data-snav-trap": computed("isModal") ? "" : undefined,
      }),

    getTitleProps: (): T["element"] => normalize.element({ ...parts.title.attrs, id: titleId }),

    /**
     * Sheet only, and a sibling of the grid. `tabindex="-1"`: a pointer and touch
     * affordance whose keyboard and screen-reader path is Escape and B — the
     * `select:cancel-trigger` precedent, kept. Not `aria-hidden`, because
     * explore-by-touch has to be able to land on it.
     */
    getCancelTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        id: getCancelTriggerId(scope),
        type: "button",
        tabIndex: -1,
        ...stateAttrs,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.CLICK" });
        },
      }),

    /**
     * A composition point, so it declares only its placement and the rest of its
     * shape sits behind `:not([data-part*=" "])`. No name of its own: the core
     * emits none, and a consumer who renders it supplies one — the rule
     * `dialog:close-trigger` already lives by.
     */
    getCloseTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.closeTrigger.attrs,
        id: getCloseTriggerId(scope),
        type: "button",
        ...stateAttrs,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLOSE.CLICK" });
        },
      }),
  };
}
