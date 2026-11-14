/**
 * The scroll-area through React: the parts, the thumb's geometry that reaches it
 * through the CSSOM and never through `style=`, the tab stop that the viewport takes
 * only when it has to, a real drag on the composed layer, the first paint against
 * hydration — and axe over the matrix the DoD asks for.
 *
 * The machine is proved in `packages/core/src/components/scroll-area`, the pointer
 * and the native scroll on a real engine in `scroll-area.browser.test.ts` beside it,
 * and the sheet in `packages/styles/src/scroll-area.browser.test.ts`. What is here is
 * what only the adapter can get wrong. A stand-in places the bars the way the sheet
 * does.
 */

import { act, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import {
  expectNoAxeViolations,
  mount,
  realKey,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { ScrollArea, type ScrollAreaComposedProps } from "./composed";
import {
  ScrollAreaContent,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "./scroll-area";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

const OFFSET = "--sui-scroll-area-thumb-offset";
const THUMB_SIZE = "--sui-scroll-area-thumb-size";

const SIZE = 200;
const LONG = 1000;
const RANGE = LONG - SIZE;
const TRAVEL = SIZE - 6 - ((SIZE - 6) * SIZE) / LONG;

const SHEET = `
  [data-slot="bare"] { inline-size: ${SIZE}px; block-size: ${SIZE}px; overflow: auto }
  [data-slot="tall"] p { margin: 0; block-size: 25px; white-space: nowrap }
  [data-slot="tall"] { inline-size: 400px; block-size: ${LONG}px }
  [data-part~="scroll-area:root"] { position: relative; inline-size: ${SIZE}px; block-size: ${SIZE}px }
  [data-part~="scroll-area:viewport"] { box-sizing: border-box; inline-size: ${SIZE}px; block-size: ${SIZE}px; overflow: auto; scrollbar-width: none }
  [data-part~="scroll-area:scrollbar"] { position: absolute; background: #eee }
  [data-part~="scroll-area:scrollbar"][data-orientation="vertical"] { inset-block: 0; inset-inline-end: 0; inline-size: 12px }
  [data-part~="scroll-area:scrollbar"][data-orientation="horizontal"] { inset-inline: 0; inset-block-end: 0; block-size: 12px }
  [data-part~="scroll-area:thumb"] { position: absolute; background: #444; touch-action: none }
  [data-part~="scroll-area:thumb"][data-orientation="vertical"] { inset-inline-end: 3px; inline-size: 6px; inset-block-start: calc(var(${OFFSET}, 0px) + 3px); block-size: var(${THUMB_SIZE}, 0px) }
  [data-part~="scroll-area:thumb"][data-orientation="horizontal"] { inset-block-end: 3px; block-size: 6px; inset-inline-start: calc(var(${OFFSET}, 0px) + 3px); inline-size: var(${THUMB_SIZE}, 0px) }
`;

function part(container: ParentNode, name: string, orientation?: string): HTMLElement {
  const suffix = orientation === undefined ? "" : `[data-orientation="${orientation}"]`;
  const node = container.querySelector<HTMLElement>(`[data-part~="scroll-area:${name}"]${suffix}`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

const pixels = (node: HTMLElement, property: string): number =>
  Number.parseFloat(node.style.getPropertyValue(property));

const LOG = Array.from(
  { length: 40 },
  (_, line) => `Line ${line} of a log that runs well past the edge of a narrow viewport`,
);

const Tall = (): React.ReactNode => (
  <div data-slot="tall">
    {LOG.map((text) => (
      <p key={text}>{text}</p>
    ))}
  </div>
);

const Area = (props: Partial<ScrollAreaComposedProps> = {}): React.ReactNode => (
  <ScrollArea label="Log" {...props}>
    <Tall />
  </ScrollArea>
);

const Staged = (props: { readonly children: React.ReactNode }): React.ReactNode => (
  <div>
    <style>{SHEET}</style>
    {props.children}
  </div>
);

afterEach(() => {
  unmountAll();
});

describe("ScrollArea", () => {
  it("renders the parts of the composed layer and of the level below the same way", () => {
    const composed = mount(<Area orientation="both" />).container;
    const parts = mount(
      <ScrollAreaRoot label="Log" orientation="both">
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <Tall />
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb orientation="vertical" />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar orientation="horizontal">
          <ScrollAreaThumb orientation="horizontal" />
        </ScrollAreaScrollbar>
      </ScrollAreaRoot>,
    ).container;

    for (const container of [composed, parts]) {
      expect(part(container, "viewport").firstElementChild).toBe(part(container, "content"));
      expect(part(container, "scrollbar", "vertical").getAttribute("aria-hidden")).toBe("true");
      expect(part(container, "thumb", "horizontal").parentElement).toBe(
        part(container, "scrollbar", "horizontal"),
      );
    }
  });

  it("writes the geometry on the thumb through the CSSOM, and leaves no style attribute in the markup", async () => {
    const html = renderToString(<Area />);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toContain(THUMB_SIZE);

    const { container } = mount(
      <Staged>
        <Area />
      </Staged>,
    );
    await settle();
    await waitFor(() => expect(pixels(part(container, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));

    expect(pixels(part(container, "thumb"), THUMB_SIZE)).toBeCloseTo(((SIZE - 6) * SIZE) / LONG, 1);
    expect(pixels(part(container, "thumb"), OFFSET)).toBe(0);
  });

  it("is a named region and a tab stop when it overflows, and gives the stop to a button inside", async () => {
    const lonely = mount(
      <Staged>
        <Area label="Log" />
      </Staged>,
    ).container;
    await waitFor(() => expect(part(lonely, "viewport").getAttribute("tabindex")).toBe("0"));
    expect(part(lonely, "viewport").getAttribute("role")).toBe("region");
    expect(part(lonely, "viewport").getAttribute("aria-label")).toBe("Log");

    const busy = mount(
      <Staged>
        <ScrollArea label="Log">
          <button type="button">Inside</button>
          <Tall />
        </ScrollArea>
      </Staged>,
    ).container;
    await settle();
    await waitFor(() => expect(pixels(part(busy, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));

    expect(part(busy, "viewport").hasAttribute("tabindex")).toBe(false);
    expect(part(busy, "viewport").hasAttribute("role")).toBe(false);
  });

  it("moves the thumb with a key that scrolls the viewport natively", async () => {
    const { container } = mount(
      <Staged>
        <Area />
      </Staged>,
    );
    await waitFor(() => expect(part(container, "viewport").getAttribute("tabindex")).toBe("0"));
    const viewport = part(container, "viewport");
    viewport.focus();

    await realKey("{End}");

    await waitFor(() => expect(Math.abs(viewport.scrollTop - RANGE)).toBeLessThan(1));
    await waitFor(() =>
      expect(Math.abs(pixels(part(container, "thumb"), OFFSET) - TRAVEL)).toBeLessThan(0.5),
    );
  });
});

describe("ScrollArea with a mouse", () => {
  it("scrolls with a real drag of the thumb that leaves the bar on the way", async () => {
    const { container } = mount(
      <Staged>
        <Area />
      </Staged>,
    );
    await waitFor(() => expect(pixels(part(container, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));
    const viewport = part(container, "viewport");
    const box = part(container, "thumb").getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;

    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x, y: y + 10 },
      { type: "move", x: x - 80, y: y + 30 },
      { type: "move", x: x - 80, y: y + 50 },
      { type: "up", x: x - 80, y: y + 50 },
    ]);
    await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));

    expect(Math.abs(viewport.scrollTop - (50 * RANGE) / TRAVEL)).toBeLessThan(12);
    expect(Math.abs(pixels(part(container, "thumb"), OFFSET) - 50)).toBeLessThan(2);
    expect(part(container, "root").hasAttribute("data-dragging")).toBe(false);
  });

  async function dragThumb(thumb: HTMLElement, dx: number): Promise<void> {
    const box = thumb.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "move", x: x + dx / 5, y },
      { type: "move", x: x + dx / 2, y },
      { type: "move", x: x + dx, y },
      { type: "up", x: x + dx, y },
    ]);
  }

  function Live(props: Partial<ScrollAreaComposedProps>): React.ReactNode {
    return (
      <Staged>
        <Area {...props} />
      </Staged>
    );
  }

  it("drags a horizontal bar that arrived after the start, through orientation", async () => {
    const { container, render } = mount(<Live orientation="vertical" />);
    await waitFor(() => expect(pixels(part(container, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));
    render(<Live orientation="both" />);
    await waitFor(() =>
      expect(pixels(part(container, "thumb", "horizontal"), THUMB_SIZE)).toBeGreaterThan(0),
    );

    await dragThumb(part(container, "thumb", "horizontal"), 40);

    await waitFor(() => expect(part(container, "viewport").scrollLeft).toBeGreaterThan(0));
  });

  it("drags the way the direction reads now, not the way it read at the start", async () => {
    const { container, render } = mount(<Live orientation="horizontal" dir="ltr" />);
    await waitFor(() => expect(pixels(part(container, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));
    render(<Live orientation="horizontal" dir="rtl" />);
    await settle();

    await dragThumb(part(container, "thumb", "horizontal"), -40);

    await waitFor(() => expect(part(container, "viewport").scrollLeft).toBeLessThan(0));
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
    mount(
      <Staged>
        <Area label={undefined} />
      </Staged>,
    );

    await waitFor(() => expect(anonymous()).toBe(true));
  });

  it("stays quiet about one named by a label or a labelledBy, and about one with a button inside", async () => {
    mount(
      <Staged>
        <h2 id="title">Log</h2>
        <Area label="Log" id="named" />
        <Area label={undefined} labelledBy="title" id="referenced" />
        <ScrollArea id="busy">
          <button type="button">Inside</button>
          <Tall />
        </ScrollArea>
      </Staged>,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    await settle();

    expect(anonymous()).toBe(false);
  });
});

describe("scroll-area — hydration", () => {
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

  it("hydrates without a mismatch, and the geometry arrives in the layout effect", async () => {
    const markup = document.createElement("div");
    markup.innerHTML = renderToString(
      <Staged>
        <Area />
      </Staged>,
    );
    expect(part(markup, "thumb").style.getPropertyValue(THUMB_SIZE)).toBe("");
    expect(part(markup, "viewport").hasAttribute("tabindex")).toBe(false);

    const host = await hydrate(
      <Staged>
        <Area />
      </Staged>,
    );
    await waitFor(() => expect(pixels(part(host, "thumb"), THUMB_SIZE)).toBeGreaterThan(0));

    expect(hydrationErrors()).toEqual([]);
    expect(part(host, "viewport").getAttribute("tabindex")).toBe("0");
  });

  it("hydrates two axes, a right-to-left one and one that stays up the same way", async () => {
    const host = await hydrate(
      <div>
        <Area orientation="both" />
        <Area orientation="horizontal" dir="rtl" />
        <Area always />
      </div>,
    );

    expect(hydrationErrors()).toEqual([]);
    expect(host.querySelectorAll('[data-part~="scroll-area:root"][data-always]')).toHaveLength(1);
  });
});

describe("scroll-area — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  async function scrollRegionViolations(node: Element): Promise<number> {
    const { run } = await import("axe-core");
    const results = await run(node as HTMLElement, {
      runOnly: { type: "rule", values: ["scrollable-region-focusable"] },
      resultTypes: ["violations", "incomplete"],
    });
    return results.violations.length + results.incomplete.length;
  }

  it("catches a scrollable region that nothing can reach, so that the passes below say something", async () => {
    const handle = mount(
      <main>
        <style>{SHEET}</style>
        <div data-slot="bare">
          <Tall />
        </div>
      </main>,
    );
    await settle();

    expect(await scrollRegionViolations(handle.container)).toBeGreaterThan(0);
  });

  it("passes over the theme × density × orientation matrix, with the rule that asks for a stop", async () => {
    const handle = mount(
      <main>
        <style>{SHEET}</style>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <Area label={`${theme} ${density} vertical`} />
              <Area label={`${theme} ${density} both`} orientation="both" />
              <Area label={`${theme} ${density} rtl`} orientation="horizontal" dir="rtl" />
            </div>
          )),
        )}
      </main>,
    );
    await settle();
    await waitFor(() =>
      expect(
        [...handle.container.querySelectorAll('[data-part~="scroll-area:viewport"]')].every(
          (viewport) => viewport.getAttribute("tabindex") === "0",
        ),
      ).toBe(true),
    );

    expect(await scrollRegionViolations(handle.container)).toBe(0);
    await expectNoAxeViolations(handle.container);
  });

  it("passes with a button inside, which is the stop, and with a name from elsewhere", async () => {
    const handle = mount(
      <main>
        <style>{SHEET}</style>
        <h2 id="log-title">Log</h2>
        <ScrollArea label={undefined} labelledBy="log-title">
          <Tall />
        </ScrollArea>
        <ScrollArea label="Actions">
          <button type="button">First</button>
          <Tall />
        </ScrollArea>
      </main>,
    );
    await settle();
    await waitFor(() =>
      expect(part(handle.container, "viewport").getAttribute("tabindex")).toBe("0"),
    );

    expect(await scrollRegionViolations(handle.container)).toBe(0);
    await expectNoAxeViolations(handle.container);
  });
});
