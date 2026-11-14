import { getInputModality, pushEngageScope, trackInputModality } from "@standarx/nav";
import { addDomEvent } from "../../dom/event";
import { observeChildren } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { trackDragAxis } from "../../interaction/drag-axis";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams, Transition } from "../../machine/types";
import type { InputModality } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import { roundToPrecision } from "../../utils/range";
import { getHandleEl, getPanelEl } from "./splitter.dom";
import { isAdjustable, precisionOf, resolveGrowth } from "./splitter.props";
import type { SplitterSchema } from "./splitter.types";

type Params = MachineParams<SplitterSchema>;

const DRAG_PRECISION = 2;

function clampSize(params: Params, size: number): number {
  return Math.min(params.prop("max"), Math.max(params.prop("min"), size));
}

function hasAccessibleName(node: HTMLElement | null): boolean {
  return (
    node === null ||
    node.hasAttribute("aria-label") ||
    node.hasAttribute("aria-labelledby") ||
    node.hasAttribute("title")
  );
}

function noteOrigin({ context, refs }: Params): void {
  if (refs.get("originSize") !== null) return;
  refs.set("originSize", refs.get("lastSize") ?? context.get("size"));
  refs.set("originCollapsed", refs.get("lastCollapsed") ?? context.get("collapsed"));
}

function writeSize(params: Params, size: number): void {
  const { context, refs } = params;
  noteOrigin(params);
  refs.set("lastSize", size);
  context.set("size", size);
}

function writeCollapsed(params: Params, collapsed: boolean): void {
  const { context, refs } = params;
  noteOrigin(params);
  refs.set("lastCollapsed", collapsed);
  context.set("collapsed", collapsed);
}

function clearWrites(refs: Params["refs"]): void {
  refs.set("lastSize", null);
  refs.set("lastCollapsed", null);
  refs.set("originSize", null);
  refs.set("originCollapsed", null);
}

function applyDrag(params: Params, position: number): void {
  const { prop, refs } = params;
  const collapsedSize = prop("collapsedSize");
  const base = refs.get("entryCollapsed") === true ? collapsedSize : (refs.get("entrySize") ?? 0);
  const container = refs.get("containerSize") ?? 0;
  const travel = position * (prop("panelSide") === "start" ? 1 : -1);
  const delta = prop("unit") === "%" ? (container > 0 ? (travel / container) * 100 : 0) : travel;
  const raw = base + delta;
  if (prop("collapsible") && raw < (collapsedSize + prop("min")) / 2) {
    const entrySize = refs.get("entrySize");
    if (refs.get("entryCollapsed") !== true && entrySize !== null) writeSize(params, entrySize);
    writeCollapsed(params, true);
    return;
  }
  writeCollapsed(params, false);
  writeSize(params, roundToPrecision(clampSize(params, raw), DRAG_PRECISION));
}

const ADJUST: Transition<SplitterSchema> = {
  guard: "canAdjust",
  actions: ["adjustFromIntent", "invokeChangeEnd"],
};

const ADJUST_HELD: Transition<SplitterSchema> = {
  guard: "canAdjust",
  actions: ["adjustFromIntent"],
};

export const machine: Machine<SplitterSchema> = createMachine<SplitterSchema>({
  props({ props }) {
    const min = props.min ?? 0;
    const requestedMax = props.max ?? 100;
    const unit = props.unit ?? "%";
    warn(
      isDev() && unit === "px" && props.max === undefined,
      'splitter `unit: "px"` without a `max` — `aria-valuemax` falls back to 100, which is a hundred pixels',
    );
    warn(isDev() && requestedMax < min, `splitter max ${requestedMax} is below min ${min}`);
    const requestedStep = props.step ?? (unit === "px" ? 10 : 1);
    warn(isDev() && !(requestedStep > 0), `splitter step must be positive, got ${requestedStep}`);

    return {
      orientation: "horizontal",
      panelSide: "start",
      defaultSize: 50,
      collapsible: false,
      collapsedSize: 0,
      resetOnDoubleClick: true,
      disabled: false,
      intents: null,
      ...props,
      unit,
      min,
      max: Math.max(min, requestedMax),
      step: requestedStep > 0 ? requestedStep : unit === "px" ? 10 : 1,
    };
  },

  context({ prop, bindable }) {
    return {
      size: bindable<number>(() => ({
        defaultValue: Math.min(prop("max"), Math.max(prop("min"), prop("defaultSize"))),
        value: prop("size"),
        onChange: (size) => prop("onSizeChange")?.({ size }),
        debugLabel: "splitter size",
      })),
      collapsed: bindable<boolean>(() => ({
        defaultValue: prop("collapsible") && prop("defaultCollapsed") === true,
        value: prop("collapsed"),
        onChange: (collapsed) => prop("onCollapsedChange")?.({ collapsed }),
        debugLabel: "splitter collapsed",
      })),
      dragging: bindable<boolean>(() => ({ defaultValue: false })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    isInteractive: ({ prop }) => !prop("disabled"),
    currentSize({ context, prop }) {
      if (context.get("collapsed")) return prop("collapsedSize");
      return Math.min(prop("max"), Math.max(prop("min"), context.get("size")));
    },
    valueMin: ({ prop }) => (prop("collapsible") ? prop("collapsedSize") : prop("min")),
    valueText({ context, prop, computed }) {
      return prop("getValueText")?.({
        size: computed("currentSize"),
        collapsed: context.get("collapsed"),
      });
    },
  },

  refs() {
    return {
      entrySize: null,
      entryCollapsed: null,
      containerSize: null,
      lastSize: null,
      lastCollapsed: null,
      originSize: null,
      originCollapsed: null,
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "warnIfAnonymous", "trackPointer"],

  on: {
    "SIZE.SET": { guard: "isInteractive", actions: ["setSize"] },
    "COLLAPSED.SET": [
      { guard: "canToggleMidDrag", actions: ["setCollapsed"] },
      { guard: "canToggle", actions: ["setCollapsed", "invokeChangeEnd"] },
    ],
    "HANDLE.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
    "HANDLE.BLUR": { target: "idle", actions: ["clearFocusSource"] },
    "HANDLE.ADJUST": ADJUST,
    "HANDLE.TOGGLE": { guard: "canToggle", actions: ["toggleCollapsed", "invokeChangeEnd"] },
    "HANDLE.RESET": { guard: "canReset", actions: ["resetSize", "invokeChangeEnd"] },
    "HANDLE.DRAG_START": { guard: "canDrag", actions: ["beginDrag"] },
    "HANDLE.DRAG": { guard: "isDragging", actions: ["updateDrag"] },
    "HANDLE.DRAG_END": { guard: "isDragging", actions: ["endDrag", "invokeChangeEnd"] },
    "HANDLE.DRAG_CANCEL": { guard: "isDragging", actions: ["cancelDrag"] },
  },

  states: {
    idle: {},

    focused: {
      effects: ["captureSelectIntent"],
      on: {
        "HANDLE.ENGAGE": { guard: "canEngage", target: "engaged" },
      },
    },

    engaged: {
      entry: ["snapshotSize"],
      effects: ["captureEngageIntents"],
      on: {
        "HANDLE.RELEASE": [
          {
            guard: ({ event }) => event.type === "HANDLE.RELEASE" && event.committed,
            target: "focused",
            actions: ["clearSnapshot", "invokeChangeEnd"],
          },
          { target: "focused", actions: ["restoreSize", "invokeChangeEnd"] },
        ],
        "HANDLE.ADJUST": ADJUST_HELD,
        "HANDLE.TOGGLE": { guard: "canToggle", actions: ["toggleCollapsed"] },
        "COLLAPSED.SET": { guard: "canToggle", actions: ["setCollapsed"] },
        "HANDLE.BLUR": {
          target: "idle",
          actions: ["restoreSize", "clearFocusSource", "invokeChangeEnd"],
        },
      },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
      canToggle: ({ prop }) => !prop("disabled") && prop("collapsible"),
      canToggleMidDrag: ({ prop, context }) =>
        !prop("disabled") && prop("collapsible") && context.get("dragging"),
      canAdjust: ({ prop, event }) =>
        !prop("disabled") &&
        event.type === "HANDLE.ADJUST" &&
        isAdjustable(event.intent, prop("orientation"), prop("panelSide")),
      canReset: ({ prop }) => !prop("disabled") && prop("resetOnDoubleClick"),
      canDrag: ({ prop, state }) => !prop("disabled") && !state.matches("engaged"),
      isDragging: ({ context }) => context.get("dragging"),
      canEngage: ({ prop, context }) =>
        !prop("disabled") && prop("intents") !== null && !context.get("dragging"),
    },

    actions: {
      setSize(params) {
        if (params.event.type !== "SIZE.SET") return;
        params.context.set("size", clampSize(params, params.event.size));
      },

      setCollapsed(params) {
        if (params.event.type !== "COLLAPSED.SET") return;
        writeCollapsed(params, params.event.collapsed);
      },

      adjustFromIntent(params) {
        const { context, prop, scope, event } = params;
        if (event.type !== "HANDLE.ADJUST") return;
        const { intent } = event;
        if (intent === "home" && prop("collapsible")) {
          writeCollapsed(params, true);
          return;
        }
        if (intent === "home" || intent === "end") {
          writeCollapsed(params, false);
          writeSize(params, intent === "home" ? prop("min") : prop("max"));
          return;
        }
        const growth = resolveGrowth(
          intent,
          prop("orientation"),
          prop("panelSide"),
          resolveDir(prop("dir"), getHandleEl(scope)),
        );
        if (growth === 0) return;
        if (context.get("collapsed")) {
          if (growth > 0) writeCollapsed(params, false);
          return;
        }
        const step = prop("step");
        const next = roundToPrecision(context.get("size") + growth * step, precisionOf(step));
        writeSize(params, clampSize(params, next));
      },

      toggleCollapsed(params) {
        const { context, refs } = params;
        writeCollapsed(params, !(refs.get("lastCollapsed") ?? context.get("collapsed")));
      },

      resetSize(params) {
        writeCollapsed(params, false);
        writeSize(params, clampSize(params, params.prop("defaultSize")));
      },

      beginDrag({ context, refs, event }) {
        if (event.type !== "HANDLE.DRAG_START") return;
        clearWrites(refs);
        refs.set("entrySize", context.get("size"));
        refs.set("entryCollapsed", context.get("collapsed"));
        refs.set("containerSize", event.containerSize);
        context.set("dragging", true);
      },

      updateDrag(params) {
        if (params.event.type !== "HANDLE.DRAG") return;
        applyDrag(params, params.event.position);
      },

      endDrag(params) {
        const { context, refs, event } = params;
        if (event.type !== "HANDLE.DRAG_END") return;
        applyDrag(params, event.position);
        context.set("dragging", false);
        refs.set("entrySize", null);
        refs.set("entryCollapsed", null);
        refs.set("containerSize", null);
      },

      cancelDrag({ context, refs }) {
        clearWrites(refs);
        const entrySize = refs.get("entrySize");
        const entryCollapsed = refs.get("entryCollapsed");
        if (entrySize !== null) context.set("size", entrySize);
        if (entryCollapsed !== null) context.set("collapsed", entryCollapsed);
        context.set("dragging", false);
        refs.set("entrySize", null);
        refs.set("entryCollapsed", null);
        refs.set("containerSize", null);
      },

      captureFocusSource({ context, scope }) {
        context.set(
          "focusSource",
          scope.getRootNode() === null ? null : getInputModality(scope.getDoc()),
        );
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      snapshotSize({ context, refs }) {
        clearWrites(refs);
        refs.set("entrySize", context.get("size"));
        refs.set("entryCollapsed", context.get("collapsed"));
      },

      restoreSize(params) {
        const { refs } = params;
        const entrySize = refs.get("entrySize");
        const entryCollapsed = refs.get("entryCollapsed");
        refs.set("entrySize", null);
        refs.set("entryCollapsed", null);
        if (entrySize !== null) writeSize(params, entrySize);
        if (entryCollapsed !== null) writeCollapsed(params, entryCollapsed);
      },

      clearSnapshot({ refs }) {
        refs.set("entrySize", null);
        refs.set("entryCollapsed", null);
      },

      invokeChangeEnd({ context, prop, refs }) {
        const originSize = refs.get("originSize");
        const size = refs.get("lastSize") ?? context.get("size");
        const collapsed = refs.get("lastCollapsed") ?? context.get("collapsed");
        const changed =
          originSize !== null && (size !== originSize || collapsed !== refs.get("originCollapsed"));
        clearWrites(refs);
        if (changed) prop("onSizeChangeEnd")?.({ size });
      },
    },

    effects: {
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      warnIfAnonymous({ scope }) {
        if (scope.getRootNode() === null) return;
        const timer = scope.getWin().setTimeout(() => {
          warn(
            isDev() && !hasAccessibleName(getHandleEl(scope)),
            "a splitter has no accessible name — give it a `label` or a `labelledBy`",
          );
        });
        return () => scope.getWin().clearTimeout(timer);
      },

      trackPointer({ scope, prop, context, send }) {
        if (getHandleEl(scope) === null) return;

        // Read per gesture, so `orientation` and `dir` changed at runtime are the
        // ones a drag follows.
        const bind = (handle: HTMLElement): VoidFunction => {
          const stops = [
            trackDragAxis(handle, {
              axis: () => (prop("orientation") === "horizontal" ? "inline" : "block"),
              dir: () => prop("dir"),
              isDisabled: () => prop("disabled"),
              onDragStart: (event) => {
                const container = getPanelEl(scope)?.parentElement?.getBoundingClientRect();
                const containerSize =
                  container === undefined
                    ? 0
                    : prop("orientation") === "horizontal"
                      ? container.width
                      : container.height;
                send({ type: "HANDLE.DRAG_START", containerSize });
                send({ type: "HANDLE.DRAG", position: event.position });
              },
              onDrag: (event) => send({ type: "HANDLE.DRAG", position: event.position }),
              onDragEnd: (event) => send({ type: "HANDLE.DRAG_END", position: event.position }),
              onDragCancel: () => send({ type: "HANDLE.DRAG_CANCEL" }),
            }),
            addDomEvent(handle, "dblclick", () => send({ type: "HANDLE.RESET" })),
          ];
          return () => {
            for (const stop of stops.reverse()) stop();
          };
        };

        // The handle can be remounted after the start — moved before or after the
        // panel's content by a `panelSide` changed at runtime — and a listener on
        // the node it replaced would hear nothing. Watched from the panel's parent,
        // which holds the panel and therefore the handle.
        let handle: HTMLElement | null = null;
        let unbind: VoidFunction | null = null;
        const sync = (): void => {
          const next = getHandleEl(scope);
          if (next === handle) return;
          unbind?.();
          handle = next;
          unbind = next === null ? null : bind(next);
        };
        sync();

        const disposers = [
          observeChildren(
            getPanelEl(scope)?.parentElement ?? getHandleEl(scope)?.parentElement,
            sync,
          ),
          addDomEvent(
            scope.getWin(),
            "keydown",
            (event: KeyboardEvent) => {
              if (event.key !== "Escape" || !context.get("dragging")) return;
              event.preventDefault();
              event.stopPropagation();
              send({ type: "HANDLE.DRAG_CANCEL" });
            },
            { capture: true },
          ),
        ];

        return () => {
          for (const dispose of disposers.reverse()) dispose();
          unbind?.();
          unbind = null;
        };
      },

      captureSelectIntent({ prop, send }) {
        const host = prop("intents");
        if (host === null) return;
        return host.pushScope((event) => {
          if (event.intent !== "select" || event.source === "keyboard") return false;
          if (prop("disabled")) return false;
          send({ type: "HANDLE.ENGAGE" });
          return true;
        });
      },

      captureEngageIntents({ prop, send }) {
        const host = prop("intents");
        if (host === null) return;
        return pushEngageScope(host, {
          onAdjust: (intent) => send({ type: "HANDLE.ADJUST", intent }),
          onRelease: (committed) => send({ type: "HANDLE.RELEASE", committed }),
        });
      },
    },
  },
});
