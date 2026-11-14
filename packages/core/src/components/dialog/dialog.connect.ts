import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./dialog.anatomy";
import {
  getActionTriggerId,
  getBackdropId,
  getCancelTriggerId,
  getCloseTriggerId,
  getContentId,
  getDescriptionId,
  getPositionerId,
  getTitleId,
  getTriggerId,
} from "./dialog.dom";
import type {
  DialogActionTriggerProps,
  DialogApi,
  DialogCancelTriggerProps,
  DialogSchema,
} from "./dialog.types";

export function connect<T extends PropTypes>(
  service: Service<DialogSchema>,
  normalize: NormalizeProps<T>,
): DialogApi<T> {
  const { context, prop, computed, send, scope } = service;

  const open = context.get("open");
  const modal = prop("modal");
  const presentation = computed("presentation");
  const disabled = prop("disabled");
  const state = open ? "open" : "closed";

  const contentId = getContentId(scope);
  const titleId = getTitleId(scope);
  const descriptionId = getDescriptionId(scope);

  // Both read from the DOM by the machine: an IDREF may only point at an id that
  // exists, and whether the consumer rendered a title is not ours to assume.
  const hasTitle = context.get("hasTitle");
  const describedBy = [
    context.get("hasDescription") ? descriptionId : undefined,
    prop("describedBy"),
  ]
    .filter((id): id is string => id !== undefined && id !== "")
    .join(" ");

  return {
    open,
    modal,
    presentation,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    dismiss(reason): void {
      send({ type: "CONTENT.DISMISS", reason });
    },

    focusInitial(): void {
      send({ type: "CONTENT.FOCUS" });
    },

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: getTriggerId(scope),
        type: "button",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": boolAttr(open),
        // Only while open. A dangling IDREF names nothing, and it is the exact
        // value `aria-valid-attr-value` flags on a closed dialog.
        "aria-controls": open ? contentId : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
      }),

    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-presentation": presentation,
      }),

    // No ARIA, and no positioner primitive either: a dialog centres in CSS, it
    // computes nothing (spec §8, divergence 3). The part exists so that `drawer`
    // and `popover` can share the composition.
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-state": state,
        "data-presentation": presentation,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: contentId,
        role: prop("role"),
        dir: context.get("surfaceDir") ?? prop("dir"),
        // So focus has somewhere to land when the surface holds nothing tabbable.
        tabIndex: -1,
        "aria-modal": ariaAttr(modal),
        "aria-labelledby": hasTitle ? titleId : undefined,
        // Never both: one name, from the title when there is one.
        "aria-label": hasTitle ? undefined : prop("label"),
        "aria-describedby": describedBy === "" ? undefined : describedBy,
        "data-state": state,
        "data-modal": dataAttr(modal),
        "data-presentation": presentation,
        "data-nested": dataAttr(prop("parentId") !== undefined),
        // The DOM trap and the spatial trap are the same declaration (input.md §3.1).
        "data-snav": "container",
        "data-snav-trap": dataAttr(modal),
      }),

    getTitleProps: (): T["element"] => normalize.element({ ...parts.title.attrs, id: titleId }),

    getDescriptionProps: (): T["element"] =>
      normalize.element({ ...parts.description.attrs, id: descriptionId }),

    getCloseTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.closeTrigger.attrs,
        id: getCloseTriggerId(scope),
        type: "button",
        "data-state": state,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLOSE.CLICK" });
        },
      }),

    // No id and no ARIA: the row is a box. It exists because touch platforms lay the two
    // choices out equal-width with one spacing, and that is
    // a rule the surface owes its actions rather than one each button can know.
    getActionsProps: (): T["element"] => normalize.element({ ...parts.actions.attrs }),

    // Both close, and both let the consumer keep the surface open by calling
    // `preventDefault()` — an action that awaits a request needs that, and it is
    // the same contract `closeTrigger` already publishes.
    getCancelTriggerProps: (cancelProps: DialogCancelTriggerProps = {}): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        id: getCancelTriggerId(scope, cancelProps.index),
        type: "button",
        "data-state": state,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLOSE.CLICK" });
        },
      }),

    getActionTriggerProps: (actionProps: DialogActionTriggerProps = {}): T["button"] =>
      normalize.button({
        ...parts.actionTrigger.attrs,
        id: getActionTriggerId(scope, actionProps.index),
        type: "button",
        "data-state": state,
        "data-destructive": dataAttr(actionProps.destructive === true),
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLOSE.CLICK" });
        },
      }),
  };
}
