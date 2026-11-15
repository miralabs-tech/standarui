import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputSystem } from "../../nav";
import { type ApplyProps, mountMachine, unmountAll } from "../harness";
import { connect } from "./link.connect";
import { machine } from "./link.machine";
import type { LinkApi, LinkMachineProps, LinkSchema } from "./link.types";

type Api = LinkApi<import("../harness").DomPropTypes>;

const NATIVE_HTML = `<a>Docs<span></span><span>(opens in a new tab)</span></a>`;
const SUBSTITUTED_HTML = `<span>Docs<span></span><span>(opens in a new tab)</span></span>`;

function render(props: LinkMachineProps = {}, html?: string) {
  return mountMachine<LinkSchema, Api>({
    machine,
    connect,
    html: html ?? NATIVE_HTML,
    id: "l1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const rootEl = host.children[0] as Element;
      apply(rootEl, api.getRootProps());
      apply(rootEl.children[0] as Element, api.getExternalIconProps());
      apply(rootEl.children[1] as Element, api.getExternalLabelProps());
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

function move(node: HTMLElement, clientX: number, clientY: number): void {
  node.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      clientX,
      clientY,
    }),
  );
}

afterEach(() => {
  unmountAll();
});

describe("link — service to DOM", () => {
  it("paints the anatomy, the presentation and the default ARIA", () => {
    const harness = render({ href: "#docs" });
    const root = harness.part("root");

    expect(root.getAttribute("data-scope")).toBe("link");
    expect(root.id).toBe("link:l1:root");
    expect(root.getAttribute("href")).toBe("#docs");
    expect(root.hasAttribute("role")).toBe(false);
    expect(root.hasAttribute("tabindex")).toBe(false);
    expect(root.getAttribute("data-variant")).toBe("tint");
    expect(root.getAttribute("data-underline")).toBe("hover");
    expect(harness.part("external-icon").hasAttribute("hidden")).toBe(true);
    expect(harness.part("external-label").hasAttribute("hidden")).toBe(true);
  });

  it("observes a click without preventing it — the navigation stays the browser's", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", onPress });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    harness.part("root").dispatchEvent(event);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0]?.[0]?.originalEvent).toBe(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("flashes data-pressed on Enter and leaves the activation to the native click", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", onPress });
    const root = harness.part("root");

    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(root.getAttribute("data-pressed")).toBe("");
    // The keyboard alone never activates a native link from here.
    expect(onPress).not.toHaveBeenCalled();

    root.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    expect(root.hasAttribute("data-pressed")).toBe(false);

    // What the browser does with that Enter: one click, one activation.
    root.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves Space entirely to the page — no preventDefault, no activation", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", onPress });
    const root = harness.part("root");
    const keydown = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });

    root.dispatchEvent(keydown);

    // On a link Space scrolls the page; intercepting it would be an APG bug.
    expect(keydown.defaultPrevented).toBe(false);
    expect(root.hasAttribute("data-pressed")).toBe(false);

    root.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("follows a pointer press with data-pressed, off the control and back", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", onPress });
    const root = harness.part("root");
    const rect = root.getBoundingClientRect();

    press(root);
    expect(root.getAttribute("data-pressed")).toBe("");

    move(root, -50, -50);
    expect(root.hasAttribute("data-pressed")).toBe(false);

    move(root, rect.left + rect.width / 2, rect.top + rect.height / 2);
    expect(root.getAttribute("data-pressed")).toBe("");

    // Released outside: the visual lets go and nothing activates.
    move(root, -50, -50);
    root.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        clientX: -50,
        clientY: -50,
      }),
    );
    expect(root.hasAttribute("data-pressed")).toBe(false);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("drops the press visual if the link is disabled mid-press", () => {
    const harness = render({ href: "#target" });
    const root = harness.part("root");

    press(root);
    expect(root.getAttribute("data-pressed")).toBe("");

    // Otherwise the link is left dimmed for good: the pointer sequence it was
    // waiting on now belongs to a control that no longer listens.
    harness.setProps({ disabled: true });
    expect(root.hasAttribute("data-pressed")).toBe(false);
  });

  it("captures the modality the focus arrived under, and freezes it", () => {
    const harness = render({ href: "#target" });
    const root = harness.part("root");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    root.focus();
    expect(root.getAttribute("data-focus-source")).toBe("keyboard");
    expect(root.getAttribute("data-focus-visible")).toBe("");

    root.blur();
    expect(root.hasAttribute("data-focus-source")).toBe(false);
    expect(root.hasAttribute("data-focus-visible")).toBe(false);

    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    root.focus();
    expect(root.getAttribute("data-focus-source")).toBe("pointer");
    // No ring for a pointer: that is the whole reason the source is captured
    // instead of trusting `:focus-visible`.
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("activates from the pad through the system's click, with no code of its own", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", onPress });
    const input = createInputSystem();
    try {
      harness.part("root").focus();

      // A → select; unclaimed, the system clicks the focused element, and that
      // click is the same ROOT.CLICK a pointer produces.
      input.emit({ intent: "select", source: "gamepad" });
      expect(onPress).toHaveBeenCalledTimes(1);

      input.emit({ intent: "select", source: "gamepad", repeat: true });
      expect(onPress).toHaveBeenCalledTimes(1);
    } finally {
      input.destroy();
    }
  });

  it("refuses while disabled: href stripped, out of the tab order, click prevented", () => {
    const onPress = vi.fn();
    const harness = render({ href: "#target", disabled: true, onPress });
    const root = harness.part("root");

    expect(root.hasAttribute("href")).toBe(false);
    root.focus();
    expect(document.activeElement).not.toBe(root);

    // The belt over the stripped href, for the composition that carries its own.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("stays reachable while disabled when asked, and says why it does nothing", () => {
    const harness = render({ href: "#target", disabled: true, focusableWhenDisabled: true });
    const root = harness.part("root");

    expect(root.getAttribute("tabindex")).toBe("0");
    expect(root.getAttribute("aria-disabled")).toBe("true");
    root.focus();
    expect(document.activeElement).toBe(root);
  });

  it("folds the external label into the accessible name, inside the anchor", () => {
    const harness = render({ href: "https://example.com", external: true });
    const root = harness.part("root");
    const label = harness.part("external-label");

    expect(root.getAttribute("target")).toBe("_blank");
    expect(root.getAttribute("rel")).toBe("noopener noreferrer");
    expect(root.contains(label)).toBe(true);
    expect(label.hasAttribute("hidden")).toBe(false);
    expect(label.hasAttribute("aria-hidden")).toBe(false);
    // Inside the anchor, so it needs no aria-describedby to be announced.
    expect(root.textContent).toContain("(opens in a new tab)");
    expect(harness.part("external-icon").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("link — on a substituted element", () => {
  function renderCustom(props: LinkMachineProps = {}) {
    return render({ nativeLink: false, ...props }, SUBSTITUTED_HTML);
  }

  it("borrows the link role and the tab order", () => {
    const harness = renderCustom();
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("link");
    expect(root.getAttribute("tabindex")).toBe("0");
  });

  it("synthesises Enter, and only Enter — one activation per gesture", () => {
    const onPress = vi.fn();
    const harness = renderCustom({ onPress });
    const root = harness.part("root");

    // Enter produces no native click on a span, so the connect stands in.
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(root.getAttribute("data-pressed")).toBe("");
    expect(onPress).toHaveBeenCalledTimes(1);
    root.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    expect(root.hasAttribute("data-pressed")).toBe(false);

    // A held key repeats the keydown; the activation must not repeat with it.
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, repeat: true }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);

    // A pointer gesture ends in one compatibility click — the other path.
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("activates once on a pointer gesture, not twice through the compatibility click", () => {
    const onPress = vi.fn();
    const harness = renderCustom({ onPress });
    const root = harness.part("root");
    const rect = root.getBoundingClientRect();

    press(root);
    root.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    // Nothing yet: the press primitive is wired for the visual only, and never
    // for activation — which is what leaves room for the click that follows.
    expect(onPress).not.toHaveBeenCalled();

    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves the tab order when disabled", () => {
    const harness = renderCustom({ disabled: true });

    expect(harness.part("root").getAttribute("tabindex")).toBe("-1");
    expect(harness.part("root").getAttribute("aria-disabled")).toBe("true");
  });
});
