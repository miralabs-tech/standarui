import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { type DragAxisEvent, type DragAxisOptions, trackDragAxis } from "./drag-axis";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function surface(attributes = ""): HTMLElement {
  const host = mount(
    `<div ${attributes} style="position: fixed; inset: 100px auto auto 100px; width: 200px; height: 200px"></div>`,
  );
  return host.firstElementChild as HTMLElement;
}

/**
 * `timeStamp` is a read-only getter on the prototype, and a constructed event gets
 * whatever the clock said when it was built. Shadowing it with an own property is
 * the only way to assert a velocity rather than a range — every timing here is
 * chosen, so nothing in this file depends on how fast the machine ran it.
 */
function pointer(type: string, at: number, init: PointerEventInit = {}): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...init });
  Object.defineProperty(event, "timeStamp", { value: at });
  return event;
}

function track(node: HTMLElement, options: DragAxisOptions): VoidFunction {
  const dispose = trackDragAxis(node, options);
  cleanups.push(dispose);
  return dispose;
}

interface Recorder {
  readonly starts: DragAxisEvent[];
  readonly drags: DragAxisEvent[];
  readonly ends: DragAxisEvent[];
}

function recorder(): Recorder & Pick<DragAxisOptions, "onDragStart" | "onDrag" | "onDragEnd"> {
  const state: Recorder = { starts: [], drags: [], ends: [] };
  return {
    ...state,
    onDragStart: (event) => state.starts.push(event),
    onDrag: (event) => state.drags.push(event),
    onDragEnd: (event) => state.ends.push(event),
  };
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("trackDragAxis — the threshold", () => {
  it("stays silent below it, so a tap is never a gesture", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 153 }));
    node.dispatchEvent(pointer("pointerup", 32, { clientX: 150, clientY: 153 }));

    expect(log.starts).toHaveLength(0);
    expect(log.drags).toHaveLength(0);
    expect(log.ends).toHaveLength(0);
  });

  it("opens the gesture exactly once when it is crossed, then reports every move", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 154 }));
    node.dispatchEvent(pointer("pointermove", 32, { clientX: 150, clientY: 170 }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 190 }));

    expect(log.starts).toHaveLength(1);
    expect(log.starts[0]?.position).toBe(4);
    expect(log.drags.map((event) => event.position)).toEqual([20, 40]);
  });

  it("honours a threshold the consumer names", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", threshold: 20, ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 160 }));
    expect(log.starts).toHaveLength(0);

    node.dispatchEvent(pointer("pointermove", 32, { clientX: 150, clientY: 175 }));
    expect(log.starts).toHaveLength(1);
  });
});

describe("trackDragAxis — the axis", () => {
  it("reads the block axis and ignores travel across it", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 400, clientY: 200 }));

    expect(log.starts[0]?.position).toBe(50);
  });

  it("reads the inline axis and ignores travel across it", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "inline", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 200, clientY: 400 }));

    expect(log.starts[0]?.position).toBe(50);
  });

  it("mirrors the inline axis in RTL", () => {
    const node = surface(`dir="rtl"`);
    const log = recorder();
    track(node, { axis: "inline", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 200, clientY: 150 }));

    expect(log.starts[0]?.position).toBe(-50);
  });

  it("leaves the block axis alone in RTL — a writing direction has nothing to say to it", () => {
    const node = surface(`dir="rtl"`);
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));

    expect(log.starts[0]?.position).toBe(50);
  });

  it("takes an explicit dir over what the page resolved", () => {
    const node = surface(`dir="rtl"`);
    const log = recorder();
    track(node, { axis: "inline", dir: "ltr", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 200, clientY: 150 }));

    expect(log.starts[0]?.position).toBe(50);
  });
});

describe("trackDragAxis — velocity", () => {
  it("measures a uniform movement", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    for (const [index, at] of [16, 32, 48, 64].entries()) {
      node.dispatchEvent(pointer("pointermove", at, { clientX: 150, clientY: 160 + index * 10 }));
    }
    node.dispatchEvent(pointer("pointerup", 80, { clientX: 150, clientY: 200 }));

    // 40 px over the 64 ms the window still spans: 0.625 px/ms.
    expect(log.ends[0]?.velocity).toBeCloseTo(0.625, 5);
  });

  it("signs the velocity with the direction of travel", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 200 }));
    for (const [index, at] of [16, 32, 48, 64].entries()) {
      node.dispatchEvent(pointer("pointermove", at, { clientX: 150, clientY: 190 - index * 10 }));
    }
    node.dispatchEvent(pointer("pointerup", 80, { clientX: 150, clientY: 150 }));

    expect(log.ends[0]?.velocity).toBeCloseTo(-0.625, 5);
  });

  it("releases at zero after the finger has come to rest", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    for (const [index, at] of [16, 32, 48, 64].entries()) {
      node.dispatchEvent(pointer("pointermove", at, { clientX: 150, clientY: 160 + index * 10 }));
    }
    // The finger parks for a third of a second and fires nothing, then lifts from
    // where it stopped. Without the staleness cutoff this releases at the flick's
    // speed and the sheet flies out from under a hand that had visibly stilled it.
    node.dispatchEvent(pointer("pointerup", 400, { clientX: 150, clientY: 190 }));

    expect(log.ends[0]?.velocity).toBe(0);
    expect(log.ends[0]?.position).toBe(40);
  });

  it("reads zero when the finger held still but kept reporting", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));
    for (const at of [200, 216, 232, 248]) {
      node.dispatchEvent(pointer("pointermove", at, { clientX: 150, clientY: 200 }));
    }
    node.dispatchEvent(pointer("pointerup", 264, { clientX: 150, clientY: 200 }));

    expect(log.ends[0]?.velocity).toBe(0);
  });

  it("keeps only the last five samples", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    // Ten moves, all of them inside the staleness cutoff, so the window is the only
    // thing that can decide the answer. The gesture crawls for five frames and then
    // accelerates tenfold: a window that kept the whole run would average the crawl
    // back in and report 2.0 instead of the 3.0 the finger is actually doing.
    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    const crawl = [2, 4, 6, 8, 10];
    const sprint = [30, 50, 70, 90, 110];
    for (const [index, offset] of [...crawl, ...sprint].entries()) {
      node.dispatchEvent(
        pointer("pointermove", (index + 1) * 5, { clientX: 150, clientY: 150 + offset }),
      );
    }
    node.dispatchEvent(pointer("pointerup", 55, { clientX: 150, clientY: 260 }));

    // Samples kept: (50,35) (70,40) (90,45) (110,50) (110,55) — 60 px over 20 ms.
    expect(log.ends[0]?.velocity).toBeCloseTo(3, 5);
  });
});

describe("trackDragAxis — the end of a gesture", () => {
  it("ends a real drag and stays quiet about one that never started", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointerup", 16, { clientX: 150, clientY: 151 }));
    expect(log.ends).toHaveLength(0);

    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200 }));
    expect(log.ends).toHaveLength(1);
  });

  it("cancels instead of ending when the pointer is taken away", () => {
    const node = surface();
    const log = recorder();
    const onDragCancel = vi.fn();
    track(node, { axis: "block", onDragCancel, ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointercancel", 32, { clientX: 150, clientY: 200 }));

    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(log.ends).toHaveLength(0);
  });

  it("does not cancel a gesture that never crossed the threshold", () => {
    const node = surface();
    const onDragCancel = vi.fn();
    track(node, { axis: "block", onDragCancel });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointercancel", 16, { clientX: 150, clientY: 150 }));

    expect(onDragCancel).not.toHaveBeenCalled();
  });

  it("lets a second gesture run after the first", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    for (const base of [0, 100]) {
      node.dispatchEvent(pointer("pointerdown", base, { clientX: 150, clientY: 150 }));
      node.dispatchEvent(pointer("pointermove", base + 16, { clientX: 150, clientY: 200 }));
      node.dispatchEvent(pointer("pointerup", base + 32, { clientX: 150, clientY: 200 }));
    }

    expect(log.starts).toHaveLength(2);
    expect(log.ends).toHaveLength(2);
    expect(log.ends[1]?.position).toBe(50);
  });
});

describe("trackDragAxis — the click a drag leaves behind", () => {
  it("swallows it", () => {
    const node = surface();
    const onClick = vi.fn();
    node.addEventListener("click", onClick);
    track(node, { axis: "block" });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointerup", 32, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("leaves a real click alone, before and after a drag", () => {
    const node = surface();
    const onClick = vi.fn();
    node.addEventListener("click", onClick);
    track(node, { axis: "block" });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointerup", 16, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    node.dispatchEvent(pointer("pointerdown", 96, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointerup", 112, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("swallows exactly one, so a programmatic click after a drag still lands", () => {
    const node = surface();
    const onClick = vi.fn();
    node.addEventListener("click", onClick);
    track(node, { axis: "block" });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointerup", 32, { clientX: 150, clientY: 200 }));

    // Two clicks with no `pointerdown` between them — the shape a consumer calling
    // `node.click()` produces. Only the compatibility click the gesture left behind
    // is the one to eat; the deliberate one after it is not the drag's business.
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("trackDragAxis — the gates", () => {
  it("asks canStart once, at pointerdown, and arms nothing when refused", () => {
    const node = surface();
    const log = recorder();
    const canStart = vi.fn(() => false);
    track(node, { axis: "block", canStart, ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));

    expect(canStart).toHaveBeenCalledTimes(1);
    expect(log.starts).toHaveLength(0);
  });

  it("obeys isDisabled", () => {
    const node = surface();
    const log = recorder();
    let disabled = true;
    track(node, { axis: "block", isDisabled: () => disabled, ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));
    expect(log.starts).toHaveLength(0);

    disabled = false;
    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 200 }));
    expect(log.starts).toHaveLength(1);
  });

  it("ignores a secondary button", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150, button: 2 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));

    expect(log.starts).toHaveLength(0);
  });

  it("ignores a second pointer while one is down", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointerdown", 8, { clientX: 150, clientY: 300, pointerId: 2 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 300, pointerId: 2 }));

    expect(log.starts).toHaveLength(0);
  });

  it("hears a release outside the node, so the next press starts from its own origin", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 250 }));
    // The release lands outside the node. Heard on the node alone it is lost, and
    // the next press, 100 px higher, reads -50 from the stale origin instead of 50.
    document.body.dispatchEvent(pointer("pointerup", 16, { clientX: 20, clientY: 20 }));

    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 200 }));
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200 }));

    expect(log.starts).toHaveLength(1);
    expect(log.ends).toHaveLength(1);
    expect(log.ends[0]?.position).toBe(50);
  });

  it("hears a touch release that lost its target, so the next contact starts", () => {
    const node = surface();
    node.innerHTML = `<span style="display: block; block-size: 50px"></span>`;
    const child = node.firstElementChild as HTMLElement;
    const log = recorder();
    track(node, { axis: "block", ...log });

    child.dispatchEvent(
      pointer("pointerdown", 0, { clientX: 150, clientY: 120, pointerId: 5, pointerType: "touch" }),
    );
    // The implicit capture's target leaves the DOM, and its release with it: the
    // engine hit-tests the release elsewhere. Touch ids never come back, so a lost
    // release would block every later contact.
    child.remove();
    document.dispatchEvent(
      pointer("pointerup", 16, { clientX: 150, clientY: 120, pointerId: 5, pointerType: "touch" }),
    );

    const touch = { pointerId: 6, pointerType: "touch" };
    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150, ...touch }));
    node.dispatchEvent(pointer("pointermove", 48, { clientX: 150, clientY: 200, ...touch }));
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200, ...touch }));

    expect(log.starts).toHaveLength(1);
    expect(log.ends).toHaveLength(1);
  });
  it("disarms a pen on a bare hover, so it cannot drag with nothing pressed", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    const pen = { pointerType: "pen" };
    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 250, ...pen }));
    // The pen came up where the document could not hear it, then hovers 100 px away.
    document.dispatchEvent(
      pointer("pointermove", 16, { clientX: 150, clientY: 150, buttons: 0, ...pen }),
    );
    expect(log.starts).toHaveLength(0);

    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150, ...pen }));
    node.dispatchEvent(
      pointer("pointermove", 48, { clientX: 150, clientY: 200, buttons: 1, ...pen }),
    );
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200, ...pen }));
    expect(log.ends[0]?.position).toBe(50);
  });

  it("re-arms on a mouse press while a press is armed, its release having been lost", () => {
    const node = surface();
    const log = recorder();
    track(node, { axis: "block", ...log });

    const mouse = { pointerType: "mouse" };
    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 250, ...mouse }));
    // No release and no move heard: a focus switch, then a touchpad tap 100 px higher.
    node.dispatchEvent(pointer("pointerdown", 32, { clientX: 150, clientY: 150, ...mouse }));
    node.dispatchEvent(
      pointer("pointermove", 48, { clientX: 150, clientY: 200, buttons: 1, ...mouse }),
    );
    node.dispatchEvent(pointer("pointerup", 64, { clientX: 150, clientY: 200, ...mouse }));

    expect(log.starts).toHaveLength(1);
    expect(log.ends[0]?.position).toBe(50);
  });
  it("goes quiet once disposed", () => {
    const node = surface();
    const log = recorder();
    const dispose = track(node, { axis: "block", ...log });

    dispose();
    node.dispatchEvent(pointer("pointerdown", 0, { clientX: 150, clientY: 150 }));
    node.dispatchEvent(pointer("pointermove", 16, { clientX: 150, clientY: 200 }));

    expect(log.starts).toHaveLength(0);
  });
});

/**
 * A real mouse, because what is under test is the engine's own click dispatch: a
 * click goes to the nearest common ancestor of the `pointerdown` and `pointerup`
 * targets, and a capture taken at `pointerdown` retargets the `pointerup` to the
 * tracked node — so a link inside it never received its click.
 */
describe("trackDragAxis — a real mouse on a link inside the surface", () => {
  function scene(): { node: HTMLElement; link: HTMLAnchorElement; clicks: EventTarget[] } {
    const node = surface();
    node.innerHTML = `<a href="#drag-axis-link" style="display: block; block-size: 100px">Link</a>`;
    const link = node.querySelector("a") as HTMLAnchorElement;
    const clicks: EventTarget[] = [];
    link.addEventListener("click", (event) => {
      if (event.target !== null) clicks.push(event.target);
      event.preventDefault();
    });
    return { node, link, clicks };
  }

  it("lets a click reach the link", async () => {
    const { link, clicks } = scene();
    const log = recorder();
    const node = link.parentElement as HTMLElement;
    track(node, { axis: "block", ...log });

    await commands.mouse([
      { type: "down", x: 150, y: 150 },
      { type: "up", x: 150, y: 150 },
    ]);

    expect(clicks).toEqual([link]);
    expect(log.starts).toHaveLength(0);
  });

  it("still drives a drag that starts on the link, and swallows the click it leaves", async () => {
    const { node, clicks } = scene();
    const log = recorder();
    const onNodeClick = vi.fn();
    node.addEventListener("click", onNodeClick);
    track(node, { axis: "block", ...log });

    await commands.mouse([
      { type: "down", x: 150, y: 120 },
      { type: "move", x: 150, y: 140 },
      { type: "move", x: 150, y: 160 },
      { type: "move", x: 150, y: 180 },
      { type: "up", x: 150, y: 180 },
    ]);

    expect(log.starts).toHaveLength(1);
    expect(log.drags.length).toBeGreaterThan(0);
    expect(log.ends).toHaveLength(1);
    expect(clicks).toEqual([]);
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});

describe("trackDragAxis — a real mouse leaving a small node", () => {
  it("starts on a first move that lands outside the node beyond the threshold", async () => {
    const node = mount(
      `<div style="position: fixed; inset: 100px auto auto 100px; width: 200px; height: 24px"></div>`,
    ).firstElementChild as HTMLElement;
    const log = recorder();
    track(node, { axis: "block", ...log });

    await commands.mouse([
      { type: "down", x: 150, y: 112 },
      { type: "move", x: 150, y: 152 },
      { type: "move", x: 150, y: 172 },
      { type: "up", x: 150, y: 172 },
    ]);

    expect(log.starts).toHaveLength(1);
    expect(log.drags.at(-1)?.position).toBeCloseTo(60, -1);
    expect(log.ends).toHaveLength(1);
  });
});

describe("trackDragAxis — the browser's own drag-and-drop", () => {
  it.each(["true", "TRUE"])(
    "leaves an element the page made draggable=%s to its drag-and-drop",
    async (value) => {
      const node = surface();
      node.innerHTML = `<div draggable="${value}" style="block-size: 100px">Row</div>`;
      track(node, { axis: "block" });
      const starts: boolean[] = [];
      const onDragStart = (event: DragEvent): void => {
        starts.push(event.defaultPrevented);
      };
      document.addEventListener("dragstart", onDragStart);
      cleanups.push(() => document.removeEventListener("dragstart", onDragStart));

      await commands.mouse([
        { type: "down", x: 150, y: 150 },
        { type: "move", x: 150, y: 170 },
        { type: "move", x: 150, y: 190 },
        { type: "move", x: 150, y: 210 },
        { type: "up", x: 150, y: 210 },
      ]);

      expect(starts).toEqual([false]);
    },
  );
});
describe("trackDragAxis — a release the document never hears", () => {
  it("disarms on a bare hover after a release outside the frame, so the next press starts from its own origin", async () => {
    const node = surface();
    const log = recorder();
    // Wide enough that neither the trip out of the frame nor the hover back is a drag.
    track(node, { axis: "block", threshold: 300, ...log });

    // Released above the test frame: Chromium and WebKit still deliver that
    // `pointerup` to the frame's document, Firefox delivers nothing.
    await commands.mouse([
      { type: "down", x: 150, y: 250 },
      { type: "move", x: 150, y: -40 },
      { type: "up", x: 150, y: -40 },
      { type: "move", x: 150, y: 160 },
    ]);
    expect(log.starts).toHaveLength(0);

    await commands.mouse([
      { type: "down", x: 150, y: 150 },
      { type: "move", x: 150, y: 460 },
      { type: "move", x: 150, y: 480 },
      { type: "up", x: 150, y: 480 },
    ]);
    expect(log.starts).toHaveLength(1);
    expect(log.ends[0]?.position).toBeCloseTo(330, -1);
  });
});
