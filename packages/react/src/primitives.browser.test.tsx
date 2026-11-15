/**
 * The primitives no core can abstract — portal, presence, environment — and the
 * environment's hand-off of its document to the input layer.
 */

import type { InputPlugin } from "@standarx/nav";
import { type GamepadRuntime, gamepadPlugin } from "@standarx/nav/gamepad";
import { NavProvider } from "@standarx/nav/react";
import { spatialPlugin } from "@standarx/nav/spatial";
import { type ReactNode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./components/button/composed";
import { EnvironmentProvider, useEnvironment } from "./environment";
import { Portal } from "./portal";
import { Presence, usePresence } from "./presence";
import { fire, mount, settle, unmountAll, waitFor } from "./render-harness";

afterEach(() => {
  unmountAll();
  document.documentElement.removeAttribute("data-sui-density");
});

describe("Portal", () => {
  it("mounts into the body by default", () => {
    const { container } = mount(
      <Portal>
        <div data-testid="portalled" />
      </Portal>,
    );

    const node = document.querySelector('[data-testid="portalled"]');
    expect(node).not.toBeNull();
    expect(node?.parentElement).toBe(document.body);
    expect(container.contains(node)).toBe(false);
  });

  it("mounts into a container, function or node", () => {
    const target = document.createElement("section");
    document.body.append(target);

    mount(
      <Portal container={() => target}>
        <div data-testid="in-section" />
      </Portal>,
    );

    expect(target.querySelector('[data-testid="in-section"]')).not.toBeNull();
    target.remove();
  });

  /**
   * The guarantee every portalled machine is built on. A `Scope` looks its parts
   * up by id from the layout effect of the commit that opened the surface, and a
   * container resolved in an effect would render nothing until the commit after —
   * by which time the focus trap, the dismissable layer and the scroll lock have
   * all installed against a document that did not hold the surface yet.
   */
  it("has its children in the document by the first layout effect", () => {
    let seen: boolean | undefined;

    function Probe(): ReactNode {
      useLayoutEffect(() => {
        seen = document.getElementById("portal-probe") !== null;
      }, []);
      return (
        <Portal>
          <div id="portal-probe" />
        </Portal>
      );
    }

    mount(<Probe />);

    expect(seen).toBe(true);
  });

  it("renders in place when disabled", () => {
    const { container } = mount(
      <Portal disabled>
        <div data-testid="inline" />
      </Portal>,
    );

    expect(container.querySelector('[data-testid="inline"]')).not.toBeNull();
  });
});

describe("Presence", () => {
  it("keeps the node while present and removes it once the exit is done", async () => {
    const handle = mount(
      <Presence present immediate>
        <div data-testid="surface" />
      </Presence>,
    );
    expect(document.querySelector('[data-testid="surface"]')).not.toBeNull();

    handle.render(
      <Presence present={false} immediate>
        <div data-testid="surface" />
      </Presence>,
    );

    expect(handle.container.querySelector('[data-testid="surface"]')).toBeNull();
  });

  it("waits for a running animation before letting the node go", async () => {
    const style = document.createElement("style");
    style.textContent = `.sui-fade { transition: opacity 60ms linear; opacity: 1 }
      .sui-fade[data-state="closed"] { opacity: 0 }`;
    document.head.append(style);

    const handle = mount(
      <Presence present>
        <div className="sui-fade" data-state="open" data-testid="fading" />
      </Presence>,
    );

    handle.render(
      <Presence present={false}>
        <div className="sui-fade" data-state="closed" data-testid="fading" />
      </Presence>,
    );

    // Still there: the transition triggered by `data-state` has not finished.
    expect(handle.container.querySelector('[data-testid="fading"]')).not.toBeNull();

    await waitFor(() => {
      expect(handle.container.querySelector('[data-testid="fading"]')).toBeNull();
    });
    style.remove();
  });

  it("keeps the node rendered when asked to", () => {
    const handle = mount(
      <Presence present={false} immediate keepMounted>
        <div data-testid="kept" />
      </Presence>,
    );

    expect(handle.container.querySelector('[data-testid="kept"]')).not.toBeNull();
  });

  it("reports the same thing through the hook", async () => {
    function Surface({ open }: { readonly open: boolean }): ReactNode {
      const presence = usePresence({ present: open, immediate: true });
      return presence.present ? <div ref={presence.ref} data-testid="hooked" /> : null;
    }

    const handle = mount(<Surface open />);
    expect(handle.container.querySelector('[data-testid="hooked"]')).not.toBeNull();

    handle.render(<Surface open={false} />);
    expect(handle.container.querySelector('[data-testid="hooked"]')).toBeNull();
  });
});

describe("EnvironmentProvider", () => {
  function Probe(): ReactNode {
    const environment = useEnvironment();
    return <span data-testid="probe">{`${environment.density}/${environment.dir}`}</span>;
  }

  function read(container: HTMLElement): string {
    return container.querySelector('[data-testid="probe"]')?.textContent ?? "";
  }

  it("falls back to the defaults with no provider", () => {
    const { container } = mount(<Probe />);

    expect(read(container)).toBe("desktop/ltr");
  });

  it("lets an explicit override win over the platform", async () => {
    const { container } = mount(
      <EnvironmentProvider density="touch" dir="rtl">
        <Probe />
      </EnvironmentProvider>,
    );
    await settle();

    expect(read(container)).toBe("touch/rtl");
  });

  it("reads the attribute an app puts on its own markup", async () => {
    document.documentElement.setAttribute("data-sui-density", "touch");
    const { container } = mount(
      <EnvironmentProvider>
        <Probe />
      </EnvironmentProvider>,
    );
    await settle();

    expect(read(container)).toBe("touch/ltr");
  });
});

/**
 * The documented iframe case, end to end: the tree is rendered into another
 * document, and the input layer has to listen, move focus and write the modality
 * there rather than in the page that hosts the frame.
 */
describe("EnvironmentProvider with a rootNode in an iframe", () => {
  const frames: { readonly root: Root; readonly frame: HTMLIFrameElement }[] = [];

  afterEach(() => {
    for (const { root, frame } of frames.splice(0, frames.length)) {
      fire(() => root.unmount());
      frame.remove();
    }
  });

  async function mountInFrame(plugins: readonly InputPlugin[]): Promise<Document> {
    const frame = document.createElement("iframe");
    frame.style.cssText = "width: 320px; height: 240px; border: 0";
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
    });
    frame.srcdoc =
      '<!doctype html><html><body><div id="root" style="display: flex; flex-direction: column; align-items: start; gap: 16px"></div></body></html>';
    document.body.append(frame);
    await loaded;

    const doc = frame.contentDocument;
    const container = doc?.getElementById("root") ?? null;
    if (doc === null || container === null) throw new Error("the iframe has no document");

    const root = createRoot(container);
    frames.push({ root, frame });
    fire(() =>
      root.render(
        <EnvironmentProvider rootNode={doc}>
          <NavProvider plugins={plugins}>
            <Button id="first">One</Button>
            <Button id="second">Two</Button>
          </NavProvider>
        </EnvironmentProvider>,
      ),
    );
    await settle();
    return doc;
  }

  /**
   * Frames are stepped by hand: the engine's first frame only snapshots the pad, so
   * a press that lands before it is taken for one held across a hidden tab and
   * never emits.
   */
  function fakePad(): {
    readonly runtime: GamepadRuntime;
    press(button: number | null): void;
    tick(): void;
  } {
    let pressed: number | null = null;
    let queued: ((now: number) => void) | null = null;
    const read = (): Gamepad =>
      ({
        id: "fake",
        index: 0,
        connected: true,
        mapping: "standard",
        timestamp: performance.now(),
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: index === pressed,
          touched: index === pressed,
          value: index === pressed ? 1 : 0,
        })),
      }) as unknown as Gamepad;
    return {
      runtime: {
        getGamepads: () => [read()],
        requestFrame: (callback) => {
          queued = callback;
          return 1;
        },
        cancelFrame: () => {
          queued = null;
        },
      },
      press(button) {
        pressed = button;
      },
      tick() {
        const callback = queued;
        queued = null;
        callback?.(performance.now());
      },
    };
  }

  it("hands the frame's document to the input layer, so an arrow key moves focus in it", async () => {
    const doc = await mountInFrame([spatialPlugin({ mode: "app" })]);
    const first = doc.getElementById("first");
    first?.focus();

    fire(() => {
      first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect({
      focused: doc.activeElement?.id,
      hostModality: document.documentElement.getAttribute("data-snav-input"),
    }).toEqual({ focused: "second", hostModality: null });
  });

  it("lets a d-pad move focus in the frame and puts the gamepad modality on its <html>", async () => {
    const pad = fakePad();
    const doc = await mountInFrame([gamepadPlugin({ runtime: pad.runtime }), spatialPlugin()]);
    doc.getElementById("first")?.focus();
    pad.tick();

    pad.press(13);
    fire(() => pad.tick());

    expect({
      focused: doc.activeElement?.id,
      frameModality: doc.documentElement.getAttribute("data-snav-input"),
    }).toEqual({ focused: "second", frameModality: "gamepad" });
  });
});
