/**
 * The browser half of `input`, and its vanilla-shaped proof: connect reaching
 * real DOM with no framework in the room. The node file pins the two *rendered*
 * mask states through `defaultMasked` and leaves the transition here on
 * purpose — an event sent before `start()` is queued (that is what a server
 * does with it), so the reveal is only provable where the service runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./input.connect";
import { machine } from "./input.machine";
import type { InputApi, InputMachineProps, InputSchema } from "./input.types";

type Api = InputApi<DomPropTypes>;

function render(props: InputMachineProps = {}) {
  return mountMachine<InputSchema, Api>({
    machine,
    connect,
    html: `<div><input /><button></button></div>`,
    id: "i1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getControlProps());
      apply(root.children[1] as Element, api.getVisibilityTriggerProps());
    },
  });
}

function renderTextarea(props: InputMachineProps = {}) {
  return mountMachine<InputSchema, Api>({
    machine,
    connect,
    html: `<div><textarea></textarea></div>`,
    id: "i1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getTextareaProps());
    },
  });
}

function control(harness: ReturnType<typeof render>): HTMLInputElement {
  return harness.part<HTMLInputElement>("control");
}

afterEach(() => {
  unmountAll();
});

describe("input", () => {
  it("records what the browser reports while typing", () => {
    const onValueChange = vi.fn();
    const harness = render({ onValueChange });
    const field = control(harness);

    field.value = "hello";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onValueChange).toHaveBeenCalledWith({ value: "hello" });
    expect(harness.api().value).toBe("hello");
  });

  it("reveals the password from a click on the eye, and masks it back", () => {
    const harness = render({ type: "password", defaultValue: "hunter2" });
    const field = control(harness);
    const trigger = harness.part<HTMLButtonElement>("visibility-trigger");

    expect(field.type).toBe("password");
    expect(trigger.getAttribute("aria-pressed")).toBe("false");

    trigger.click();

    // Revealed means retyped as text — same value, different element type,
    // which is also what stops a password manager from re-masking it.
    expect(field.type).toBe("text");
    expect(field.value).toBe("hunter2");
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(trigger.getAttribute("data-state")).toBe("visible");

    trigger.click();

    expect(field.type).toBe("password");
    expect(trigger.getAttribute("data-state")).toBe("masked");
  });

  it("keeps the caret in the field when the eye is pressed with a pointer", () => {
    const harness = render({ type: "password" });
    const trigger = harness.part<HTMLButtonElement>("visibility-trigger");

    // "Does not move the focus" is about the pointer: the mousedown is refused,
    // so the browser never gets to move focus out of the field. The button
    // itself stays focusable — Tab still reaches it.
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    trigger.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(trigger.tabIndex).toBe(0);
  });

  it("lets Escape empty the field only on request, and only when there is something to empty", () => {
    const harness = render({ clearOnEscape: true, defaultValue: "abc" });
    const field = control(harness);

    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    field.dispatchEvent(first);

    expect(first.defaultPrevented).toBe(true);
    expect(harness.api().value).toBe("");

    // Now empty: Escape belongs to whatever is above — a popover, a dialog —
    // and swallowing it here would make the field a place Escape goes to die.
    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    field.dispatchEvent(second);

    expect(second.defaultPrevented).toBe(false);
  });

  it("leaves Escape alone entirely when clearing was not asked for", () => {
    const harness = render({ defaultValue: "abc" });
    const field = control(harness);

    const untouched = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(untouched);

    expect(untouched.defaultPrevented).toBe(false);
    expect(harness.api().value).toBe("abc");
  });

  it("refuses to write while read-only, and says so on the element", () => {
    const onValueChange = vi.fn();
    const harness = render({ readOnly: true, defaultValue: "kept", onValueChange });

    expect(control(harness).readOnly).toBe(true);

    harness.api().setValue("overwritten");

    expect(onValueChange).not.toHaveBeenCalled();
    expect(harness.api().value).toBe("kept");
  });

  it("shows the focus ring only for a keyboard arrival, and holds it", () => {
    const harness = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    control(harness).focus();

    const root = harness.part("root");
    expect(root.getAttribute("data-focus")).toBe("");
    expect(root.getAttribute("data-focus-visible")).toBe("");
    expect(root.getAttribute("data-focus-source")).toBe("keyboard");

    control(harness).blur();

    expect(root.hasAttribute("data-focus")).toBe(false);
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
    expect(root.hasAttribute("data-focus-source")).toBe(false);
  });

  it("drives a textarea from the same machine, with no type to its name", () => {
    // No `defaultValue` here: a textarea has no `value` *attribute*, its initial
    // text is its child content — which is the adapter's business, not this
    // attribute-applying harness's. What is provable here is the behaviour.
    const harness = renderTextarea();
    const area = harness.part<HTMLTextAreaElement>("control");

    expect(area.tagName).toBe("TEXTAREA");
    expect(area.hasAttribute("type")).toBe(false);

    area.value = "notes\nsecond line";
    area.dispatchEvent(new Event("input", { bubbles: true }));

    expect(harness.api().value).toBe("notes\nsecond line");
  });
});
