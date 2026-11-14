/**
 * A finger, a stylus or a mouse travelling along **one** axis, reported as a
 * signed offset in pixels and a signed velocity in px/ms.
 *
 * This is the half of a gesture that is *interaction*: capture, threshold,
 * sampling, the click a drag leaves behind. What a component does with the
 * release — settling to a resting position — is animation, and lives in
 * `@standarui/core/gesture` so a consumer that only pages a carousel never
 * downloads WAAPI (motion.md §3.3).
 *
 * **Not `press`.** That module's first rule is "never call `preventDefault` on a
 * pointer event", which is right for a press and wrong here: a drag has to stop
 * the text selection it would otherwise paint across the page. The two cannot be
 * one module, and a control uses one or the other.
 *
 * **Not the slider's pointer path either.** That one re-reads the track's rect on
 * every move and answers in percent, because a scroll under the finger would make
 * a cached rect drift. This one answers in signed pixels from where the gesture
 * started and reads no rect at all. Merging them would make an audited component
 * pay for a rewrite; the question is worth reopening when `carousel` and
 * `splitter` exist and there are three call sites to look at.
 */

import { addDomEvent, isPrimaryPointer } from "../dom/event";
import { resolveDir } from "../dom/text-dir";
import type { Direction } from "../types";

/** Which of the two logical axes the gesture runs along. */
export type DragAxis = "block" | "inline";

export interface DragAxisEvent {
  /** Signed pixels from where the gesture started, already mirrored for RTL. */
  readonly position: number;
  /** Signed px/ms over the recent window — `0` when the finger came to rest. */
  readonly velocity: number;
  readonly originalEvent: PointerEvent;
}

/**
 * While a press is armed, the browser's own drag of a link, an image or a selection inside the node is refused; an element marked `draggable="true"` keeps its drag-and-drop.
 */
export interface DragAxisOptions {
  /** A function is asked once per gesture, at `pointerdown`, for a value that can change. */
  readonly axis: DragAxis | (() => DragAxis);
  /**
   * Omit to read what the page resolved around the node (`resolveDir`). A
   * function is asked once per gesture, as `axis` is.
   */
  readonly dir?: Direction | (() => Direction | undefined) | undefined;
  /** Travel before the gesture is one, in px. Defaults to 4, as `color-picker`. */
  readonly threshold?: number | undefined;
  /**
   * Asked once, at `pointerdown`, before anything is armed. This is where a sheet
   * refuses a gesture that belongs to a scroller underneath it — the module has no
   * opinion about what makes a start legitimate, and every consumer's answer is
   * different.
   */
  readonly canStart?: ((event: PointerEvent) => boolean) | undefined;
  readonly isDisabled?: (() => boolean) | undefined;
  readonly onDragStart?: ((event: DragAxisEvent) => void) | undefined;
  readonly onDrag?: ((event: DragAxisEvent) => void) | undefined;
  readonly onDragEnd?: ((event: DragAxisEvent) => void) | undefined;
  readonly onDragCancel?: (() => void) | undefined;
}

interface Sample {
  readonly position: number;
  readonly time: number;
}

const NOOP: VoidFunction = () => {};

const DEFAULT_THRESHOLD_PX = 4;

/** Enough to average out one slow frame, short enough to stay recent. */
const SAMPLE_WINDOW = 5;

/**
 * A sample older than this is not evidence about where the finger is *going*.
 *
 * Without the cutoff a finger that flicks, holds still for half a second and then
 * lifts releases with the velocity of the flick, because holding still fires no
 * `pointermove` and the window keeps describing a movement that has stopped. The
 * sheet would then fly off under a finger that had visibly parked it.
 */
const STALE_SAMPLE_MS = 100;

export function trackDragAxis(
  node: HTMLElement | null | undefined,
  options: DragAxisOptions,
): VoidFunction {
  if (node === null || node === undefined) return NOOP;

  let pointerId: number | null = null;
  let started = false;
  let swallowClick = false;
  let origin = 0;
  // Resolved once per gesture rather than per move: without a `dir` prop the
  // answer comes from `getComputedStyle`, which forces a style recalc, and a
  // `pointermove` fires every frame while the writing direction does not change
  // under the finger. The same call the slider's pointer path makes.
  let sign = 1;
  let axis: DragAxis = "inline";
  let samples: Sample[] = [];

  const threshold = options.threshold ?? DEFAULT_THRESHOLD_PX;
  const disabled = (): boolean => options.isDisabled?.() ?? false;

  const coordinateOf = (event: PointerEvent): number =>
    axis === "block" ? event.clientY : event.clientX;

  const positionOf = (event: PointerEvent): number => (coordinateOf(event) - origin) * sign;

  const record = (position: number, time: number): void => {
    samples.push({ position, time });
    if (samples.length > SAMPLE_WINDOW) samples.shift();
  };

  const velocityAt = (time: number): number => {
    const last = samples.at(-1);
    if (last === undefined) return 0;
    const first = samples.find((sample) => time - sample.time <= STALE_SAMPLE_MS);
    if (first === undefined || last.time <= first.time) return 0;
    return (last.position - first.position) / (last.time - first.time);
  };

  const detail = (event: PointerEvent): DragAxisEvent => ({
    position: positionOf(event),
    velocity: velocityAt(event.timeStamp),
    originalEvent: event,
  });

  const releaseCapture = (): void => {
    if (pointerId === null) return;
    try {
      node.releasePointerCapture(pointerId);
    } catch {
      // Already handed back by the browser — nothing left to release.
    }
  };

  // The rest of an armed press is heard on the document, not on the node: the
  // capture waits for the threshold, and until then a move or a release only
  // reaches the node while the pointer is over it — a 24 px grabber loses the
  // move that crosses the threshold, and a release outside it would never come.
  let unlisten: VoidFunction = NOOP;

  const disarm = (): void => {
    unlisten();
    unlisten = NOOP;
    releaseCapture();
    pointerId = null;
    started = false;
  };

  const cancel = (): void => {
    const wasDragging = started;
    disarm();
    swallowClick = false;
    if (wasDragging) options.onDragCancel?.();
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    if (
      !started &&
      (event.pointerType === "mouse" || event.pointerType === "pen") &&
      event.buttons === 0
    ) {
      // A bare hover: the button came up where this document could not hear it —
      // Firefox delivers no release outside the frame. Only touch is guaranteed an
      // implicit capture; a mouse or a pen can lose its release.
      disarm();
      return;
    }
    const position = positionOf(event);
    record(position, event.timeStamp);
    if (!started) {
      if (Math.abs(position) < threshold) return;
      started = true;
      swallowClick = true;
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that is already gone still deserves the rest of the sequence;
        // capture is what keeps the finger attached, not a precondition.
      }
      options.onDragStart?.(detail(event));
      return;
    }
    // The one `preventDefault` this module makes, and only once the gesture is
    // real: it stops the selection a drag would otherwise paint across the page.
    // Scroll is not stopped here — that is `touch-action`, which belongs to the
    // sheet, because only CSS can refuse a scroll before the first move fires.
    event.preventDefault();
    options.onDrag?.(detail(event));
  };

  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    // Browsers do not guarantee a final `pointermove` at the release point, and
    // this sample is also what makes a parked finger read as stopped rather than
    // as whatever it was doing five frames ago.
    record(positionOf(event), event.timeStamp);
    const wasDragging = started;
    const end = detail(event);
    disarm();
    if (wasDragging) options.onDragEnd?.(end);
  };

  const onCancel = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    cancel();
  };

  const disposers = [
    addDomEvent(node, "pointerdown", (event: PointerEvent) => {
      // A mouse or a pen pressing while a press is armed proves its release was
      // lost — a focus switch, a touchpad tap with no move, a pen back with a new
      // id. A second touch is a second finger and waits its turn.
      if (pointerId !== null) {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        cancel();
      }
      if (disabled() || !isPrimaryPointer(event)) return;
      if (options.canStart?.(event) === false) return;
      pointerId = event.pointerId;
      started = false;
      swallowClick = false;
      axis = typeof options.axis === "function" ? options.axis() : options.axis;
      origin = coordinateOf(event);
      const dir = typeof options.dir === "function" ? options.dir() : options.dir;
      sign = axis === "inline" && resolveDir(dir, node) === "rtl" ? -1 : 1;
      samples = [{ position: 0, time: event.timeStamp }];
      const doc = node.ownerDocument;
      const off = [
        addDomEvent(doc, "pointermove", onMove, { capture: true }),
        addDomEvent(doc, "pointerup", onUp, { capture: true }),
        addDomEvent(doc, "pointercancel", onCancel, { capture: true }),
      ];
      unlisten = () => {
        for (const dispose of off) dispose();
      };
      // No capture and no `preventDefault` here, deliberately: nothing is a gesture
      // yet. A capture would retarget the `pointerup` to this node, and a click goes
      // to the common ancestor of where it went down and where it came up — so a
      // link or a button inside the dragged surface would never be activated.
    }),

    // A mouse that presses on a link, an image or a selection inside the surface
    // would otherwise start the browser's own drag-and-drop on its first move, and
    // the engine answers that with a `pointercancel` that ends this gesture. Only
    // refused while a press of ours is armed, and never for an element the page
    // made `draggable="true"` itself: that is a drag-and-drop someone asked for.
    addDomEvent(node, "dragstart", (event: DragEvent) => {
      if (pointerId === null) return;
      const target = event.target as Node | null;
      const element = target?.nodeType === 1 ? (target as Element) : target?.parentElement;
      const own = element?.closest('[draggable="true" i]');
      if (own !== null && own !== undefined && node.contains(own)) return;
      event.preventDefault();
    }),

    // A drag that ends over the surface still produces a click. Swallowing it is
    // what keeps a consumer's own handler from acting on a gesture that was never
    // a click (precedent: switch, slider, color-picker).
    addDomEvent(
      node,
      "click",
      (event: MouseEvent) => {
        if (!swallowClick) return;
        swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true },
    ),
  ];

  return () => {
    disarm();
    for (const dispose of disposers.reverse()) dispose();
  };
}
