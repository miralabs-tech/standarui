import type { Direction } from "../types";

/**
 * What the page actually resolved around `node`. Computed, not the attribute —
 * `dir` inherits, and the nearest ancestor carrying it may be far up the tree.
 */
export function getComputedDir(node: Element | null | undefined): Direction {
  const win = node?.ownerDocument?.defaultView;
  if (node === null || node === undefined || win === null || win === undefined) return "ltr";
  return win.getComputedStyle(node).direction === "rtl" ? "rtl" : "ltr";
}

/**
 * The direction a behaviour should obey: the prop when the consumer named one,
 * otherwise whatever the page resolved around `node`.
 *
 * `dir` is a first-class machine prop (CDC §5.2) but it is deliberately *not*
 * defaulted any more. The machines used to default it to `"ltr"` and emit that
 * onto a real HTML `dir` attribute, which reset every miralabs.tech subtree nested in
 * an RTL region back to LTR — the attribute won over the inheritance it was
 * supposed to follow. With no default the attribute is omitted, the subtree
 * inherits, and the arrow keys and the positioner ask for the resolved value
 * here instead.
 *
 * Reads the DOM, so every call site sits in an effect or an event handler; on
 * the server `node` is `null` and the answer is `"ltr"`, which is what the
 * consumers already assumed when `dir` was `undefined`.
 */
export function resolveDir(
  dir: Direction | undefined,
  node: Element | null | undefined,
): Direction {
  return dir ?? getComputedDir(node);
}

export function isRtl(dir: Direction | undefined): boolean {
  return dir === "rtl";
}

/**
 * Left/right are logical, not physical. Every arrow-key handler resolves through
 * this so RTL is decided once instead of in every component.
 */
export function resolveDirection(direction: "start" | "end", dir: Direction): "left" | "right" {
  const rtl = isRtl(dir);
  if (direction === "start") return rtl ? "right" : "left";
  return rtl ? "left" : "right";
}
