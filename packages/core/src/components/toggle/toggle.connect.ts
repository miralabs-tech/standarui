/**
 * Pure, DOM-free, replayable on a server. Every handler checks `defaultPrevented`
 * first, which is what makes a consumer's own handler able to veto the machine
 * (merged ahead of ours by `mergeProps`).
 */

import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./toggle.anatomy";
import { getIndicatorId, getRootId } from "./toggle.dom";
import type { ToggleApi, ToggleSchema } from "./toggle.types";

export function connect<T extends PropTypes>(
  service: Service<ToggleSchema>,
  normalize: NormalizeProps<T>,
): ToggleApi<T> {
  const { context, prop, state, send, scope } = service;

  const pressed = context.get("pressed");
  const disabled = prop("disabled");
  // Gated on the state as well as on the value: the source is cleared on the way
  // out of `focused`, but reading both keeps the two from ever disagreeing.
  const focusSource = state.matches("focused") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  return {
    pressed,
    disabled,
    focusSource,
    focusVisible,

    setPressed(next: boolean): void {
      send({ type: "PRESSED.SET", pressed: next });
    },
    toggle(): void {
      send({ type: "TRIGGER.CLICK" });
    },

    getRootProps: (): T["button"] =>
      normalize.button({
        ...parts.root.attrs,
        id: getRootId(scope),
        type: "button",
        dir: prop("dir"),
        // Native `disabled` rather than `aria-disabled`: a toggle button is not
        // a menu item, it has no reason to stay focusable while inert.
        disabled,
        "aria-pressed": boolAttr(pressed),
        "data-state": pressed ? "on" : "off",
        "data-disabled": dataAttr(disabled),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.BLUR" });
        },
      }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        // The root already carries the state; the indicator is decoration.
        "aria-hidden": ariaAttr(true),
        "data-state": pressed ? "on" : "off",
        "data-disabled": dataAttr(disabled),
      }),
  };
}
