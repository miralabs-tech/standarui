/**
 * One tooltip at a time, and a family that stays warm.
 *
 * Two behaviours that no single machine can implement, because both are about
 * what the *other* tooltips on the page are doing:
 *
 * 1. **Only one is ever visible.** Opening one closes whichever was up. Without
 *    this, a pointer crossing a toolbar leaves a trail of surfaces behind it —
 *    each machine only knows its own trigger was left, and a leave that lands
 *    straight on the next trigger fires in an order nobody controls.
 * 2. **A family that has just shown one is warm**, and the next opens on the
 *    short delay instead of the long one (motion.md §2.4). The 700 ms is there to
 *    keep a tooltip from appearing under a pointer merely passing through; once
 *    the user has demonstrably stopped to read one, that argument is spent.
 *
 * Per document, not per module: an iframe or a popup window is a different page
 * with its own pointer, and a `WeakMap` keyed on the document is what the
 * modality tracker and the layer stack already do.
 *
 * State is a boolean plus a timer rather than a timestamp, so a test can drive it
 * with fake timers and never has to wait on a real clock.
 */

import { timeout } from "../../dom/raf";

interface Visible {
  readonly id: string;
  readonly close: VoidFunction;
}

interface Family {
  visible: Visible | null;
  warm: boolean;
  cancelCooldown: VoidFunction | undefined;
}

const families = new WeakMap<Document, Family>();

function familyOf(doc: Document): Family {
  const existing = families.get(doc);
  if (existing !== undefined) return existing;
  const created: Family = { visible: null, warm: false, cancelCooldown: undefined };
  families.set(doc, created);
  return created;
}

/**
 * Registers this tooltip as the visible one and closes the previous.
 *
 * The swap happens **before** the old one is told, so its own `hide` finds itself
 * no longer current and leaves `warm` alone — otherwise a handover would start a
 * cooldown for the tooltip that just opened.
 */
export function showTooltip(doc: Document, id: string, close: VoidFunction): void {
  const family = familyOf(doc);
  family.cancelCooldown?.();
  family.cancelCooldown = undefined;
  family.warm = false;
  const previous = family.visible;
  family.visible = { id, close };
  if (previous !== null && previous.id !== id) previous.close();
}

export function hideTooltip(doc: Document, id: string, warmFor: number): void {
  const family = familyOf(doc);
  if (family.visible?.id !== id) return;
  family.visible = null;
  family.cancelCooldown?.();
  family.cancelCooldown = undefined;

  const win = doc.defaultView;
  if (win === null || warmFor <= 0) {
    family.warm = false;
    return;
  }
  family.warm = true;
  family.cancelCooldown = timeout(
    win,
    () => {
      family.warm = false;
      family.cancelCooldown = undefined;
    },
    warmFor,
  );
}

/**
 * True while one is up as well as during the cooldown: moving from a trigger
 * whose tooltip is still open onto the next is the very case the short delay
 * exists for, and it is the one a cooldown started on close would miss.
 */
export function isTooltipWarm(doc: Document): boolean {
  const family = families.get(doc);
  if (family === undefined) return false;
  return family.warm || family.visible !== null;
}
