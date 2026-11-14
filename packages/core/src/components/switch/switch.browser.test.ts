import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./switch.connect";
import { machine } from "./switch.machine";
import type { SwitchApi, SwitchMachineProps, SwitchSchema } from "./switch.types";

type Api = SwitchApi<DomPropTypes>;

function render(props: SwitchMachineProps = {}) {
  const harness = mountMachine<SwitchSchema, Api>({
    machine,
    connect,
    html: `<label><input /><span><span></span></span><span></span></label>`,
    id: "s1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getHiddenInputProps());
      apply(root.children[1] as Element, api.getControlProps());
      apply((root.children[1] as Element).children[0] as Element, api.getThumbProps());
      apply(root.children[2] as Element, api.getLabelProps());
    },
  });
  // The drag maths needs a real box to measure against.
  const control = harness.part("control");
  control.style.display = "block";
  control.style.inlineSize = "100px";
  control.style.blockSize = "30px";
  return harness;
}

function pointer(
  node: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  clientX: number,
): PointerEvent {
  const rect = node.getBoundingClientRect();
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    clientX: rect.left + clientX,
    clientY: rect.top + rect.height / 2,
  });
  node.dispatchEvent(event);
  return event;
}

afterEach(() => {
  unmountAll();
});

describe("switch", () => {
  it("is a switch to assistive technology, not a checkbox", () => {
    const harness = render();
    const input = harness.part<HTMLInputElement>("hidden-input");

    expect(input.type).toBe("checkbox");
    expect(input.getAttribute("role")).toBe("switch");
    expect(harness.part("root").getAttribute("data-state")).toBe("unchecked");
  });

  it("toggles from the label click, once", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });

    harness.part("root").click();

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(harness.api().checked).toBe(true);
  });

  it("follows the finger and commits to the side it was released on", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    expect(harness.part("root").getAttribute("data-pressed")).toBe("");

    pointer(control, "pointermove", 80);
    expect(harness.api().dragging).toBe(true);
    expect(harness.part("thumb").style.getPropertyValue("--sui-switch-progress")).toBe("0.8");

    pointer(control, "pointerup", 80);

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
    expect(harness.api().dragging).toBe(false);
    expect(harness.part("root").hasAttribute("data-pressed")).toBe(false);
  });

  it("stays put when the drag ends on the side it started from", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    pointer(control, "pointermove", 40);
    pointer(control, "pointerup", 40);

    // Released before halfway: the switch is where it was, and nothing changed,
    // so nothing is reported.
    expect(harness.api().checked).toBe(false);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("swallows the click a drag leaves behind", () => {
    const harness = render();
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    pointer(control, "pointermove", 80);
    pointer(control, "pointerup", 80);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    control.dispatchEvent(click);

    // Without this the browser's tap would undo the gesture that just happened.
    expect(click.defaultPrevented).toBe(true);
  });

  it("treats a press that never moved as a tap and leaves it to the browser", () => {
    const harness = render();
    const control = harness.part("control");

    pointer(control, "pointerdown", 50);
    const move = pointer(control, "pointermove", 52);
    pointer(control, "pointerup", 52);

    // Under the threshold: no preventDefault, no drag, and the label click that
    // follows is the one that toggles.
    expect(move.defaultPrevented).toBe(false);
    expect(harness.api().checked).toBe(false);
  });

  it("mirrors the gesture in RTL, where on is on the left", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ dir: "rtl", onCheckedChange });
    const control = harness.part("control");

    pointer(control, "pointerdown", 90);
    pointer(control, "pointermove", 20);
    pointer(control, "pointerup", 20);

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  // The sheet mirrors the thumb on `:dir(rtl)`, which matches an INHERITED
  // direction — so a gesture that only consulted the `dir` prop drew the thumb
  // one way and committed the value the other. Every other RTL test in this file
  // passes the prop, which is exactly the path that never broke.
  it("mirrors the gesture in a region that only inherits its direction", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });
    const control = harness.part("control");
    const region = control.closest("label")?.parentElement ?? control.ownerDocument.body;
    region.setAttribute("dir", "rtl");

    pointer(control, "pointerdown", 90);
    pointer(control, "pointermove", 20);
    pointer(control, "pointerup", 20);

    region.removeAttribute("dir");
    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  it("gives the gesture back on cancel without changing anything", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ onCheckedChange });
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    pointer(control, "pointermove", 90);
    pointer(control, "pointercancel", 90);

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(harness.api().dragging).toBe(false);
  });

  it("does not drag at all when the gesture is turned off", () => {
    const harness = render({ draggable: false });
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    pointer(control, "pointermove", 90);
    pointer(control, "pointerup", 90);

    expect(harness.api().checked).toBe(false);
    expect(harness.api().dragging).toBe(false);
  });

  it("refuses the gesture while disabled", () => {
    const onCheckedChange = vi.fn();
    const harness = render({ disabled: true, onCheckedChange });
    const control = harness.part("control");

    pointer(control, "pointerdown", 10);
    pointer(control, "pointermove", 90);
    pointer(control, "pointerup", 90);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
