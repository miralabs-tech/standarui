import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface SearchFieldValueChangeDetails {
  readonly value: string;
}

/**
 * How the field is drawn (CDC §4.2, amendment of 2026-08-31). `capsule` is the
 * default and the shape search is drawn with; `rect` is the
 * rounded rect, `soft` the value between the two. Search keeps its own inline
 * inset whichever shape it wears — the inset is what the search presentation
 * settles, the shape is a design choice no component can make for a consumer.
 */
export type SearchFieldShape = "capsule" | "soft" | "rect";

/**
 * Whether a keydown is the shortcut that focuses this field. A predicate rather
 * than a key descriptor: "the search shortcut" is ⌘F here, `/` there, and an app
 * that ships both should not have to file the difference with us.
 */
export type SearchHotkeyPredicate = (event: KeyboardEvent) => boolean;

export interface SearchFieldMachineProps {
  readonly dir?: Direction | undefined;
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly shape?: SearchFieldShape | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly autoComplete?: string | undefined;
  /** Defaults to `search`, which is what puts a search key on a phone keyboard. */
  readonly inputMode?: string | undefined;
  readonly maxLength?: number | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /**
   * The accessible name of the control *and* of the `search` landmark. Never
   * defaulted to a string: a library that ships "Search" ships it in English.
   */
  readonly label?: string | undefined;
  /**
   * The accessible name of the clear button. Defaults to `"Clear search"` —
   * the one string this component ships, because the alternative is an icon-only
   * button with no name at all (see the machine for why this and `label` differ).
   */
  readonly clearLabel?: string | undefined;
  /**
   * The accessible name of the cancel button. Defaults to `"Cancel search"`, for
   * the same reason `clearLabel` is defaulted — and the reason is stronger here:
   * the clear button is out of the tab order, this one is a tab stop a keyboard
   * user meets head-on.
   */
  readonly cancelLabel?: string | undefined;
  /**
   * Escape empties the field. On by default here — that is the whole difference
   * between this presentation and a text field — and it only ever consumes the
   * key when there is something to clear.
   */
  readonly clearOnEscape?: boolean | undefined;
  /**
   * Opt-in activation shortcut, read once when the effect installs: pass it at
   * mount. Absent means no document listener at all, which is why a page that
   * did not ask keeps the browser's own find-in-page intact.
   */
  readonly hotkey?: SearchHotkeyPredicate | undefined;
  readonly onValueChange?: ((details: SearchFieldValueChangeDetails) => void) | undefined;
  /**
   * The cancel gesture happened. It is an **addition** to `onValueChange` and
   * never a replacement — the value went to the empty string, and a consumer
   * filtering on the value has to see that or their list stays filtered — and it
   * is fired **last**, after the focus has gone back to the control. That order
   * is the contract: `onCancel` is the last word, so a consumer who moves the
   * focus inside it (closing a search popover, say) keeps it.
   *
   * `api.cancel()` on an already-empty field fires this and *not*
   * `onValueChange`: cancelling is an intention, not a change of value.
   */
  readonly onCancel?: (() => void) | undefined;
}

export interface ResolvedSearchFieldMachineProps extends SearchFieldMachineProps {
  readonly shape: SearchFieldShape;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly clearOnEscape: boolean;
}

export interface SearchFieldSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedSearchFieldMachineProps;
  context: { value: string; focusSource: InputModality | null };
  /**
   * Whether the cancel button is the thing holding the focus. A ref and not a
   * bindable on purpose: no rule in the sheet reads it, and making it context
   * would turn every focus of that button into a transition, a notification and
   * an adapter render for a fact nobody paints — the same arbitration
   * `data-scroll` makes. It is also why `cancelTrigger` carries no
   * `data-focus-visible`: its ring comes from the page's modality.
   */
  refs: { cancelFocused: boolean };
  event:
    | { type: "VALUE.SET"; value: string }
    | { type: "VALUE.CLEAR" }
    /**
     * The programmatic half of the cancel gesture. It exists for the reason
     * `VALUE.CLEAR` exists next to `CLEAR.CLICK`: `api.cancel()` must empty and
     * notify without taking anybody's caret, and `CANCEL.CLICK` hands the focus
     * back on purpose. One event cannot be both.
     */
    | { type: "VALUE.CANCEL" }
    | { type: "CLEAR.CLICK" }
    | { type: "CANCEL.CLICK" }
    | { type: "CANCEL.FOCUS" }
    | { type: "CANCEL.BLUR" }
    | { type: "CONTROL.FOCUS" }
    | { type: "CONTROL.BLUR" };
  action:
    | "setValue"
    | "clearValue"
    | "focusControl"
    | "notifyCancel"
    | "markCancelFocused"
    | "clearCancelFocused"
    | "rescueCancelFocus"
    | "captureFocusSource"
    | "clearFocusSource";
  guard: "isInteractive";
  effect: "trackModality" | "trackHotkey";
}

export interface SearchFieldApi<T extends PropTypes = PropTypes> {
  readonly value: string;
  /** What `data-empty` says on the root, for a consumer that needs it in script. */
  readonly empty: boolean;
  readonly disabled: boolean;
  readonly invalid: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  setValue(value: string): void;
  /** The programmatic clear: it empties the field and leaves the focus alone. */
  clear(): void;
  /**
   * The programmatic cancel: it empties the field, notifies `onCancel`, and — like
   * `clear()` — takes nobody's focus. On an already-empty field it still fires
   * `onCancel` and does not fire `onValueChange`.
   */
  cancel(): void;
  getRootProps(): T["element"];
  getFieldProps(): T["element"];
  getIndicatorProps(): T["element"];
  getControlProps(): T["input"];
  getClearTriggerProps(): T["button"];
  getCancelTriggerProps(): T["button"];
}
