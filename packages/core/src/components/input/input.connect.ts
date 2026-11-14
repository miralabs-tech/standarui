import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./input.anatomy";
import { getControlId, getRootId, getVisibilityTriggerId } from "./input.dom";
import type { InputApi, InputSchema } from "./input.types";

export function connect<T extends PropTypes>(
  service: Service<InputSchema>,
  normalize: NormalizeProps<T>,
): InputApi<T> {
  const { context, prop, computed, state, send, scope } = service;

  const value = context.get("value");
  const disabled = prop("disabled");
  const invalid = prop("invalid");
  const readOnly = prop("readOnly");
  const masked = context.get("masked");
  const isPassword = computed("isPassword");
  const focused = state.matches("focused");
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = focused ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);
  // What the field *is*, which is the one thing the type can settle, and all it
  // buys now is the search field's own inline padding (CDC §4.2, amendment of
  // 2026-08-30). The shape left with the amendment of 2026-08-31: how a field is
  // drawn is a design choice no type can make, so it is a prop. The declared
  // type, not the resolved one — that one turns a revealed password into text.
  const isSearch = prop("type") === "search";

  const stateAttrs = {
    "data-disabled": dataAttr(disabled),
    "data-invalid": dataAttr(invalid),
    "data-readonly": dataAttr(readOnly),
    "data-focus-visible": dataAttr(focusVisible),
    "data-focus-source": focusSource ?? undefined,
    // Not `data-snav-focused`: that attribute belongs to `@standarx/nav`'s spatial
    // engine, and the styles hang the tvOS lift off it. Emitting it here would
    // lift the root and the control at once, and break the engine's "exactly one
    // focused node" invariant.
    "data-focus": dataAttr(focused),
  };

  // Shared by the single-line and multi-line controls: same behaviour, different
  // element. Only `type` belongs to one of them.
  const controlProps = {
    ...parts.control.attrs,
    ...stateAttrs,
    id: getControlId(scope),
    dir: prop("dir"),
    value,
    disabled,
    readOnly,
    required: prop("required"),
    name: prop("name"),
    form: prop("form"),
    placeholder: prop("placeholder"),
    maxLength: prop("maxLength"),
    // WCAG 2.2 SC 1.3.5 lives on this one, and a mobile keyboard on the other.
    autoComplete: prop("autoComplete"),
    inputMode: prop("inputMode"),
    "aria-invalid": ariaAttr(invalid),
    "aria-describedby": prop("describedBy"),
    onInput(event: Event) {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (target !== null) send({ type: "VALUE.SET", value: target.value });
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape" || !prop("clearOnEscape")) return;
      // Only when there is something to clear: otherwise Escape belongs to
      // whatever is above — a popover, a dialog — and swallowing it here would
      // leave the user unable to close it from inside the field.
      if (value === "") return;
      event.preventDefault();
      send({ type: "VALUE.CLEAR" });
    },
    onFocus(event: FocusEvent) {
      if (event.defaultPrevented) return;
      send({ type: "CONTROL.FOCUS" });
    },
    onBlur(event: FocusEvent) {
      if (event.defaultPrevented) return;
      send({ type: "CONTROL.BLUR" });
    },
  };

  return {
    value,
    disabled,
    invalid,
    focusSource,
    focusVisible,
    masked,

    setValue(next: string): void {
      send({ type: "VALUE.SET", value: next });
    },
    clear(): void {
      send({ type: "VALUE.CLEAR" });
    },
    toggleVisibility(): void {
      send({ type: "VISIBILITY.TOGGLE" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "data-variant": isSearch ? "search" : undefined,
        "data-shape": prop("shape"),
      }),

    getControlProps: (): T["input"] =>
      normalize.input({ ...controlProps, type: computed("resolvedType") }),

    getTextareaProps: (): T["textarea"] => normalize.textarea(controlProps),

    getVisibilityTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.visibilityTrigger.attrs,
        // Deliberately not `stateAttrs`: this button is its own focusable, and
        // wearing the control's focus state would ring it whenever the field is
        // focused.
        "data-disabled": dataAttr(disabled),
        "data-invalid": dataAttr(invalid),
        id: getVisibilityTriggerId(scope),
        type: "button",
        disabled,
        hidden: !isPassword,
        "aria-controls": getControlId(scope),
        "aria-pressed": masked ? "false" : "true",
        "data-state": masked ? "masked" : "visible",
        // "Does not move the focus" is about the pointer: a mouse click on the
        // eye must not take the caret out of the field. It stays focusable, and
        // Tab reaches it — a reveal a keyboard user cannot operate is not a
        // reveal.
        onMouseDown(event) {
          if (event.defaultPrevented) return;
          event.preventDefault();
        },
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "VISIBILITY.TOGGLE" });
        },
      }),
  };
}
