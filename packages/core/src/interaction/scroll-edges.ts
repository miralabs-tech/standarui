/**
 * Which way a scroller can still go, published on the scroller itself as
 * `data-scroll="up" | "down" | "up down"` — absent when there is nothing to
 * reach in either direction.
 *
 * **Written by an effect straight onto the node, never through a bindable.** The
 * value changes on every scroll frame, and a bindable would make each of them a
 * transition, a notify and an adapter render — for a fact no state depends on.
 * Nothing in a machine ever reads it back; it exists so a sheet can draw the
 * affordance, which is the same trade the positioner already makes with
 * `--sui-transform-origin`. The inline variant does two more things, both for
 * the machine that installed it: it writes `tabindex="-1"` on a scroller that
 * scrolls, and it tells the caller when the box starts or stops being one.
 *
 * Three things move it and all three are watched, because two of them are not
 * scrolls at all: the surface being re-capped against a shrinking viewport
 * (`observeResize`) and rows being added or removed under a filter
 * (`observeChildren`) both change what is reachable without the scroll position
 * moving a pixel.
 */

import { addDomEvent } from "../dom/event";
import { observeAttributes, observeChildren, observeResize } from "../dom/observers";
import { getComputedDir } from "../dom/text-dir";
import { resolveEnvironment } from "../environment/environment";

export type ScrollEdges = "" | "up" | "down" | "up down";

/**
 * A pixel of slack on both reads. A fractional zoom, a subpixel row height or a
 * device pixel ratio that is not an integer all leave `scrollTop + clientHeight`
 * a fraction short of `scrollHeight` on a scroller that is, visibly, at its end —
 * and an affordance that says "there is more below" when there is not is worse
 * than none, because it never goes away.
 */
const EPSILON = 1;

export function readScrollEdges(el: Element): ScrollEdges {
  const up = el.scrollTop > EPSILON;
  const down = el.scrollTop + el.clientHeight < el.scrollHeight - EPSILON;
  if (up) return down ? "up down" : "up";
  return down ? "down" : "";
}

/**
 * Whether `el` still has somewhere to go in one logical direction on one axis.
 *
 * The question `readScrollEdges` answers is "what affordance do I draw", and its
 * vocabulary — `up`, `down`, published as `data-scroll` — is the answer to that
 * one. This is a different question: *does this gesture belong to the scroller or
 * to the surface around it*, asked once at `pointerdown` and never drawn. Widening
 * `ScrollEdges` to carry an inline pair would have changed what `data-scroll`
 * publishes for `menu`, which already ships, so the two stay apart.
 *
 * **Reads `scrollLeft` through `Math.abs`, which is what makes it direction-blind.**
 * Under the modern model an RTL scroller runs from `0` at the inline start down to
 * a negative number at the inline end, an LTR one from `0` up to a positive one:
 * the distance already travelled from the start is the magnitude either way, so no
 * `dir` has to be resolved and no writing direction can be got wrong.
 */
export function hasScrollRoom(
  el: Element,
  axis: "block" | "inline",
  towards: "start" | "end",
): boolean {
  const travelled = axis === "block" ? el.scrollTop : Math.abs(el.scrollLeft);
  if (towards === "start") return travelled > EPSILON;
  const visible = axis === "block" ? el.clientHeight : el.clientWidth;
  const total = axis === "block" ? el.scrollHeight : el.scrollWidth;
  return travelled + visible < total - EPSILON;
}

const NOOP: VoidFunction = () => {};

const writtenTabindex = new WeakSet<Element>();

function trackEdges<T extends string>(
  el: HTMLElement | null | undefined,
  attribute: string,
  read: (el: Element) => T,
  onChange?: (edges: T) => void,
  attributes: readonly string[] = [],
): VoidFunction {
  if (el === null || el === undefined) return NOOP;

  let last: T | null = null;
  const sync = (): void => {
    const edges = read(el);
    if (edges === last) return;
    last = edges;
    if (edges === "") el.removeAttribute(attribute);
    else el.setAttribute(attribute, edges);
    onChange?.(edges);
  };

  sync();
  const removeScroll = addDomEvent(el, "scroll", sync, { passive: true });
  const stopResize = observeResize(el, sync);
  const stopChildren = observeChildren(el, sync);
  const stopAttributes = attributes.length > 0 ? observeAttributes(el, attributes, sync) : NOOP;

  return () => {
    stopAttributes();
    stopChildren();
    stopResize();
    removeScroll();
  };
}

/**
 * Keeps `data-scroll` current on `el` until the returned disposer runs.
 *
 * **The disposer does not take the attribute back**, and that is deliberate: a
 * surface tears its effects down when it starts closing, while `presence` keeps
 * the node mounted for the exit. Removing it there would snap the affordance off
 * at the first frame of a fade the person is still watching. The install re-reads,
 * so a reopened surface never inherits a stale value.
 */
export function trackScrollEdges(el: HTMLElement | null | undefined): VoidFunction {
  return trackEdges(el, "data-scroll", readScrollEdges);
}

/**
 * Which way a scroller can still go along the inline axis, published as
 * `data-scroll-inline="start" | "end" | "start end"`. `start` means there is
 * content before the visible window in the writing direction, so the leading edge
 * is where the affordance belongs; the vocabulary is logical so a right-to-left
 * scroller needs no second reading. A separate attribute from `data-scroll`, for
 * the reason `hasScrollRoom` gives: `menu` already ships the vertical one.
 */
export type InlineScrollEdges = "" | "start" | "end" | "start end";

export function readInlineScrollEdges(el: Element): InlineScrollEdges {
  const start = hasScrollRoom(el, "inline", "start");
  const end = hasScrollRoom(el, "inline", "end");
  if (start) return end ? "start end" : "start";
  return end ? "end" : "";
}

/**
 * Keeps `data-scroll-inline` current on `el`, with the disposer semantics of
 * `trackScrollEdges`. **It also writes `tabindex="-1"` on `el` while the scroller
 * has somewhere to go**, and takes it back when it has not: Firefox makes every
 * scrollable box a tab stop of its own, in front of the roving stop the composite
 * already exposes, and arrows pressed there scroll instead of moving. The nodes
 * this module has written one on are remembered module-wide, so an install that
 * follows a disposer on the same node (a re-run effect, `StrictMode`) still knows
 * the attribute is its own to remove; an author's own `tabindex` is never touched.
 * `active` is asked on every read, for the scroller whose axis is not always the
 * inline one: while it answers `false` the attribute is absent, whatever the box
 * overflows by. `attributes` names attributes of `el` that, when they change,
 * make a read of their own — what `active` depends on, when nothing else
 * observable moves with it. `onToggle` runs after the box starts or stops being a
 * scroller, which is when the sheet changes its padding and every child moves
 * without resizing — the one change a caller that measures children cannot hear
 * from an observer. **While the box scrolls, a vertical wheel over it moves it
 * along its line** until it has no further to go (`turnWheelInline`); a box that
 * fits never takes the wheel from the page, and `wheel: false` never installs the
 * listener at all.
 */
export function trackInlineScrollEdges(
  el: HTMLElement | null | undefined,
  options: {
    active?: () => boolean;
    attributes?: readonly string[];
    onToggle?: () => void;
    wheel?: boolean;
  } = {},
): VoidFunction {
  if (el === null || el === undefined) return NOOP;

  const { active = () => true, attributes, onToggle, wheel = true } = options;
  let scrolls = false;
  let stopWheel = NOOP;
  const read = (node: Element): InlineScrollEdges => (active() ? readInlineScrollEdges(node) : "");
  const stopEdges = trackEdges(
    el,
    "data-scroll-inline",
    read,
    (edges) => {
      if (edges !== "" && !el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1");
        writtenTabindex.add(el);
      } else if (edges === "" && writtenTabindex.has(el)) {
        el.removeAttribute("tabindex");
        writtenTabindex.delete(el);
      }
      if ((edges !== "") !== scrolls) {
        scrolls = edges !== "";
        stopWheel();
        stopWheel =
          scrolls && wheel
            ? addDomEvent(el, "wheel", (event) => turnWheelInline(el, event), { passive: false })
            : NOOP;
        onToggle?.();
      }
    },
    attributes,
  );
  return () => {
    stopWheel();
    stopEdges();
  };
}

/** What one line of a wheel in `DOM_DELTA_LINE` is taken to be worth, in pixels. */
const WHEEL_LINE = 16;

/**
 * A vertical wheel over a strip that scrolls along its line moves the strip, and
 * only while it can still go that way: at its end, when the wheel is mostly
 * horizontal, or with Ctrl, Shift, Meta or Alt held (zoom, sideways, and the
 * gestures a platform or an app gives those), the event is left alone and the
 * page scrolls as it would anywhere else. Installed
 * only while the box is a scroller, which is the one time it is passive: false.
 * Down goes to the inline end, so to the left in a right-to-left strip. The
 * deltas are read before `deltaMode`: Firefox reports lines to a page that asks
 * for the mode first, and pixels otherwise. The drawn bar's thumb, which is outside
 * the scroller and takes the pointer, hands its wheel here too.
 */
export function turnWheelInline(el: HTMLElement, event: WheelEvent): void {
  const { altKey, ctrlKey, metaKey, shiftKey, deltaX, deltaY } = event;
  if (event.defaultPrevented || altKey || ctrlKey || metaKey || shiftKey) return;
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
  if (!hasScrollRoom(el, "inline", deltaY > 0 ? "end" : "start")) return;

  const unit = [1, WHEEL_LINE, el.clientWidth][event.deltaMode] ?? 1;
  event.preventDefault();
  el.scrollLeft += (getComputedDir(el) === "rtl" ? -deltaY : deltaY) * unit;
}

/**
 * Brings `target` into view along the inline axis of `scroller` and nowhere
 * else worth naming: the nearest edge, so nothing moves when it is already
 * visible, and `scroll-padding-inline` is respected, so the item stops past the
 * fade and not under it. A scroller with nothing to scroll is left alone, which
 * is what keeps a group that fits from moving the page. The motion resolves like
 * `tabs`' `scrollActiveIntoView`: attributes first, media query second. **A smooth
 * scroll asked for earlier is cancelled first, by a smooth scroll of nothing**:
 * Firefox starts a smooth scroll a frame or more after the call, so the scroller
 * still reads its old position, and a `scrollIntoView` with nothing to do there
 * left the earlier one to run on — a burst of arrows round the track came back to
 * the first segment and slid on to the end. Once a frame has passed, an instant
 * scroll to the same position no longer cancels it in Firefox and a smooth one
 * does; WebKit keeps it through either, and the `scrollIntoView` that follows
 * replaces it there.
 */
export function scrollIntoInlineView(scroller: HTMLElement | null, target: HTMLElement): void {
  if (scroller === null || scroller.scrollWidth <= scroller.clientWidth) return;
  const behavior = resolveEnvironment(scroller).reducedMotion ? "auto" : "smooth";
  scroller.scrollBy({ left: 0, behavior });
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
}
