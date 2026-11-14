import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./checkbox.connect";
import { machine } from "./checkbox.machine";
import type { CheckboxApi, CheckboxMachineProps, CheckboxSchema } from "./checkbox.types";

type Api = CheckboxApi<DomPropTypes>;

function render(props: CheckboxMachineProps = {}) {
  return mountMachine<CheckboxSchema, Api>({
    machine,
    connect,
    // The shape a consumer writes: the root is the label, the input lives inside it.
    html: `<label><input /><span><span></span></span><span></span></label>`,
    id: "c1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getHiddenInputProps());
      apply(root.children[1] as Element, api.getControlProps());
      apply((root.children[1] as Element).children[0] as Element, api.getIndicatorProps());
      apply(root.children[2] as Element, api.getLabelProps());
    },
  });
}

function input(harness: ReturnType<typeof render>): HTMLInputElement {
  return harness.part<HTMLInputElement>("hidden-input");
}

afterEach(() => {
  unmountAll();
});

describe("checkbox", () => {
  it("puts a real checkbox in the form, hidden but focusable", () => {
    const harness = render({ name: "terms", value: "yes" });
    const field = input(harness);

    expect(field.type).toBe("checkbox");
    expect(field.name).toBe("terms");
    expect(field.value).toBe("yes");
    expect(field.checked).toBe(false);
    // Visually hidden, not removed: it stays in the tab order.
    expect(field.style.position).toBe("absolute");
    field.focus();
    expect(document.activeElement).toBe(field);
  });

  it("toggles from the input's own change event", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });

    input(harness).click();

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
    expect(harness.part("root").getAttribute("data-state")).toBe("checked");
    expect(input(harness).checked).toBe(true);
  });

  it("toggles once when the label is clicked, not twice", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });

    // The browser forwards a label click to the input; a handler on the root
    // would toggle it straight back.
    harness.part("root").click();

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(harness.api().checked).toBe(true);
  });

  it("writes indeterminate as the DOM property it is", () => {
    const harness = render({ defaultChecked: "indeterminate" });

    expect(input(harness).indeterminate).toBe(true);
    expect(harness.part("root").getAttribute("data-state")).toBe("indeterminate");
    expect(harness.api().indeterminate).toBe(true);
  });

  it("goes from mixed to checked, never back to unchecked", () => {
    const harness = render({ defaultChecked: "indeterminate" });

    harness.api().toggle();

    expect(harness.api().checked).toBe(true);
    expect(input(harness).indeterminate).toBe(false);
  });

  it("refuses to change while read-only, and says so", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ readOnly: true, onCheckedChange });

    expect(input(harness).getAttribute("aria-readonly")).toBe("true");
    // Not disabled: still focusable, still announced.
    expect(input(harness).disabled).toBe(false);

    harness.api().toggle();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("refuses to change while disabled", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ disabled: true, onCheckedChange });

    expect(input(harness).disabled).toBe(true);
    expect(harness.part("root").getAttribute("data-disabled")).toBe("");

    harness.api().toggle();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("reports but does not write while controlled", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ checked: false, onCheckedChange });

    harness.api().toggle();

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
    expect(harness.api().checked).toBe(false);

    harness.setProps({ checked: true });
    expect(harness.part("root").getAttribute("data-state")).toBe("checked");
  });

  it("carries invalid onto the input and the stylable state", () => {
    const harness = render({ invalid: true });

    expect(input(harness).getAttribute("aria-invalid")).toBe("true");
    expect(harness.part("root").getAttribute("data-invalid")).toBe("");
  });

  it("hides the drawn box from assistive technology", () => {
    const harness = render();

    expect(harness.part("control").getAttribute("aria-hidden")).toBe("true");
    expect(harness.part("indicator").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the focus ring only for a keyboard modality", () => {
    const harness = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    input(harness).focus();

    expect(harness.part("root").getAttribute("data-focus-visible")).toBe("");
  });
});
