/**
 * The DOM half of the positioner: measure, apply, and keep it right.
 *
 * Everything that decides *where* lives in `compute-position`; this file only
 * reads rects and writes styles. Position is written as a `translate` rather than
 * as `top`/`left` so a move never triggers layout, and the custom properties the
 * CSS contract names (`--sui-transform-origin`, `--sui-anchor-width`,
 * `--sui-arrow-x/y`) are published here.
 *
 * Auto-update watches what actually moves the anchor: its own size, the surface's
 * size, and scrolling on every scrollable ancestor. A rAF polling loop would be
 * simpler and would also keep a phone's radio awake for a menu nobody is
 * touching.
 */

import { addDomEvent } from "../dom/event";
import { observeResize } from "../dom/observers";
import { raf } from "../dom/raf";
import type { Rect } from "../types";
import { computePosition, type PositionOptions, type PositionResult } from "./compute-position";

export interface TrackPositionOptions extends PositionOptions {
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly onPositioned?: ((result: PositionResult) => void) | undefined;
  /** The clipping box. Defaults to the viewport. */
  readonly boundary?: (() => Rect) | undefined;
  readonly arrowNode?: (() => HTMLElement | null | undefined) | undefined;
  /**
   * Anchor to a rect rather than to the element's own box — a caret, a text
   * range, a point on a canvas. When given it replaces the anchor's measurement,
   * and `anchor` becomes the element the surface still *watches*: pass the scroll
   * container so resize and scroll keep updating. Passing `null` for `anchor` is
   * allowed and costs exactly that tracking — only a window resize repositions.
   */
  readonly getAnchorRect?: (() => Rect) | undefined;
  /**
   * While this returns true the surface keeps the geometry it already has.
   *
   * For the window between "the machine has decided to close" and "the effect
   * that installed this tracker is torn down" — the select's selection blink is
   * the one that exists today. The commit rewrites the trigger's caption, the
   * trigger resizes under a surface that is still open and fully opaque, and
   * re-fitting it there is a jump the eye reads as a bug rather than as a close.
   */
  readonly paused?: (() => boolean) | undefined;
}

const NOOP: VoidFunction = () => {};

function rectOf(node: Element): Rect {
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}

function viewportRect(win: Window): Rect {
  return { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight };
}

/** Every ancestor that can scroll, plus the window — those are the things that move it. */
function scrollParents(node: Element): (Element | Window)[] {
  const win = node.ownerDocument.defaultView;
  const parents: (Element | Window)[] = [];
  let current: Element | null = node.parentElement;
  while (current !== null && current !== node.ownerDocument.body) {
    const style = win?.getComputedStyle(current);
    const overflow = `${style?.overflow ?? ""}${style?.overflowX ?? ""}${style?.overflowY ?? ""}`;
    if (/auto|scroll|overlay|hidden/.test(overflow)) parents.push(current);
    current = current.parentElement;
  }
  if (win !== null && win !== undefined) parents.push(win);
  return parents;
}

export function trackPosition(
  anchor: HTMLElement | null | undefined,
  floating: HTMLElement | null | undefined,
  options: TrackPositionOptions = {},
): VoidFunction {
  const win = floating?.ownerDocument.defaultView;
  if (floating == null || win === null || win === undefined) return NOOP;

  const anchorEl = anchor ?? null;
  const readAnchorRect =
    options.getAnchorRect ?? (anchorEl !== null ? () => rectOf(anchorEl) : null);
  if (readAnchorRect === null) return NOOP;

  // **`fixed`, and `absolute` is the trap it replaced.** Everything computed below
  // is in viewport coordinates — `getBoundingClientRect` for the anchor, the
  // window box for the boundary — and it is written as a translate from
  // `top: 0; left: 0`. Under `absolute` in a portal with no positioned ancestor,
  // that origin is the *document*, so the surface landed exactly `-scrollY` away
  // from its anchor: correct on an unscrolled page and off by the whole scroll
  // offset on any other. Under `fixed` the containing block is the viewport, which
  // is the space the numbers were already in.
  //
  // The remaining exposure is an ancestor that establishes a containing block for
  // fixed descendants — `transform`, `filter`, `backdrop-filter`, `contain: paint`
  // — and this library paints glass with `backdrop-filter`. Portalling to the body
  // is what keeps a surface clear of one; a surface rendered inside glass has to
  // ask for `absolute` and accept the document-origin arithmetic that comes with it.
  const strategy = options.strategy ?? "fixed";
  let scheduled: VoidFunction | undefined;
  // Whether the *last* pass wrote a width, so the reset below can take back its
  // own answer without ever removing one the author set inline.
  let wroteWidth = false;

  const apply = (): void => {
    if (options.paused?.() === true) return;
    const anchorRect = readAnchorRect();
    const boundary = options.boundary?.() ?? viewportRect(win);

    // Taken out of flow *before* it is measured, and the order is the whole point:
    // a surface still in flow is a block-level box as wide as its container, and
    // that width goes straight into the shift clamp — `max` falls below `min` and
    // the surface is pinned to `padding`, hard against the boundary's edge,
    // whatever the placement asked for. Measuring the box in the layout mode it
    // will actually be laid out in costs one style recalc on the first pass and
    // nothing after for these three, which never change again.
    floating.style.position = strategy;
    floating.style.top = "0";
    floating.style.left = "0";
    // The width does change, so it is given back before the measurement: left in
    // place, `rectOf` below would return the answer of the *previous* pass instead
    // of the surface's natural width, and a `matchWidth` surface could never
    // shrink again once its anchor narrowed. One synchronous block, no frame
    // painted in between — the clear costs a recalc, never a flash.
    if (wroteWidth) {
      floating.style.removeProperty("width");
      wroteWidth = false;
    }

    const result = computePosition(anchorRect, rectOf(floating), boundary, options);

    // Translate, not top/left: moving a surface must not cost a layout pass.
    floating.style.transform = `translate3d(${result.x}px, ${result.y}px, 0)`;
    floating.style.setProperty("--sui-transform-origin", result.transformOrigin);
    floating.style.setProperty("--sui-anchor-width", `${anchorRect.width}px`);
    floating.style.setProperty("--sui-anchor-height", `${anchorRect.height}px`);
    floating.style.setProperty("--sui-available-width", `${result.availableWidth}px`);
    floating.style.setProperty("--sui-available-height", `${result.availableHeight}px`);
    floating.dataset["side"] = result.side;
    floating.dataset["align"] = result.align;
    if (result.width !== null) {
      floating.style.width = `${result.width}px`;
      wroteWidth = true;
    }

    const arrowNode = options.arrowNode?.();
    if (arrowNode != null && result.arrow !== null) {
      arrowNode.style.setProperty("--sui-arrow-x", `${result.arrow.x}px`);
      arrowNode.style.setProperty("--sui-arrow-y", `${result.arrow.y}px`);
    }

    options.onPositioned?.(result);
  };

  // Coalesced: a resize and a scroll in the same frame are one reposition.
  const schedule = (): void => {
    scheduled?.();
    scheduled = raf(win, () => {
      scheduled = undefined;
      apply();
    });
  };

  apply();

  const disposers: VoidFunction[] = [observeResize(floating, schedule)];
  // A virtual anchor with no element has nothing to observe and nothing to hang a
  // scroll listener on; the window still moves it.
  if (anchorEl !== null) {
    disposers.push(observeResize(anchorEl, schedule));
    for (const parent of scrollParents(anchorEl)) {
      disposers.push(addDomEvent(parent, "scroll", schedule, { passive: true, capture: true }));
    }
  }
  disposers.push(addDomEvent(win, "resize", schedule, { passive: true }));

  return () => {
    scheduled?.();
    for (let index = disposers.length - 1; index >= 0; index--) disposers[index]?.();
  };
}
