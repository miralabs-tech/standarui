import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./search-field.anatomy";
import {
  getCancelTriggerId,
  getClearTriggerId,
  getControlId,
  getFieldId,
  getIndicatorId,
  getRootId,
} from "./search-field.dom";
import type { SearchFieldApi, SearchFieldSchema } from "./search-field.types";

export function connect<T extends PropTypes>(
  service: Service<SearchFieldSchema>,
  normalize: NormalizeProps<T>,
): SearchFieldApi<T> {
  const { context, prop, state, send, scope } = service;

  const value = context.get("value");
  const empty = value === "";
  const disabled = prop("disabled");
  const invalid = prop("invalid");
  const readOnly = prop("readOnly");
  const label = prop("label");
  const focused = state.matches("focused");
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = focused ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-disabled": dataAttr(disabled),
    "data-invalid": dataAttr(invalid),
    "data-readonly": dataAttr(readOnly),
    "data-focus-visible": dataAttr(focusVisible),
    "data-focus-source": focusSource ?? undefined,
    // Not `data-snav-focused`: that attribute belongs to `@standarx/nav`'s spatial
    // engine, and the styles hang the tvOS lift off it.
    "data-focus": dataAttr(focused),
  };

  return {
    value,
    empty,
    disabled,
    invalid,
    focusSource,
    focusVisible,

    setValue(next: string): void {
      send({ type: "VALUE.SET", value: next });
    },
    clear(): void {
      send({ type: "VALUE.CLEAR" });
    },
    cancel(): void {
      send({ type: "VALUE.CANCEL" });
    },

    // The ROW, and the landmark — not the box. The capsule moved to `field` on
    // 2026-09-05 so the cancel button could stand beside it rather than inside
    // it, which is the only arrangement in practice.
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        // Kept here as well as on `field`: the row fades as one thing, the
        // cancel button included, and `[data-disabled]` is the single rule that
        // stayed on the root when the box left.
        ...stateAttrs,
        id: getRootId(scope),
        dir: prop("dir"),
        // The landmark, which is the whole normative recipe for search: there is
        // no APG "search" pattern, there is `role="search"` around a native
        // `searchbox`. Named by `label`, because two unnamed search landmarks on
        // one page are indistinguishable to anyone using a landmark list.
        role: "search",
        "aria-label": label,
        // The row lays itself out on this — the button is rendered or it is not.
        "data-empty": dataAttr(empty),
      }),

    // The CAPSULE: the box, the border, the radius, the ring, the wash. The two
    // presentation tokens travel with it, because they describe a box and the box
    // is here now. A consumer's own sheet keyed on `[data-variant="search"]` keeps
    // matching — that selector never named a part.
    getFieldProps: (): T["element"] =>
      normalize.element({
        ...parts.field.attrs,
        ...stateAttrs,
        id: getFieldId(scope),
        "data-variant": "search",
        "data-shape": prop("shape"),
        "data-empty": dataAttr(empty),
      }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        // Decorative: the landmark and the placeholder already say "search", and
        // a magnifier announced beside them is one repetition too many.
        "aria-hidden": "true",
      }),

    getControlProps: (): T["input"] =>
      normalize.input({
        ...parts.control.attrs,
        ...stateAttrs,
        id: getControlId(scope),
        dir: prop("dir"),
        // Never a `role`: `input[type=search]` *is* a `searchbox`, and writing the
        // role by hand is how a native one gets overridden with a worse copy.
        type: "search",
        value,
        disabled,
        readOnly,
        required: prop("required"),
        name: prop("name"),
        form: prop("form"),
        placeholder: prop("placeholder"),
        maxLength: prop("maxLength"),
        autoComplete: prop("autoComplete"),
        // A phone keyboard gets its search key from this; a `field`'s visible
        // label still wins the name calculation over the `aria-label` below.
        inputMode: prop("inputMode") ?? "search",
        "aria-label": label,
        "aria-invalid": ariaAttr(invalid),
        "aria-describedby": prop("describedBy"),
        onInput(event: Event) {
          if (event.defaultPrevented) return;
          const target = event.target as HTMLInputElement | null;
          if (target !== null) send({ type: "VALUE.SET", value: target.value });
        },
        onKeyDown(event: KeyboardEvent) {
          if (event.defaultPrevented || event.key !== "Escape" || !prop("clearOnEscape")) return;
          // Only when there is something to clear: an empty field lets Escape
          // through to whatever is above it — that is the "then closes" of the
          // annexe, and it belongs to the popover, not to the field.
          if (empty) return;
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
      }),

    getClearTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.clearTrigger.attrs,
        // Deliberately not `stateAttrs`: the field's focus state would ring this
        // button whenever the caret is in the control.
        "data-disabled": dataAttr(disabled),
        "data-invalid": dataAttr(invalid),
        id: getClearTriggerId(scope),
        type: "button",
        // Out of the tab order, and not by omission. native desktop fields do not put it in the
        // keyboard path, Escape is the keyboard way to clear, and a tab stop that
        // evaporates the moment it does its job drops the focus on `<body>`. It
        // keeps a name and stays in the a11y tree, so an AT user activates it
        // without ever focusing it.
        tabIndex: -1,
        // And out of the *pad's* path too, which `tabIndex` alone does not buy:
        // the spatial engine scores every focusable, and `tabindex="-1"` is
        // still focusable. Without this, `moveRight` from the control lands on
        // the clear button — measured, 2026-09-05 — and a d-pad would reach a
        // control no arrow key can, which is the one thing CDC §4.4 forbids
        // outright ("clavier fléché et d-pad produisent les mêmes intents").
        // The precedent is `toast:group`, which excludes itself the same way.
        "data-snav-ignore": "",
        disabled,
        // The rule: a disabled field
        // with text in it keeps the glyph hidden.
        hidden: empty || disabled || readOnly,
        "aria-label": prop("clearLabel"),
        "aria-controls": getControlId(scope),
        // Like the eye on a password field: a mouse press must not take the caret
        // out of the control.
        onMouseDown(event) {
          if (event.defaultPrevented) return;
          event.preventDefault();
        },
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLEAR.CLICK" });
        },
      }),

    getCancelTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        // Deliberately not `stateAttrs`, for the clear button's reason: the
        // field's focus state would ring this button whenever the caret is in
        // the control. Its own ring comes from the page's modality instead.
        "data-disabled": dataAttr(disabled || readOnly),
        "data-invalid": dataAttr(invalid),
        id: getCancelTriggerId(scope),
        type: "button",
        // No `tabIndex`, and that is the difference from the clear button rather
        // than an oversight. The clear button has Escape as its keyboard double,
        // so taking it out of the tab order costs nothing; this one has no
        // double at all, so removing it would be a 2.1.1 failure. The focus it
        // drops when it goes is answered with an action instead of an
        // amputation — `focusControl` on the gesture, `rescueCancelFocus` when
        // somebody else empties the field.
        disabled: disabled || readOnly,
        // Rendered but inert while read-only: `CANCEL.CLICK` empties the value,
        // which read-only forbids. Either it does its job or it says it cannot —
        // never "it vanished for no visible reason". Only emptiness takes it
        // away, because only emptiness re-lays-out the row.
        hidden: empty,
        "aria-label": prop("cancelLabel"),
        "aria-controls": getControlId(scope),
        // Like the clear button and the eye on a password field: a mouse press
        // must not take the caret out of the control. It is also what keeps
        // `cancelFocused` true only for a keyboard or a pad.
        onMouseDown(event) {
          if (event.defaultPrevented) return;
          event.preventDefault();
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.BLUR" });
        },
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.CLICK" });
        },
      }),
  };
}
