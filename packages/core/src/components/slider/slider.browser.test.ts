/**
 * The slider against a real engine, driven with no framework at all.
 *
 * The arithmetic is tested without a page in `slider.test.ts`; everything here
 * needs one and could not be faked — a box to measure a percentage against, a
 * pointer that keeps reporting after it has left that box, a focus that a press
 * has to move, an intent bus with a layer underneath it.
 *
 * The harness applies the prop getters to real nodes and repaints on settle,
 * which is the shape `@standarui/vanilla` will take: what passes here is what
 * the core promises every adapter, React included.
 */

import { createIntentBus, getTabbables, type IntentBus, setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./slider.connect";
import { machine } from "./slider.machine";
import type { SliderApi, SliderMachineProps, SliderSchema } from "./slider.types";

type Api = SliderApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

const CONTROL_LENGTH = 200;
const THUMB_LENGTH = 20;
/** Half a thumb at each end: the centre of a `contain` thumb travels 180 of 200. */
const TRAVEL = CONTROL_LENGTH - THUMB_LENGTH;

interface SceneOptions {
  /** Left out to prove the thumb never points at a label that was not rendered. */
  readonly label?: boolean;
  /** The consumer's own name, for the shape that has no label part to borrow. */
  readonly ariaLabel?: string;
  readonly vertical?: boolean;
}

function markup(options: SceneOptions): string {
  const label = options.label === false ? "" : `<span data-slot="label">Volume</span>`;
  const name = options.ariaLabel === undefined ? "" : ` aria-label="${options.ariaLabel}"`;
  return `
    <div>
      ${label}
      <span data-slot="value-text"></span>
      <div data-slot="control">
        <div data-slot="track"><div data-slot="range"></div></div>
        <div data-slot="thumb"${name}></div>
        <div data-slot="marker-group"></div>
      </div>
      <input data-slot="hidden-input" />
    </div>`;
}

function render(props: SliderMachineProps = {}, options: SceneOptions = {}) {
  const harness = mountMachine<SliderSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: "sl1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      apply(host.firstElementChild as Element, api.getRootProps());
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("label", api.getLabelProps());
      put("value-text", api.getValueTextProps());
      put("control", api.getControlProps());
      put("track", api.getTrackProps());
      put("range", api.getRangeProps());
      put("thumb", api.getThumbProps({ index: 0 }));
      put("hidden-input", api.getHiddenInputProps({ index: 0 }));

      const group = host.querySelector('[data-slot="marker-group"]');
      if (group === null) return;
      apply(group, api.getMarkerGroupProps());
      // The ticks are the consumer's to render, from `api.marks` — so the harness
      // renders them the same way an adapter's `.map()` would.
      api.marks.forEach((mark: number, index: number) => {
        let node = group.children[index];
        if (node === undefined) {
          node = document.createElement("div");
          group.append(node);
        }
        apply(node, api.getMarkerProps({ value: mark }));
      });
    },
  });

  // The percentage maths needs a real box, and the thumb's own length is what
  // shortens the travel under `contain` — the sheet owns that number in an app,
  // so the test has to supply one here.
  const control = harness.part("control");
  control.style.position = "relative";
  control.style.display = "block";
  control.style.inlineSize = `${options.vertical === true ? 44 : CONTROL_LENGTH}px`;
  control.style.blockSize = `${options.vertical === true ? CONTROL_LENGTH : 44}px`;

  const thumb = harness.part("thumb");
  thumb.style.position = "absolute";
  thumb.style.inlineSize = `${options.vertical === true ? 44 : THUMB_LENGTH}px`;
  thumb.style.blockSize = `${options.vertical === true ? THUMB_LENGTH : 44}px`;

  return harness;
}

type PointerType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";

/** `offset` is measured from the control's leading edge, along its own axis. */
function pointer(harness: Harness, type: PointerType, offset: number): PointerEvent {
  const control = harness.part("control");
  const rect = control.getBoundingClientRect();
  const vertical = harness.part("root").getAttribute("data-orientation") === "vertical";
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: rect.left + (vertical ? rect.width / 2 : offset),
    clientY: rect.top + (vertical ? offset : rect.height / 2),
  });
  control.dispatchEvent(event);
  return event;
}

/** The offset that puts a `contain` thumb's centre at `percent` of the travel. */
const at = (percent: number): number => THUMB_LENGTH / 2 + percent * TRAVEL;

function key(harness: Harness, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  harness.part("thumb").dispatchEvent(event);
  return event;
}

/** Long enough for a MutationObserver's callback to have been delivered. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const extra: VoidFunction[] = [];

afterEach(() => {
  unmountAll();
  for (const dispose of extra.splice(0, extra.length)) dispose();
});

describe("slider — the pointer", () => {
  it("jumps to the press, takes the focus with it, and reports the gesture once", () => {
    const onValueChange = vi.fn();
    const onValueChangeEnd = vi.fn();
    const harness = render({ defaultValue: 0, onValueChange, onValueChangeEnd });

    pointer(harness, "pointerdown", at(0.5));

    expect(harness.api().value).toEqual([50]);
    // APG: a press on the track moves the value *and* the focus, so the arrows
    // carry on from where the pointer left off.
    expect(document.activeElement).toBe(harness.part("thumb"));
    expect(harness.part("root").getAttribute("data-dragging")).toBe("");

    pointer(harness, "pointerup", at(0.5));

    expect(onValueChange).toHaveBeenCalledWith({ value: [50] });
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    expect(onValueChangeEnd).toHaveBeenCalledWith({ value: [50] });
    expect(harness.part("root").hasAttribute("data-dragging")).toBe(false);
  });

  it("follows the finger, and publishes the percentage the sheet places from", () => {
    const harness = render({ defaultValue: 0 });
    const thumb = harness.part("thumb");

    pointer(harness, "pointerdown", at(0));
    expect(harness.api().value).toEqual([0]);

    pointer(harness, "pointermove", at(0.25));
    expect(harness.api().value).toEqual([25]);
    expect(thumb.style.getPropertyValue("--sui-slider-thumb-percent")).toBe("25%");
    expect(thumb.getAttribute("data-dragging")).toBe("");

    pointer(harness, "pointermove", at(0.75));
    expect(thumb.style.getPropertyValue("--sui-slider-thumb-percent")).toBe("75%");

    pointer(harness, "pointerup", at(0.75));
    expect(harness.api().value).toEqual([75]);
    expect(thumb.hasAttribute("data-dragging")).toBe(false);
  });

  it("clamps a finger that runs off either end", () => {
    const harness = render({ defaultValue: 50 });

    pointer(harness, "pointerdown", at(0.5));
    pointer(harness, "pointermove", -400);
    expect(harness.api().value).toEqual([0]);

    pointer(harness, "pointermove", 900);
    expect(harness.api().value).toEqual([100]);
  });

  it("captures the pointer, so a finger outside the box keeps driving the value", () => {
    const harness = render({ defaultValue: 0 });
    const control = harness.part("control");
    const capture = vi.spyOn(control, "setPointerCapture");

    pointer(harness, "pointerdown", at(0.5));

    // Without the capture the move below would be delivered to whatever the
    // finger happened to be over, and the drag would stop at the edge.
    expect(capture).toHaveBeenCalledWith(1);

    pointer(harness, "pointermove", CONTROL_LENGTH + 300);
    expect(harness.api().value).toEqual([100]);
  });

  it("ignores a second pointer that joins a gesture already in flight", () => {
    const harness = render({ defaultValue: 0 });
    const control = harness.part("control");
    const rect = control.getBoundingClientRect();

    pointer(harness, "pointerdown", at(0.5));
    control.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 2,
        isPrimary: false,
        clientX: rect.left + at(1),
        clientY: rect.top + rect.height / 2,
      }),
    );

    expect(harness.api().value).toEqual([50]);
  });

  it("swallows the click a drag leaves behind", () => {
    const harness = render({ defaultValue: 0 });

    pointer(harness, "pointerdown", at(0));
    pointer(harness, "pointermove", at(0.8));
    pointer(harness, "pointerup", at(0.8));

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    harness.part("control").dispatchEvent(click);

    // A gesture is not a click, and a consumer's own handler must not act on one.
    expect(click.defaultPrevented).toBe(true);
  });

  it("leaves the click alone when the press never travelled", () => {
    const harness = render({ defaultValue: 0 });

    pointer(harness, "pointerdown", at(0.5));
    pointer(harness, "pointermove", at(0.5) + 2);
    pointer(harness, "pointerup", at(0.5) + 2);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    harness.part("control").dispatchEvent(click);

    // Under the threshold: the value still moved by those two pixels, but the tap
    // belongs to the page.
    expect(click.defaultPrevented).toBe(false);
  });

  it("finishes the gesture cleanly when the pointer is cancelled", () => {
    const onValueChangeEnd = vi.fn();
    const harness = render({ defaultValue: 0, onValueChangeEnd });

    pointer(harness, "pointerdown", at(0.5));
    pointer(harness, "pointercancel", at(0.5));

    expect(harness.api().dragging).toBe(false);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });

  it("snaps a dragged value to the step grid", () => {
    const harness = render({ defaultValue: 0, step: 25 });

    pointer(harness, "pointerdown", at(0.4));

    expect(harness.api().value).toEqual([50]);
  });

  it("reads the vertical axis from the bottom", () => {
    const harness = render({ defaultValue: 0, orientation: "vertical" }, { vertical: true });

    pointer(harness, "pointerdown", at(0.25));

    // 25% *down* the control is 75% of the value: the axis has no writing order,
    // so it is read the way a level is.
    expect(harness.api().value).toEqual([75]);
  });

  it("mirrors the horizontal axis in RTL", () => {
    const harness = render({ defaultValue: 0, dir: "rtl" });

    pointer(harness, "pointerdown", at(0.25));

    expect(harness.api().value).toEqual([75]);
  });
});

describe("slider — the keyboard", () => {
  it("moves by a step, a page and to the ends — the eight APG keys", () => {
    const onValueChangeEnd = vi.fn();
    const harness = render({ defaultValue: 50, onValueChangeEnd });

    key(harness, { key: "ArrowRight" });
    expect(harness.api().value).toEqual([51]);
    // One key press is one whole gesture, and it reports exactly once.
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);

    key(harness, { key: "ArrowLeft" });
    expect(harness.api().value).toEqual([50]);

    key(harness, { key: "ArrowUp" });
    expect(harness.api().value).toEqual([51]);

    key(harness, { key: "ArrowDown" });
    expect(harness.api().value).toEqual([50]);

    // A tenth of the range, not ten steps.
    key(harness, { key: "PageUp" });
    expect(harness.api().value).toEqual([60]);

    key(harness, { key: "PageDown" });
    expect(harness.api().value).toEqual([50]);

    key(harness, { key: "Home" });
    expect(harness.api().value).toEqual([0]);

    key(harness, { key: "End" });
    expect(harness.api().value).toEqual([100]);
  });

  it("mirrors only left and right in RTL", () => {
    const harness = render({ defaultValue: 50, dir: "rtl" });

    key(harness, { key: "ArrowRight" });
    expect(harness.api().value).toEqual([49]);

    key(harness, { key: "ArrowLeft" });
    expect(harness.api().value).toEqual([50]);

    // Up and down have no writing order to follow.
    key(harness, { key: "ArrowUp" });
    expect(harness.api().value).toEqual([51]);

    // And the APG says Home is *the minimum value*, not the left-hand end. This
    // is the cell a wholesale RTL mirror gets wrong.
    key(harness, { key: "Home" });
    expect(harness.api().value).toEqual([0]);

    key(harness, { key: "End" });
    expect(harness.api().value).toEqual([100]);
  });

  it("keeps the same keymap on the vertical axis", () => {
    const harness = render(
      { defaultValue: 50, orientation: "vertical", dir: "rtl" },
      { vertical: true },
    );

    key(harness, { key: "ArrowUp" });
    expect(harness.api().value).toEqual([51]);

    key(harness, { key: "ArrowDown" });
    expect(harness.api().value).toEqual([50]);

    // Mirroring these would break the vertical slider outright, since there is no
    // left and right to speak of.
    key(harness, { key: "ArrowRight" });
    expect(harness.api().value).toEqual([51]);
  });

  it("stops at the ends without reporting a change", () => {
    const onValueChange = vi.fn();
    const harness = render({ defaultValue: 100, onValueChange });

    key(harness, { key: "ArrowRight" });
    key(harness, { key: "End" });

    expect(harness.api().value).toEqual([100]);
    // The array is rebuilt on every write; without `isEqual` on the bindable this
    // would report a change per key press, forever.
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("takes the eight keys it consumes and leaves the rest to the page", () => {
    const harness = render({ defaultValue: 50 });

    expect(key(harness, { key: "ArrowRight" }).defaultPrevented).toBe(true);
    expect(key(harness, { key: "PageDown" }).defaultPrevented).toBe(true);
    expect(key(harness, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(key(harness, { key: "Enter" }).defaultPrevented).toBe(false);
  });

  it("declines Shift and the modifiers, which belong to whoever else wants them", () => {
    const harness = render({ defaultValue: 50 });

    for (const init of [
      { key: "ArrowRight", shiftKey: true },
      { key: "ArrowRight", ctrlKey: true },
      { key: "ArrowRight", metaKey: true },
      { key: "ArrowRight", altKey: true },
    ]) {
      expect(key(harness, init).defaultPrevented).toBe(false);
    }
    expect(harness.api().value).toEqual([50]);
  });
});

describe("slider — read-only, disabled and invalid", () => {
  it("says it is invalid on the element that carries the role", () => {
    const harness = render({ defaultValue: 50, invalid: true });

    // The thumb is the `role="slider"`: a field marked invalid around a slider
    // that only stated it in `data-invalid` announced nothing at all.
    expect(harness.part("thumb").getAttribute("aria-invalid")).toBe("true");
    expect(harness.part("root").getAttribute("data-invalid")).toBe("");

    harness.setProps({ invalid: false });
    expect(harness.part("thumb").hasAttribute("aria-invalid")).toBe(false);
  });

  it("says it is required on the same element", () => {
    const harness = render({ defaultValue: 50, required: true });

    // An announcement, not a constraint: the submission is a `type="hidden"`
    // input and never validates. Without this the field's asterisk was drawn
    // and never spoken.
    expect(harness.part("thumb").getAttribute("aria-required")).toBe("true");

    harness.setProps({ required: false });
    expect(harness.part("thumb").hasAttribute("aria-required")).toBe(false);
  });

  it("keeps a read-only slider reachable, inert and out of the page's way", () => {
    const onValueChange = vi.fn();
    const harness = render({ defaultValue: 50, readOnly: true, onValueChange });

    const paging = key(harness, { key: "PageDown" });

    expect(harness.api().value).toEqual([50]);
    expect(onValueChange).not.toHaveBeenCalled();
    // The interactive test sits *before* `preventDefault`: on a read-only slider
    // PageDown still has to scroll the page.
    expect(paging.defaultPrevented).toBe(false);
    expect(harness.part("thumb").getAttribute("tabindex")).toBe("0");

    pointer(harness, "pointerdown", at(1));
    expect(harness.api().value).toEqual([50]);
  });

  it("takes a disabled slider out of the tab order and answers no gesture", () => {
    const onValueChange = vi.fn();
    const harness = render({ defaultValue: 50, disabled: true, onValueChange });
    const thumb = harness.part("thumb");

    expect(thumb.hasAttribute("tabindex")).toBe(false);
    // The shape the 2026-08-27 audit called out: a disabled control in first
    // position must be *skipped*, not landed on and refused.
    expect(getTabbables(harness.host)).not.toContain(thumb);

    key(harness, { key: "ArrowRight" });
    pointer(harness, "pointerdown", at(1));
    pointer(harness, "pointerup", at(1));

    expect(harness.api().value).toEqual([50]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("finishes a gesture that was in flight when the slider went disabled", () => {
    const onValueChangeEnd = vi.fn();
    const harness = render({ defaultValue: 0, onValueChangeEnd });

    pointer(harness, "pointerdown", at(0.5));
    harness.setProps({ disabled: true });
    pointer(harness, "pointerup", at(0.5));

    // `THUMB.DRAG_END` carries no interactive guard on purpose: a control that is
    // turned off mid-gesture still has to put its own state back.
    expect(harness.api().dragging).toBe(false);
    expect(harness.part("root").hasAttribute("data-dragging")).toBe(false);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });
});

describe("slider — the controlled value", () => {
  it("reports the change without writing it, and follows the prop back down", () => {
    const onValueChange = vi.fn();
    const harness = render({ value: 20, onValueChange });

    key(harness, { key: "ArrowRight" });

    // The consumer owns the value: the machine asks, and waits.
    expect(harness.api().value).toEqual([20]);
    expect(onValueChange).toHaveBeenCalledWith({ value: [21] });

    harness.setProps({ value: 21 });
    expect(harness.api().value).toEqual([21]);
    expect(harness.part("thumb").getAttribute("aria-valuenow")).toBe("21");
  });
});

describe("slider — focus", () => {
  it("holds the modality focus arrived under, and does not let a mouse rewrite it", () => {
    const harness = render({ defaultValue: 50 });
    const thumb = harness.part("thumb");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    thumb.focus();

    expect(thumb.getAttribute("data-focus-source")).toBe("keyboard");
    expect(thumb.getAttribute("data-focus-visible")).toBe("");

    // What 300ms of mouse movement does to the document's modality. The ring must
    // not blink out from under a user who never touched the mouse to this control.
    setInputModality(document, "pointer");
    harness.setProps({});

    expect(thumb.getAttribute("data-focus-source")).toBe("keyboard");
    expect(harness.api().focusVisible).toBe(true);

    thumb.blur();
    expect(thumb.hasAttribute("data-focus-source")).toBe(false);
    expect(harness.api().focusSource).toBeNull();
  });

  it("shows no ring for a focus that arrived from a pointer", () => {
    const harness = render({ defaultValue: 50 });

    pointer(harness, "pointerdown", at(0.5));
    pointer(harness, "pointerup", at(0.5));

    expect(harness.part("thumb").hasAttribute("data-focus-visible")).toBe(false);
    expect(harness.api().focusSource).toBe("pointer");
  });
});

describe("slider — the label", () => {
  it("points at the label part once it has been proved to exist", () => {
    const harness = render({ defaultValue: 50 });

    expect(harness.part("thumb").getAttribute("aria-labelledby")).toBe("slider:sl1:label");
    expect(harness.part("label").id).toBe("slider:sl1:label");
  });

  it("emits no dangling IDREF on the shape that has no label at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = render({ defaultValue: 50 }, { label: false });

    // The regression class the 2026-08-27 audit found in two components: every
    // fixture rendered its label, so the pointer at a non-existent id was
    // unobservable.
    expect(harness.part("thumb").hasAttribute("aria-labelledby")).toBe(false);
    expect(document.getElementById("slider:sl1:label")).toBeNull();
    // `role="slider"` demands a name and the library cannot invent one — said one
    // task late, so a `field` above gets to hand its own label down first.
    await tick();
    expect(warn.mock.calls.flat().join(" ")).toContain("no accessible name");
    warn.mockRestore();
  });

  it("says nothing when the consumer named the thumb itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render({ defaultValue: 50 }, { label: false, ariaLabel: "Volume" });

    // Awaited past the deferred check, or this passes without proving anything.
    await tick();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("says nothing when the name arrives from outside, the way a field hands one over", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = render({ defaultValue: 50 }, { label: false });

    // A field learns its own label exists only after its child's effects have
    // run, so `labelledBy` always lands late. The warning has to survive that.
    harness.setProps({ labelledBy: "some-outer-label" });
    await tick();

    expect(harness.part("thumb").getAttribute("aria-labelledby")).toBe("some-outer-label");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("picks the label up when it is rendered later, without a re-mount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = render({ defaultValue: 50 }, { label: false });
    const root = harness.part("root");

    // What an adapter does when a consumer renders a label into a slider that
    // was mounted without one: the element arrives already wearing its part
    // attributes.
    const label = document.createElement("span");
    for (const [name, value] of Object.entries(harness.api().getLabelProps())) {
      label.setAttribute(name, String(value));
    }
    root.prepend(label);
    await tick();

    // The mutation observer is what closes the gap between "the adapter rendered
    // it" and "the machine may point at it".
    expect(harness.part("thumb").getAttribute("aria-labelledby")).toBe("slider:sl1:label");
    warn.mockRestore();
  });
});

describe("slider — the ticks", () => {
  it("places every tick and marks the ones the value has crossed", () => {
    const harness = render({ defaultValue: 40, marks: [0, 50, 100] });
    const markers = [...harness.host.querySelectorAll<HTMLElement>('[data-part~="slider:marker"]')];

    expect(markers).toHaveLength(3);
    expect(markers.map((node) => node.style.getPropertyValue("--sui-marker-percent"))).toEqual([
      "0%",
      "50%",
      "100%",
    ]);
    expect(markers.map((node) => node.getAttribute("data-state"))).toEqual([
      "in-range",
      "out-of-range",
      "out-of-range",
    ]);

    key(harness, { key: "End" });

    expect(markers.map((node) => node.getAttribute("data-state"))).toEqual([
      "in-range",
      "in-range",
      "in-range",
    ]);
  });

  it("keeps the tick rail out of the accessibility tree", () => {
    const harness = render({ defaultValue: 40, marks: 3 });

    expect(harness.part("marker-group").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("slider — the gamepad", () => {
  function withPad(props: SliderMachineProps = {}): {
    harness: Harness;
    bus: IntentBus;
    seen: string[];
  } {
    const bus = createIntentBus();
    const seen: string[] = [];
    // A scope underneath the slider's, standing in for the dialog or the popover
    // it sits inside.
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    const harness = render({ defaultValue: 50, intents: bus, ...props });
    harness.part("thumb").focus();
    return { harness, bus, seen };
  }

  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  it("takes hold of the value on A, and says so on the root and the thumb", () => {
    const { harness, bus, seen } = withPad();

    expect(pad(bus, "select").consumed).toBe(true);

    expect(harness.api().engaged).toBe(true);
    // Our own state, and it has to exist: a knob held by a pad must not look like
    // a knob merely focused, or the user cannot tell whether the d-pad will move
    // the focus or the value.
    expect(harness.part("root").getAttribute("data-engaged")).toBe("");
    expect(harness.part("thumb").getAttribute("data-engaged")).toBe("");
    expect(seen).toEqual([]);
  });

  it("turns the directional intents into steps and the triggers into pages", () => {
    const { harness, bus } = withPad();
    pad(bus, "select");

    pad(bus, "moveRight");
    expect(harness.api().value).toEqual([51]);

    pad(bus, "moveLeft");
    expect(harness.api().value).toEqual([50]);

    // LT and RT, per the engage grammar (CDC §4.4).
    pad(bus, "pageUp");
    expect(harness.api().value).toEqual([60]);

    pad(bus, "home");
    expect(harness.api().value).toEqual([0]);

    pad(bus, "end");
    expect(harness.api().value).toEqual([100]);
  });

  it("mirrors the pad exactly as it mirrors the keyboard", () => {
    const { harness, bus } = withPad({ dir: "rtl" });
    pad(bus, "select");

    pad(bus, "moveRight");
    expect(harness.api().value).toEqual([49]);

    pad(bus, "home");
    expect(harness.api().value).toEqual([0]);
  });

  it("commits on a second A and lets go", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus } = withPad({ onValueChangeEnd });
    pad(bus, "select");
    pad(bus, "moveRight");

    pad(bus, "select");

    expect(harness.api().value).toEqual([51]);
    expect(harness.api().engaged).toBe(false);
    expect(harness.part("root").hasAttribute("data-engaged")).toBe(false);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    expect(onValueChangeEnd).toHaveBeenLastCalledWith({ value: [51] });
  });

  it("puts the value back on B, and never lets B reach the layer underneath", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus, seen } = withPad({ onValueChangeEnd });
    pad(bus, "select");
    pad(bus, "moveRight");
    pad(bus, "moveRight");
    expect(harness.api().value).toEqual([52]);

    const dispatch = pad(bus, "back");

    expect(harness.api().value).toEqual([50]);
    expect(harness.api().engaged).toBe(false);
    // The reason `back` is consumed by the engage scope: without it, leaving a
    // slider inside a popover would close the popover on the way out.
    expect(dispatch.consumed).toBe(true);
    expect(seen).toEqual([]);
    // Once per gesture, with the value the gesture ended on — the restored one.
    // The count is the assertion: the two `moveRight` inside the hold adjust the
    // value, they do not end anything.
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    expect(onValueChangeEnd).toHaveBeenLastCalledWith({ value: [50] });
  });

  it("ends the gesture once however many ways the value moved inside the hold", () => {
    const onValueChangeEnd = vi.fn();
    const { bus } = withPad({ onValueChangeEnd });
    pad(bus, "select");

    // All four value events, because all four are answered twice — once at
    // machine level, once inside `engaged` — and only the second must be silent.
    pad(bus, "moveRight");
    pad(bus, "moveLeft");
    pad(bus, "pageUp");
    pad(bus, "home");
    pad(bus, "end");

    expect(onValueChangeEnd).not.toHaveBeenCalled();

    pad(bus, "select");

    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    expect(onValueChangeEnd).toHaveBeenCalledWith({ value: [100] });
  });

  it("can be taken hold of again after it was let go", () => {
    const { harness, bus } = withPad();

    pad(bus, "select");
    pad(bus, "back");
    pad(bus, "select");

    expect(harness.api().engaged).toBe(true);
  });

  it("gives the directions back the moment the focus leaves", () => {
    const { harness, bus, seen } = withPad();
    pad(bus, "select");

    harness.part("thumb").blur();
    pad(bus, "moveRight");

    // The scope goes with the state: a blurred slider must not keep eating the
    // pad's navigation.
    expect(harness.api().engaged).toBe(false);
    expect(harness.api().value).toEqual([50]);
    expect(seen).toEqual(["moveRight"]);
    expect(bus.depth()).toBe(1);
  });

  it("lets A through on a read-only slider rather than swallowing it", () => {
    const { harness, bus, seen } = withPad({ readOnly: true });

    const dispatch = pad(bus, "select");

    expect(harness.api().engaged).toBe(false);
    expect(dispatch.consumed).toBe(false);
    expect(seen).toEqual(["select"]);
  });

  it("leaves the keyboard's own Enter alone — engage is the pad's grammar", () => {
    const { harness, bus, seen } = withPad();

    const dispatch = bus.dispatch({ intent: "select", source: "keyboard" });

    // Enter on a slider belongs to the form around it, and a keyboard engage
    // would hand Escape the power to rewind a value the user had settled on.
    expect(harness.api().engaged).toBe(false);
    expect(dispatch.consumed).toBe(false);
    expect(seen).toEqual(["select"]);
  });

  it("detaches silently when the slider unmounts mid-hold", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus } = withPad({ onValueChangeEnd });
    pad(bus, "select");

    harness.destroy();

    // Unmounting is not the user letting go: an `onValueChangeEnd` here would
    // report a gesture nobody made.
    expect(onValueChangeEnd).not.toHaveBeenCalled();
    expect(bus.depth()).toBe(1);
  });
});
