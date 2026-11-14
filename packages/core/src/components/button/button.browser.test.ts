import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, mountMachine, unmountAll } from "../harness";
import { connect } from "./button.connect";
import { machine } from "./button.machine";
import type { ButtonApi, ButtonMachineProps, ButtonSchema } from "./button.types";

type Api = ButtonApi<import("../harness").DomPropTypes>;

function render(props: ButtonMachineProps = {}, html?: string) {
  return mountMachine<ButtonSchema, Api>({
    machine,
    connect,
    html: html ?? `<button></button><span></span>`,
    id: "b1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      apply(host.children[0] as Element, api.getRootProps());
      apply(host.children[1] as Element, api.getLoadingIndicatorProps());
    },
  });
}

function press(node: HTMLElement, init: PointerEventInit = {}): void {
  const rect = node.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  node.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      ...at,
      ...init,
    }),
  );
}

function release(node: HTMLElement, init: PointerEventInit = {}): void {
  const rect = node.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  node.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId: 1, isPrimary: true, ...at, ...init }),
  );
}

afterEach(() => {
  unmountAll();
});

describe("button — service to DOM", () => {
  it("paints the anatomy, the presentation and the default ARIA", () => {
    const harness = render();
    const root = harness.part("root");

    expect(root.getAttribute("data-scope")).toBe("button");
    expect(root.id).toBe("button:b1:root");
    expect(root.getAttribute("type")).toBe("button");
    expect(root.getAttribute("data-variant")).toBe("filled");
    expect(root.getAttribute("data-size")).toBe("md");
    expect(root.hasAttribute("role")).toBe(false);
    expect(root.hasAttribute("aria-disabled")).toBe(false);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(harness.part("loading-indicator").hasAttribute("hidden")).toBe(true);
  });

  it("carries the presentation props through as data attributes", () => {
    const harness = render({ variant: "glass", size: "xl", type: "submit" });

    expect(harness.part("root").getAttribute("data-variant")).toBe("glass");
    expect(harness.part("root").getAttribute("data-size")).toBe("xl");
    expect(harness.part("root").getAttribute("type")).toBe("submit");
  });

  it("activates on a click", () => {
    const onPress = vi.fn();
    const harness = render({ onPress });

    harness.part("root").click();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("follows a pointer press with data-pressed, and lets go when the finger leaves", () => {
    const harness = render();
    const root = harness.part("root");

    press(root);
    expect(root.getAttribute("data-pressed")).toBe("");

    // Sliding off the control releases the visual without activating.
    root.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        clientX: -50,
        clientY: -50,
      }),
    );
    expect(root.hasAttribute("data-pressed")).toBe(false);
  });

  it("flashes data-pressed for Enter and Space without preventing the native click", () => {
    const harness = render();
    const root = harness.part("root");

    const keydown = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    root.dispatchEvent(keydown);

    expect(root.getAttribute("data-pressed")).toBe("");
    // The one thing a submit button cannot afford to lose.
    expect(keydown.defaultPrevented).toBe(false);

    root.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(root.hasAttribute("data-pressed")).toBe(false);
  });

  it("refuses to activate while disabled, and leaves the tab order", () => {
    const onPress = vi.fn();
    const harness = render({ disabled: true, onPress });
    const root = harness.part<HTMLButtonElement>("root");

    expect(root.disabled).toBe(true);
    expect(root.getAttribute("data-disabled")).toBe("");
    expect(root.hasAttribute("aria-disabled")).toBe(false);

    root.click();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("stays focusable when asked, and says so with aria-disabled", () => {
    const onPress = vi.fn();
    const harness = render({ disabled: true, focusableWhenDisabled: true, onPress });
    const root = harness.part<HTMLButtonElement>("root");

    expect(root.disabled).toBe(false);
    expect(root.getAttribute("aria-disabled")).toBe("true");

    root.focus();
    expect(document.activeElement).toBe(root);

    root.click();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("refuses to activate while loading, and says busy", () => {
    const onPress = vi.fn();
    const harness = render({ loading: true, onPress });

    expect(harness.part("root").getAttribute("aria-busy")).toBe("true");
    expect(harness.part("root").getAttribute("data-loading")).toBe("");
    expect(harness.part("loading-indicator").hasAttribute("hidden")).toBe(false);

    harness.part("root").click();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("announces the loading text once, politely, when loading turns on", () => {
    const harness = render({ loadingText: "Saving…" });

    harness.setProps({ loading: true });

    const region = document.querySelector('[data-sui-live-region="polite"]');
    expect(region?.getAttribute("aria-live")).toBe("polite");
    // The regions are created empty and written on a later task — a region that
    // appears already populated is never announced.
    expect(region?.textContent).toBe("");
    return vi.waitFor(() => {
      expect(region?.textContent).toBe("Saving…");
    });
  });

  it("drops the press visual if loading interrupts it", () => {
    const harness = render();
    const root = harness.part("root");

    press(root);
    expect(root.getAttribute("data-pressed")).toBe("");

    harness.setProps({ loading: true });
    expect(root.hasAttribute("data-pressed")).toBe(false);
  });

  it("connects purely — the same attributes before the service starts", () => {
    const harness = render({ variant: "tinted" });
    const props = harness.api().getRootProps();

    expect(props["data-variant"]).toBe("tinted");
    expect(props["data-pressed"]).toBeUndefined();
  });
});

describe("button — on a substituted element", () => {
  function renderCustom(props: ButtonMachineProps = {}) {
    return render({ nativeButton: false, ...props }, `<div></div><span></span>`);
  }

  it("borrows the button role and the tab order", () => {
    const harness = renderCustom();
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("button");
    expect(root.getAttribute("tabindex")).toBe("0");
    expect(root.hasAttribute("type")).toBe(false);
  });

  it("activates on Space keyup, the way APG asks", () => {
    const onPress = vi.fn();
    const harness = renderCustom({ onPress });
    const root = harness.part("root");

    const keydown = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    root.dispatchEvent(keydown);
    // No native scroll here: this element is standing in for a button.
    expect(keydown.defaultPrevented).toBe(true);
    expect(onPress).not.toHaveBeenCalled();

    root.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("activates once on a pointer press, not twice through the compatibility click", () => {
    const onPress = vi.fn();
    const harness = renderCustom({ onPress });
    const root = harness.part("root");

    press(root);
    release(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves the tab order when disabled", () => {
    const harness = renderCustom({ disabled: true });

    expect(harness.part("root").getAttribute("tabindex")).toBe("-1");
    expect(harness.part("root").getAttribute("aria-disabled")).toBe("true");
  });
});
