/**
 * Where a sliding indicator sits, measured rather than derived from an index.
 *
 * An index is a position only where `grid-auto-columns: 1fr` makes it one, and
 * that stops being true the moment the items are sized by their own text, which
 * is every tab list: the same arithmetic would put the pill beside the thing it
 * points at. So the geometry is read, and it is read here — shared with `tabs`,
 * `radio-group` and `toggle-group`, and with the `tab-bar` presentation.
 * `getIndicatorMetrics` is pure and takes boxes in the track's own pixels;
 * `measureIndicator` reads them from the elements, dividing out the scale of an
 * ancestor, and gives way to the caller's layout boxes when a segment is itself
 * scaled, as it is while pressed.
 *
 * Pure, and expressed **logically**: the horizontal branch measures from the
 * start edge of the writing direction, which is what lets the stylesheet consume
 * it as `inset-inline-start` and RTL cost nobody a second rule. `inset-*` rather
 * than `translate` is the other half of that decision — a percentage `translate`
 * resolves against the element's own border box, which WebKit rounds to whole
 * pixels (motion.md amendment).
 */

import type { Direction, Orientation } from "../types";

/** The fields of a `DOMRect` this module reads — a `DOMRect` satisfies it as is. */
export interface IndicatorBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The scroll and border offsets of the track — an `HTMLElement` satisfies it. */
export interface IndicatorScroll {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly clientLeft: number;
  readonly clientTop: number;
}

export interface IndicatorAxis {
  readonly orientation: Orientation;
  readonly dir: Direction;
}

export interface IndicatorMetrics {
  /** Along the main axis, from the track's padding-box start, in CSS pixels. */
  readonly offset: number;
  readonly size: number;
}

/**
 * Relative to the track's **padding box**, scroll included: the indicator is
 * positioned inside that box, so a viewport-relative reading would drift the
 * moment the track scrolled or the page did.
 */
export function getIndicatorMetrics(
  track: IndicatorBox,
  item: IndicatorBox,
  scroll: IndicatorScroll,
  axis: IndicatorAxis,
): IndicatorMetrics {
  if (axis.orientation === "vertical") {
    return {
      offset: item.top - track.top + scroll.scrollTop - scroll.clientTop,
      size: item.height,
    };
  }
  // In RTL the start edge is the right one, and `scrollLeft` counts down from
  // zero there. The mirror is spent here and nowhere else.
  const rtl = axis.dir === "rtl";
  const start = rtl ? track.right - item.right : item.left - track.left;
  return {
    offset: start + (rtl ? -scroll.scrollLeft : scroll.scrollLeft) - scroll.clientLeft,
    size: item.width,
  };
}

/**
 * The border box of an element along one axis, in CSS pixels and with its
 * fraction — `offsetWidth` rounds and the computed size does not. `NaN` for a box
 * with no used size.
 */
function borderBoxSize(style: CSSStyleDeclaration, vertical: boolean): number {
  const size = Number.parseFloat(vertical ? style.height : style.width);
  if (style.boxSizing === "border-box") return size;
  const edges = vertical
    ? [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
    : [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth];
  return edges.reduce((total, edge) => total + Number.parseFloat(edge), size);
}

/**
 * `getIndicatorMetrics` fed from the elements themselves, in the track's own CSS
 * pixels and to a fraction of one. The bounding rects carry every transform on
 * the way up, so the track's rect over its layout size is divided out — which is
 * what lets a group inside a dialog that is still scaling in measure in CSS
 * pixels. `null` when the rects cannot be trusted: the item is itself transformed
 * (a segment is, while it is pressed), or the track has no usable size. The
 * caller reads the layout boxes then.
 */
export function measureIndicator(
  track: HTMLElement,
  item: HTMLElement,
  getStyle: (node: Element) => CSSStyleDeclaration,
  axis: IndicatorAxis,
): IndicatorMetrics | null {
  const vertical = axis.orientation === "vertical";
  const trackStyle = getStyle(track);
  const itemStyle = getStyle(item);
  const outer = track.getBoundingClientRect();
  const ratio = (vertical ? outer.height : outer.width) / borderBoxSize(trackStyle, vertical);
  const transformed = [
    itemStyle.transform,
    itemStyle.scale,
    itemStyle.rotate,
    itemStyle.translate,
  ].some((entry) => entry !== "none");
  if (transformed || !Number.isFinite(ratio) || ratio === 0) return null;

  const inTrack = (box: DOMRect): IndicatorBox => ({
    left: (box.left - outer.left) / ratio,
    right: (box.right - outer.left) / ratio,
    top: (box.top - outer.top) / ratio,
    width: box.width / ratio,
    height: box.height / ratio,
  });
  return getIndicatorMetrics(
    inTrack(outer),
    inTrack(item.getBoundingClientRect()),
    {
      scrollLeft: track.scrollLeft,
      scrollTop: track.scrollTop,
      clientLeft: Number.parseFloat(trackStyle.borderInlineStartWidth),
      clientTop: Number.parseFloat(trackStyle.borderTopWidth),
    },
    axis,
  );
}
