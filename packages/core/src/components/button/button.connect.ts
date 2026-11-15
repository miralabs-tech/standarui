/**
 * Pure, DOM-free, replayable on a server.
 *
 * The keyboard press *visual* is handled here rather than by the press primitive
 * when the root is a real `<button>`: `data-pressed` has to follow Enter and
 * Space, but the primitive's keyboard mode calls `preventDefault` on Space, which
 * would stop a `type="submit"` button from submitting. Listening without
 * preventing costs six lines and keeps the browser's behaviour intact.
 */

import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./button.anatomy";
import { getLoadingIndicatorId, getRootId } from "./button.dom";
import type { ButtonApi, ButtonSchema } from "./button.types";

const ACTIVATION_KEYS: ReadonlySet<string> = new Set(["Enter", " "]);

export function connect<T extends PropTypes>(
  service: Service<ButtonSchema>,
  normalize: NormalizeProps<T>,
): ButtonApi<T> {
  const { context, prop, state, send, scope } = service;

  const disabled = prop("disabled");
  const loading = prop("loading");
  const nativeButton = prop("nativeButton");
  const focusableWhenDisabled = prop("focusableWhenDisabled");
  const pressed = context.get("pressed");
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = state.matches("focused") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  // Two spellings of the same fact. The native attribute takes the control out of
  // the tab order, which is right for a lone button and wrong for a toolbar item
  // that must stay reachable to explain why it cannot be used.
  const nativeDisabled = nativeButton && disabled && !focusableWhenDisabled;
  // Loading is a refusal too: the guard already rejects the activation, and a
  // keyboard user pressing Enter on a busy button otherwise gets silence.
  const ariaDisabled = (disabled && !nativeDisabled) || loading;
  // A substituted element has no native tab order to lose, so it is taken out of
  // it by hand — unless it was asked to stay reachable while disabled.
  const customTabIndex = disabled && !focusableWhenDisabled ? -1 : 0;

  return {
    disabled,
    loading,
    pressed,
    focusSource,
    focusVisible,

    getRootProps: (): T["button"] =>
      normalize.button({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        type: nativeButton ? prop("type") : undefined,
        role: nativeButton ? undefined : "button",
        tabIndex: nativeButton ? undefined : customTabIndex,
        disabled: nativeDisabled,
        "aria-disabled": ariaAttr(ariaDisabled),
        "aria-busy": ariaAttr(loading),
        "data-variant": prop("variant"),
        "data-size": prop("size"),
        "data-disabled": dataAttr(disabled),
        "data-loading": dataAttr(loading),
        "data-pressed": dataAttr(pressed),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.CLICK", originalEvent: event });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || !nativeButton || event.repeat) return;
          if (ACTIVATION_KEYS.has(event.key)) send({ type: "ROOT.PRESS_START" });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || !nativeButton) return;
          if (ACTIVATION_KEYS.has(event.key)) send({ type: "ROOT.PRESS_END" });
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

    getLoadingIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.loadingIndicator.attrs,
        id: getLoadingIndicatorId(scope),
        // `aria-busy` on the root already carries the state; the spinner itself is
        // decoration, and announcing it twice is worse than not at all.
        "aria-hidden": ariaAttr(true),
        "data-loading": dataAttr(loading),
        hidden: !loading,
      }),
  };
}
