/**
 * The gesture half of the machine's effects, in a module of its own.
 *
 * Not a second component and not a barrel — the folder's own `index.ts` is still
 * the only one. The picker carries two pointer paths and no other component has
 * needed even one that is two-dimensional; keeping them beside the state grammar
 * made a machine nobody could read in one pass.
 *
 * **Both send a ratio, never a coordinate** (the slider's rule): these functions
 * hold the elements, so they do the conversion, and every transition the machine
 * declares stays reachable from a node test. The area sends two ratios, one per
 * axis; a channel sends one.
 */

import { addDomEvent, isPrimaryPointer } from "../../dom/event";
import { getEventTarget, isHTMLElement } from "../../dom/query";
import { resolveDir } from "../../dom/text-dir";
import type { EffectCleanup, MachineParams } from "../../machine/types";
import type { Direction } from "../../types";
import type { ColorNumericChannel } from "../../utils/color";
import { getPercentFromPoint } from "../../utils/range";
import {
  CHANNEL_SLIDER_SELECTOR,
  getAreaEl,
  getChannelThumbEl,
  getSurfaceEl,
} from "./color-picker.dom";
import type { ColorPickerSchema } from "./color-picker.types";

type Params = MachineParams<ColorPickerSchema>;

/** How far the pointer has to travel before the click it leaves behind is eaten. */
const DRAG_THRESHOLD_PX = 4;

export function trackAreaPointer({ prop, scope, send }: Params): EffectCleanup {
  const area = getAreaEl(scope);
  if (area === null) return;

  let pointerId: number | null = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  // Resolved once per gesture: without a `dir` prop the answer comes from
  // `getComputedStyle`, which forces a style recalc, and a pointermove fires
  // once a frame while the writing direction never changes mid-drag.
  let dragDir: Direction = "ltr";

  // The thumb is centred on the value and overhangs the box at every edge,
  // so its own size takes nothing off the travel — `thumbSize: 0` on both
  // axes, which is `thumbAlignment: "center"` in the slider's vocabulary.
  const pointAt = (event: PointerEvent): { x: number; y: number } => {
    const rect = area.getBoundingClientRect();
    return {
      x: getPercentFromPoint(event.clientX, event.clientY, {
        rect,
        orientation: "horizontal",
        dir: dragDir,
        thumbSize: 0,
      }),
      y: getPercentFromPoint(event.clientX, event.clientY, {
        rect,
        orientation: "vertical",
        dir: dragDir,
        thumbSize: 0,
      }),
    };
  };

  const disposers = [
    addDomEvent(area, "pointerdown", (event: PointerEvent) => {
      if (pointerId !== null || !isPrimaryPointer(event)) return;
      if (prop("disabled") || prop("readOnly")) return;
      pointerId = event.pointerId;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      dragDir = resolveDir(prop("dir"), area);
      const point = pointAt(event);
      try {
        area.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that is already gone still deserves the rest of the
        // sequence; capture is an optimisation, not a precondition.
      }
      // No text selection, no native image drag, no focus stolen by the
      // browser — `focusAreaInput` places it deliberately instead.
      event.preventDefault();
      send({ type: "AREA.PRESS", x: point.x, y: point.y });
    }),

    addDomEvent(area, "pointermove", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (
        Math.abs(event.clientX - startX) >= DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - startY) >= DRAG_THRESHOLD_PX
      ) {
        moved = true;
      }
      const point = pointAt(event);
      send({ type: "AREA.DRAG", x: point.x, y: point.y });
    }),

    addDomEvent(area, "pointerup", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      // Browsers do not guarantee a final pointermove at the release point.
      const point = pointAt(event);
      send({ type: "AREA.DRAG", x: point.x, y: point.y });
      send({ type: "AREA.DRAG_END", moved });
    }),

    addDomEvent(area, "pointercancel", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      send({ type: "AREA.DRAG_END", moved });
    }),

    // A drag that ends inside the area still produces a click. Swallowing it
    // is what keeps a consumer's own handler from acting on a gesture that
    // was never a click (precedent: switch, slider).
    addDomEvent(
      area,
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
        area.releasePointerCapture(pointerId);
      } catch {
        // Already released by the browser — nothing left to hand back.
      }
    }
    for (const dispose of disposers.reverse()) dispose();
  };
}

/**
 * One set of listeners for every channel, delegated on the surface: a
 * picker draws up to four tracks and installing four gesture handlers would
 * be four times the teardown for one pointer that can only be on one of them.
 */
export function trackChannelPointer({ prop, scope, send }: Params): EffectCleanup {
  const surface = getSurfaceEl(scope);
  if (surface === null) return;

  let pointerId: number | null = null;
  let slider: HTMLElement | null = null;
  // The track the last gesture was on, kept past `release` because the click
  // arrives after it — it is what bounds the swallower at the bottom of the list
  // to the one element the area's swallower is bound to by construction.
  let dragged: HTMLElement | null = null;
  let thumbSize = 0;
  let moved = false;
  let startX = 0;
  let dragDir: Direction = "ltr";

  const release = (): void => {
    if (pointerId !== null && slider !== null) {
      try {
        slider.releasePointerCapture(pointerId);
      } catch {
        // Already released by the browser — nothing left to hand back.
      }
    }
    pointerId = null;
    slider = null;
  };

  const percentAt = (event: PointerEvent): number => {
    if (slider === null) return 0;
    return getPercentFromPoint(event.clientX, event.clientY, {
      rect: slider.getBoundingClientRect(),
      orientation: "horizontal",
      dir: dragDir,
      thumbSize,
    });
  };

  const disposers = [
    addDomEvent(surface, "pointerdown", (event: PointerEvent) => {
      if (pointerId !== null || !isPrimaryPointer(event)) return;
      // Spent here, before the guards, and not where the gesture starts: the click
      // swallower at the bottom of this list is bound to the *whole surface*, so a
      // flag left standing by the last drag ate the first click on a swatch, on
      // Close or on the eyedropper (audit of 2026-09-05). A fresh primary
      // pointerdown is a new interaction whatever it lands on.
      moved = false;
      if (prop("disabled") || prop("readOnly")) return;
      const target = getEventTarget(event);
      if (!isHTMLElement(target)) return;
      const found = target.closest<HTMLElement>(CHANNEL_SLIDER_SELECTOR);
      const channel = (found?.getAttribute("data-channel") ?? null) as ColorNumericChannel | null;
      if (found === null || channel === null) return;

      pointerId = event.pointerId;
      slider = found;
      dragged = found;
      startX = event.clientX;
      dragDir = resolveDir(prop("dir"), found);
      // Measured once per gesture: the knob's centre travels a track
      // shortened by one knob, and the element is the only place that width
      // exists — the CSS owns it.
      thumbSize = getChannelThumbEl(scope, channel)?.getBoundingClientRect().width ?? 0;

      try {
        found.setPointerCapture(event.pointerId);
      } catch {
        // See the area's handler: capture is an optimisation.
      }
      event.preventDefault();
      send({ type: "CHANNEL.PRESS", channel, percent: percentAt(event) });
    }),

    addDomEvent(surface, "pointermove", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (Math.abs(event.clientX - startX) >= DRAG_THRESHOLD_PX) moved = true;
      send({ type: "CHANNEL.DRAG", percent: percentAt(event) });
    }),

    addDomEvent(surface, "pointerup", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      // Browsers do not guarantee a final pointermove at the release point.
      send({ type: "CHANNEL.DRAG", percent: percentAt(event) });
      release();
      send({ type: "CHANNEL.DRAG_END", moved });
    }),

    addDomEvent(surface, "pointercancel", (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      release();
      send({ type: "CHANNEL.DRAG_END", moved });
    }),

    // A drag that ends on the track still produces a click, and swallowing it is
    // what keeps a consumer's handler from acting on a gesture that was never a
    // click. Bound to the surface because the tracks are delegated (see above), so
    // it has to ask the question the area's handler gets for free: *this* track,
    // and not the swatch or the Close button the reader clicked next.
    addDomEvent(
      surface,
      "click",
      (event: MouseEvent) => {
        if (!moved || dragged === null) return;
        const target = getEventTarget(event);
        if (!isHTMLElement(target)) return;
        if (target.closest<HTMLElement>(CHANNEL_SLIDER_SELECTOR) !== dragged) return;
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true },
    ),
  ];

  return () => {
    release();
    for (const dispose of disposers.reverse()) dispose();
  };
}
