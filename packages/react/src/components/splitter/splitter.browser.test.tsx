/**
 * The splitter through React: the panel and the handle, the size that reaches the
 * panel through the CSSOM and never through `style=`, the pad on the real input
 * system, the first paint against hydration — and axe over the matrix the DoD asks
 * for.
 *
 * The machine is proved in `packages/core/src/components/splitter`, the pointer on
 * a real engine in `splitter.browser.test.ts` beside it, and the sheet in
 * `packages/styles/src/splitter.browser.test.ts`. What is here is what only the
 * adapter can get wrong.
 */

import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { act, StrictMode, useEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import {
  expectNoAxeViolations,
  fire,
  mount,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { DialogContent, DialogPortal, DialogRoot } from "../dialog/dialog";
import { Splitter } from "./composed";
import { SplitterHandle, SplitterPanel, SplitterRoot, type SplitterRootProps } from "./splitter";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

const SIZE = "--sui-splitter-size";

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="splitter:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

function key(node: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  fire(() => node.dispatchEvent(event));
  return event;
}

const Side = (props: Partial<SplitterRootProps>): React.ReactNode => (
  <Splitter
    label="Sidebar"
    unit="px"
    min={180}
    max={360}
    defaultSize={196}
    collapsible
    collapsedSize={56}
    {...props}
  >
    <p>Navigation</p>
  </Splitter>
);

afterEach(() => {
  unmountAll();
});

describe("Splitter", () => {
  it("renders a panel and a separator that points at it, named and valued", () => {
    const { container } = mount(<Side />);
    const panel = part(container, "panel");
    const handle = part(container, "handle");

    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-label")).toBe("Sidebar");
    expect(handle.getAttribute("aria-controls")).toBe(panel.id);
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("196");
    expect(handle.getAttribute("aria-valuemin")).toBe("56");
    expect(handle.getAttribute("aria-valuemax")).toBe("360");
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.parentElement).toBe(panel);
  });

  it("writes the size on the panel through the CSSOM, and leaves no style attribute in the markup", () => {
    const html = renderToString(<Side />);
    expect(html).not.toMatch(/ style=/);
    expect(html).not.toContain(SIZE);

    const { container } = mount(<Side />);
    const panel = part(container, "panel");

    expect(panel.style.getPropertyValue(SIZE)).toBe("196px");
  });

  it("follows the keyboard: the panel's property moves with the separator's value", () => {
    const onSizeChangeEnd = vi.fn();
    const { container } = mount(<Side onSizeChangeEnd={onSizeChangeEnd} />);
    const panel = part(container, "panel");
    const handle = part(container, "handle");

    expect(key(handle, { key: "ArrowRight" }).defaultPrevented).toBe(true);
    expect(panel.style.getPropertyValue(SIZE)).toBe("206px");
    expect(handle.getAttribute("aria-valuenow")).toBe("206");

    expect(key(handle, { key: "ArrowUp" }).defaultPrevented).toBe(false);
    expect(panel.style.getPropertyValue(SIZE)).toBe("206px");

    key(handle, { key: "Home" });
    expect(panel.style.getPropertyValue(SIZE)).toBe("56px");
    key(handle, { key: "End" });
    expect(panel.style.getPropertyValue(SIZE)).toBe("360px");
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(3);
  });

  it("reports the size just written to `onSizeChangeEnd` when the parent holds the size", () => {
    const ends: number[] = [];
    const Controlled = (): React.ReactNode => {
      const [size, setSize] = useState(196);
      return (
        <Side
          collapsible={false}
          size={size}
          onSizeChange={(details) => setSize(details.size)}
          onSizeChangeEnd={(details) => ends.push(details.size)}
        />
      );
    };
    const { container } = mount(<Controlled />);
    const panel = part(container, "panel");
    const handle = part(container, "handle");

    key(handle, { key: "ArrowRight" });
    key(handle, { key: "ArrowRight" });
    expect(panel.style.getPropertyValue(SIZE)).toBe("216px");
    key(handle, { key: "Home" });
    key(handle, { key: "End" });
    fire(() => handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));

    expect(ends).toEqual([206, 216, 180, 360, 196]);
    expect(panel.style.getPropertyValue(SIZE)).toBe("196px");
  });

  it("folds on Enter to the collapsed size and marks the fold a rail", () => {
    const { container } = mount(<Side />);
    const panel = part(container, "panel");
    const handle = part(container, "handle");

    key(handle, { key: "Enter" });

    expect(panel.style.getPropertyValue(SIZE)).toBe("56px");
    expect(panel.hasAttribute("data-collapsed")).toBe(true);
    expect(panel.hasAttribute("data-rail")).toBe(true);
    expect(handle.hasAttribute("data-rail")).toBe(true);
    expect(handle.getAttribute("aria-valuenow")).toBe("56");

    key(handle, { key: "Enter" });
    expect(panel.hasAttribute("data-collapsed")).toBe(false);
    expect(panel.hasAttribute("data-rail")).toBe(false);
    expect(panel.style.getPropertyValue(SIZE)).toBe("196px");
  });

  it("marks a fold to nothing as collapsed and not as a rail", () => {
    const { container } = mount(<Side collapsedSize={0} defaultCollapsed />);
    const panel = part(container, "panel");

    expect(panel.hasAttribute("data-collapsed")).toBe(true);
    expect(panel.hasAttribute("data-rail")).toBe(false);
    expect(part(container, "handle").hasAttribute("data-rail")).toBe(false);
  });

  it("puts the handle first when the panel is on the end side", () => {
    const { container } = mount(<Side panelSide="end" />);
    const panel = part(container, "panel");

    expect(panel.firstElementChild).toBe(part(container, "handle"));
  });

  it("gives a panel its own element at the level of the parts", () => {
    const { container } = mount(
      <SplitterRoot label="Rail" unit="px" max={300} defaultSize={120}>
        <SplitterPanel render={<nav aria-label="Library" />}>
          <SplitterHandle />
        </SplitterPanel>
      </SplitterRoot>,
    );

    expect(part(container, "panel").tagName).toBe("NAV");
    expect(part(container, "panel").style.getPropertyValue(SIZE)).toBe("120px");
  });
});

describe("Splitter with a mouse", () => {
  it("resizes the panel with a real drag and reports the end of the gesture once", async () => {
    const onSizeChangeEnd = vi.fn();
    const { container } = mount(
      <div>
        <style>{`[data-part~="splitter:panel"] { position: relative; flex: none; inline-size: var(${SIZE}, auto); block-size: 100px } [data-part~="splitter:handle"] { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 12px; background: #888 }`}</style>
        <div
          style={{
            position: "fixed",
            insetBlockStart: 100,
            insetInlineStart: 10,
            inlineSize: 380,
            blockSize: 100,
            display: "flex",
          }}
        >
          <Side collapsible={false} onSizeChangeEnd={onSizeChangeEnd} />
        </div>
      </div>,
    );
    await settle();
    const handle = part(container, "handle");
    const box = handle.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 10, y },
      { type: "move", x: x + 20, y },
      { type: "up", x: x + 20, y },
    ]);

    const size = Number.parseFloat(part(container, "panel").style.getPropertyValue(SIZE));
    expect(Math.abs(size - 216)).toBeLessThan(1.5);
    expect(onSizeChangeEnd).toHaveBeenCalledTimes(1);
  });

  const STAGE = `
    [data-part~="splitter:panel"] { position: relative; flex: none; background: #ddd }
    [data-part~="splitter:panel"][data-orientation="horizontal"] { inline-size: var(${SIZE}, auto); block-size: 100px }
    [data-part~="splitter:panel"][data-orientation="vertical"] { block-size: var(${SIZE}, auto); inline-size: 100px }
    [data-part~="splitter:handle"] { position: absolute; background: #888 }
    [data-part~="splitter:handle"][data-orientation="horizontal"] { inset-block: 0; inline-size: 12px }
    [data-part~="splitter:handle"][data-orientation="horizontal"][data-side="start"] { inset-inline-end: 0 }
    [data-part~="splitter:handle"][data-orientation="horizontal"][data-side="end"] { inset-inline-start: 0 }
    [data-part~="splitter:handle"][data-orientation="vertical"] { inset-inline: 0; block-size: 12px; inset-block-end: 0 }
  `;

  function Stage(props: Partial<SplitterRootProps>): React.ReactNode {
    return (
      <div dir={props.dir}>
        <style>{STAGE}</style>
        <div
          style={{
            position: "fixed",
            insetBlockStart: 20,
            insetInlineStart: 10,
            inlineSize: 380,
            blockSize: 380,
            display: "flex",
            flexDirection: props.orientation === "vertical" ? "column" : "row",
            justifyContent: props.panelSide === "end" ? "flex-end" : "flex-start",
          }}
        >
          <Side collapsible={false} {...props} />
        </div>
      </div>
    );
  }

  async function drag(container: HTMLElement, dx: number, dy: number): Promise<number> {
    const box = part(container, "handle").getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + dx / 2, y: y + dy / 2 },
      { type: "move", x: x + dx, y: y + dy },
      { type: "up", x: x + dx, y: y + dy },
    ]);
    return Number.parseFloat(part(container, "panel").style.getPropertyValue(SIZE));
  }

  it("drags along the orientation it has now, not the one it started with", async () => {
    const { container, render } = mount(<Stage orientation="horizontal" />);
    await settle();
    render(<Stage orientation="vertical" />);
    await settle();

    expect(Math.abs((await drag(container, 0, 20)) - 216)).toBeLessThan(1.5);
  });

  it("drags the way the direction reads now, not the way it read at the start", async () => {
    const { container, render } = mount(<Stage dir="ltr" />);
    await settle();
    render(<Stage dir="rtl" />);
    await settle();

    expect(Math.abs((await drag(container, -20, 0)) - 216)).toBeLessThan(1.5);
  });

  it("moves the handle on a panelSide changed at runtime, the same node, still draggable", async () => {
    const { container, render } = mount(<Stage panelSide="start" />);
    await settle();
    const before = part(container, "handle");
    render(<Stage panelSide="end" />);
    await settle();

    expect(part(container, "handle")).toBe(before);
    expect(part(container, "panel").firstElementChild).toBe(before);
    expect(Math.abs((await drag(container, -20, 0)) - 216)).toBeLessThan(1.5);
  });

  it("follows a handle the parts remount after the start", async () => {
    const Parts = (props: { readonly generation: number }): React.ReactNode => (
      <div>
        <style>{STAGE}</style>
        <div
          style={{ position: "fixed", insetBlockStart: 20, insetInlineStart: 10, display: "flex" }}
        >
          <SplitterRoot label="Rail" unit="px" min={180} max={360} defaultSize={196}>
            <SplitterPanel>
              <p>Navigation</p>
              <SplitterHandle key={props.generation} />
            </SplitterPanel>
          </SplitterRoot>
        </div>
      </div>
    );
    const { container, render } = mount(<Parts generation={0} />);
    await settle();
    const first = part(container, "handle");
    render(<Parts generation={1} />);
    await settle();
    expect(part(container, "handle")).not.toBe(first);

    expect(Math.abs((await drag(container, 20, 0)) - 216)).toBeLessThan(1.5);
  });
});

describe("Splitter inside a dialog", () => {
  it("takes the Escape of a drag for itself: the size comes back and the dialog stays open", async () => {
    const Late = (props: Partial<SplitterRootProps>): React.ReactNode => {
      const [ready, setReady] = useState(false);
      useEffect(() => setReady(true), []);
      return ready ? <Side {...props} /> : null;
    };
    const { container } = mount(
      <DialogRoot defaultOpen>
        <DialogPortal disabled>
          <DialogContent aria-label="Layout">
            <style>{`[data-part~="splitter:panel"] { position: relative; flex: none; inline-size: var(${SIZE}, auto); block-size: 100px } [data-part~="splitter:handle"] { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 12px; background: #888 }`}</style>
            <div style={{ display: "flex", inlineSize: 380, blockSize: 100 }}>
              <Late collapsible={false} />
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>,
    );
    await settle();
    const handle = part(container, "handle");
    handle.scrollIntoView();
    const box = handle.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + 10, y },
      { type: "move", x: x + 20, y },
      { type: "move", x: x + 30, y },
      { type: "move", x: x + 40, y },
    ]);
    await waitFor(() => expect(part(container, "handle").hasAttribute("data-dragging")).toBe(true));
    await userEvent.keyboard("{Escape}");
    await commands.mouse([
      { type: "move", x: x + 50, y },
      { type: "up", x: x + 50, y },
    ]);
    await settle();

    expect(container.querySelector('[data-part~="dialog:content"]')).not.toBeNull();
    expect(part(container, "panel").style.getPropertyValue(SIZE)).toBe("196px");
  });
});

describe("Splitter on a gamepad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "select" | "back" | "moveRight"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  it("takes hold on A, adjusts on the d-pad, and gives the size back on B", async () => {
    const onSizeChangeEnd = vi.fn();
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Side onSizeChangeEnd={onSizeChangeEnd} />
      </NavProvider>,
    );
    await settle();
    const handle = part(container, "handle");
    if (!document.hasFocus()) window.focus();
    fire(() => handle.focus());
    await waitFor(() => expect(handle.hasAttribute("data-focus-source")).toBe(true));

    pad("select");
    expect(handle.getAttribute("data-engaged")).toBe("");

    pad("moveRight");
    pad("moveRight");
    expect(handle.getAttribute("aria-valuenow")).toBe("216");

    pad("back");
    expect(handle.getAttribute("aria-valuenow")).toBe("196");
    expect(handle.hasAttribute("data-engaged")).toBe(false);
  });

  it("answers no pad at all when the consumer says so", async () => {
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Side intents={null} />
      </NavProvider>,
    );
    await settle();
    const handle = part(container, "handle");
    fire(() => handle.focus());

    pad("select");

    expect(handle.hasAttribute("data-engaged")).toBe(false);
  });
});

describe("splitter — the name, in development", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const anonymous = (): boolean =>
    warn.mock.calls.some((call: unknown[]) => String(call[0]).includes("has no accessible name"));

  it("warns about a separator that nobody named", async () => {
    mount(<Side label={undefined} />);

    await waitFor(() => expect(anonymous()).toBe(true));
  });

  it("stays quiet about one named by a label, by a labelledBy, or by the app's own attribute", async () => {
    mount(
      <div>
        <Side />
        <h2 id="title">Inspector</h2>
        <Side label={undefined} labelledBy="title" />
      </div>,
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle();

    expect(anonymous()).toBe(false);
  });
});

describe("splitter — hydration", () => {
  let errors: unknown[][];
  let spy: ReturnType<typeof vi.spyOn>;
  const hosts: HTMLElement[] = [];

  beforeEach(() => {
    errors = [];
    spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    spy.mockRestore();
    for (const host of hosts.splice(0)) host.remove();
  });

  const hydrationErrors = (): string[] =>
    errors
      .map((args) =>
        args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "),
      )
      .filter((message) =>
        /hydrat|did not match|server (?:HTML|render)|mismatch|#418/i.test(message),
      );

  async function hydrate(element: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    document.body.append(host);
    hosts.push(host);
    await act(async () => {
      hydrateRoot(host, <StrictMode>{element}</StrictMode>);
    });
    await act(async () => {});
    return host;
  }

  it("hydrates without a mismatch, and the size arrives in the layout effect", async () => {
    const markup = document.createElement("div");
    markup.innerHTML = renderToString(<Side />);
    expect(part(markup, "panel").style.getPropertyValue(SIZE)).toBe("");

    const host = await hydrate(<Side />);

    expect(hydrationErrors()).toEqual([]);
    expect(part(host, "panel").style.getPropertyValue(SIZE)).toBe("196px");
    expect(part(host, "handle").getAttribute("aria-valuenow")).toBe("196");
  });

  it("hydrates a folded splitter, a stacked one and one on the end side the same way", async () => {
    const host = await hydrate(
      <div>
        <Side defaultCollapsed />
        <Side orientation="vertical" label="Stacked" />
        <Side panelSide="end" label="End" dir="rtl" />
      </div>,
    );

    expect(hydrationErrors()).toEqual([]);
    expect(host.querySelectorAll('[data-part~="splitter:panel"][data-rail]')).toHaveLength(1);
  });
});

describe("splitter — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  it("passes over the theme × density × orientation × dir matrix", async () => {
    const handle = mount(
      <main>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <Side label={`${theme} ${density} side by side`} />
              <Side label={`${theme} ${density} stacked`} orientation="vertical" />
              <div dir="rtl">
                <Side label={`${theme} ${density} rtl`} dir="rtl" panelSide="end" />
              </div>
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });

  it("passes folded to a rail, folded to nothing, disabled and in percent", async () => {
    const handle = mount(
      <main>
        <Side label="Rail" defaultCollapsed />
        <Side label="Nothing" defaultCollapsed collapsedSize={0} />
        <Side label="Unavailable" disabled />
        <Splitter label="Share" defaultSize={30}>
          <p>Percent</p>
        </Splitter>
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });

  it("passes named by something else than its own label", async () => {
    const handle = mount(
      <main>
        <h2 id="inspector-title">Inspector</h2>
        <Side label={undefined} labelledBy="inspector-title" />
      </main>,
    );
    await settle();

    expect(part(handle.container, "handle").getAttribute("aria-labelledby")).toBe(
      "inspector-title",
    );
    await expectNoAxeViolations(handle.container);
  });
});
