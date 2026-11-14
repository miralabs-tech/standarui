import { afterEach, describe, expect, it, vi } from "vitest";
import { trackInlineScrollbar } from "./inline-scrollbar";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length).reverse()) cleanup();
});

interface Scene {
  readonly scroller: HTMLElement;
  readonly bar: HTMLElement;
  readonly thumb: HTMLElement;
  readonly dispose: VoidFunction;
}

function scene(dir: "ltr" | "rtl" = "ltr"): Scene {
  const host = document.createElement("div");
  host.dir = dir;
  host.innerHTML = `
    <div id="scroller" style="inline-size:100px;block-size:20px;overflow:auto hidden;scrollbar-width:none">
      <div style="inline-size:400px;block-size:10px"></div>
    </div>
    <div id="bar" style="position:relative;inline-size:100px;block-size:12px">
      <div id="thumb" style="position:absolute;inset-block:3px;inset-inline-start:0;inline-size:20px"></div>
    </div>`;
  document.body.append(host);
  cleanups.push(() => host.remove());
  const find = (id: string): HTMLElement => {
    const node = host.querySelector<HTMLElement>(`#${id}`);
    if (node === null) throw new Error(`no ${id}`);
    return node;
  };
  const scroller = find("scroller");
  const bar = find("bar");
  const thumb = find("thumb");
  scroller.setAttribute("data-scroll-inline", "end");
  const dispose = trackInlineScrollbar(scroller, bar, thumb);
  cleanups.push(dispose);
  return { scroller, bar, thumb, dispose };
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function pointer(type: string, clientX: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
    clientY: 5,
    ...init,
  });
}

const LENGTH = "--sui-scroll-thumb-length";
const OFFSET = "--sui-scroll-thumb-offset";

describe("trackInlineScrollbar — what it shows", () => {
  it("follows data-scroll-inline on the scroller", async () => {
    const { scroller, bar } = scene();
    expect(bar.getAttribute("data-state")).toBe("visible");

    scroller.removeAttribute("data-scroll-inline");
    await vi.waitFor(() => expect(bar.getAttribute("data-state")).toBe("hidden"));

    scroller.setAttribute("data-scroll-inline", "start end");
    await vi.waitFor(() => expect(bar.getAttribute("data-state")).toBe("visible"));
  });

  it("writes the thumb's length and place from the scroller and the bar", async () => {
    const { scroller, thumb } = scene();
    const track = 100 - 6;
    const length = (track * 100) / 400;
    const travel = track - length;
    expect(thumb.style.getPropertyValue(LENGTH)).toBe(`${length}px`);
    expect(thumb.style.getPropertyValue(OFFSET)).toBe("0px");

    scroller.scrollLeft = 150;
    await vi.waitFor(() => expect(thumb.style.getPropertyValue(OFFSET)).toBe(`${travel / 2}px`));
  });

  it("mirrors in a right-to-left strip, where the scroll offset is negative", async () => {
    const { scroller, thumb } = scene("rtl");
    const travel = 94 - 23.5;

    scroller.scrollLeft = -300;
    await vi.waitFor(() => expect(thumb.style.getPropertyValue(OFFSET)).toBe(`${travel}px`));
  });
});

describe("trackInlineScrollbar — dragging the thumb", () => {
  async function drag(thumb: HTMLElement, from: number, to: number): Promise<void> {
    thumb.dispatchEvent(pointer("pointerdown", from));
    thumb.dispatchEvent(pointer("pointermove", from + (to - from) / 2));
    thumb.dispatchEvent(pointer("pointermove", to));
    await frame();
  }

  it("scrolls by the travel the thumb stands for, and marks the bar while it does", async () => {
    const { scroller, bar, thumb } = scene();
    const travel = 94 - 23.5;

    await drag(thumb, 50, 50 + travel / 2);
    expect(bar.hasAttribute("data-dragging")).toBe(true);
    expect(scroller.scrollLeft).toBeCloseTo(150, 0);

    thumb.dispatchEvent(pointer("pointerup", 50 + travel / 2));
    expect(bar.hasAttribute("data-dragging")).toBe(false);
    expect(scroller.scrollLeft).toBeCloseTo(150, 0);
  });

  it("scrolls to the negative side in a right-to-left strip", async () => {
    const { scroller, thumb } = scene("rtl");
    const travel = 94 - 23.5;

    await drag(thumb, 50, 50 - travel / 2);
    expect(scroller.scrollLeft).toBeCloseTo(-150, 0);
    thumb.dispatchEvent(pointer("pointerup", 50 - travel / 2));
  });

  it("puts the scroll back where it started when the gesture is cancelled", async () => {
    const { scroller, bar, thumb } = scene();
    scroller.scrollLeft = 100;
    await frame();

    await drag(thumb, 50, 80);
    expect(scroller.scrollLeft).not.toBe(100);
    thumb.dispatchEvent(pointer("pointercancel", 80));

    expect(Math.abs(scroller.scrollLeft - 100)).toBeLessThan(1);
    expect(bar.hasAttribute("data-dragging")).toBe(false);
  });

  it("does not take the focus from the control a mouse press came from", () => {
    const { thumb } = scene();
    const event = pointer("pointerdown", 50, { cancelable: true });
    thumb.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const touch = pointer("pointerdown", 50, {
      cancelable: true,
      pointerType: "touch",
      pointerId: 2,
    });
    thumb.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(false);
  });

  it("does not take the focus from the control a pen press came from either", () => {
    const { thumb } = scene();
    const pen = pointer("pointerdown", 50, { cancelable: true, pointerType: "pen", pointerId: 3 });
    thumb.dispatchEvent(pen);
    expect(pen.defaultPrevented).toBe(true);
  });
});

describe("trackInlineScrollbar — a wheel over the thumb", () => {
  it("moves the scroller the way a wheel over the strip does, and keeps it from the page", () => {
    const { scroller, thumb } = scene();
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 });

    thumb.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scroller.scrollLeft).toBeCloseTo(40, 0);
  });

  it("leaves a wheel that has nowhere to go to the page", () => {
    const { scroller, thumb } = scene();
    scroller.scrollLeft = 300;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 });

    thumb.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("trackInlineScrollbar — the disposer", () => {
  it("lets go of the scroll, the resize and the drag", async () => {
    const { scroller, bar, thumb, dispose } = scene();
    const before = thumb.style.getPropertyValue(OFFSET);
    dispose();

    scroller.scrollLeft = 150;
    scroller.removeAttribute("data-scroll-inline");
    await frame();
    await frame();
    expect(thumb.style.getPropertyValue(OFFSET)).toBe(before);
    expect(bar.getAttribute("data-state")).toBe("visible");

    thumb.dispatchEvent(pointer("pointerdown", 50));
    thumb.dispatchEvent(pointer("pointermove", 90));
    expect(bar.hasAttribute("data-dragging")).toBe(false);
  });

  it("ends a drag in progress and cancels the frame it had asked for", async () => {
    const { scroller, bar, thumb, dispose } = scene();
    scroller.scrollLeft = 100;
    await frame();
    await frame();
    const resting = thumb.style.getPropertyValue(OFFSET);

    thumb.dispatchEvent(pointer("pointerdown", 50));
    thumb.dispatchEvent(pointer("pointermove", 60));
    thumb.dispatchEvent(pointer("pointermove", 80));
    expect(bar.hasAttribute("data-dragging")).toBe(true);

    scroller.scrollLeft = 300;
    scroller.dispatchEvent(new Event("scroll"));
    dispose();
    expect(bar.hasAttribute("data-dragging")).toBe(false);
    await frame();
    await frame();

    expect(thumb.style.getPropertyValue(OFFSET)).toBe(resting);
  });

  it("does nothing for a node that is not there", () => {
    expect(() => trackInlineScrollbar(null, null, undefined)()).not.toThrow();
  });
});
