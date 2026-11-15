/**
 * The Phase 2 exit criterion: a machine goes service → connect → real DOM
 * attributes with no framework in the room.
 *
 * The ~30-line renderer below is deliberately dumb — apply the prop getters as
 * attributes and listeners, re-apply whenever the reactivity root settles. It is
 * the seed of the vanilla adapter, and the proof that the core needs nothing from
 * a framework beyond a way to re-read the props.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import type { PartIdOverrides } from "../../machine/scope";
import { createService } from "../../machine/service";
import type { Service } from "../../machine/types";
import { getInputModality, MODALITY_ATTRIBUTE, setInputModality } from "../../nav";
import { createReactivityRoot } from "../../reactivity";
import { connect } from "./toggle.connect";
import { machine } from "./toggle.machine";
import type { ToggleApi, ToggleMachineProps, ToggleSchema } from "./toggle.types";

interface DomPropTypes extends PropTypes {
  element: Record<string, unknown>;
  button: Record<string, unknown>;
}

const normalize = createNormalizer<DomPropTypes>((props) => props);

function applyProps(
  node: HTMLElement,
  props: Record<string, unknown>,
  bound: Map<string, EventListener>,
): void {
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on") && typeof value === "function") {
      const type = key.slice(2).toLowerCase();
      const previous = bound.get(type);
      if (previous !== undefined) node.removeEventListener(type, previous);
      const listener = value as EventListener;
      node.addEventListener(type, listener);
      bound.set(type, listener);
      continue;
    }
    if (value === undefined || value === false || value === null) {
      node.removeAttribute(key);
      continue;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }
}

interface Harness {
  readonly root: HTMLElement;
  readonly indicator: HTMLElement;
  readonly service: Service<ToggleSchema>;
  api(): ToggleApi<DomPropTypes>;
  setProps(next: Partial<ToggleMachineProps>): void;
  destroy(): void;
}

const harnesses: Harness[] = [];

function render(initial: Partial<ToggleMachineProps> = {}, ids?: PartIdOverrides): Harness {
  let props: Partial<ToggleMachineProps> = { ...initial };
  const host = document.createElement("div");
  host.innerHTML = `<button></button><span></span>`;
  document.body.append(host);

  const root = host.firstElementChild as HTMLElement;
  const indicator = host.lastElementChild as HTMLElement;
  const rootListeners = new Map<string, EventListener>();
  const indicatorListeners = new Map<string, EventListener>();

  const reactivity = createReactivityRoot();
  const service = createService(machine, reactivity.adapter, {
    id: "t1",
    ids,
    getRootNode: () => document,
    props: () => props,
  });

  const api = (): ToggleApi<DomPropTypes> => connect(service, normalize);
  const paint = (): void => {
    const current = api();
    applyProps(root, current.getRootProps(), rootListeners);
    applyProps(indicator, current.getIndicatorProps(), indicatorListeners);
  };

  paint();
  reactivity.subscribe(paint);
  service.start();
  paint();

  const harness: Harness = {
    root,
    indicator,
    service,
    api,
    setProps(next: Partial<ToggleMachineProps>): void {
      props = { ...props, ...next };
      paint();
    },
    destroy(): void {
      // Detach first: removing a focused element fires blur, and a machine that
      // has already stopped would warn about an event it can no longer handle.
      host.remove();
      service.stop();
      reactivity.dispose();
    },
  };
  harnesses.push(harness);
  return harness;
}

afterEach(() => {
  for (const harness of harnesses.splice(0, harnesses.length)) harness.destroy();
});

describe("toggle — service to DOM", () => {
  it("paints the anatomy, the ARIA state and the stylable state", () => {
    const { root, indicator } = render();

    expect(root.getAttribute("data-scope")).toBe("toggle");
    expect(root.getAttribute("data-part")).toBe("toggle:root");
    expect(root.getAttribute("id")).toBe("toggle:t1:root");
    expect(root.getAttribute("type")).toBe("button");
    expect(root.getAttribute("aria-pressed")).toBe("false");
    expect(root.getAttribute("data-state")).toBe("off");
    expect(root.hasAttribute("data-disabled")).toBe(false);

    expect(indicator.getAttribute("data-part")).toBe("toggle:indicator");
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(indicator.getAttribute("data-state")).toBe("off");
  });

  it("starts pressed when the default says so — the SSR-safe path", () => {
    const { root } = render({ defaultPressed: true });

    expect(root.getAttribute("aria-pressed")).toBe("true");
    expect(root.getAttribute("data-state")).toBe("on");
  });

  it("toggles on a real click, and repaints both parts", () => {
    const onPressedChange = vi.fn();
    const { root, indicator } = render({ onPressedChange });

    root.click();

    expect(onPressedChange).toHaveBeenCalledWith({ pressed: true });
    expect(root.getAttribute("aria-pressed")).toBe("true");
    expect(root.getAttribute("data-state")).toBe("on");
    expect(indicator.getAttribute("data-state")).toBe("on");

    root.click();
    expect(root.getAttribute("aria-pressed")).toBe("false");
    expect(onPressedChange).toHaveBeenLastCalledWith({ pressed: false });
  });

  it("reports but does not write while controlled, and follows the prop back down", () => {
    const onPressedChange = vi.fn();
    const harness = render({ pressed: false, onPressedChange });

    harness.root.click();

    expect(onPressedChange).toHaveBeenCalledWith({ pressed: true });
    expect(harness.root.getAttribute("aria-pressed")).toBe("false");

    harness.setProps({ pressed: true });
    expect(harness.root.getAttribute("aria-pressed")).toBe("true");
  });

  it("stays put while disabled", () => {
    const onPressedChange = vi.fn();
    const { root } = render({ disabled: true, onPressedChange });

    expect(root.hasAttribute("disabled")).toBe(true);
    expect(root.getAttribute("data-disabled")).toBe("");

    root.click();

    expect(onPressedChange).not.toHaveBeenCalled();
    expect(root.getAttribute("aria-pressed")).toBe("false");
  });

  it("exposes the focus ring only for a keyboard modality", () => {
    const { root } = render();

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    root.focus();
    expect(root.hasAttribute("data-focus-visible")).toBe(false);

    root.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    root.focus();
    expect(root.getAttribute("data-focus-visible")).toBe("");

    root.blur();
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("says how the focus arrived, and stops saying it once the focus leaves", () => {
    const { root } = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    root.focus();
    expect(root.getAttribute("data-focus-source")).toBe("keyboard");

    root.blur();
    expect(root.hasAttribute("data-focus-source")).toBe(false);
  });

  it("keeps the ring when the pointer takes over without moving the focus", () => {
    const { root } = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    root.focus();
    expect(root.getAttribute("data-focus-visible")).toBe("");

    // The modality of *now* is pointer, but nothing refocused: this element is
    // still the one the keyboard put the focus on. Reading the live modality
    // here is what used to blink the ring out from under the user's hands, and
    // it is not what the browser does with `:focus-visible` either.
    setInputModality(document, "pointer");

    expect(root.getAttribute("data-focus-source")).toBe("keyboard");
    expect(root.getAttribute("data-focus-visible")).toBe("");
  });

  it("takes the new source when the focus actually moves", () => {
    const { root } = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    root.focus();
    root.blur();

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    root.focus();

    expect(root.getAttribute("data-focus-source")).toBe("pointer");
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("drives the same transitions from the imperative api", () => {
    const harness = render();

    harness.api().toggle();
    expect(harness.root.getAttribute("data-state")).toBe("on");

    harness.api().setPressed(false);
    expect(harness.root.getAttribute("data-state")).toBe("off");
    expect(harness.api().pressed).toBe(false);
  });

  it("lets a consumer override a part id", () => {
    const { root, indicator } = render({}, { root: "custom-root" });

    expect(root.getAttribute("id")).toBe("custom-root");
    expect(indicator.getAttribute("id")).toBe("toggle:t1:indicator");
  });

  it("carries dir onto the root", () => {
    const { root } = render({ dir: "rtl" });

    expect(root.getAttribute("dir")).toBe("rtl");
  });

  it("connects purely — the same attributes before the service ever starts", () => {
    const reactivity = createReactivityRoot();
    const service = createService(machine, reactivity.adapter, {
      id: "t2",
      props: () => ({ defaultPressed: true }),
    });

    const props = connect(service, normalize).getRootProps();

    expect(service.status()).toBe("not-started");
    expect(props["aria-pressed"]).toBe("true");
    expect(props["data-state"]).toBe("on");
  });

  /**
   * This used to `stop()` the service and then call `focus()` on the root, which
   * made it the only producer of "event was sent after the service stopped" in
   * the whole suite — and it proved nothing: a stopped service drops the event
   * either way, so the assertion held whether or not the listener had come off.
   *
   * The tracker is ref-counted per document and takes `data-snav-input` off the
   * documentElement when the last subscriber leaves, so that attribute is the
   * observable fact, and no event has to be sent to a stopped machine to read it.
   *
   * Nothing about the warning itself is worth silencing: it covers 19 `send`
   * sites inside effects and it is the alarm for exactly the bug Phase 5's
   * focus-scope can introduce — a trap calling `.focus()` back after `stop()`.
   */
  it("takes its document listener off when the service stops", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.documentElement.getAttribute(MODALITY_ATTRIBUTE)).toBe("keyboard");
    expect(harness.api().focusVisible).toBe(false);

    harness.service.stop();

    // Last subscriber gone: listeners off, and the attribute goes with them.
    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);
    // Reports the default rather than a stale reading — the honest answer for a
    // tracker that is not running.
    expect(getInputModality(document)).toBe("pointer");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
