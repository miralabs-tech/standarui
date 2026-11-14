/**
 * Three states, and each one earns its place.
 *
 * `engaged` is a state because it **owns an effect to unmount** — the intent scope
 * a gamepad's A button pushes (CDC §4.4). The drag is not a state: it has no
 * effect of its own, the pointer listeners are installed once at machine level
 * with pointer capture, and `activeIndex` in the context is enough to describe it.
 * Making the drag a state would also cost the focus: a thumb is dragged *and*
 * focused at the same time, and a flat machine cannot hold both.
 *
 * **The events carry a percentage, never a coordinate.** The pointer effect holds
 * the element, so it does the conversion; the machine stays DOM-free and every
 * transition is reachable from a node test. The switch already sends `progress`
 * rather than a `clientX` for the same reason.
 *
 * The effect order is a contract. `trackModality` first, because the handle has to
 * be held before the first Tab and its teardown must come last. `trackPointer`
 * last, so its own teardown — releasing the capture, dropping the click swallower
 * — runs before the modality refcount falls.
 */

import { focusElement, getInputModality, pushEngageScope, trackInputModality } from "@standarx/nav";
import { addDomEvent, isPrimaryPointer } from "../../dom/event";
import { observeChildren } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { createMachine } from "../../machine/create-machine";
import type { Machine, PropAccessor, Transition } from "../../machine/types";
import type { Direction, InputModality } from "../../types";
import { isDev } from "../../utils/env";
import { arrayEquals } from "../../utils/equality";
import { warn } from "../../utils/invariant";
import {
  fromPercent,
  getPercentFromPoint,
  normalizeValues,
  resolveLargeStep,
  resolveMarks,
  setValueAtIndex,
  toPercent,
  toValueArray,
} from "../../utils/range";
import { getControlEl, getRootEl, getThumbEl, hasPart } from "./slider.dom";
import { resolveDirection, toAdjustEvent } from "./slider.props";
import type { SliderRange, SliderSchema } from "./slider.types";

/** How far the pointer has to travel before the click it leaves behind is eaten. */
const DRAG_THRESHOLD_PX = 4;

type Prop = PropAccessor<SliderSchema>;

function rangeOf(prop: Prop): SliderRange {
  return {
    min: prop("min"),
    max: prop("max"),
    step: prop("step"),
    minStepsBetweenThumbs: prop("minStepsBetweenThumbs"),
  };
}

/** The thumb a press belongs to — the nearest one, and 0 whenever there is one. */
function closestIndex(values: readonly number[], percent: number, prop: Prop): number {
  let best = 0;
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index++) {
    const distance = Math.abs(toPercent(values[index] ?? 0, prop("min"), prop("max")) - percent);
    if (distance < closest) {
      closest = distance;
      best = index;
    }
  }
  return best;
}

function hasAccessibleName(node: HTMLElement | null): boolean {
  // Absent is not nameless: nothing is rendered yet, and warning then would fire
  // on every server-rendered tree before its first paint.
  return (
    node === null ||
    node.hasAttribute("aria-label") ||
    node.hasAttribute("aria-labelledby") ||
    node.hasAttribute("title")
  );
}

/** One transition object, referenced by all four value events. */
const ADJUST: Transition<SliderSchema> = {
  guard: "isInteractive",
  actions: ["adjustValue", "invokeChangeEnd"],
};

/**
 * The same four events while a pad holds the thumb. Outside a hold every
 * adjustment *is* the whole gesture and commits on the spot; inside one the hold
 * is the gesture, and `THUMB.RELEASE` is its only end — so A, →, →, B has to
 * report once, not three times.
 */
const ADJUST_HELD: Transition<SliderSchema> = {
  guard: "isInteractive",
  actions: ["adjustValue"],
};

export const machine: Machine<SliderSchema> = createMachine<SliderSchema>({
  props({ props }) {
    const min = props.min ?? 0;
    const requestedMax = props.max ?? 100;
    warn(isDev() && requestedMax < min, `slider max ${requestedMax} is below min ${min}`);
    const max = Math.max(min, requestedMax);
    const requestedStep = props.step ?? 1;
    warn(isDev() && !(requestedStep > 0), `slider step must be positive, got ${requestedStep}`);
    const step = requestedStep > 0 ? requestedStep : 1;

    return {
      orientation: "horizontal",
      minStepsBetweenThumbs: 0,
      thumbAlignment: "contain",
      disabled: false,
      readOnly: false,
      invalid: false,
      required: false,
      // Pinned rather than read from the environment, for the same reason
      // `progress` pins it: a locale resolved from the browser makes the server
      // and the client format the same number differently, and hydration says so.
      locale: "en-US",
      formatOptions: {},
      intents: null,
      ...props,
      min,
      max,
      step,
      largeStep: resolveLargeStep(props.largeStep, min, max, step),
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<number[]>(() => ({
        defaultValue: normalizeValues(
          toValueArray(prop("defaultValue"), prop("min")),
          rangeOf(prop),
        ),
        // Passed through rather than re-normalised on every read: a controlled
        // value belongs to the consumer, and `percent` clamps what it paints.
        value: prop("value") === undefined ? undefined : toValueArray(prop("value"), prop("min")),
        // Without this every write of a fresh array — which is every write — would
        // report a change and re-render, forever.
        isEqual: arrayEquals,
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "slider value",
      })),
      focusedIndex: bindable<number>(() => ({ defaultValue: -1 })),
      activeIndex: bindable<number>(() => ({ defaultValue: -1 })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    percent: ({ context, prop }) =>
      context.get("value").map((value) => toPercent(value, prop("min"), prop("max"))),
    valueAsText({ context, prop }) {
      const getValueText = prop("getValueText");
      if (getValueText !== undefined) {
        return context.get("value").map((value, index) => getValueText({ value, index }));
      }
      const formatter = new Intl.NumberFormat(prop("locale"), prop("formatOptions"));
      return context.get("value").map((value) => formatter.format(value));
    },
    markValues: ({ prop }) => resolveMarks(prop("marks"), prop("min"), prop("max"), prop("step")),
  },

  refs() {
    return { thumbSize: null, entryValue: null };
  },

  // Pure: no DOM, no environment. The server renders what the client hydrates.
  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackParts", "trackPointer"],

  watch({ scope, track, action }) {
    // A dependency like any other, so an adapter that renders the label into
    // existence is in step immediately rather than one mutation record later.
    track(
      () => [hasPart(scope, "label")],
      () => action(["syncParts"]),
    );
  },

  on: {
    "VALUE.SET": { guard: "isInteractive", actions: ["setValue"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
    "THUMB.FOCUS": { target: "focused", actions: ["setFocusedIndex", "captureFocusSource"] },
    "THUMB.BLUR": { target: "idle", actions: ["clearFocusSource"] },
    // `focusThumb` comes last, and it has to. Moving the focus fires a `focus`
    // event synchronously, the thumb's own handler answers it with `THUMB.FOCUS`,
    // and that re-entrant delivery replaces the event the actions still to run
    // were reading — so a press ordered focus-first writes no value at all.
    "CONTROL.PRESS": {
      guard: "isInteractive",
      actions: ["setFocusedIndex", "startDrag", "setValueFromPercent", "focusThumb"],
    },
    "THUMB.DRAG": { guard: "isDragging", actions: ["setValueFromPercent"] },
    // No `isInteractive` guard on purpose: a control that goes disabled halfway
    // through a gesture still has to finish it cleanly.
    "THUMB.DRAG_END": { actions: ["endDrag", "invokeChangeEnd"] },
    "THUMB.INCREMENT": ADJUST,
    "THUMB.DECREMENT": ADJUST,
    "THUMB.SET_MIN": ADJUST,
    "THUMB.SET_MAX": ADJUST,
  },

  states: {
    idle: {},

    focused: {
      effects: ["captureSelectIntent"],
      on: {
        "THUMB.ENGAGE": { guard: "canEngage", target: "engaged", actions: ["setFocusedIndex"] },
      },
    },

    /**
     * The snapshot is taken on entry and read on the way out. It is deliberately
     * *not* cleared on exit: the interpreter runs a state's exit actions before
     * the transition's own, so an exit that cleared it would erase the value B is
     * there to restore. Entry overwrites it, which is the same guarantee one step
     * later.
     */
    engaged: {
      entry: ["snapshotValue"],
      effects: ["captureEngageIntents"],
      on: {
        "THUMB.RELEASE": [
          {
            guard: ({ event }) => event.type === "THUMB.RELEASE" && event.committed,
            target: "focused",
            actions: ["clearSnapshot", "invokeChangeEnd"],
          },
          { target: "focused", actions: ["restoreValue", "invokeChangeEnd"] },
        ],
        // Carrying no target, these stay in `engaged` without re-entering it —
        // `snapshotValue` keeps the value the hold started on.
        "THUMB.INCREMENT": ADJUST_HELD,
        "THUMB.DECREMENT": ADJUST_HELD,
        "THUMB.SET_MIN": ADJUST_HELD,
        "THUMB.SET_MAX": ADJUST_HELD,
      },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
      isDragging: ({ context }) => context.get("activeIndex") >= 0,
      canEngage: ({ prop }) => !prop("disabled") && !prop("readOnly") && prop("intents") !== null,
    },

    actions: {
      setValue({ context, prop, event }) {
        if (event.type !== "VALUE.SET") return;
        context.set("value", normalizeValues(event.value, rangeOf(prop)));
      },

      setValueFromPercent({ context, prop, event }) {
        if (event.type !== "CONTROL.PRESS" && event.type !== "THUMB.DRAG") return;
        const index = context.get("activeIndex");
        if (index < 0) return;
        const range = rangeOf(prop);
        const next = fromPercent(event.percent, range.min, range.max);
        context.set("value", setValueAtIndex(context.get("value"), index, next, range));
      },

      /**
       * All four value events land here. Out of range the write is a no-op, and
       * `isEqual` on the bindable means no `onValueChange` is reported either —
       * an arrow key held at the maximum stays silent.
       */
      adjustValue({ context, prop, event }) {
        if (!("index" in event)) return;
        const values = context.get("value");
        const current = values[event.index];
        if (current === undefined) return;
        const range = rangeOf(prop);
        const stride = "large" in event && event.large ? prop("largeStep") : range.step;
        const next =
          event.type === "THUMB.SET_MIN"
            ? range.min
            : event.type === "THUMB.SET_MAX"
              ? range.max
              : current + (event.type === "THUMB.DECREMENT" ? -stride : stride);
        context.set("value", setValueAtIndex(values, event.index, next, range));
      },

      startDrag({ context, event }) {
        if (event.type === "CONTROL.PRESS") context.set("activeIndex", event.index);
      },

      endDrag({ context }) {
        context.set("activeIndex", -1);
      },

      setFocusedIndex({ context, event }) {
        if ("index" in event) context.set("focusedIndex", event.index);
      },

      // APG: pressing anywhere on the track moves the value *and* the focus, so
      // the arrow keys carry on from where the pointer left off.
      focusThumb({ scope, event }) {
        if (event.type === "CONTROL.PRESS") focusElement(getThumbEl(scope, event.index));
      },

      // Read once, when focus lands, and held: the modality of `now` flips to
      // pointer after 300 ms of mouse movement whether or not the focus moved,
      // and a ring that blinks out under the user's hands was the result.
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      snapshotValue({ context, refs }) {
        refs.set("entryValue", [...context.get("value")]);
      },

      restoreValue({ context, refs }) {
        const entry = refs.get("entryValue");
        refs.set("entryValue", null);
        if (entry !== null) context.set("value", entry);
      },

      clearSnapshot({ refs }) {
        refs.set("entryValue", null);
      },

      invokeChangeEnd({ context, prop }) {
        prop("onValueChangeEnd")?.({ value: context.get("value") });
      },

      syncParts({ context, scope }) {
        context.set("hasLabel", hasPart(scope, "label"));
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        // `role="slider"` demands an accessible name and the library cannot supply
        // one: with no label part rendered, only the consumer can. Same warning
        // shape as the dialog's nameless close trigger.
        //
        // Deferred a task, and it has to be: a slider inside a `field` is named by
        // the *field's* label, which reaches the thumb only once the field's own
        // observer has run — and effects run child before parent, so that is
        // strictly after this one. Warning from here would cry wolf on the very
        // composition the wiring exists to make correct.
        const timer = scope.getWin().setTimeout(() => {
          warn(
            isDev() && !hasPart(scope, "label") && !hasAccessibleName(getThumbEl(scope, 0)),
            "a slider has no accessible name — render its label part, or give the thumb an `aria-label`",
          );
        });
        const stop = observeChildren(getRootEl(scope), () => send({ type: "PARTS.SYNC" }));
        return () => {
          scope.getWin().clearTimeout(timer);
          stop();
        };
      },

      trackPointer({ scope, prop, refs, context, send }) {
        const control = getControlEl(scope);
        if (control === null) return;

        let pointerId: number | null = null;
        let moved = false;
        let startX = 0;
        let startY = 0;
        // Resolved once per gesture, unlike the rect. Without a `dir` prop the
        // answer comes from `getComputedStyle`, which forces a style recalc — and
        // a pointermove fires per frame, while the writing direction of a track
        // under the finger does not change mid-drag.
        let dragDir: Direction = "ltr";

        // The rect, by contrast, is read on every move rather than cached at
        // pointerdown: a scroll under the finger would invalidate a cached one and
        // the thumb would drift.
        const percentAt = (event: PointerEvent): number =>
          getPercentFromPoint(event.clientX, event.clientY, {
            rect: control.getBoundingClientRect(),
            orientation: prop("orientation"),
            dir: dragDir,
            thumbSize: refs.get("thumbSize") ?? 0,
          });

        const disposers = [
          addDomEvent(control, "pointerdown", (event: PointerEvent) => {
            if (pointerId !== null || !isPrimaryPointer(event)) return;
            if (prop("disabled") || prop("readOnly")) return;
            pointerId = event.pointerId;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            dragDir = resolveDir(prop("dir"), control);
            // Measured once per gesture: under `contain` the centre of the thumb
            // travels a track shortened by one thumb, and the element is the only
            // place that width exists — the CSS owns it.
            const thumb = prop("thumbAlignment") === "center" ? null : getThumbEl(scope, 0);
            const box = thumb?.getBoundingClientRect();
            refs.set(
              "thumbSize",
              box === undefined ? 0 : prop("orientation") === "vertical" ? box.height : box.width,
            );
            const percent = percentAt(event);
            try {
              control.setPointerCapture(event.pointerId);
            } catch {
              // A pointer that is already gone still deserves the rest of the
              // sequence; capture is an optimisation, not a precondition.
            }
            // No text selection, no native image drag, no focus stolen by the
            // browser — `focusThumb` places it deliberately instead.
            event.preventDefault();
            send({
              type: "CONTROL.PRESS",
              percent,
              index: closestIndex(context.get("value"), percent, prop),
            });
          }),

          addDomEvent(control, "pointermove", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            // The threshold gates the *click swallow*, never the value: a careful
            // two-pixel adjustment has to land.
            if (
              Math.abs(event.clientX - startX) >= DRAG_THRESHOLD_PX ||
              Math.abs(event.clientY - startY) >= DRAG_THRESHOLD_PX
            ) {
              moved = true;
            }
            send({ type: "THUMB.DRAG", percent: percentAt(event) });
          }),

          addDomEvent(control, "pointerup", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            // Browsers do not guarantee a final pointermove at the release point.
            send({ type: "THUMB.DRAG", percent: percentAt(event) });
            send({ type: "THUMB.DRAG_END", moved });
          }),

          addDomEvent(control, "pointercancel", (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            send({ type: "THUMB.DRAG_END", moved });
          }),

          // A drag that ends on the track still produces a click. Swallowing it is
          // what keeps a consumer's own handler from acting on a gesture that was
          // never a click (precedent: switch).
          addDomEvent(
            control,
            "click",
            (event: MouseEvent) => {
              if (!moved) return;
              event.preventDefault();
              event.stopPropagation();
            },
            { capture: true },
          ),
        ];

        return () => {
          if (pointerId !== null) {
            try {
              control.releasePointerCapture(pointerId);
            } catch {
              // Already released by the browser — nothing left to hand back.
            }
          }
          for (const dispose of disposers.reverse()) dispose();
        };
      },

      /**
       * A is how a pad takes hold, and this is where it is claimed — while a thumb
       * is focused and nowhere else, so the scope is on the stack for exactly as
       * long as the grab is possible.
       *
       * Never from a keyboard. Enter on a slider belongs to the form around it,
       * the arrows already move the value without holding anything, and a keyboard
       * engage would hand Escape the power to rewind a value the user had settled
       * on. Read-only and disabled let the intent fall through untouched rather
       * than swallowing it into a state that would refuse it anyway.
       */
      captureSelectIntent({ prop, context, send }) {
        const host = prop("intents");
        if (host === null) return;
        return host.pushScope((event) => {
          if (event.intent !== "select" || event.source === "keyboard") return false;
          if (prop("disabled") || prop("readOnly")) return false;
          const index = context.get("focusedIndex");
          if (index < 0) return false;
          send({ type: "THUMB.ENGAGE", index });
          return true;
        });
      },

      /**
       * The gamepad's hold on the value. `pushEngageScope` consumes `back`, so B
       * restores the entry value instead of popping the layer underneath — a
       * slider inside a popover must not close the popover on the way out.
       *
       * The dispose it returns detaches silently: unmounting is not the user
       * letting go, so `onRelease` does not fire on teardown.
       */
      captureEngageIntents({ prop, context, scope, send }) {
        const host = prop("intents");
        if (host === null) return;
        return pushEngageScope(host, {
          onAdjust: (intent) => {
            const index = context.get("focusedIndex");
            if (index < 0) return;
            const dir = resolveDir(prop("dir"), getControlEl(scope));
            send(toAdjustEvent(resolveDirection(intent, dir, prop("orientation")), index));
          },
          onRelease: (committed) => send({ type: "THUMB.RELEASE", committed }),
        });
      },
    },
  },
});
