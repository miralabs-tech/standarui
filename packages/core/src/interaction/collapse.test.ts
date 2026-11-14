/**
 * The module without a DOM. What is provable here is the wiring: that the two
 * custom properties are written in px on the node it was handed, that the exit
 * is delegated rather than reimplemented, and that `destroy` really cancels.
 *
 * The measurement itself — a real `scrollHeight`, against a real animation — is
 * proved in `components/accordion/accordion.browser.test.ts` and in the React
 * adapter, which is the only place the "DOM before watch" order actually holds.
 */

import { describe, expect, it, vi } from "vitest";
import { createCollapse } from "./collapse";

interface FakeStyle {
  readonly written: Map<string, string>;
  setProperty(property: string, value: string): void;
}

/**
 * Everything `createCollapse` touches, and nothing else. `defaultView: null` is
 * not a shortcut: it is the shape `resolveEnvironment` treats as the server, and
 * the one `createPresence` completes on immediately — which is what makes the
 * delegation observable without a frame to wait for.
 */
function fakeNode(height: number, width = 0): { node: HTMLElement; style: FakeStyle } {
  const written = new Map<string, string>();
  const style: FakeStyle = {
    written,
    setProperty(property: string, value: string): void {
      written.set(property, value);
    },
  };
  const node = {
    scrollHeight: height,
    scrollWidth: width,
    style,
    ownerDocument: { defaultView: null },
  };
  return { node: node as unknown as HTMLElement, style };
}

describe("createCollapse", () => {
  it("writes the measured height and width on the node, in pixels", () => {
    const collapse = createCollapse({ onExitComplete: () => {} });
    const { node, style } = fakeNode(180, 240);

    collapse.setOpen(true, node);

    expect(style.written.get("--sui-collapse-height")).toBe("180px");
    expect(style.written.get("--sui-collapse-width")).toBe("240px");
  });

  it("measures on the way out too — the panel may have grown while it was open", () => {
    const collapse = createCollapse({ onExitComplete: () => {} });
    const first = fakeNode(100);
    collapse.setOpen(true, first.node);

    const grown = fakeNode(320);
    collapse.setOpen(false, grown.node);

    expect(grown.style.written.get("--sui-collapse-height")).toBe("320px");
  });

  it("reports the exit once the presence says the node may go", () => {
    const onExitComplete = vi.fn();
    const collapse = createCollapse({ onExitComplete });
    const { node } = fakeNode(80);

    collapse.setOpen(true, node);
    expect(onExitComplete).not.toHaveBeenCalled();

    collapse.setOpen(false, node);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    expect(collapse.isExiting()).toBe(false);
  });

  it("says nothing about a panel that was never open", () => {
    // The seed path. A machine that asked an unopened collapse to close and got
    // no answer would leave the value in `exitingValues` for the rest of the
    // session, and the panel would never take `hidden`.
    const onExitComplete = vi.fn();
    const collapse = createCollapse({ onExitComplete });

    collapse.setOpen(false, fakeNode(80).node);

    expect(onExitComplete).not.toHaveBeenCalled();
  });

  it("survives a node it cannot measure", () => {
    const onExitComplete = vi.fn();
    const collapse = createCollapse({ onExitComplete });

    // A server render, or the first client render before the mount effect.
    collapse.setOpen(true, null);
    collapse.setOpen(false, undefined);

    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("cancels on destroy", () => {
    const onExitComplete = vi.fn();
    const collapse = createCollapse({ onExitComplete });
    const { node } = fakeNode(80);

    collapse.setOpen(true, node);
    collapse.destroy();
    collapse.setOpen(false, node);

    expect(onExitComplete).not.toHaveBeenCalled();
  });
});
