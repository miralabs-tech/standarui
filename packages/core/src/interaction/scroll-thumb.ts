export interface AxisMetrics {
  readonly viewport: number;
  readonly content: number;
  readonly offset: number;
}

export const OVERFLOW_EPSILON = 1;

export const SCROLLBAR_SIZE = 12;

export const THUMB_INSET = 3;

export const THUMB_MIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function overflows(metrics: AxisMetrics): boolean {
  return metrics.content > metrics.viewport + OVERFLOW_EPSILON;
}

export function trackLength(viewport: number, corner: boolean): number {
  return Math.max(0, viewport - 2 * THUMB_INSET - (corner ? SCROLLBAR_SIZE : 0));
}

export function thumbLength(metrics: AxisMetrics, track: number): number {
  if (!overflows(metrics) || track <= 0) return 0;
  return Math.min(track, Math.max(THUMB_MIN, (track * metrics.viewport) / metrics.content));
}

export function thumbPosition(metrics: AxisMetrics, track: number): number {
  const range = metrics.content - metrics.viewport;
  const travel = track - thumbLength(metrics, track);
  if (range <= 0 || travel <= 0) return 0;
  return clamp((travel * metrics.offset) / range, 0, travel);
}

export function dragOffset(
  start: number,
  position: number,
  metrics: AxisMetrics,
  track: number,
): number {
  const range = Math.max(0, metrics.content - metrics.viewport);
  const travel = track - thumbLength(metrics, track);
  if (range === 0 || travel <= 0) return clamp(start, 0, range);
  return clamp(start + (position * range) / travel, 0, range);
}

export function pageOffset(metrics: AxisMetrics, direction: 1 | -1): number {
  const range = Math.max(0, metrics.content - metrics.viewport);
  return clamp(metrics.offset + direction * metrics.viewport, 0, range);
}
