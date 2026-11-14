import { ariaAttr, dataAttr } from "../../dom/attrs";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./toast.anatomy";
import { getDescriptionId, getGroupId, getRootId, getTitleId } from "./toast.dom";
import type { ToastApi, ToastGroupSchema, ToastRecord } from "./toast.types";

export function connect<T extends PropTypes>(
  service: Service<ToastGroupSchema>,
  normalize: NormalizeProps<T>,
): ToastApi<T> {
  const { context, prop, computed, send, scope } = service;

  const toaster = prop("toaster");
  const toasts = context.get("toasts");
  const paused = context.get("pausedByInteraction");
  const translations = prop("translations");
  const count = computed("visibleCount");
  const frontId = computed("frontId");

  // The two defaults live here rather than in the machine's `props`: a machine's
  // resolved props are also its *input* type, so promoting these to required
  // would make an adapter that passes only one of the two fail to typecheck.
  const regionLabel = translations.regionLabel?.(count) ?? `Notifications (${count})`;
  const dismissLabel = translations.dismissLabel ?? "Dismiss notification";

  const indexOf = (toast: ToastRecord): number =>
    toasts.findIndex((record) => record.id === toast.id);

  /**
   * Arrows, Home and End come from the shared roving arithmetic — the same
   * function the composites use, so a d-pad and a keyboard cannot disagree about
   * what `next` means. Escape is answered here rather than by a dismissable layer
   * because the toasts are not on the layer stack: a global Escape belongs to
   * whatever menu or dialog is really open.
   */
  const onRegionKeyDown = (event: KeyboardEvent, id: string | null): void => {
    if (event.defaultPrevented) return;
    const action = getRovingKeyAction(event.key);
    if (action !== null) {
      event.preventDefault();
      send({ type: "TOAST.NAVIGATE", to: action });
      return;
    }
    if (event.key !== "Escape" || id === null) return;
    event.preventDefault();
    send({ type: "TOAST.DISMISS", id, reason: "escape" });
  };

  return {
    toasts,
    count,
    queuedCount: toaster.getQueuedCount(),
    paused,

    focusGroup(): void {
      send({ type: "GROUP.HOTKEY" });
    },

    dismiss(id?: string | undefined): void {
      send({ type: "TOAST.DISMISS", id, reason: "programmatic" });
    },

    notifyExit(id: string): void {
      send({ type: "TOAST.EXITED", id });
    },

    getGroupProps: (): T["element"] =>
      normalize.element({
        ...parts.group.attrs,
        id: getGroupId(scope),
        role: "region",
        "aria-label": regionLabel,
        // Focusable but not tabbable: the hotkey and `api.focusGroup()` put the
        // focus here, and nothing else may.
        tabIndex: -1,
        dir: prop("dir"),
        "data-placement": toaster.placement,
        "data-overlap": dataAttr(toaster.overlap),
        "data-paused": dataAttr(paused),
        "data-expanded": dataAttr(paused),
        // Spatial navigation never routes into a notification region on its own
        // (components.md T2): arriving here is always something the person did.
        "data-snav-ignore": "",
        style: { "--sui-toast-count": String(count) },
        onPointerEnter() {
          send({ type: "GROUP.POINTER_ENTER" });
        },
        onPointerLeave() {
          send({ type: "GROUP.POINTER_LEAVE" });
        },
        onFocusIn(event) {
          send({ type: "GROUP.FOCUS_ENTER", relatedTarget: event.relatedTarget });
        },
        onFocusOut(event) {
          send({ type: "GROUP.FOCUS_LEAVE", relatedTarget: event.relatedTarget });
        },
        onKeyDown(event) {
          onRegionKeyDown(event, frontId);
        },
      }),

    /**
     * `role` for navigability, `aria-live="off"` so the card does not read itself
     * — the speech goes through the document's shared announcer (spec §0.4, the
     * Radix pattern). A title is required on every record, so `aria-labelledby`
     * is unconditional; the description is only pointed at when the record has
     * one, because a dangling IDREF names nothing.
     */
    getRootProps: (toast: ToastRecord): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope, toast.id),
        role: toast.politeness === "assertive" ? "alert" : "status",
        "aria-live": "off",
        "aria-atomic": ariaAttr(true),
        "aria-labelledby": getTitleId(scope, toast.id),
        "aria-describedby":
          toast.description === undefined ? undefined : getDescriptionId(scope, toast.id),
        // Every card is its own tab stop. A stack capped at three does not earn a
        // roving composite, and a toast can leave under the focus at any moment —
        // which is what the hand-off exists for, not a single tab stop.
        tabIndex: 0,
        "data-type": toast.type,
        "data-state": toast.status === "visible" ? "open" : "closed",
        "data-front": dataAttr(toast.id === frontId),
        "data-paused": dataAttr(paused),
        "data-placement": toaster.placement,
        // The card applies the material, so it is the card that has to say so:
        // nothing inside it can find out what is painted behind it.
        "data-sui-on-glass": "",
        style: { "--sui-toast-index": String(indexOf(toast)) },
        onKeyDown(event) {
          onRegionKeyDown(event, toast.id);
        },
      }),

    getIndicatorProps: (toast: ToastRecord): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-type": toast.type,
      }),

    getTitleProps: (toast: ToastRecord): T["element"] =>
      normalize.element({ ...parts.title.attrs, id: getTitleId(scope, toast.id) }),

    getDescriptionProps: (toast: ToastRecord): T["element"] =>
      normalize.element({ ...parts.description.attrs, id: getDescriptionId(scope, toast.id) }),

    getActionTriggerProps: (toast: ToastRecord): T["button"] =>
      normalize.button({
        ...parts.actionTrigger.attrs,
        type: "button",
        "data-type": toast.type,
        onClick(event) {
          if (event.defaultPrevented) return;
          const action = toast.action;
          if (action === undefined) return;
          action.onClick();
          if (action.dismissOnClick === false) return;
          send({ type: "TOAST.DISMISS", id: toast.id, reason: "action" });
        },
      }),

    getCloseTriggerProps: (toast: ToastRecord): T["button"] =>
      normalize.button({
        ...parts.closeTrigger.attrs,
        type: "button",
        "aria-label": dismissLabel,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "TOAST.DISMISS", id: toast.id, reason: "close-trigger" });
        },
      }),
  };
}
