/**
 * The scroll-area against a real engine, with no framework at all.
 *
 * `scroll-area.test.ts` proves the arithmetic with no document in the room. What
 * cannot be faked there is what this file is about: a wheel and a key that scroll
 * natively and move the thumb, a pointer that captures and keeps steering the
 * scroll once it has left the bar, the real RTL `scrollLeft`, a content that changes
 * size under the observer, and the warning about a tab stop nobody named.
 *
 * The sheet is not loaded: a stand-in places the bars and the thumbs the way the
 * real one does, from the two custom properties. What the sheet adds is measured in
 * `packages/styles/src/scroll-area.browser.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./scroll-area.connect";
import { machine } from "./scroll-area.machine";
import type { ScrollAreaApi, ScrollAreaMachineProps, ScrollAreaSchema } from "./scroll-area.types";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
    wheel: (x: number, y: number, deltaX: number, deltaY: number) => Promise<void>;
  }
}

type Api = ScrollAreaApi<DomPropTypes>;

const LEFT = 10;
const TOP = 100;
const SIZE = 200;
const LONG = 1000;
const RANGE = LONG - SIZE;
const TRACK = SIZE - 6;
const THUMB = (TRACK * SIZE) / LONG;
const TRAVEL = TRACK - THUMB;

const OFFSET = "--sui-scroll-area-thumb-offset";
const THUMB_SIZE = "--sui-scroll-area-thumb-size";

interface SceneOptions {
  readonly dir?: "ltr" | "rtl";
  readonly contentX?: number;
  readonly contentY?: number;
  readonly focusable?: boolean;
  readonly field?: boolean;
  readonly id?: string;
  readonly shadow?: boolean;
  readonly onPaint?: () => void;
}

function markup(options: SceneOptions): string {
  const { contentX = SIZE, contentY = LONG, focusable = false, field = false } = options;
  return `
    <style>
      [data-slot="root"] { position: fixed; inset-block-start: ${TOP}px; inset-inline-start: ${LEFT}px; inline-size: ${SIZE}px; block-size: ${SIZE}px }
      [data-slot="viewport"] { box-sizing: border-box; inline-size: ${SIZE}px; block-size: ${SIZE}px; overflow: auto; scrollbar-width: none }
      [data-slot="content"] { inline-size: ${contentX}px; block-size: ${contentY}px }
      [data-slot="bar-y"] { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 12px; background: #eee }
      [data-slot="bar-x"] { position: absolute; inset-inline: 0; inset-block-end: 0; block-size: 12px; background: #eee }
      [data-slot="thumb-y"] { position: absolute; inset-inline-end: 3px; inline-size: 6px; inset-block-start: calc(var(${OFFSET}, 0px) + 3px); block-size: var(${THUMB_SIZE}, 0px); background: #444; touch-action: none }
      [data-slot="thumb-x"] { position: absolute; inset-block-end: 3px; block-size: 6px; inset-inline-start: calc(var(${OFFSET}, 0px) + 3px); inline-size: var(${THUMB_SIZE}, 0px); background: #444; touch-action: none }
    </style>
    <div data-slot="root" dir="${options.dir ?? "ltr"}">
      <div data-slot="viewport"><div data-slot="content">${focusable ? "<button>Inside</button>" : ""}${field ? '<input data-slot="field" aria-label="Field">' : ""}</div></div>
      <div data-slot="bar-y"><div data-slot="thumb-y"></div></div>
      <div data-slot="bar-x"><div data-slot="thumb-x"></div></div>
    </div>`;
}

function render(props: ScrollAreaMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<ScrollAreaSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: options.id ?? "sa1",
    shadow: options.shadow,
    props: { orientation: "both", label: "Log", dir: options.dir, ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("root", api.getRootProps());
      put("viewport", api.getViewportProps());
      put("content", api.getContentProps());
      put("bar-y", api.getScrollbarProps({ orientation: "vertical" }));
      put("thumb-y", api.getThumbProps({ orientation: "vertical" }));
      put("bar-x", api.getScrollbarProps({ orientation: "horizontal" }));
      put("thumb-x", api.getThumbProps({ orientation: "horizontal" }));
      options.onPaint?.();
    },
  });
}

type Harness = ReturnType<typeof render>;

const slot = (harness: Harness, name: string): HTMLElement => {
  const node = harness.host.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}"`);
  return node;
};

const readPx = (node: HTMLElement, property: string): number =>
  Number.parseFloat(node.style.getPropertyValue(property));

const thumbOffset = (harness: Harness, axis: "x" | "y"): number =>
  readPx(slot(harness, `thumb-${axis}`), OFFSET);

const thumbLength = (harness: Harness, axis: "x" | "y"): number =>
  readPx(slot(harness, `thumb-${axis}`), THUMB_SIZE);

const centre = (box: DOMRect): { x: number; y: number } => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});

function near(actual: number | undefined, expected: number, within = 1.5): void {
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(within);
}

async function measured(harness: Harness): Promise<void> {
  await vi.waitFor(() => expect(thumbLength(harness, "y")).toBeGreaterThan(0));
}

function frames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function takeFocus(node: HTMLElement): void {
  if (!document.hasFocus()) window.focus();
  node.focus();
}

afterEach(() => {
  unmountAll();
});

describe("scroll-area — the native scroll moves the thumb", () => {
  it("sizes the thumb from the measure the observers took", async () => {
    const harness = render();
    await measured(harness);

    near(thumbLength(harness, "y"), THUMB, 0.1);
    near(thumbOffset(harness, "y"), 0, 0.01);
    expect(slot(harness, "bar-y").getAttribute("data-state")).toBe("visible");
    expect(slot(harness, "bar-x").getAttribute("data-state")).toBe("hidden");
  });

  it("follows a wheel turned over the viewport", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    const { x, y } = centre(viewport.getBoundingClientRect());

    await commands.wheel(x, y, 0, 300);
    await vi.waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));
    await vi.waitFor(() =>
      near(thumbOffset(harness, "y"), (TRAVEL * viewport.scrollTop) / RANGE, 0.05),
    );

    expect(thumbOffset(harness, "y")).toBeGreaterThan(0);
  });

  it("follows the keys of a focused viewport, which scroll it natively", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    expect(viewport.getAttribute("tabindex")).toBe("0");
    takeFocus(viewport);

    await userEvent.keyboard("{PageDown}");
    await vi.waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));
    await vi.waitFor(() =>
      near(thumbOffset(harness, "y"), (TRAVEL * viewport.scrollTop) / RANGE, 0.05),
    );

    await userEvent.keyboard("{End}");
    await vi.waitFor(() => near(viewport.scrollTop, RANGE, 1));
    await vi.waitFor(() => near(thumbOffset(harness, "y"), TRAVEL, 0.5));

    await userEvent.keyboard("{Home}");
    await vi.waitFor(() => expect(viewport.scrollTop).toBe(0));
    await vi.waitFor(() => near(thumbOffset(harness, "y"), 0, 0.01));
  });

  it("goes back to idle once the delay has passed", async () => {
    const harness = render({ hideDelay: 80 });
    await measured(harness);
    const viewport = slot(harness, "viewport");

    viewport.scrollTop = 100;
    await vi.waitFor(() => expect(slot(harness, "root").hasAttribute("data-scrolling")).toBe(true));
    await vi.waitFor(() =>
      expect(slot(harness, "root").hasAttribute("data-scrolling")).toBe(false),
    );
  });
});

describe("scroll-area — the thumb under a real pointer", () => {
  it("scrolls with a drag, and keeps doing so once the pointer has left the bar", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    const bar = slot(harness, "bar-y");
    const { x, y } = centre(slot(harness, "thumb-y").getBoundingClientRect());

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x, y: y + 10 },
      { type: "move", x: x - 60, y: y + 30 },
      { type: "move", x: x - 90, y: y + 50 },
    ]);
    await vi.waitFor(() => expect(bar.hasAttribute("data-dragging")).toBe(true));
    expect(harness.api().dragging).toBe(true);
    expect(x - 90).toBeLessThan(bar.getBoundingClientRect().left);

    await commands.mouse([{ type: "up", x: x - 90, y: y + 50 }]);
    await vi.waitFor(() => expect(bar.hasAttribute("data-dragging")).toBe(false));

    near(viewport.scrollTop, (50 * RANGE) / TRAVEL, 12);
    near(thumbOffset(harness, "y"), 50, 2);
    expect(harness.api().dragging).toBe(false);
  });

  it("drags the horizontal thumb of a line that runs left to right", async () => {
    const harness = render({}, { contentX: LONG, contentY: SIZE });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const viewport = slot(harness, "viewport");
    const { x, y } = centre(slot(harness, "thumb-x").getBoundingClientRect());

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 10, y },
      { type: "move", x: x + 30, y: y - 60 },
      { type: "move", x: x + 50, y: y - 80 },
      { type: "up", x: x + 50, y: y - 80 },
    ]);
    await vi.waitFor(() => expect(viewport.scrollLeft).toBeGreaterThan(0));

    near(viewport.scrollLeft, (50 * RANGE) / TRAVEL, 12);
    near(thumbOffset(harness, "x"), 50, 2);
  });

  it("drags the horizontal thumb of a line that runs right to left, against a negative scrollLeft", async () => {
    const harness = render({}, { dir: "rtl", contentX: LONG, contentY: SIZE });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const viewport = slot(harness, "viewport");
    const before = slot(harness, "thumb-x").getBoundingClientRect();
    const { x, y } = centre(before);

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x - 10, y },
      { type: "move", x: x - 30, y: y - 60 },
      { type: "move", x: x - 50, y: y - 80 },
      { type: "up", x: x - 50, y: y - 80 },
    ]);
    await vi.waitFor(() => expect(viewport.scrollLeft).toBeLessThan(0));

    near(Math.abs(viewport.scrollLeft), (50 * RANGE) / TRAVEL, 12);
    near(thumbOffset(harness, "x"), 50, 2);
    near(before.left - slot(harness, "thumb-x").getBoundingClientRect().left, 50, 2.5);
  });

  it("jumps a page when the track is pressed beyond the thumb, and back when pressed before it", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    const thumb = slot(harness, "thumb-y").getBoundingClientRect();
    const x = thumb.left + thumb.width / 2;

    await commands.mouse([
      { type: "move", x, y: thumb.bottom + 30 },
      { type: "down", x, y: thumb.bottom + 30 },
      { type: "up", x, y: thumb.bottom + 30 },
    ]);
    await vi.waitFor(() => near(viewport.scrollTop, SIZE, 1));

    const moved = slot(harness, "thumb-y").getBoundingClientRect();
    await commands.mouse([
      { type: "move", x, y: moved.top - 10 },
      { type: "down", x, y: moved.top - 10 },
      { type: "up", x, y: moved.top - 10 },
    ]);
    await vi.waitFor(() => expect(viewport.scrollTop).toBe(0));
    near(thumbOffset(harness, "y"), 0, 0.01);
  });

  it("does not page when the press lands in the margin beside the thumb", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    const thumb = slot(harness, "thumb-y").getBoundingClientRect();
    const y = thumb.top + thumb.height / 2;

    for (const x of [thumb.right + 1, thumb.left - 1]) {
      await commands.mouse([
        { type: "move", x, y },
        { type: "down", x, y },
        { type: "up", x, y },
      ]);
      expect(viewport.scrollTop).toBe(0);
    }
  });

  it("takes a press in the margin beside the thumb for a grip on the thumb", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    const thumb = slot(harness, "thumb-y").getBoundingClientRect();
    const x = thumb.right + 1;
    const y = thumb.top + thumb.height / 2;

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x, y: y + 10 },
      { type: "move", x: x - 60, y: y + 30 },
      { type: "move", x: x - 60, y: y + 50 },
      { type: "up", x: x - 60, y: y + 50 },
    ]);
    await vi.waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));

    near(viewport.scrollTop, (50 * RANGE) / TRAVEL, 12);
  });

  it("does not page when the press lands beside the horizontal thumb", async () => {
    const harness = render({}, { contentX: LONG, contentY: SIZE });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const viewport = slot(harness, "viewport");
    const thumb = slot(harness, "thumb-x").getBoundingClientRect();
    const x = thumb.left + thumb.width / 2;

    await commands.mouse([
      { type: "move", x, y: thumb.top - 1 },
      { type: "down", x, y: thumb.top - 1 },
      { type: "up", x, y: thumb.top - 1 },
    ]);

    expect(viewport.scrollLeft).toBe(0);
  });

  it("pages towards the line's end in a right-to-left area", async () => {
    const harness = render({}, { dir: "rtl", contentX: LONG, contentY: SIZE });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const viewport = slot(harness, "viewport");
    const thumb = slot(harness, "thumb-x").getBoundingClientRect();
    const y = thumb.top + thumb.height / 2;
    const at = thumb.left - 30;

    await commands.mouse([
      { type: "move", x: at, y },
      { type: "down", x: at, y },
      { type: "up", x: at, y },
    ]);

    await vi.waitFor(() => near(viewport.scrollLeft, -SIZE, 1));
  });

  it("marks only the bar under the pointer", async () => {
    const harness = render({}, { contentX: LONG, contentY: LONG });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const { x, y } = centre(slot(harness, "bar-y").getBoundingClientRect());

    await commands.mouse([
      { type: "move", x: x - 80, y },
      { type: "move", x, y },
    ]);

    await vi.waitFor(() => expect(slot(harness, "bar-y").hasAttribute("data-hovering")).toBe(true));
    expect(slot(harness, "bar-x").hasAttribute("data-hovering")).toBe(false);
  });
});

describe("scroll-area — a press on the bar is not a press on the page", () => {
  async function pressWith(harness: Harness, target: "thumb" | "track"): Promise<HTMLElement> {
    await measured(harness);
    const field = slot(harness, "field");
    takeFocus(field);
    expect(document.activeElement).toBe(field);
    const thumb = slot(harness, "thumb-y").getBoundingClientRect();
    const x = thumb.left + thumb.width / 2;
    const y = target === "thumb" ? thumb.top + thumb.height / 2 : thumb.bottom + 30;

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "up", x, y },
    ]);
    return field;
  }

  it("keeps the focus where it is when the thumb is pressed", async () => {
    const harness = render({}, { field: true });
    const field = await pressWith(harness, "thumb");

    expect(document.activeElement).toBe(field);
  });

  it("keeps the focus where it is when the track is pressed", async () => {
    const harness = render({}, { field: true });
    const field = await pressWith(harness, "track");

    expect(slot(harness, "viewport").scrollTop).toBeGreaterThan(0);
    expect(document.activeElement).toBe(field);
  });

  it("cancels the compatibility events of a mouse press on the bar, and leaves those of a pen and a finger alone", async () => {
    const harness = render();
    await measured(harness);
    const thumb = slot(harness, "thumb-y").getBoundingClientRect();
    const x = thumb.left + thumb.width / 2;
    const y = thumb.bottom + 30;
    const press = (pointerType: string): boolean => {
      const event = new PointerEvent("pointerdown", {
        pointerType,
        button: 0,
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      slot(harness, "bar-y").dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(press("mouse")).toBe(true);
    expect(press("pen")).toBe(false);
    expect(press("touch")).toBe(false);
  });

  it("resolves the writing direction once for a drag, not on every move", async () => {
    const harness = render({ dir: undefined }, { contentX: LONG, contentY: SIZE });
    await vi.waitFor(() => expect(thumbLength(harness, "x")).toBeGreaterThan(0));
    const { x, y } = centre(slot(harness, "thumb-x").getBoundingClientRect());
    const resolve = vi.spyOn(window, "getComputedStyle");

    try {
      await commands.mouse([
        { type: "move", x, y },
        { type: "down", x, y },
        { type: "move", x: x + 10, y },
      ]);
      await vi.waitFor(() => expect(harness.api().dragging).toBe(true));
      resolve.mockClear();

      await commands.mouse([
        { type: "move", x: x + 20, y },
        { type: "move", x: x + 30, y },
        { type: "move", x: x + 40, y },
        { type: "move", x: x + 50, y },
      ]);
      await vi.waitFor(() => near(thumbOffset(harness, "x"), 50, 2));

      expect(resolve).not.toHaveBeenCalled();
    } finally {
      resolve.mockRestore();
      await commands.mouse([{ type: "up", x: x + 50, y }]);
    }
  });
});

describe("scroll-area — one scroll per frame reaches the machine", () => {
  it("sends the last offset of a burst once, on the next frame", async () => {
    let paints = 0;
    const harness = render({}, { onPaint: () => (paints += 1) });
    await measured(harness);
    await frames();
    const viewport = slot(harness, "viewport");
    const before = paints;

    for (const top of [50, 100, 150, 200, 250]) {
      viewport.scrollTop = top;
      viewport.dispatchEvent(new Event("scroll"));
    }

    expect(paints).toBe(before);
    await vi.waitFor(() => near(thumbOffset(harness, "y"), (TRAVEL * 250) / RANGE, 0.5));
    expect(paints - before).toBeLessThanOrEqual(2);
  });
});

describe("scroll-area — a content that changes size", () => {
  it("resizes the thumb, and drops it when nothing overflows any more", async () => {
    const harness = render();
    await measured(harness);
    const content = slot(harness, "content");

    content.style.blockSize = "2000px";
    await vi.waitFor(() => near(thumbLength(harness, "y"), (TRACK * SIZE) / 2000, 0.1));
    expect(slot(harness, "root").hasAttribute("data-overflow-y")).toBe(true);

    content.style.blockSize = "150px";
    await vi.waitFor(() => expect(thumbLength(harness, "y")).toBe(0));
    expect(slot(harness, "root").hasAttribute("data-overflow-y")).toBe(false);
    expect(slot(harness, "viewport").hasAttribute("tabindex")).toBe(false);
  });

  it("gives the tab stop up to a button that arrives, and takes it back when it leaves", async () => {
    const harness = render();
    await measured(harness);
    const content = slot(harness, "content");
    const viewport = slot(harness, "viewport");
    expect(viewport.getAttribute("tabindex")).toBe("0");

    const button = document.createElement("button");
    button.textContent = "Inside";
    content.append(button);
    await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
    expect(viewport.hasAttribute("role")).toBe(false);

    button.remove();
    await vi.waitFor(() => expect(viewport.getAttribute("tabindex")).toBe("0"));
    expect(viewport.getAttribute("role")).toBe("region");
  });

  it("follows a button that a class or a style shows and hides", async () => {
    const harness = render();
    await measured(harness);
    const content = slot(harness, "content");
    const viewport = slot(harness, "viewport");
    const sheet = document.createElement("style");
    sheet.textContent = ".r116-gone { display: none }";
    document.head.append(sheet);
    const button = document.createElement("button");
    button.textContent = "Inside";
    button.className = "r116-gone";
    content.append(button);
    try {
      await frames();
      expect(viewport.getAttribute("tabindex")).toBe("0");

      button.className = "";
      await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
      button.style.display = "none";
      await vi.waitFor(() => expect(viewport.getAttribute("tabindex")).toBe("0"));
      button.style.display = "";
      await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
    } finally {
      sheet.remove();
    }
  });

  it("stops at the first tab stop instead of weighing every focusable of the content", async () => {
    const harness = render();
    await measured(harness);
    const content = slot(harness, "content");
    for (let index = 0; index < 50; index++) {
      const button = document.createElement("button");
      button.textContent = `Row ${index}`;
      content.append(button);
    }
    await vi.waitFor(() => expect(harness.service.context.get("hasFocusable")).toBe(true));
    const checks = vi.spyOn(Element.prototype, "checkVisibility");
    try {
      content.append(document.createElement("span"));
      await frames();
      expect(checks.mock.calls.length).toBeGreaterThan(0);
      expect(checks.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      checks.mockRestore();
    }
  });
});

describe("scroll-area — the viewport alone changes size", () => {
  it("sizes the thumb again when the view shrinks and the content stays", async () => {
    const harness = render();
    await measured(harness);
    await frames();

    slot(harness, "viewport").style.blockSize = "150px";
    await vi.waitFor(() => near(thumbLength(harness, "y"), (144 * 150) / LONG, 0.1));
  });
});

describe("scroll-area — the tab stop is kept while the viewport holds the focus", () => {
  it("keeps the stop, the role and the focus when a button arrives, and drops them on blur", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    takeFocus(viewport);
    expect(document.activeElement).toBe(viewport);

    const button = document.createElement("button");
    button.textContent = "Inside";
    slot(harness, "content").append(button);
    await vi.waitFor(() => expect(harness.service.context.get("hasFocusable")).toBe(true));
    await frames();

    expect(viewport.getAttribute("tabindex")).toBe("0");
    expect(viewport.getAttribute("role")).toBe("region");
    expect(document.activeElement).toBe(viewport);

    viewport.blur();
    await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
    expect(viewport.hasAttribute("role")).toBe(false);
  });

  it("keeps the stop when the content stops overflowing under the focus, and drops it on blur", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    takeFocus(viewport);

    slot(harness, "content").style.blockSize = "150px";
    await vi.waitFor(() => expect(thumbLength(harness, "y")).toBe(0));
    await frames();

    expect(viewport.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(viewport);

    viewport.blur();
    await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
  });

  it("keeps the stop when the window loses the focus, which blurs the viewport while it stays the active element", async () => {
    const harness = render();
    await measured(harness);
    const viewport = slot(harness, "viewport");
    takeFocus(viewport);

    const button = document.createElement("button");
    button.textContent = "Inside";
    slot(harness, "content").append(button);
    await vi.waitFor(() => expect(harness.service.context.get("hasFocusable")).toBe(true));

    viewport.dispatchEvent(new FocusEvent("blur"));
    await frames();

    expect(document.activeElement).toBe(viewport);
    expect(viewport.getAttribute("tabindex")).toBe("0");
    expect(viewport.getAttribute("role")).toBe("region");
  });

  async function focusedWithButton(
    options: SceneOptions = {},
  ): Promise<{ harness: Harness; viewport: HTMLElement }> {
    const harness = render({}, options);
    await measured(harness);
    const viewport = slot(harness, "viewport");
    takeFocus(viewport);
    const button = document.createElement("button");
    button.textContent = "Inside";
    slot(harness, "content").append(button);
    await vi.waitFor(() => expect(harness.service.context.get("hasFocusable")).toBe(true));
    await frames();
    expect(harness.service.context.get("viewportFocused")).toBe(true);
    expect(viewport.getAttribute("tabindex")).toBe("0");
    return { harness, viewport };
  }

  it("drops the stop when the focused viewport is hidden", async () => {
    const { harness, viewport } = await focusedWithButton();
    viewport.style.display = "none";
    await frames();
    viewport.style.display = "";
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));
    expect(document.activeElement).not.toBe(viewport);
    expect(viewport.hasAttribute("tabindex")).toBe(false);
  });

  it("drops the stop when an ancestor of the focused viewport is hidden", async () => {
    const { harness, viewport } = await focusedWithButton();
    const root = slot(harness, "root");
    root.hidden = true;
    await frames();
    root.hidden = false;
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));
    expect(viewport.hasAttribute("tabindex")).toBe(false);
  });

  it("drops the stop when the focused viewport is taken out of the page and put back", async () => {
    const { harness, viewport } = await focusedWithButton();
    const root = slot(harness, "root");
    viewport.remove();
    await frames();
    root.prepend(viewport);
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));
    expect(document.activeElement).not.toBe(viewport);
    await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
  });

  it("keeps the stop when the window loses the focus and the page then changes", async () => {
    const { harness, viewport } = await focusedWithButton();
    viewport.dispatchEvent(new FocusEvent("blur"));
    const elsewhere = document.createElement("div");
    document.body.append(elsewhere);
    await frames();
    elsewhere.remove();

    expect(harness.service.context.get("viewportFocused")).toBe(true);
    expect(viewport.getAttribute("tabindex")).toBe("0");
  });

  it("drops the stop again after a second focus and a second removal", async () => {
    const { harness, viewport } = await focusedWithButton();
    const root = slot(harness, "root");
    viewport.remove();
    root.prepend(viewport);
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));

    const button = slot(harness, "content").querySelector("button");
    button?.remove();
    await vi.waitFor(() => expect(viewport.getAttribute("tabindex")).toBe("0"));
    takeFocus(viewport);
    expect(harness.service.context.get("viewportFocused")).toBe(true);
    if (button !== null && button !== undefined) slot(harness, "content").append(button);
    await vi.waitFor(() => expect(harness.service.context.get("hasFocusable")).toBe(true));
    viewport.remove();
    root.prepend(viewport);
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));
  });

  it("keeps the stop of a viewport focused inside a shadow root while the page changes", async () => {
    const { harness, viewport } = await focusedWithButton({ shadow: true });
    expect((viewport.getRootNode() as ShadowRoot).activeElement).toBe(viewport);
    const elsewhere = document.createElement("div");
    document.body.append(elsewhere);
    await frames();
    elsewhere.remove();

    expect(harness.service.context.get("viewportFocused")).toBe(true);
    expect(viewport.getAttribute("tabindex")).toBe("0");
  });

  it("drops the stop when a viewport focused inside a shadow root is taken out and put back", async () => {
    const { harness, viewport } = await focusedWithButton({ shadow: true });
    const root = slot(harness, "root");
    viewport.remove();
    await frames();
    root.prepend(viewport);
    await vi.waitFor(() => expect(harness.service.context.get("viewportFocused")).toBe(false));
    await vi.waitFor(() => expect(viewport.hasAttribute("tabindex")).toBe(false));
  });
});

describe("scroll-area — the name, in development", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const anonymous = (): boolean =>
    warn.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes("takes focus with no accessible name"),
    );

  it("warns about a viewport that takes focus and that nobody named", async () => {
    render({ label: undefined });

    await vi.waitFor(() => expect(anonymous()).toBe(true));
  });

  it("stays quiet when a label, a labelledBy, or a focusable inside gives it no stop to name", async () => {
    render({ label: "Log" }, { id: "named" });
    render({ label: undefined, labelledBy: "heading" }, { id: "referenced" });
    render({ label: undefined }, { id: "busy", focusable: true });
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(anonymous()).toBe(false);
  });
});
