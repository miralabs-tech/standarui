/**
 * One pair of live regions per document, shared by every component that speaks:
 * toast, clipboard, slider values, combobox result counts, editable.
 *
 * Deduplicated on purpose. A live region only announces when its content changes
 * *after* it is in the accessibility tree, so a component that creates its own
 * region and fills it in the same tick announces nothing at all — the classic
 * failure. The regions here are created once, up front and empty, and text is set
 * on a later task.
 *
 * The same mechanism is why an identical message has to be cleared first: setting
 * the same string twice is not a change, and screen readers stay silent.
 */

import { setStyle } from "../dom/attrs";
import { visuallyHiddenStyle } from "./visually-hidden";

export type Politeness = "polite" | "assertive";

export interface LiveAnnouncer {
  announce(message: string, politeness?: Politeness): void;
  destroy(): void;
}

interface AnnouncerState {
  readonly announcer: LiveAnnouncer;
  readonly regions: Map<Politeness, HTMLElement>;
}

const announcers = new WeakMap<Document, AnnouncerState>();

function createRegion(doc: Document, politeness: Politeness): HTMLElement {
  const region = doc.createElement("div");
  region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("data-sui-live-region", politeness);
  setStyle(region, visuallyHiddenStyle);
  doc.body.append(region);
  return region;
}

export function getLiveAnnouncer(doc: Document): LiveAnnouncer {
  const existing = announcers.get(doc);
  if (existing !== undefined) return existing.announcer;

  const regions = new Map<Politeness, HTMLElement>([
    ["polite", createRegion(doc, "polite")],
    ["assertive", createRegion(doc, "assertive")],
  ]);
  const pending = new Map<Politeness, number>();
  const win = doc.defaultView;

  const announcer: LiveAnnouncer = {
    announce(message: string, politeness: Politeness = "polite"): void {
      const region = regions.get(politeness);
      if (region === undefined || win === null) return;

      const scheduled = pending.get(politeness);
      if (scheduled !== undefined) win.clearTimeout(scheduled);

      // Clear first, then set on the next task: an identical string is not a
      // change, and a change in the same task can land before the region is read.
      region.textContent = "";
      pending.set(
        politeness,
        win.setTimeout(() => {
          region.textContent = message;
          pending.delete(politeness);
        }, 0),
      );
    },
    destroy(): void {
      for (const timer of pending.values()) win?.clearTimeout(timer);
      pending.clear();
      for (const region of regions.values()) region.remove();
      regions.clear();
      announcers.delete(doc);
    },
  };

  announcers.set(doc, { announcer, regions });
  return announcer;
}
