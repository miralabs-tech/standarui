/**
 * Pure, DOM-free, replayable on a server. Every handler checks
 * `defaultPrevented` first, which is what makes a consumer's own handler able
 * to veto the machine (merged ahead of ours by `mergeProps`).
 *
 * Enter and Space are the native behaviour of the `<button>` — no onKeyDown
 * anywhere, the platform does the APG split (Enter on keydown, Space on keyup)
 * better than a handler would.
 */

import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./collapsible.anatomy";
import { getContentId, getIndicatorId, getRootId, getTriggerId } from "./collapsible.dom";
import type { CollapsibleApi, CollapsibleSchema } from "./collapsible.types";

export function connect<T extends PropTypes>(
  service: Service<CollapsibleSchema>,
  normalize: NormalizeProps<T>,
): CollapsibleApi<T> {
  const { context, prop, send, scope } = service;

  const open = context.get("open");
  const disabled = prop("disabled");
  const keepMounted = prop("keepMounted");
  const dir = prop("dir");
  const state = open ? "open" : "closed";

  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  return {
    open,
    disabled,
    focusSource,
    focusVisible,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },
    toggle(): void {
      send({ type: "TRIGGER.CLICK" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
      }),

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: getTriggerId(scope),
        type: "button",
        // Native `disabled` rather than `aria-disabled`: a disclosure trigger
        // has no reason to stay focusable while inert.
        disabled,
        "aria-expanded": boolAttr(open),
        // Only while the content is actually in the document — a dangling
        // IDREF names nothing (the popover's rule). Without `keepMounted` a
        // closed content is unmounted by the adapter's presence path.
        "aria-controls": open || keepMounted ? getContentId(scope) : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
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

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        // The trigger already carries the state; the chevron is decoration.
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-disabled": dataAttr(disabled),
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope),
        dir,
        // Only in `keepMounted` mode. Without it the content is unmounted by
        // the adapter's presence path, and `hidden` would kill its exit
        // animation (the tabs rule).
        hidden: !open && keepMounted ? true : undefined,
        // While the exit runs the content is still in the tree, already announced
        // collapsed: out of the tab order and the a11y tree until it is unmounted.
        inert: !open && !keepMounted ? true : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
        // Until the first real toggle: a `defaultOpen` first paint must be
        // there, not arrive — the sheet answers with `animation: none`.
        "data-immediate": dataAttr(!context.get("animated")),
      }),
  };
}
