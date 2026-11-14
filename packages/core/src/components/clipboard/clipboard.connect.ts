/**
 * Pure, DOM-free, replayable on a server. Every handler checks `defaultPrevented`
 * first, which is what makes a consumer's own handler able to veto the machine
 * (merged ahead of ours by `mergeProps`).
 *
 * The indicator renders twice — a resting glyph and a copied one — and the getter
 * takes which of the two it is dressing. Neither instance gets an id: two parts
 * sharing one would be invalid DOM, and nothing ever needs to look them up.
 */

import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./clipboard.anatomy";
import { getControlId, getInputId, getLabelId, getRootId, getTriggerId } from "./clipboard.dom";
import type { ClipboardApi, ClipboardIndicatorPartProps, ClipboardSchema } from "./clipboard.types";

export function connect<T extends PropTypes>(
  service: Service<ClipboardSchema>,
  normalize: NormalizeProps<T>,
): ClipboardApi<T> {
  const { context, prop, state, send, scope } = service;

  const value = context.get("value");
  const disabled = prop("disabled");
  const stateName = state.get();
  const copied = state.matches("copied");
  // Focus is context rather than a state here — the state axis belongs to the
  // copy cycle — so the source alone is the truth of focus.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-state": stateName,
    "data-disabled": dataAttr(disabled),
  };

  return {
    value,
    copied,
    disabled,
    focusSource,
    focusVisible,

    copy(): void {
      send({ type: "COPY.REQUEST" });
    },
    setValue(next: string): void {
      send({ type: "VALUE.SET", value: next });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "data-copied": dataAttr(copied),
      }),

    getLabelProps: (): T["label"] =>
      normalize.label({
        ...parts.label.attrs,
        ...stateAttrs,
        id: getLabelId(scope),
        // Only meaningful next to the input part: a consumer who renders no
        // input should render no label either — a `for` with no target is inert.
        for: getInputId(scope),
      }),

    getControlProps: (): T["element"] =>
      normalize.element({
        ...parts.control.attrs,
        ...stateAttrs,
        id: getControlId(scope),
      }),

    getInputProps: (): T["input"] =>
      normalize.input({
        ...parts.input.attrs,
        ...stateAttrs,
        id: getInputId(scope),
        dir: prop("dir"),
        value,
        disabled,
        // Always readonly, by decision: an editable flow composes the `input`
        // component with `api.setValue` — this part is the value's display and
        // the manual fallback, not a text field.
        readOnly: true,
        "data-readonly": "",
        "data-copied": dataAttr(copied),
        onFocus(event: FocusEvent) {
          if (event.defaultPrevented) return;
          // Select-all on focus is the structural fallback: with the whole
          // value selected, Ctrl/Cmd+C is one keystroke away — the answer for
          // the insecure-context consumer the Clipboard API refuses.
          (event.currentTarget as HTMLInputElement | null)?.select();
        },
      }),

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        ...stateAttrs,
        id: getTriggerId(scope),
        dir: prop("dir"),
        type: "button",
        // Native `disabled`, like toggle: no reason to stay focusable inert.
        disabled,
        // The accessible name never changes with the state: the state change is
        // what the live region says, the name stays the action.
        "aria-label": prop("copyLabel"),
        "data-copied": dataAttr(copied),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.BLUR" });
        },
      }),

    getIndicatorProps: (props: ClipboardIndicatorPartProps = {}): T["element"] => {
      const wanted = props.copied ?? false;
      return normalize.element({
        ...parts.indicator.attrs,
        ...stateAttrs,
        // No id: this part renders twice, and a duplicated id is invalid DOM.
        "aria-hidden": ariaAttr(true),
        hidden: wanted !== copied,
        // The variant's identity, for the sheet — not the machine's state.
        "data-copied": dataAttr(wanted),
      });
    },
  };
}
