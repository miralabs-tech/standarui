/**
 * `scroll-edges` had no test of its own until now — it was exercised only through
 * `menu`, which reads the attribute and never the predicates. Both halves are here:
 * the one that publishes `data-scroll`, and the one a gesture asks before deciding
 * whether it belongs to the scroller or to the surface around it.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  hasScrollRoom,
  readInlineScrollEdges,
  readScrollEdges,
  scrollIntoInlineView,
  trackInlineScrollEdges,
  trackScrollEdges,
} from "./scroll-edges";

const cleanups: VoidFunction[] = [];

function scroller(axis: "block" | "inline", dir: "ltr" | "rtl" = "ltr"): HTMLElement {
  const host = document.createElement("div");
  const vertical = axis === "block";
  host.setAttribute("dir", dir);
  host.setAttribute(
    "style",
    `position: fixed; inset: 0 auto auto 0; inline-size: 100px; block-size: 100px; overflow: ${
      vertical ? "hidden auto" : "auto hidden"
    }`,
  );
  const inner = document.createElement("div");
  inner.setAttribute(
    "style",
    `inline-size: ${vertical ? 100 : 400}px; block-size: ${vertical ? 400 : 100}px`,
  );
  host.append(inner);
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("readScrollEdges", () => {
  it("names the directions that are still reachable", () => {
    const node = scroller("block");
    expect(readScrollEdges(node)).toBe("down");

    node.scrollTop = 150;
    expect(readScrollEdges(node)).toBe("up down");

    node.scrollTop = node.scrollHeight;
    expect(readScrollEdges(node)).toBe("up");
  });

  it("says nothing at all when there is nowhere to go", () => {
    const node = scroller("block");
    (node.firstElementChild as HTMLElement).style.blockSize = "50px";
    expect(readScrollEdges(node)).toBe("");
  });

  it("is absent rather than empty on the node", () => {
    const node = scroller("block");
    const stop = trackScrollEdges(node);
    cleanups.push(stop);
    expect(node.getAttribute("data-scroll")).toBe("down");

    (node.firstElementChild as HTMLElement).style.blockSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.hasAttribute("data-scroll")).toBe(false);
  });
});

describe("hasScrollRoom — the question a gesture asks", () => {
  it("reads the block axis from both ends", () => {
    const node = scroller("block");
    expect(hasScrollRoom(node, "block", "start")).toBe(false);
    expect(hasScrollRoom(node, "block", "end")).toBe(true);

    node.scrollTop = 150;
    expect(hasScrollRoom(node, "block", "start")).toBe(true);
    expect(hasScrollRoom(node, "block", "end")).toBe(true);

    node.scrollTop = node.scrollHeight;
    expect(hasScrollRoom(node, "block", "start")).toBe(true);
    expect(hasScrollRoom(node, "block", "end")).toBe(false);
  });

  it("reads the inline axis in LTR", () => {
    const node = scroller("inline");
    expect(hasScrollRoom(node, "inline", "start")).toBe(false);
    expect(hasScrollRoom(node, "inline", "end")).toBe(true);

    node.scrollLeft = 150;
    expect(hasScrollRoom(node, "inline", "start")).toBe(true);
    expect(hasScrollRoom(node, "inline", "end")).toBe(true);
  });

  it("reads the inline axis in RTL, where scrollLeft runs the other way", () => {
    const node = scroller("inline", "rtl");
    // The modern model: 0 is the inline start, which in RTL is the right-hand edge.
    expect(node.scrollLeft).toBe(0);
    expect(hasScrollRoom(node, "inline", "start")).toBe(false);
    expect(hasScrollRoom(node, "inline", "end")).toBe(true);

    node.scrollLeft = -150;
    expect(hasScrollRoom(node, "inline", "start")).toBe(true);
    expect(hasScrollRoom(node, "inline", "end")).toBe(true);
  });

  it("refuses both directions when there is nothing to scroll", () => {
    const node = scroller("block");
    (node.firstElementChild as HTMLElement).style.blockSize = "50px";
    expect(hasScrollRoom(node, "block", "start")).toBe(false);
    expect(hasScrollRoom(node, "block", "end")).toBe(false);
  });

  it("does not confuse one axis for the other", () => {
    const node = scroller("block");
    node.scrollTop = 150;
    // Plenty of room on the block axis, none at all across it.
    expect(hasScrollRoom(node, "inline", "start")).toBe(false);
    expect(hasScrollRoom(node, "inline", "end")).toBe(false);
  });
});

describe("readInlineScrollEdges", () => {
  it("names the logical sides that are still reachable in LTR", () => {
    const node = scroller("inline");
    expect(readInlineScrollEdges(node)).toBe("end");

    node.scrollLeft = 150;
    expect(readInlineScrollEdges(node)).toBe("start end");

    node.scrollLeft = node.scrollWidth;
    expect(readInlineScrollEdges(node)).toBe("start");
  });

  it("names the same logical sides in RTL, where scrollLeft runs negative", () => {
    const node = scroller("inline", "rtl");
    expect(readInlineScrollEdges(node)).toBe("end");

    node.scrollLeft = -150;
    expect(readInlineScrollEdges(node)).toBe("start end");

    node.scrollLeft = -node.scrollWidth;
    expect(readInlineScrollEdges(node)).toBe("start");
  });

  it("says nothing when the content fits, and nothing about the block axis", () => {
    const fits = scroller("inline");
    (fits.firstElementChild as HTMLElement).style.inlineSize = "50px";
    expect(readInlineScrollEdges(fits)).toBe("");

    const tall = scroller("block");
    expect(readInlineScrollEdges(tall)).toBe("");
  });
});

describe("trackInlineScrollEdges", () => {
  it("publishes data-scroll-inline and leaves data-scroll alone", () => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");
    expect(node.hasAttribute("data-scroll")).toBe(false);

    node.scrollLeft = 150;
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("data-scroll-inline")).toBe("start end");
  });

  it("removes the attribute rather than leaving it empty", () => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.hasAttribute("data-scroll-inline")).toBe(false);
  });

  it("follows the children and stops at the disposer", async () => {
    const node = scroller("inline");
    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    const stop = trackInlineScrollEdges(node);
    expect(node.hasAttribute("data-scroll-inline")).toBe(false);

    const wide = document.createElement("div");
    wide.setAttribute("style", "inline-size: 400px; block-size: 10px");
    node.append(wide);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");

    stop();
    node.scrollLeft = 150;
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");
  });

  it("is a no-op on a missing node", () => {
    expect(() => trackInlineScrollEdges(null)()).not.toThrow();
  });

  it("keeps a scroller that scrolls out of the tab order, and gives it back", () => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    expect(node.getAttribute("tabindex")).toBe("-1");

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves a tabindex the author wrote alone, in both directions", () => {
    const node = scroller("inline");
    node.setAttribute("tabindex", "0");
    cleanups.push(trackInlineScrollEdges(node));
    expect(node.getAttribute("tabindex")).toBe("0");

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("tabindex")).toBe("0");
  });

  it("takes back the tabindex it wrote when the same node is tracked again after a dispose", () => {
    const node = scroller("inline");
    trackInlineScrollEdges(node)();
    expect(node.getAttribute("tabindex")).toBe("-1");
    cleanups.push(trackInlineScrollEdges(node));

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves a tabindex the author wrote alone across a dispose and a new install", () => {
    const node = scroller("inline");
    node.setAttribute("tabindex", "0");
    trackInlineScrollEdges(node)();
    cleanups.push(trackInlineScrollEdges(node));

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("tabindex")).toBe("0");
  });

  it("reads again when an attribute it was told to watch changes", async () => {
    const node = scroller("inline");
    let active = true;
    cleanups.push(
      trackInlineScrollEdges(node, { active: () => active, attributes: ["data-disabled"] }),
    );
    expect(node.getAttribute("data-scroll-inline")).toBe("end");
    expect(node.getAttribute("tabindex")).toBe("-1");
    for (let settle = 0; settle < 3; settle++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    active = false;
    node.setAttribute("data-disabled", "");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(node.hasAttribute("data-scroll-inline")).toBe(false);
    expect(node.hasAttribute("tabindex")).toBe(false);
  });

  it("says nothing while `active` answers no, and reads again when it answers yes", () => {
    const node = scroller("inline");
    let active = false;
    cleanups.push(trackInlineScrollEdges(node, { active: () => active }));
    expect(node.hasAttribute("data-scroll-inline")).toBe(false);
    expect(node.hasAttribute("tabindex")).toBe(false);

    active = true;
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");
  });

  it("tells the caller when the box starts and stops being a scroller, and only then", () => {
    const node = scroller("inline");
    let toggles = 0;
    cleanups.push(trackInlineScrollEdges(node, { onToggle: () => (toggles += 1) }));
    expect(toggles).toBe(1);

    node.scrollLeft = 150;
    node.dispatchEvent(new Event("scroll"));
    expect(node.getAttribute("data-scroll-inline")).toBe("start end");
    expect(toggles).toBe(1);

    (node.firstElementChild as HTMLElement).style.inlineSize = "50px";
    node.scrollLeft = 0;
    node.dispatchEvent(new Event("scroll"));
    expect(toggles).toBe(2);
  });
});

/**
 * What the listener takes, read where it decides: `defaultPrevented` on a
 * cancelable wheel and the `scrollLeft` it wrote. A real Ctrl or Shift wheel is
 * handled by the engine (zoom, sideways) and a horizontal one scrolls the strip
 * natively, so neither the page nor the strip tells whether the listener took it.
 * The positive control is read to a pixel: Firefox snaps `scrollLeft` to a device
 * pixel.
 */
describe("trackInlineScrollEdges — the wheel", () => {
  function wheel(node: HTMLElement, init: WheelEventInit): boolean {
    return !node.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40, ...init }),
    );
  }

  it("takes a vertical wheel while the strip can still go that way, and moves it", () => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    expect(wheel(node, {})).toBe(true);
    expect(node.scrollLeft).toBeCloseTo(40, 0);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
    ["a mostly horizontal wheel", { deltaX: 50 }],
  ] as const)("leaves %s to the browser", (_, init) => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    // Not `scrollLeft`: WebKit scrolls the strip itself for a synthetic sideways wheel.
    expect(wheel(node, init)).toBe(false);
  });

  it.each([
    [1, 16],
    [2, 100],
  ] as const)("counts a unit of a wheel in mode %i as %i px", (deltaMode, px) => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node));
    expect(wheel(node, { deltaMode, deltaY: 1 })).toBe(true);
    expect(node.scrollLeft).toBeCloseTo(px, 0);
  });

  it("never installs the listener under `wheel: false`", () => {
    const node = scroller("inline");
    cleanups.push(trackInlineScrollEdges(node, { wheel: false }));
    expect(node.getAttribute("data-scroll-inline")).toBe("end");
    expect(wheel(node, {})).toBe(false);
    expect(node.scrollLeft).toBe(0);
  });
});

describe("scrollIntoInlineView", () => {
  function track(count: number): { node: HTMLElement; items: HTMLElement[] } {
    const node = document.createElement("div");
    node.dataset.motion = "none";
    node.setAttribute(
      "style",
      "position: fixed; inset: 0 auto auto 0; inline-size: 100px; overflow: auto hidden; display: flex; scroll-padding-inline: 20px",
    );
    const items = Array.from({ length: count }, () => {
      const item = document.createElement("button");
      item.setAttribute("style", "flex: none; inline-size: 60px; block-size: 20px");
      node.append(item);
      return item;
    });
    document.body.append(node);
    cleanups.push(() => node.remove());
    return { node, items };
  }

  it("brings a hidden item to the nearest edge, past the scroll padding", () => {
    const { node, items } = track(6);
    const target = items[3] as HTMLElement;
    scrollIntoInlineView(node, target);

    const box = target.getBoundingClientRect();
    const port = node.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(port.right - 20 + 1);
    expect(box.left).toBeGreaterThanOrEqual(port.left);
  });

  // R128b. Firefox starts a smooth scroll a frame or more after it is asked for,
  // so the scroller still reads 0 when the next reveal comes; a reveal with nothing
  // to do at 0 then left the earlier one running, and the track slid on to its end.
  it("rests where the last reveal asked, while the one before is still pending", async () => {
    const { node, items } = track(2);
    delete node.dataset.motion;
    expect(node.scrollWidth - node.clientWidth).toBe(20);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    scrollIntoInlineView(node, items[1] as HTMLElement);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    scrollIntoInlineView(node, items[0] as HTMLElement);

    const from = performance.now();
    let last = node.scrollLeft;
    let since = from;
    while (performance.now() - since < 300 || performance.now() - from < 800) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (node.scrollLeft !== last) {
        last = node.scrollLeft;
        since = performance.now();
      }
    }
    // Recent Firefox ends a smooth scroll a sub-pixel short of its target (0.05 px).
    expect(node.scrollLeft).toBeCloseTo(0, 0);
  });

  it("does not move a scroller that has nothing to scroll", () => {
    const { node, items } = track(1);
    scrollIntoInlineView(node, items[0] as HTMLElement);
    expect(node.scrollLeft).toBe(0);
  });

  it("is a no-op without a scroller", () => {
    const { items } = track(2);
    expect(() => scrollIntoInlineView(null, items[0] as HTMLElement)).not.toThrow();
  });
});
