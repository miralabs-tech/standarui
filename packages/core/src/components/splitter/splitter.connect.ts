import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { roundToPrecision } from "../../utils/range";
import { parts } from "./splitter.anatomy";
import { getHandleId, getPanelId } from "./splitter.dom";
import { getKeyIntent, isAdjustable, precisionOf } from "./splitter.props";
import type { SplitterApi, SplitterSchema } from "./splitter.types";

export function connect<T extends PropTypes>(
  service: Service<SplitterSchema>,
  normalize: NormalizeProps<T>,
): SplitterApi<T> {
  const { context, prop, computed, state, send, scope } = service;

  const orientation = prop("orientation");
  const panelSide = prop("panelSide");
  const unit = prop("unit");
  const step = prop("step");
  const disabled = prop("disabled");
  const collapsible = prop("collapsible");

  const size = context.get("size");
  const collapsed = context.get("collapsed");
  const currentSize = computed("currentSize");
  const dragging = context.get("dragging");
  const engaged = state.matches("engaged");
  const focusSource = state.matches("focused", "engaged") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const stateAttrs = {
    "data-orientation": orientation,
    "data-side": panelSide,
    "data-collapsed": dataAttr(collapsed),
    "data-rail": dataAttr(collapsed && prop("collapsedSize") > 0),
    "data-dragging": dataAttr(dragging),
  };

  return {
    size,
    collapsed,
    dragging,
    engaged,
    focusVisible,

    setSize(next: number): void {
      send({ type: "SIZE.SET", size: next });
    },

    setCollapsed(next: boolean): void {
      send({ type: "COLLAPSED.SET", collapsed: next });
    },

    toggle(): void {
      send({ type: "HANDLE.TOGGLE" });
    },

    getPanelProps: (): T["element"] =>
      normalize.element({
        ...parts.panel.attrs,
        ...stateAttrs,
        id: getPanelId(scope),
        style: { "--sui-splitter-size": `${roundToPrecision(currentSize, 4)}${unit}` },
      }),

    getHandleProps: (): T["element"] =>
      normalize.element({
        ...parts.handle.attrs,
        ...stateAttrs,
        id: getHandleId(scope),
        role: "separator",
        tabIndex: disabled ? undefined : 0,
        "aria-orientation": orientation === "horizontal" ? "vertical" : "horizontal",
        "aria-valuenow": roundToPrecision(currentSize, precisionOf(step)),
        "aria-valuemin": computed("valueMin"),
        "aria-valuemax": prop("max"),
        "aria-valuetext": computed("valueText"),
        "aria-controls": getPanelId(scope),
        "aria-label": prop("label"),
        "aria-labelledby": prop("labelledBy"),
        "aria-disabled": ariaAttr(disabled),
        "data-engaged": dataAttr(engaged),
        "data-disabled": dataAttr(disabled),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,

        onKeyDown(event) {
          if (event.defaultPrevented || disabled) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.key === "Enter") {
            if (!collapsible) return;
            event.preventDefault();
            if (!event.repeat) send({ type: "HANDLE.TOGGLE" });
            return;
          }
          const intent = getKeyIntent(event.key);
          if (intent === null || !isAdjustable(intent, orientation, panelSide)) return;
          event.preventDefault();
          send({ type: "HANDLE.ADJUST", intent });
        },

        onFocus(event) {
          if (!event.defaultPrevented) send({ type: "HANDLE.FOCUS" });
        },

        onBlur(event) {
          if (!event.defaultPrevented) send({ type: "HANDLE.BLUR" });
        },
      }),
  };
}
