/**
 * The splitter against a real engine, with no framework at all.
 *
 * `splitter.test.ts` proves the arithmetic with no document in the room. What
 * cannot be faked there is what this file is about: a pointer that captures and
 * keeps steering the panel once it has left the handle, the engine's own click
 * dispatch after a drag, and the seam between `interaction/drag-axis` and the
 * machine, where a sign can be wrong without either side being wrong alone.
 *
 * The sheet is not loaded: a four-line stand-in gives the panel the width the
 * real one reads from `--sui-splitter-size`. What the sheet adds is measured in
 * `packages/styles/src/splitter.browser.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { createIntentBus, type IntentBus } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./splitter.connect";
import { machine } from "./splitter.machine";
import type { SplitterApi, SplitterMachineProps, SplitterSchema } from "./splitter.types";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

type Api = SplitterApi<DomPropTypes>;

/** The scene's own box, in the test iframe's pixels: 380 wide, 100 tall. */
const LEFT = 10;
const TOP = 100;
const WIDTH = 380;

interface SceneOptions {
  readonly dir?: "ltr" | "rtl";
  readonly iframe?: boolean;
  readonly collapsed?: boolean;
}

function markup(options: SceneOptions): string {
  return `
    <style>
      [data-slot="stage"] { position: fixed; inset-block-start: ${TOP}px; inset-inline-start: ${LEFT}px; inline-size: ${WIDTH}px; block-size: 100px; display: flex }
      [data-slot="panel"] { position: relative; flex: none; inline-size: var(--sui-splitter-size, auto); block-size: 100px; background: #ddd }
      [data-slot="handle"] { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 12px; background: #888 }
      [data-slot="rest"] { flex: 1 1 auto }
      [data-slot="cover"] { position: fixed; inset-block-start: ${TOP}px; inset-inline-start: 175px; inline-size: 120px; block-size: 100px; border: 0; z-index: 5 }
    </style>
    <div data-slot="stage" dir="${options.dir ?? "ltr"}">
      <div data-slot="panel"><div data-slot="handle"></div></div>
      <div data-slot="rest"></div>
    </div>
    ${options.iframe === true ? '<iframe data-slot="cover" title="cover" src="about:blank"></iframe>' : ""}`;
}

function render(props: SplitterMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<SplitterSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: "k1",
    props: { unit: "px", min: 80, max: 300, defaultSize: 150, label: "Panel", ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("panel", api.getPanelProps());
      put("handle", api.getHandleProps());
    },
  });
}

type Harness = ReturnType<typeof render>;

const handleBox = (harness: Harness): DOMRect => harness.part("handle").getBoundingClientRect();
const centre = (box: DOMRect): { x: number; y: number } => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});

/**
 * The mouse command maps the iframe's scale back to CSS pixels, and Firefox and
 * WebKit leave a fraction of a pixel on every hundred: the pointer is where the
 * engine put it, so a size is asserted to a pixel and a half, never exactly.
 */
function near(actual: number | undefined, expected: number): void {
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1.5);
}

afterEach(() => {
  unmountAll();
});

describe("splitter — the mouse", () => {
  it("resizes the panel with the pointer, and keeps doing so once it has left the handle", async () => {
    const onSizeChangeEnd = vi.fn();
    const harness = render({ onSizeChangeEnd });
    const panel = harness.part("panel");
    const samples: { width: number; dragging: boolean }[] = [];
    const observer = new MutationObserver(() =>
      samples.push({
        width: panel.getBoundingClientRect().width,
        dragging: panel.hasAttribute("data-dragging"),
      }),
    );
    observer.observe(panel, { attributes: true, attributeFilter: ["style", "data-dragging"] });
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 10, y },
      { type: "move", x: x + 30, y },
      { type: "move", x: x + 50, y: y + 250 },
      { type: "move", x: x + 80, y: y + 250 },
      { type: "up", x: x + 80, y: y + 250 },
    ]);
    observer.disconnect();

    expect(samples.some((sample) => sample.dragging && Math.abs(sample.width - 200) < 1.5)).toBe(
      true,
    );
    near(harness.api().size, 230);
    near(panel.getBoundingClientRect().width, 230);
    expect(harness.api().dragging).toBe(false);
    expect(panel.hasAttribute("data-dragging")).toBe(false);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
    near(onSizeChangeEnd.mock.calls[0]?.[0]?.size, 230);
  });

  it("keeps steering the panel over an iframe, which would otherwise take the moves", async () => {
    const harness = render({}, { iframe: true });
    const { x, y } = centre(handleBox(harness));
    const cover = harness.host.querySelector<HTMLElement>('[data-slot="cover"]');
    expect(cover).not.toBeNull();
    const coverBox = (cover as HTMLElement).getBoundingClientRect();
    expect(x + 40).toBeGreaterThan(coverBox.left);
    expect(x + 40).toBeLessThan(coverBox.right);

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 10, y },
      { type: "move", x: x + 25, y },
      { type: "move", x: x + 40, y },
      { type: "up", x: x + 40, y },
    ]);

    near(harness.api().size, 190);
  });

  it("answers the pointer's direction the other way round under rtl", async () => {
    const harness = render({ dir: "rtl" }, { dir: "rtl" });
    const box = handleBox(harness);
    expect(box.left).toBeGreaterThan(LEFT + WIDTH / 2);
    const { x, y } = centre(box);

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x - 10, y },
      { type: "move", x: x - 40, y },
      { type: "up", x: x - 40, y },
    ]);

    near(harness.api().size, 190);

    await commands.mouse([
      { type: "move", x: x - 40, y },
      { type: "down", x: x - 40, y },
      { type: "move", x: x - 20, y },
      { type: "move", x: x - 10, y },
      { type: "up", x: x - 10, y },
    ]);

    near(harness.api().size, 160);
  });

  it("inherits the direction from the document when no `dir` prop is given, for the pointer", async () => {
    const harness = render({}, { dir: "rtl" });
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x - 10, y },
      { type: "move", x: x - 40, y },
      { type: "up", x: x - 40, y },
    ]);

    near(harness.api().size, 190);
  });

  it("measures a percentage against the container the panel sits in", async () => {
    const harness = render({ unit: "%", min: 10, max: 90, defaultSize: 50 });
    expect(harness.part("panel").getBoundingClientRect().width).toBe(WIDTH / 2);
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 19, y },
      { type: "move", x: x + 38, y },
      { type: "up", x: x + 38, y },
    ]);

    near(harness.api().size, 60);
    near(harness.part("panel").getBoundingClientRect().width, WIDTH * 0.6);
  });

  it("puts the size back when Escape is pressed in the middle of the gesture", async () => {
    const onSizeChangeEnd = vi.fn();
    let pressed = false;
    const harness = render({
      onSizeChangeEnd,
      onSizeChange: ({ size }) => {
        if (size < 190 || pressed) return;
        pressed = true;
        setTimeout(() =>
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          ),
        );
      },
    });
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 20, y },
      { type: "move", x: x + 50, y },
      { type: "move", x: x + 60, y },
      { type: "move", x: x + 70, y },
      { type: "up", x: x + 70, y },
    ]);

    expect(pressed).toBe(true);
    near(harness.api().size, 150);
    expect(harness.api().dragging).toBe(false);
    expect(onSizeChangeEnd).not.toHaveBeenCalled();
  });

  it("swallows the click that ends a drag, and lets a plain press through", async () => {
    const harness = render();
    const handle = harness.part("handle");
    const clicks: Event[] = [];
    handle.addEventListener("click", (event) => clicks.push(event));
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 15, y },
      { type: "move", x: x + 30, y },
      { type: "up", x: x + 30, y },
    ]);
    near(harness.api().size, 180);
    expect(clicks).toHaveLength(0);

    const again = centre(handleBox(harness));
    await commands.mouse([
      { type: "move", x: again.x, y: again.y },
      { type: "down", x: again.x, y: again.y },
      { type: "up", x: again.x, y: again.y },
    ]);
    expect(clicks).toHaveLength(1);
    near(harness.api().size, 180);
  });

  it("folds the panel when the pointer passes halfway to the collapsed size, and brings it back", async () => {
    const folds: boolean[] = [];
    const harness = render({
      collapsible: true,
      collapsedSize: 40,
      min: 100,
      defaultSize: 150,
      onCollapsedChange: ({ collapsed }) => folds.push(collapsed),
    });
    const { x, y } = centre(handleBox(harness));

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x - 20, y },
      { type: "move", x: x - 90, y },
      { type: "move", x: x - 30, y },
      { type: "up", x: x - 30, y },
    ]);

    expect(folds).toEqual([true, false]);
    expect(harness.api().collapsed).toBe(false);
    near(harness.api().size, 120);
  });
});

describe("splitter — the keyboard and the double click, in a real document", () => {
  it("moves by a step on an arrow of its axis, ignores the other axis", async () => {
    const harness = render();
    const handle = harness.part("handle");
    handle.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(harness.api().size).toBe(160);
    await userEvent.keyboard("{ArrowUp}");
    expect(harness.api().size).toBe(160);
    await userEvent.keyboard("{Home}");
    expect(harness.api().size).toBe(80);
    await userEvent.keyboard("{End}");
    expect(harness.api().size).toBe(300);
  });

  it("inherits the direction from the document when no `dir` prop is given, for the arrows", async () => {
    const harness = render({}, { dir: "rtl" });
    harness.part("handle").focus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(harness.api().size).toBe(160);
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowRight}");
    expect(harness.api().size).toBe(140);
  });

  it("goes back to the default size on a double click", async () => {
    const harness = render();
    const handle = harness.part("handle");
    handle.focus();
    await userEvent.keyboard("{End}");
    expect(harness.api().size).toBe(300);

    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(harness.api().size).toBe(150);
  });

  it("folds and unfolds on Enter only when it can collapse", async () => {
    const fixed = render();
    fixed.part("handle").focus();
    await userEvent.keyboard("{Enter}");
    expect(fixed.api().collapsed).toBe(false);
    unmountAll();

    const folding = render({ collapsible: true, collapsedSize: 40 });
    folding.part("handle").focus();
    await userEvent.keyboard("{Enter}");
    expect(folding.api().collapsed).toBe(true);
    expect(folding.part("panel").getBoundingClientRect().width).toBe(40);
    await userEvent.keyboard("{Enter}");
    expect(folding.api().collapsed).toBe(false);
    expect(folding.part("panel").getBoundingClientRect().width).toBe(150);
  });
});

describe("splitter — the pad", () => {
  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  function takeFocus(harness: Harness): void {
    harness.part("handle").focus();
    if (harness.service.state.get() !== "focused") harness.service.send({ type: "HANDLE.FOCUS" });
  }

  function padScene(): { bus: IntentBus; harness: Harness } {
    const bus = createIntentBus();
    const harness = render({ intents: bus });
    return { bus, harness };
  }

  it("takes hold on A, adjusts on the d-pad, and gives the size back on B", () => {
    const { bus, harness } = padScene();
    takeFocus(harness);

    pad(bus, "select");
    expect(harness.part("handle").hasAttribute("data-engaged")).toBe(true);

    pad(bus, "moveRight");
    pad(bus, "moveRight");
    expect(harness.api().size).toBe(170);

    pad(bus, "back");
    expect(harness.api().size).toBe(150);
    expect(harness.part("handle").hasAttribute("data-engaged")).toBe(false);
  });

  it("leaves the pad alone until A has been pressed", () => {
    const { bus, harness } = padScene();
    takeFocus(harness);

    pad(bus, "moveRight");

    expect(harness.api().size).toBe(150);
  });
});
