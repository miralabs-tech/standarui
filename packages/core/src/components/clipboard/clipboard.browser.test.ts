/**
 * The browser half of `clipboard`: a real click through a real DOM, against a
 * stubbed `navigator.clipboard` — the three-engine matrix must never depend on
 * the real clipboard permission, which chromium grants, firefox prompts for and
 * webkit ties to a gesture the harness cannot always prove.
 *
 * The stub is an own property on the navigator *instance*, shadowing the
 * prototype getter; `Reflect.deleteProperty` puts the real one back. That works
 * because the machine reads the navigator off the trigger's own window — the
 * scope rule — not off a global this file could not intercept.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./clipboard.connect";
import { machine } from "./clipboard.machine";
import type { ClipboardApi, ClipboardMachineProps, ClipboardSchema } from "./clipboard.types";

type Api = ClipboardApi<DomPropTypes>;

const MARKUP = `<div><label></label><div class="row"><input /><button><span class="rest"></span><span class="done"></span></button></div></div>`;

function render(props: ClipboardMachineProps = {}) {
  return mountMachine<ClipboardSchema, Api>({
    machine,
    connect,
    html: MARKUP,
    id: "c1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.querySelector("label") as HTMLElement, api.getLabelProps());
      apply(root.querySelector(".row") as HTMLElement, api.getControlProps());
      apply(root.querySelector("input") as HTMLElement, api.getInputProps());
      apply(root.querySelector("button") as HTMLElement, api.getTriggerProps());
      apply(root.querySelector(".rest") as HTMLElement, api.getIndicatorProps());
      apply(root.querySelector(".done") as HTMLElement, api.getIndicatorProps({ copied: true }));
    },
  });
}

/** The shipped `IconOnly` scene: a root, a trigger, the indicator pair. */
const ICON_ONLY = `<div><button><span class="rest"></span><span class="done"></span></button></div>`;

function renderIconOnly(props: ClipboardMachineProps = {}) {
  return mountMachine<ClipboardSchema, Api>({
    machine,
    connect,
    html: ICON_ONLY,
    id: "c2",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.querySelector("button") as HTMLElement, api.getTriggerProps());
      apply(root.querySelector(".rest") as HTMLElement, api.getIndicatorProps());
      apply(root.querySelector(".done") as HTMLElement, api.getIndicatorProps({ copied: true }));
    },
  });
}

type WriteText = (text: string) => Promise<void>;

const restores: VoidFunction[] = [];

/** `undefined` simulates the insecure context, where the API does not exist. */
function stubClipboard(writeText: WriteText | undefined): void {
  const target = window.navigator as Navigator & Record<string, unknown>;
  Object.defineProperty(target, "clipboard", {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
  restores.push(() => Reflect.deleteProperty(target, "clipboard"));
}

function politeRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[data-sui-live-region="polite"]');
  if (region === null) throw new Error("the polite live region was never created");
  return region;
}

interface Deferred {
  readonly promise: Promise<void>;
  resolve: VoidFunction;
}

function deferred(): Deferred {
  let resolve!: VoidFunction;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

afterEach(() => {
  unmountAll();
  for (const restore of restores.splice(0, restores.length)) restore();
  getLiveAnnouncer(document).destroy();
});

describe("clipboard — service to DOM", () => {
  it("copies on a real click, and swaps the indicator pair", async () => {
    const written: string[] = [];
    stubClipboard((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const harness = render({ defaultValue: "hello" });
    const trigger = harness.part("trigger");
    const rest = harness.host.querySelector(".rest") as HTMLElement;
    const done = harness.host.querySelector(".done") as HTMLElement;

    expect(rest.hidden).toBe(false);
    expect(done.hidden).toBe(true);

    trigger.click();

    await vi.waitFor(() => {
      expect(trigger.getAttribute("data-copied")).toBe("");
    });
    expect(written).toEqual(["hello"]);
    expect(harness.part("root").getAttribute("data-copied")).toBe("");
    expect(harness.part("root").getAttribute("data-state")).toBe("copied");
    expect(rest.hidden).toBe(true);
    expect(done.hidden).toBe(false);
  });

  /**
   * The scene with no `control` and no `input` at all. It exists because a React
   * suite read `copied` off the wrong element and the shortest explanation for
   * the `null` it got was "the icon-only root never transitions" — which is
   * false, and this is where that stays false. The value is copied from the
   * machine's own context, so there is nothing in the missing subtree to starve.
   */
  it("reaches copied with no control subtree — the icon-only scene", async () => {
    const written: string[] = [];
    stubClipboard((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const harness = renderIconOnly({ defaultValue: "npm i" });

    expect(harness.host.querySelector("input")).toBeNull();

    harness.part("trigger").click();

    await vi.waitFor(() => {
      expect(harness.service.state.get()).toBe("copied");
    });
    expect(written).toEqual(["npm i"]);
    expect(harness.part("root").getAttribute("data-copied")).toBe("");
    expect((harness.host.querySelector(".done") as HTMLElement).hidden).toBe(false);
  });

  it("calls writeText inside the click's own task — the activation invariant", () => {
    let syncInTask = false;
    let captured = "";
    stubClipboard((text) => {
      syncInTask = true;
      captured = text;
      return Promise.resolve();
    });
    const harness = render({ defaultValue: "the value at click time" });

    harness.part("trigger").click();

    // Asserted before any await: the effect installed on entering `copying`
    // runs synchronously inside the dispatch, which is what preserves the
    // transient user activation the Clipboard API requires.
    expect(syncInTask).toBe(true);
    expect(captured).toBe("the value at click time");
  });

  it("announces through the shared polite region, on a later task", async () => {
    stubClipboard(() => Promise.resolve());
    const harness = render({ copiedText: "Lien copié" });

    harness.part("trigger").click();

    await vi.waitFor(() => {
      expect(politeRegion().textContent).toBe("Lien copié");
    });
  });

  it("returns to idle when the feedback elapses, on the real clock", async () => {
    stubClipboard(() => Promise.resolve());
    const harness = render({ copiedDuration: 60 });
    const trigger = harness.part("trigger");

    trigger.click();
    await vi.waitFor(() => {
      expect(trigger.getAttribute("data-copied")).toBe("");
    });

    await vi.waitFor(() => {
      expect(trigger.hasAttribute("data-copied")).toBe(false);
    });
    expect(harness.part("root").getAttribute("data-state")).toBe("idle");
    expect((harness.host.querySelector(".rest") as HTMLElement).hidden).toBe(false);
    expect((harness.host.querySelector(".done") as HTMLElement).hidden).toBe(true);
  });

  it("lands in error when the write is refused, announcing the failure", async () => {
    const refusal = new Error("NotAllowedError");
    const onCopyError = vi.fn();
    stubClipboard(() => Promise.reject(refusal));
    const harness = render({ onCopyError });

    harness.part("trigger").click();

    await vi.waitFor(() => {
      expect(harness.part("root").getAttribute("data-state")).toBe("error");
    });
    expect(onCopyError).toHaveBeenCalledWith({ error: refusal });
    await vi.waitFor(() => {
      expect(politeRegion().textContent).toBe("Copy to clipboard failed");
    });
    // No third glyph: the resting indicator shows through an error.
    expect((harness.host.querySelector(".rest") as HTMLElement).hidden).toBe(false);
  });

  it("treats a missing clipboard as the same error — the insecure context", async () => {
    const onCopyError = vi.fn();
    stubClipboard(undefined);
    const harness = render({ onCopyError });

    harness.part("trigger").click();

    await vi.waitFor(() => {
      expect(harness.part("root").getAttribute("data-state")).toBe("error");
    });
    const details = onCopyError.mock.calls[0]?.[0] as { error: Error };
    expect(details.error.message).toContain("navigator.clipboard is unavailable");
  });

  it("ignores a resolution that arrives after the service stopped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = deferred();
    stubClipboard(() => pending.promise);
    const harness = render();

    harness.part("trigger").click();
    expect(harness.api().getRootProps()["data-state"]).toBe("copying");

    harness.destroy();
    pending.resolve();
    await new Promise((settle) => setTimeout(settle, 10));

    // The stale guard: without it the late resolution would send into a stopped
    // service, and the library's one leak detector would fire.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("selects the whole value when the input takes focus — the manual fallback", () => {
    const harness = render({ defaultValue: "https://example.com/install.sh" });
    const input = harness.part<HTMLInputElement>("input");

    input.focus();

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("https://example.com/install.sh".length);
    expect(input.readOnly).toBe(true);
  });

  it("leaves the native keyboard path alone — Enter and Space belong to the button", async () => {
    // A synthetic KeyboardEvent is untrusted and produces no native click, so
    // what this asserts is the contract that makes real keys work: the trigger
    // is a native `<button type="button">` with no keydown handler in the way,
    // and the click — however the browser produces it — is the activation.
    stubClipboard(() => Promise.resolve());
    const harness = render();
    const trigger = harness.part<HTMLButtonElement>("trigger");

    expect(trigger.localName).toBe("button");
    expect(trigger.getAttribute("type")).toBe("button");

    for (const key of ["Enter", " "]) {
      const keydown = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      trigger.dispatchEvent(keydown);
      expect(keydown.defaultPrevented).toBe(false);
    }
    expect(harness.part("root").getAttribute("data-state")).toBe("idle");

    trigger.click();
    await vi.waitFor(() => {
      expect(harness.part("root").getAttribute("data-state")).toBe("copied");
    });
  });

  it("announces the same text twice for two copies — the region clears in between", async () => {
    stubClipboard(() => Promise.resolve());
    const harness = render({ copiedDuration: 40 });
    const trigger = harness.part("trigger");

    trigger.click();
    await vi.waitFor(() => {
      expect(politeRegion().textContent).toBe("Copied to clipboard");
    });
    await vi.waitFor(() => {
      expect(harness.part("root").getAttribute("data-state")).toBe("idle");
    });

    // Watch the region itself: the identical message lands only through a clear
    // and a rewrite, and polling could sleep straight through the empty window.
    const settings: string[] = [];
    const observer = new MutationObserver(() => {
      settings.push(politeRegion().textContent ?? "");
    });
    observer.observe(politeRegion(), { childList: true, characterData: true, subtree: true });

    trigger.click();
    await vi.waitFor(() => {
      expect(settings).toContain("Copied to clipboard");
    });
    observer.disconnect();
    expect(settings).toContain("");
  });

  it("shows the ring for a keyboard focus and withholds it for a pointer one", () => {
    const harness = render();
    const trigger = harness.part("trigger");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    trigger.focus();
    expect(trigger.getAttribute("data-focus-visible")).toBe("");
    expect(trigger.getAttribute("data-focus-source")).toBe("keyboard");

    trigger.blur();
    expect(trigger.hasAttribute("data-focus-source")).toBe(false);

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    trigger.focus();
    expect(trigger.hasAttribute("data-focus-visible")).toBe(false);
    expect(trigger.getAttribute("data-focus-source")).toBe("pointer");
  });
});
