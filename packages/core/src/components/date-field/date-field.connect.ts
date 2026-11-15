import { ariaAttr, dataAttr } from "../../dom/attrs";
import { isComposingEvent } from "../../dom/event";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./date-field.anatomy";
import {
  getControlEl,
  getControlId,
  getHiddenInputId,
  getRootId,
  getSegmentId,
} from "./date-field.dom";
import { toISOValue } from "./date-field.segments";
import type {
  DateFieldApi,
  DateFieldSchema,
  DateFieldValue,
  DateSegment,
  DateSegmentType,
} from "./date-field.types";

export function connect<T extends PropTypes>(
  service: Service<DateFieldSchema>,
  normalize: NormalizeProps<T>,
): DateFieldApi<T> {
  const { context, prop, computed, state, send, scope } = service;

  const value = computed("value");
  const segments = computed("segments");
  const outOfRange = computed("isOutOfRange");
  const editable = computed("isEditable");
  const granularity = prop("granularity");

  const dir = prop("dir");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const required = prop("required");
  // A complete date outside `min`/`max` is invalid, and it is heard as such: that
  // is what a native date input reports through `:out-of-range`. The consumer gets
  // the two apart on `data-out-of-range`.
  const invalid = prop("invalid") === true || outOfRange;

  const engaged = state.matches("engaged");
  const focusedSegment = context.get("focusedSegment");
  // Held from the moment focus landed and only while a segment still has it — the
  // rule every other control in the library follows.
  const focusSource = focusedSegment === null ? null : context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-invalid": dataAttr(invalid),
    "data-out-of-range": dataAttr(outOfRange),
    "data-engaged": dataAttr(engaged),
  };

  /**
   * The stepper, and its two halves are separate presses, never one state of the
   * field.
   */
  const stepper = (up: boolean): T["button"] =>
    normalize.button({
      ...(up ? parts.incrementTrigger : parts.decrementTrigger).attrs,
      "data-disabled": dataAttr(disabled),
      type: "button",
      disabled: disabled || readOnly,
      // Out of the tab order and out of the accessibility tree: the keyboard steps
      // through the segment itself, so a reader announcing these would offer two
      // ways to do one thing — `number-input`'s reading, and the one the
      // placement of the stepper inside the box implies.
      tabIndex: -1,
      "aria-hidden": "true",
      // And out of the spatial engine too, which does not read either of the two
      // above: `collectNavNodes` filters on this attribute and on empty rects, and
      // `isFocusable` never looks at `aria-hidden` — so a pad reached a button with
      // nothing to announce, which is an `aria-hidden-focus` violation the moment it
      // lands (precedent: `toast.connect.ts:85`, measured again on 2026-09-05).
      "data-snav-ignore": "",
      // A mouse on the stepper must not take the focus out of the segment it is
      // stepping: which segment holds the focus is what decides what a press does.
      onMouseDown(event: MouseEvent) {
        if (!event.defaultPrevented) event.preventDefault();
      },
      onClick(event: MouseEvent) {
        if (event.defaultPrevented) return;
        send({ type: up ? "TRIGGER.INCREMENT" : "TRIGGER.DECREMENT" });
      },
    });

  return {
    value,
    valueAsString: toISOValue(value, granularity),
    segments,
    disabled,
    invalid,
    outOfRange,
    engaged,
    focusedSegment,
    focusSource,
    focusVisible,

    setValue(next: DateFieldValue | null): void {
      send({ type: "VALUE.SET", value: next });
    },
    clear(): void {
      send({ type: "VALUE.CLEAR" });
    },
    increment(): void {
      send({ type: "TRIGGER.INCREMENT" });
    },
    decrement(): void {
      send({ type: "TRIGGER.DECREMENT" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir,
        "data-granularity": granularity,
      }),

    /**
     * The group carries the accessible name: the segments inside it are
     * spinbuttons and each already names its own unit, so a name on every segment
     * would read the field's four times over. It also wears the field's control
     * id — `field` sees that a `div` is not labelable, drops its `for`, and the
     * name arrives through `labelledBy` instead. Outside a `field` there is
     * nothing to hand an id down, which is what `label` is for.
     */
    getControlProps: (): T["element"] =>
      normalize.element({
        ...parts.control.attrs,
        ...stateAttrs,
        id: getControlId(scope),
        role: "group",
        "aria-label": prop("label"),
        "aria-labelledby": prop("labelledBy"),
        "aria-describedby": prop("describedBy"),
        "aria-disabled": ariaAttr(disabled),
        "aria-invalid": ariaAttr(invalid),
      }),

    getSegmentProps: (segment: DateSegment): T["element"] => {
      if (segment.type === "literal") {
        return normalize.element({
          ...parts.segment.attrs,
          "data-segment": "literal",
          // No id, no tab stop, no role: a slash is punctuation, and a reader
          // walking the group has nothing to do with it.
          "aria-hidden": "true",
        });
      }

      const type: DateSegmentType = segment.type;
      const focused = focusedSegment === type;

      return normalize.element({
        ...parts.segment.attrs,
        ...stateAttrs,
        id: getSegmentId(scope, type),
        role: "spinbutton",
        // Dropped rather than set to -1: a disabled field is out of the tab order
        // entirely, and a lone `tabindex="-1"` still answers a script's `.focus()`
        // as though it were reachable. Every segment is its own stop — the APG's
        // arrangement for spinbuttons, and why there is no roving here.
        tabIndex: disabled ? undefined : 0,
        "data-segment": type,
        "data-placeholder": dataAttr(segment.isPlaceholder),
        "data-engaged": dataAttr(engaged && focused),
        "data-focus-visible": dataAttr(focused && focusVisible),
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        "aria-label": segment.label,
        "aria-valuemin": segment.min,
        "aria-valuemax": segment.max,
        // Omitted while the segment is empty, which is what the APG asks of a
        // spinbutton with no value: there is no number to announce yet.
        "aria-valuenow": segment.value ?? undefined,
        // Only when the text adds something, and the question is asked of the
        // *number* the text reads as, not of its spelling: a compare on strings
        // called `"04"` a different value from `4` and emitted `valuetext="04"`
        // beside `valuenow="4"` on every padded unit — the double announcement
        // this guard exists to prevent. `Number` is `NaN` on a word, so the day
        // period, which is the case that genuinely reads otherwise, still speaks.
        "aria-valuetext":
          segment.value !== null && Number(segment.text) !== segment.value
            ? segment.text
            : undefined,
        "aria-disabled": ariaAttr(disabled),
        "aria-readonly": ariaAttr(readOnly),
        "aria-required": ariaAttr(required),
        // On the segment as well as on the group, because the segment is the
        // `role="spinbutton"` — the element that owns the value, which is where
        // `slider` puts it for the same reason (slider.connect.ts:191-194) and
        // where `radio-group` puts it on both the group and every item
        // (radio-group.connect.ts:75 and :137). Nothing ever focuses the group,
        // so a field marked invalid announced nothing at all when entered
        // segment-first. The description stays on the group alone: it is one
        // sentence about the field, and six segments would each repeat it.
        "aria-invalid": ariaAttr(invalid),
        onKeyDown(event: KeyboardEvent) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          if (isComposingEvent(event)) return;
          const key = event.key;

          if (key.length === 1 && key >= "0" && key <= "9") {
            event.preventDefault();
            send({ type: "SEGMENT.INPUT", segment: type, digit: Number(key) });
            return;
          }

          if (key === "Backspace" || key === "Delete") {
            event.preventDefault();
            send({ type: "SEGMENT.CLEAR", segment: type });
            return;
          }

          if (key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown") {
            // The editable test sits before `preventDefault`, deliberately: on a
            // read-only field PageDown still belongs to the page.
            if (!editable) return;
            event.preventDefault();
            const up = key === "ArrowUp" || key === "PageUp";
            send({
              type: up ? "SEGMENT.INCREMENT" : "SEGMENT.DECREMENT",
              segment: type,
              large: key === "PageUp" || key === "PageDown",
            });
            return;
          }

          // Resolved here and not at the top of `connect`: with no `dir` prop the
          // answer is read off the control, and a DOM read during render would run
          // on the server.
          const action = getRovingKeyAction(key, {
            orientation: "horizontal",
            dir: resolveDir(dir, getControlEl(scope)),
          });
          if (action === null) return;
          event.preventDefault();
          send({ type: "SEGMENT.MOVE", action });
        },
        onFocus(event: FocusEvent) {
          if (!event.defaultPrevented) send({ type: "SEGMENT.FOCUS", segment: type });
        },
        onBlur(event: FocusEvent) {
          if (!event.defaultPrevented) send({ type: "SEGMENT.BLUR" });
        },
      });
    },

    getIncrementTriggerProps: (): T["button"] => stepper(true),
    getDecrementTriggerProps: (): T["button"] => stepper(false),

    /**
     * `type="hidden"`, never `type="date"`: a real date input brings the browser's
     * own picker with it — the very thing this component replaces — and puts a
     * second date control in the accessibility tree beside the group.
     */
    getHiddenInputProps: (): T["input"] =>
      normalize.input({
        ...parts.hiddenInput.attrs,
        id: getHiddenInputId(scope),
        type: "hidden",
        name: prop("name"),
        form: prop("form"),
        // Native rule: a disabled control is not submitted.
        disabled,
        value: toISOValue(value, granularity),
      }),
  };
}
