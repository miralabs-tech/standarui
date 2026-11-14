/**
 * The drawn bar of a strip that scrolls along its line (`toggle-group`, `tabs`):
 * a part outside the scroller, a thumb inside it, kept in step with the scroll.
 *
 * **Written straight onto the nodes, never through a machine.** The thumb moves on
 * every scroll frame, and a bindable would make each of them a transition, a notify
 * and an adapter render for a fact nothing reads back; the sheet draws from the two
 * custom properties and from `data-state`, the same trade `trackScrollEdges` makes.
 * `scroll-area` keeps its own machine because its viewport and content ids are its
 * own and its bars have hover, linger and page states a strip does not need.
 *
 * **Shown by the scroller's own `data-scroll-inline`**, which already leaves out the
 * vertical orientation and a disabled strip: the one fact that says there is
 * somewhere to go is read once and not recomputed here.
 */

import { addDomEvent } from "../dom/event";
import { observeAttributes, observeChildren, observeResize } from "../dom/observers";
import { getComputedDir } from "../dom/text-dir";
import { trackDragAxis } from "./drag-axis";
import { turnWheelInline } from "./scroll-edges";
import {
  type AxisMetrics,
  dragOffset,
  thumbLength,
  thumbPosition,
  trackLength,
} from "./scroll-thumb";

const NOOP: VoidFunction = () => {};

const LENGTH = "--sui-scroll-thumb-length";

const OFFSET = "--sui-scroll-thumb-offset";

export function trackInlineScrollbar(
  scroller: HTMLElement | null | undefined,
  bar: HTMLElement | null | undefined,
  thumb: HTMLElement | null | undefined,
): VoidFunction {
  if (scroller == null || bar == null || thumb == null) return NOOP;
  const win = scroller.ownerDocument.defaultView;
  if (win === null) return NOOP;

  const metrics = (): AxisMetrics => ({
    viewport: scroller.clientWidth,
    content: scroller.scrollWidth,
    offset: Math.abs(scroller.scrollLeft),
  });
  const track = (): number => trackLength(bar.clientWidth, false);

  let length = "";
  let offset = "";
  const sync = (): void => {
    const visible = scroller.hasAttribute("data-scroll-inline");
    const state = visible ? "visible" : "hidden";
    if (bar.getAttribute("data-state") !== state) bar.setAttribute("data-state", state);
    if (!visible) return;
    const read = metrics();
    const room = track();
    const nextLength = `${thumbLength(read, room)}px`;
    const nextOffset = `${thumbPosition(read, room)}px`;
    if (nextLength !== length) {
      length = nextLength;
      thumb.style.setProperty(LENGTH, length);
    }
    if (nextOffset !== offset) {
      offset = nextOffset;
      thumb.style.setProperty(OFFSET, offset);
    }
  };

  let frame = 0;
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  const halt = (): void => scroller.scrollBy({ left: 0, behavior: "smooth" });

  let rtl = false;
  let start = 0;
  const write = (position: number): void => {
    scroller.scrollLeft = (rtl ? -1 : 1) * dragOffset(start, position, metrics(), track());
  };

  sync();

  const disposers = [
    addDomEvent(scroller, "scroll", schedule, { passive: true }),
    observeResize(scroller, sync),
    observeResize(bar, sync),
    observeChildren(scroller, sync),
    observeAttributes(scroller, ["data-scroll-inline"], sync),
    addDomEvent(thumb, "pointerdown", (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") event.preventDefault();
      halt();
    }),
    addDomEvent(thumb, "wheel", (event) => turnWheelInline(scroller, event), { passive: false }),
    trackDragAxis(thumb, {
      axis: "inline",
      onDragStart: (event) => {
        halt();
        rtl = getComputedDir(scroller) === "rtl";
        start = Math.abs(scroller.scrollLeft);
        bar.setAttribute("data-dragging", "");
        write(event.position);
      },
      onDrag: (event) => write(event.position),
      onDragEnd: (event) => {
        write(event.position);
        bar.removeAttribute("data-dragging");
      },
      onDragCancel: () => {
        scroller.scrollLeft = (rtl ? -1 : 1) * start;
        bar.removeAttribute("data-dragging");
      },
    }),
  ];

  return () => {
    if (frame !== 0) win.cancelAnimationFrame(frame);
    frame = 0;
    bar.removeAttribute("data-dragging");
    for (const dispose of disposers.reverse()) dispose();
  };
}
