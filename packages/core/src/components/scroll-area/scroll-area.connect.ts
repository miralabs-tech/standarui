import { dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Orientation } from "../../types";
import { roundToPrecision } from "../../utils/range";
import { parts } from "./scroll-area.anatomy";
import {
  getContentId,
  getCornerId,
  getRootId,
  getScrollbarId,
  getThumbId,
  getViewportEl,
  getViewportId,
} from "./scroll-area.dom";
import type {
  ScrollAreaApi,
  ScrollAreaSchema,
  ScrollAreaScrollToOptions,
  ScrollAxis,
} from "./scroll-area.types";

const PX_PRECISION = 2;

function axisOf(orientation: Orientation): ScrollAxis {
  return orientation === "horizontal" ? "x" : "y";
}

export function connect<T extends PropTypes>(
  service: Service<ScrollAreaSchema>,
  normalize: NormalizeProps<T>,
): ScrollAreaApi<T> {
  const { context, prop, computed, state, scope } = service;

  const overflowX = computed("overflowX");
  const overflowY = computed("overflowY");
  const scrolling = state.matches("scrolling");
  const dragging = state.matches("dragging");
  const lingering = state.matches("lingering");
  const hoverAxis = context.get("hoverAxis");
  const dragAxis = context.get("dragAxis");
  const focusable =
    context.get("viewportFocused") || ((overflowX || overflowY) && !context.get("hasFocusable"));

  const overflowAttrs = {
    "data-overflow-x": dataAttr(overflowX),
    "data-overflow-y": dataAttr(overflowY),
  };

  return {
    overflowX,
    overflowY,
    scrolling,
    dragging,

    scrollTo({ top, left }: ScrollAreaScrollToOptions): void {
      const viewport = getViewportEl(scope);
      if (viewport === null) return;
      const target: ScrollToOptions = {};
      if (top !== undefined) target.top = top;
      if (left !== undefined) {
        target.left = resolveDir(prop("dir"), viewport) === "rtl" ? -left : left;
      }
      viewport.scrollTo(target);
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "data-orientation": prop("orientation"),
        "data-scrolling": dataAttr(scrolling),
        "data-dragging": dataAttr(dragging),
        "data-always": dataAttr(prop("always")),
        ...overflowAttrs,
      }),

    getViewportProps: (): T["element"] =>
      normalize.element({
        ...parts.viewport.attrs,
        id: getViewportId(scope),
        tabIndex: focusable ? 0 : undefined,
        role: focusable ? "region" : undefined,
        "aria-label": focusable ? prop("label") : undefined,
        "aria-labelledby": focusable ? prop("labelledBy") : undefined,
        ...overflowAttrs,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope),
      }),

    getScrollbarProps: ({ orientation }: { orientation: Orientation }): T["element"] => {
      const axis = axisOf(orientation);
      return normalize.element({
        ...parts.scrollbar.attrs,
        id: getScrollbarId(scope, axis),
        "aria-hidden": "true",
        "data-orientation": orientation,
        "data-state": (axis === "x" ? overflowX : overflowY) ? "visible" : "hidden",
        "data-hovering": dataAttr(hoverAxis === axis && !lingering),
        "data-lingering": dataAttr(hoverAxis === axis && lingering),
        "data-dragging": dataAttr(dragAxis === axis),
      });
    },

    getThumbProps: ({ orientation }: { orientation: Orientation }): T["element"] => {
      const axis = axisOf(orientation);
      return normalize.element({
        ...parts.thumb.attrs,
        id: getThumbId(scope, axis),
        "data-orientation": orientation,
        style: {
          "--sui-scroll-area-thumb-size": `${roundToPrecision(
            computed(axis === "x" ? "thumbSizeX" : "thumbSizeY"),
            PX_PRECISION,
          )}px`,
          "--sui-scroll-area-thumb-offset": `${roundToPrecision(
            computed(axis === "x" ? "thumbOffsetX" : "thumbOffsetY"),
            PX_PRECISION,
          )}px`,
        },
      });
    },

    getCornerProps: (): T["element"] =>
      normalize.element({
        ...parts.corner.attrs,
        id: getCornerId(scope),
        "aria-hidden": "true",
        "data-state": computed("corner") ? "visible" : "hidden",
      }),
  };
}
