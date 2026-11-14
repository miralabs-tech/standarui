import { FOCUSABLE_SELECTOR, isTabbable } from "@standarx/nav";
import { addDomEvent, isPrimaryPointer } from "../../dom/event";
import { observeAttributes, observeChildren, observeResize as onResize } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { trackDragAxis } from "../../interaction/drag-axis";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import {
  getContentEl,
  getRootId,
  getScrollbarEl,
  getThumbEl,
  getViewportEl,
  readViewportMetrics,
} from "./scroll-area.dom";
import {
  type AxisMetrics,
  dragOffset,
  overflows,
  pageOffset,
  thumbLength,
  thumbPosition,
  trackLength,
} from "./scroll-area.props";
import type { ScrollAreaSchema, ScrollAxis } from "./scroll-area.types";

type Params = MachineParams<ScrollAreaSchema>;

type Reader = Pick<Params, "context" | "prop">;

const AXES: readonly ScrollAxis[] = ["x", "y"];

const DEFAULT_HIDE_DELAY = 1000;

function disposeAll(disposers: VoidFunction[]): void {
  for (const dispose of disposers.reverse()) dispose();
}

function metricsOf({ context }: Reader, axis: ScrollAxis): AxisMetrics {
  return axis === "x"
    ? {
        viewport: context.get("viewportX"),
        content: context.get("contentX"),
        offset: context.get("offsetX"),
      }
    : {
        viewport: context.get("viewportY"),
        content: context.get("contentY"),
        offset: context.get("offsetY"),
      };
}

function hasCorner(reader: Reader): boolean {
  return (
    reader.prop("orientation") === "both" &&
    overflows(metricsOf(reader, "x")) &&
    overflows(metricsOf(reader, "y"))
  );
}

function trackOf(reader: Reader, axis: ScrollAxis): number {
  return trackLength(metricsOf(reader, axis).viewport, hasCorner(reader));
}

function setOffset({ context }: Reader, axis: ScrollAxis, offset: number): void {
  context.set(axis === "x" ? "offsetX" : "offsetY", offset);
}

function hasAccessibleName(node: HTMLElement): boolean {
  return (
    node.hasAttribute("aria-label") ||
    node.hasAttribute("aria-labelledby") ||
    node.hasAttribute("title")
  );
}

function writeScroll({ scope, context }: Params, axis: ScrollAxis, rtl: boolean): void {
  const viewport = getViewportEl(scope);
  if (viewport === null) return;
  if (axis === "y") {
    viewport.scrollTop = context.get("offsetY");
    return;
  }
  const offset = context.get("offsetX");
  viewport.scrollLeft = rtl ? -offset : offset;
}

export const machine: Machine<ScrollAreaSchema> = createMachine<ScrollAreaSchema>({
  props({ props }) {
    return {
      orientation: "vertical",
      always: false,
      ...props,
      hideDelay: Math.max(0, props.hideDelay ?? DEFAULT_HIDE_DELAY),
    };
  },

  context({ bindable }) {
    return {
      viewportX: bindable<number>(() => ({ defaultValue: 0 })),
      viewportY: bindable<number>(() => ({ defaultValue: 0 })),
      contentX: bindable<number>(() => ({ defaultValue: 0 })),
      contentY: bindable<number>(() => ({ defaultValue: 0 })),
      offsetX: bindable<number>(() => ({ defaultValue: 0 })),
      offsetY: bindable<number>(() => ({ defaultValue: 0 })),
      hoverAxis: bindable<ScrollAxis | null>(() => ({ defaultValue: null })),
      hasFocusable: bindable<boolean>(() => ({ defaultValue: false })),
      viewportFocused: bindable<boolean>(() => ({ defaultValue: false })),
      dragAxis: bindable<ScrollAxis | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    overflowX: (reader) =>
      reader.prop("orientation") !== "vertical" && overflows(metricsOf(reader, "x")),
    overflowY: (reader) =>
      reader.prop("orientation") !== "horizontal" && overflows(metricsOf(reader, "y")),
    corner: (reader) => hasCorner(reader),
    thumbSizeX: (reader) => thumbLength(metricsOf(reader, "x"), trackOf(reader, "x")),
    thumbSizeY: (reader) => thumbLength(metricsOf(reader, "y"), trackOf(reader, "y")),
    thumbOffsetX: (reader) => thumbPosition(metricsOf(reader, "x"), trackOf(reader, "x")),
    thumbOffsetY: (reader) => thumbPosition(metricsOf(reader, "y"), trackOf(reader, "y")),
  },

  refs() {
    return { dragStart: null };
  },

  initialState() {
    return "idle";
  },

  effects: [
    "trackScroll",
    "observeResize",
    "trackFocusables",
    "trackViewportFocus",
    "warnIfAnonymous",
    "trackPointer",
  ],

  on: {
    "VIEWPORT.RESIZE": { actions: ["setMetrics"] },
    "CONTENT.FOCUSABLES": { actions: ["setFocusables"] },
    "VIEWPORT.FOCUS": { actions: ["setViewportFocus"] },
    "VIEWPORT.BLUR": { actions: ["setViewportFocus"] },
    "SCROLLBAR.POINTERENTER": { actions: ["setHovering"] },
    "SCROLLBAR.POINTERLEAVE": { actions: ["clearHovering"] },
    "THUMB.DRAG_START": { guard: "canDrag", target: "dragging", actions: ["beginDrag"] },
    "TRACK.PAGE": { actions: ["pageTrack"] },
  },

  states: {
    idle: {
      on: {
        "VIEWPORT.SCROLL": [
          { guard: "isAlways", actions: ["setOffsets"] },
          { target: "scrolling", actions: ["setOffsets"] },
        ],
        "SCROLLBAR.POINTERLEAVE": [
          { guard: "restartsHide", target: "lingering" },
          { actions: ["clearHovering"] },
        ],
      },
    },

    lingering: {
      effects: ["armHideTimer"],
      on: {
        "VIEWPORT.SCROLL": { target: "scrolling", actions: ["setOffsets", "clearHoverAxis"] },
        "SCROLLBAR.POINTERENTER": { target: "idle", actions: ["setHovering"] },
        "HIDE.TIMEOUT": { target: "idle", actions: ["clearHoverAxis"] },
      },
    },

    scrolling: {
      effects: ["armHideTimer"],
      on: {
        "VIEWPORT.SCROLL": { reenter: true, actions: ["setOffsets"] },
        "SCROLLBAR.POINTERLEAVE": [
          { guard: "restartsHide", reenter: true, actions: ["clearHovering"] },
          { actions: ["clearHovering"] },
        ],
        "HIDE.TIMEOUT": { target: "idle" },
      },
    },

    dragging: {
      on: {
        "VIEWPORT.SCROLL": { actions: ["setOffsets"] },
        "THUMB.DRAG": { actions: ["updateDrag"] },
        "THUMB.DRAG_END": [
          { guard: "isAlways", target: "idle", actions: ["endDrag"] },
          { target: "scrolling", actions: ["endDrag"] },
        ],
        "THUMB.DRAG_CANCEL": [
          { guard: "isAlways", target: "idle", actions: ["cancelDrag"] },
          { target: "scrolling", actions: ["cancelDrag"] },
        ],
      },
    },
  },

  implementations: {
    guards: {
      isAlways: ({ prop }) => prop("always"),
      restartsHide: ({ prop, context, event }) =>
        event.type === "SCROLLBAR.POINTERLEAVE" &&
        !prop("always") &&
        context.get("hoverAxis") === event.axis,
      canDrag(params) {
        const { event, state } = params;
        if (event.type !== "THUMB.DRAG_START" || state.matches("dragging")) return false;
        const metrics = metricsOf(params, event.axis);
        const track = trackOf(params, event.axis);
        return overflows(metrics) && track - thumbLength(metrics, track) > 0;
      },
    },

    actions: {
      setOffsets({ context, event }) {
        if (event.type !== "VIEWPORT.SCROLL") return;
        context.set("offsetX", event.offsetX);
        context.set("offsetY", event.offsetY);
      },

      setMetrics({ context, event }) {
        if (event.type !== "VIEWPORT.RESIZE") return;
        context.set("viewportX", event.viewportX);
        context.set("viewportY", event.viewportY);
        context.set("contentX", event.contentX);
        context.set("contentY", event.contentY);
        context.set("offsetX", event.offsetX);
        context.set("offsetY", event.offsetY);
      },

      setFocusables({ context, event }) {
        if (event.type === "CONTENT.FOCUSABLES") context.set("hasFocusable", event.has);
      },

      setViewportFocus({ context, event }) {
        if (event.type === "VIEWPORT.FOCUS") context.set("viewportFocused", true);
        else if (event.type === "VIEWPORT.BLUR") context.set("viewportFocused", false);
      },

      setHovering({ context, event }) {
        if (event.type === "SCROLLBAR.POINTERENTER") context.set("hoverAxis", event.axis);
      },

      clearHoverAxis({ context }) {
        context.set("hoverAxis", null);
      },

      clearHovering({ context, event }) {
        if (event.type === "SCROLLBAR.POINTERLEAVE" && context.get("hoverAxis") === event.axis) {
          context.set("hoverAxis", null);
        }
      },

      beginDrag({ context, refs, event }) {
        if (event.type !== "THUMB.DRAG_START") return;
        refs.set("dragStart", event.offset);
        context.set("dragAxis", event.axis);
      },

      updateDrag(params) {
        const { context, refs, event } = params;
        const axis = context.get("dragAxis");
        const start = refs.get("dragStart");
        if (event.type !== "THUMB.DRAG" || axis === null || start === null) return;
        setOffset(
          params,
          axis,
          dragOffset(start, event.position, metricsOf(params, axis), trackOf(params, axis)),
        );
      },

      endDrag(params) {
        const { context, refs, event } = params;
        const axis = context.get("dragAxis");
        const start = refs.get("dragStart");
        if (event.type === "THUMB.DRAG_END" && axis !== null && start !== null) {
          setOffset(
            params,
            axis,
            dragOffset(start, event.position, metricsOf(params, axis), trackOf(params, axis)),
          );
        }
        refs.set("dragStart", null);
        context.set("dragAxis", null);
      },

      cancelDrag(params) {
        const { context, refs } = params;
        const axis = context.get("dragAxis");
        const start = refs.get("dragStart");
        if (axis !== null && start !== null) setOffset(params, axis, start);
        refs.set("dragStart", null);
        context.set("dragAxis", null);
      },

      pageTrack(params) {
        const { event } = params;
        if (event.type !== "TRACK.PAGE") return;
        const metrics = metricsOf(params, event.axis);
        if (!overflows(metrics)) return;
        setOffset(params, event.axis, pageOffset(metrics, event.direction));
      },
    },

    effects: {
      trackScroll({ scope, send }) {
        const viewport = getViewportEl(scope);
        if (viewport === null) return;
        const win = viewport.ownerDocument.defaultView;
        const report = (): void =>
          send({
            type: "VIEWPORT.SCROLL",
            offsetX: Math.abs(viewport.scrollLeft),
            offsetY: viewport.scrollTop,
          });
        if (win === null) return addDomEvent(viewport, "scroll", report, { passive: true });
        let frame: number | null = null;
        const stop = addDomEvent(
          viewport,
          "scroll",
          () => {
            if (frame !== null) return;
            frame = win.requestAnimationFrame(() => {
              frame = null;
              report();
            });
          },
          { passive: true },
        );
        return () => {
          stop();
          if (frame !== null) win.cancelAnimationFrame(frame);
        };
      },

      observeResize({ scope, send }) {
        const viewport = getViewportEl(scope);
        if (viewport === null) return;
        const measure = (): void =>
          send({ type: "VIEWPORT.RESIZE", ...readViewportMetrics(viewport) });
        measure();
        const stops = [onResize(viewport, measure), onResize(getContentEl(scope), measure)];
        return () => {
          for (const stop of stops.reverse()) stop();
        };
      },

      trackFocusables({ scope, send }) {
        const content = getContentEl(scope);
        if (content === null) return;
        // The first tab stop settles the question: weighing every focusable costs a
        // `checkVisibility` each, on every batch of a virtualised list's rows.
        const sync = (): void =>
          send({
            type: "CONTENT.FOCUSABLES",
            has: Array.prototype.some.call(
              content.querySelectorAll(FOCUSABLE_SELECTOR),
              isTabbable,
            ),
          });
        sync();
        return observeChildren(content, sync, [
          "tabindex",
          "disabled",
          "hidden",
          "inert",
          "class",
          "style",
        ]);
      },

      trackViewportFocus({ scope, send }) {
        const viewport = getViewportEl(scope);
        if (viewport === null) return;
        const doc = viewport.ownerDocument;
        const win = doc.defaultView;
        // The viewport's own root, not the document: inside a shadow root the
        // document's active element is the host. A detached node has no root
        // that knows an active element.
        const isActive = (): boolean => {
          const root = viewport.getRootNode() as Partial<DocumentOrShadowRoot>;
          return root.activeElement === viewport;
        };
        let observer: MutationObserver | null = null;
        const release = (): void => {
          observer?.disconnect();
          observer = null;
        };
        const lose = (): void => {
          release();
          send({ type: "VIEWPORT.BLUR" });
        };
        // Firefox and WebKit send no `blur` when a focused node leaves the
        // document: while the viewport holds the focus, every batch of mutations
        // asks whether it still does. Each shadow root up to the document is
        // observed, since a mutation does not cross that boundary.
        const hold = (): void => {
          send({ type: "VIEWPORT.FOCUS" });
          if (observer !== null || win === null) return;
          const watcher = new win.MutationObserver(() => {
            if (!isActive()) lose();
          });
          let node: Node = viewport;
          for (;;) {
            const root = node.getRootNode();
            if (root.nodeType !== 11 || !("host" in root)) break;
            watcher.observe(root, { childList: true, subtree: true });
            node = (root as ShadowRoot).host;
          }
          watcher.observe(doc.documentElement, { childList: true, subtree: true });
          observer = watcher;
        };
        if (isActive()) hold();
        const stops = [
          addDomEvent(viewport, "focus", hold),
          addDomEvent(viewport, "blur", () => {
            if (!isActive()) lose();
          }),
        ];
        return () => {
          for (const stop of stops.reverse()) stop();
          release();
        };
      },

      warnIfAnonymous({ scope }) {
        const viewport = getViewportEl(scope);
        if (viewport === null || !isDev()) return;
        let warned = false;
        const check = (): void => {
          if (warned || viewport.getAttribute("tabindex") !== "0" || hasAccessibleName(viewport)) {
            return;
          }
          warned = true;
          warn(
            true,
            "a scroll-area takes focus with no accessible name — give it a `label` or a `labelledBy`",
          );
        };
        check();
        return observeAttributes(viewport, ["tabindex"], check);
      },

      trackPointer(params) {
        const { scope, prop, context, send, state } = params;
        const bound = new Map<
          ScrollAxis,
          { bar: HTMLElement | null; thumb: HTMLElement | null; stop: VoidFunction }
        >();

        const bind = (
          axis: ScrollAxis,
          bar: HTMLElement,
          thumb: HTMLElement | null,
        ): VoidFunction => {
          const disposers: VoidFunction[] = [];
          disposers.push(
            addDomEvent(bar, "pointerenter", () => send({ type: "SCROLLBAR.POINTERENTER", axis })),
            addDomEvent(bar, "pointerleave", () => send({ type: "SCROLLBAR.POINTERLEAVE", axis })),
          );

          if (thumb === null) return () => disposeAll(disposers);

          const onThumbSpan = (event: PointerEvent): boolean => {
            const box = thumb.getBoundingClientRect();
            return axis === "y"
              ? event.clientY >= box.top && event.clientY <= box.bottom
              : event.clientX >= box.left && event.clientX <= box.right;
          };

          disposers.push(
            addDomEvent(bar, "pointerdown", (event: PointerEvent) => {
              if (!isPrimaryPointer(event)) return;
              if (event.pointerType === "mouse") event.preventDefault();
              if (onThumbSpan(event)) return;
              const box = thumb.getBoundingClientRect();
              const before = axis === "y" ? event.clientY < box.top : event.clientX < box.left;
              const mirrored = axis === "x" && resolveDir(prop("dir"), bar) === "rtl";
              send({ type: "TRACK.PAGE", axis, direction: before !== mirrored ? -1 : 1 });
              writeScroll(params, axis, mirrored);
            }),
          );

          let active = false;
          let rtl = false;
          disposers.push(
            // No `dir`: the root wears `dir={prop("dir")}`, and the gesture reads
            // what the bar resolves when it starts, so a direction changed at
            // runtime is the one a drag follows.
            trackDragAxis(bar, {
              axis: axis === "x" ? "inline" : "block",
              canStart: onThumbSpan,
              onDragStart: (event) => {
                rtl = axis === "x" && resolveDir(prop("dir"), bar) === "rtl";
                send({
                  type: "THUMB.DRAG_START",
                  axis,
                  offset: context.get(axis === "x" ? "offsetX" : "offsetY"),
                });
                active = state.matches("dragging");
                if (!active) return;
                send({ type: "THUMB.DRAG", position: event.position });
                writeScroll(params, axis, rtl);
              },
              onDrag: (event) => {
                if (!active) return;
                send({ type: "THUMB.DRAG", position: event.position });
                writeScroll(params, axis, rtl);
              },
              onDragEnd: (event) => {
                if (!active) return;
                active = false;
                send({ type: "THUMB.DRAG_END", position: event.position });
                writeScroll(params, axis, rtl);
              },
              onDragCancel: () => {
                if (!active) return;
                active = false;
                send({ type: "THUMB.DRAG_CANCEL" });
                writeScroll(params, axis, rtl);
              },
            }),
          );
          return () => disposeAll(disposers);
        };

        // A bar or a thumb can arrive, leave or be replaced after the start
        // (`orientation` changed at runtime): each axis is bound to the nodes
        // that exist now, and rebound when they change.
        const sync = (): void => {
          for (const axis of AXES) {
            const bar = getScrollbarEl(scope, axis);
            const thumb = getThumbEl(scope, axis);
            const current = bound.get(axis);
            if (current !== undefined && current.bar === bar && current.thumb === thumb) continue;
            current?.stop();
            bound.delete(axis);
            if (bar !== null) bound.set(axis, { bar, thumb, stop: bind(axis, bar, thumb) });
          }
        };
        sync();

        const root = scope.getById(getRootId(scope));
        const viewport = getViewportEl(scope);
        const stopObserving = observeChildren(root, (_, records) => {
          if (records.every((record) => viewport?.contains(record.target) === true)) return;
          sync();
        });

        return () => {
          stopObserving();
          for (const { stop } of bound.values()) stop();
          bound.clear();
        };
      },

      armHideTimer({ prop, send }) {
        const timer = setTimeout(() => send({ type: "HIDE.TIMEOUT" }), prop("hideDelay"));
        return () => clearTimeout(timer);
      },
    },
  },
});
