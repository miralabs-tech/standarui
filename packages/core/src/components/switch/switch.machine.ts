/**
 * The same hidden-input skeleton as the checkbox — the browser owns form
 * association, the label click and the keyboard — plus the one gesture that makes
 * a switch feel like iOS: dragging the thumb across the track.
 *
 * The drag is written here rather than through the `press` primitive because
 * `press` deliberately reports crossings, not positions, and a switch needs the
 * position: the thumb follows the finger, and the release commits to whichever
 * side of the halfway mark it ended on. A drag that never moved is a tap, and a
 * tap must fall through to the native label click rather than toggle twice.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { addDomEvent, isPrimaryPointer } from "../../dom/event";
import { resolveDir } from "../../dom/text-dir";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { Direction, InputModality } from "../../types";
import { getControlEl } from "./switch.dom";
import type { SwitchSchema } from "./switch.types";

/** How far the finger has to travel before this stops being a tap. */
const DRAG_THRESHOLD_PX = 4;

export const machine: Machine<SwitchSchema> = createMachine<SwitchSchema>({
  props({ props }) {
    return {
      disabled: false,
      invalid: false,
      required: false,
      readOnly: false,
      draggable: true,
      value: "on",
      size: "md",
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      checked: bindable<boolean>(() => ({
        defaultValue: prop("defaultChecked") ?? false,
        value: prop("checked"),
        onChange: (checked) => prop("onCheckedChange")?.({ checked }),
        debugLabel: "switch checked",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      dragProgress: bindable<number | null>(() => ({ defaultValue: null })),
      pressed: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackThumbDrag"],

  on: {
    "CHECKED.TOGGLE": { guard: "isInteractive", actions: ["toggleChecked"] },
    "CHECKED.SET": { guard: "isInteractive", actions: ["setChecked"] },
    "THUMB.DRAG_START": { guard: "isInteractive", actions: ["startDrag"] },
    "THUMB.DRAG": { guard: "isInteractive", actions: ["trackDrag"] },
    "THUMB.DRAG_END": { actions: ["endDrag"] },
    "ROOT.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource"],
      on: { "ROOT.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      toggleChecked({ context }) {
        context.set("checked", (checked) => !checked);
      },
      setChecked({ context, event }) {
        if (event.type === "CHECKED.SET") context.set("checked", event.checked);
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
      startDrag({ context }) {
        context.set("pressed", true);
      },
      trackDrag({ context, event }) {
        if (event.type !== "THUMB.DRAG") return;
        context.set("dragProgress", event.progress);
      },
      endDrag({ context, event, prop }) {
        if (event.type !== "THUMB.DRAG_END") return;
        context.set("pressed", false);
        context.set("dragProgress", null);
        // A tap is left to the browser: the label forwards it to the input, which
        // toggles and reports. Handling it here as well would toggle twice.
        if (!event.moved || prop("disabled") || prop("readOnly")) return;
        context.set("checked", event.progress >= 0.5);
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackThumbDrag({ scope, prop, send, context }) {
        const control = getControlEl(scope);
        if (control === null || !prop("draggable")) return;

        let pointerId: number | null = null;
        let startX = 0;
        let moved = false;

        // Resolved once per gesture rather than per frame, the slider's
        // arrangement: `getComputedStyle` on every `pointermove` is a style
        // recalc the drag does not need, and a direction cannot change under a
        // finger that is already down.
        let dragDir: Direction = "ltr";

        const progressAt = (clientX: number): number => {
          const rect = control.getBoundingClientRect();
          if (rect.width === 0) return context.get("checked") ? 1 : 0;
          const ratio = (clientX - rect.left) / rect.width;
          // The track is read in writing order, so the whole gesture mirrors in
          // RTL — where "on" is on the left. Resolved from the node and not from
          // `prop("dir")`: the sheet mirrors the thumb on `:dir(rtl)`, which
          // matches an INHERITED direction, so reading the prop alone drew the
          // thumb one way and committed the value the other.
          const oriented = dragDir === "rtl" ? 1 - ratio : ratio;
          return Math.min(Math.max(oriented, 0), 1);
        };

        const disposers = [
          addDomEvent(control, "pointerdown", (event: PointerEvent) => {
            if (pointerId !== null || !isPrimaryPointer(event)) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            moved = false;
            dragDir = resolveDir(prop("dir"), control);
            try {
              control.setPointerCapture(event.pointerId);
            } catch {
              // A pointer that is already gone still deserves the rest of the
              // sequence; capture is an optimisation, not a precondition.
            }
            send({ type: "THUMB.DRAG_START" });
          }),

          addDomEvent(control, "pointermove", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            if (!moved && Math.abs(event.clientX - startX) < DRAG_THRESHOLD_PX) return;
            moved = true;
            // Only once it is a drag: preventing earlier would eat the tap, and
            // with it the label's click.
            event.preventDefault();
            send({ type: "THUMB.DRAG", progress: progressAt(event.clientX) });
          }),

          addDomEvent(control, "pointerup", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            send({ type: "THUMB.DRAG_END", progress: progressAt(event.clientX), moved });
          }),

          addDomEvent(control, "pointercancel", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            send({
              type: "THUMB.DRAG_END",
              progress: context.get("checked") ? 1 : 0,
              moved: false,
            });
          }),

          // A drag that ends on the thumb still produces a click on the label.
          // Swallowing it is what keeps the gesture from being undone by the tap
          // the browser reports underneath it.
          addDomEvent(
            control,
            "click",
            (event: MouseEvent) => {
              if (moved) event.preventDefault();
            },
            { capture: true },
          ),
        ];

        return () => {
          for (const dispose of disposers.reverse()) dispose();
        };
      },
    },
  },
});
