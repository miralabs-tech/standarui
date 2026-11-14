import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Align, Side } from "../../positioner/compute-position";
import { parts } from "./popover.anatomy";
import {
  getAnchorId,
  getArrowId,
  getBackdropId,
  getCloseTriggerId,
  getContentId,
  getDescriptionId,
  getPositionerId,
  getTitleId,
  getTriggerId,
} from "./popover.dom";
import type { PopoverApi, PopoverSchema } from "./popover.types";

export function connect<T extends PropTypes>(
  service: Service<PopoverSchema>,
  normalize: NormalizeProps<T>,
): PopoverApi<T> {
  const { context, prop, computed, send, scope } = service;

  const open = context.get("open");
  const modal = prop("modal");
  const presentation = computed("presentation");
  const disabled = prop("disabled");
  const state = open ? "open" : "closed";
  const placement = context.get("currentPlacement");
  // Split here rather than imported: `compute-position` keeps its parser private,
  // and re-exporting one to save this line would widen the positioner's surface.
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const contentId = getContentId(scope);
  const titleId = getTitleId(scope);
  const descriptionId = getDescriptionId(scope);

  const hasTitle = context.get("hasTitle");
  const describedBy = [
    context.get("hasDescription") ? descriptionId : undefined,
    prop("describedBy"),
  ]
    .filter((id): id is string => id !== undefined && id !== "")
    .join(" ");

  const placementAttrs = { "data-side": side, "data-align": align };

  return {
    open,
    modal,
    presentation,
    placement,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
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
        // Only while open — a dangling IDREF names nothing.
        "aria-controls": open ? contentId : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          // A disclosure: the same button closes it. This is the one event where
          // the popover and the dialog genuinely differ.
          send({ type: "TRIGGER.CLICK" });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.key !== "Tab" || event.shiftKey) return;
          // The machine guards this too. The condition is repeated here because
          // suppressing the browser's own Tab has to be decided synchronously,
          // and only the handler is in a position to do it: without the
          // `preventDefault`, focus would enter the surface and the native Tab
          // would immediately walk it out again.
          if (!open || prop("autoFocus")) return;
          event.preventDefault();
          send({ type: "TRIGGER.KEYDOWN", key: event.key, shiftKey: event.shiftKey });
        },
      }),

    // No ARIA and no state: it is a measuring box. It exists for the surfaces
    // that point at something other than the control that opened them.
    getAnchorProps: (): T["element"] =>
      normalize.element({ ...parts.anchor.attrs, id: getAnchorId(scope) }),

    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-presentation": presentation,
      }),

    /**
     * The floating element. **`data-side` and `data-align` are deliberately absent
     * here** — the position effect writes them onto this node directly, and an
     * adapter that also rendered them would fight the effect over the same two
     * attributes on every commit. They are published on `content` and `arrow`
     * instead, from `currentPlacement`, which is the same value one step later.
     */
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-sui-layer-parent": prop("parentId"),
        "data-state": state,
        "data-presentation": presentation,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        ...placementAttrs,
        id: contentId,
        role: "dialog",
        dir: context.get("surfaceDir") ?? prop("dir"),
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
        // Posted even when the surface is not modal, unlike the dialog: a popover
        // is left with B, not by walking out of the bottom of it. tvOS convention.
        "data-snav": "container",
        "data-snav-trap": "",
      }),

    // Decoration, and it says so: the silhouette carries no meaning a reader
    // needs, and `--sui-arrow-x/y` lands on this node.
    getArrowProps: (): T["element"] =>
      normalize.element({
        ...parts.arrow.attrs,
        ...placementAttrs,
        id: getArrowId(scope),
        "aria-hidden": ariaAttr(true),
      }),

    getArrowTipProps: (): T["element"] => normalize.element({ ...parts.arrowTip.attrs }),

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
  };
}
