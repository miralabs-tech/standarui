import { dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Align, Side } from "../../positioner/compute-position";
import { parts } from "./tooltip.anatomy";
import { getContentId, getPositionerId, getTriggerId } from "./tooltip.dom";
import type { TooltipApi, TooltipSchema } from "./tooltip.types";

export function connect<T extends PropTypes>(
  service: Service<TooltipSchema>,
  normalize: NormalizeProps<T>,
): TooltipApi<T> {
  const { context, prop, send, scope } = service;

  const open = context.get("open");
  const disabled = prop("disabled");
  const state = open ? "open" : "closed";
  const placement = context.get("currentPlacement");
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const contentId = getContentId(scope);
  const placementAttrs = { "data-side": side, "data-align": align };

  return {
    open,
    placement,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    /**
     * `aria-describedby` and never `aria-label`: a tooltip adds to the control's
     * name, it does not replace it. Published only while open, because that is
     * when the surface is in the tree — a dangling IDREF describes nothing.
     *
     * `disabled` is deliberately absent: the prop disables the tooltip, not the
     * control it hangs off, and a disabled control is exactly the one whose
     * tooltip explains why.
     */
    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: getTriggerId(scope),
        type: "button",
        "aria-describedby": open ? contentId : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
        onPointerEnter(event) {
          send({ type: "TRIGGER.POINTER_ENTER", pointerType: event.pointerType });
        },
        onPointerLeave() {
          send({ type: "TRIGGER.POINTER_LEAVE" });
        },
        onPointerDown() {
          send({ type: "TRIGGER.POINTER_DOWN" });
        },
        onFocus() {
          send({ type: "TRIGGER.FOCUS" });
        },
        onBlur() {
          send({ type: "TRIGGER.BLUR" });
        },
      }),

    /**
     * The floating element. `data-side` and `data-align` are absent here for the
     * popover's reason: the position effect writes them onto this node itself,
     * and an adapter rendering them too would fight it on every commit.
     */
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-state": state,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        ...placementAttrs,
        id: contentId,
        role: "tooltip",
        dir: context.get("surfaceDir") ?? prop("dir"),
        "data-state": state,
      }),
  };
}
