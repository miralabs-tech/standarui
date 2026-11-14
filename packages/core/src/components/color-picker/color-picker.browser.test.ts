/**
 * The colour picker against a real engine, driven with no framework at all.
 *
 * The arithmetic and the state grammar are proved without a page in
 * `color-picker.test.ts`; everything here needs one and could not be faked — a box
 * to measure two percentages against, a pointer that keeps reporting after it has
 * left that box, a focus a press has to move, a grid whose roving stop is a real
 * `tabindex`, and an intent bus with a layer underneath it.
 *
 * The three shapes the 2026-08-27 audit made mandatory are all here: the minimal
 * markup with none of the optional parts, a collection whose first cell must not
 * be able to hold a tab stop it should not have, and a gamepad intent that travels
 * through a real bus.
 */

import { createIntentBus, getTabbables, type IntentBus } from "@standarx/nav";
import { afterEach, describe, expect, it } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./color-picker.connect";
import { machine } from "./color-picker.machine";
import type {
  ColorPickerApi,
  ColorPickerMachineProps,
  ColorPickerSchema,
} from "./color-picker.types";

type Api = ColorPickerApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

const AREA_SIZE = 200;
const TRACK_LENGTH = 200;
const KNOB = 20;
const SWATCHES = [
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#ffffff",
  "#000000",
];

const extra: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of extra.splice(0, extra.length)) dispose();
  unmountAll();
});

interface SceneOptions {
  /** The minimal shape the audit demands: a root and a trigger, nothing else. */
  readonly minimal?: boolean;
  readonly channel?: "hue" | "alpha";
}

function markup(options: SceneOptions): string {
  if (options.minimal === true) {
    return `<div><button data-slot="trigger"></button></div>`;
  }
  const cells = SWATCHES.map(
    (_value, index) => `<div data-slot="swatch" data-cell="${index}"></div>`,
  ).join("");
  return `
    <div>
      <span data-slot="label">Tint</span>
      <button data-slot="trigger"><span data-slot="trigger-swatch"></span></button>
      <input data-slot="hidden-input" />
      <div data-slot="content">
        <button data-slot="close-trigger"></button>
        <div data-slot="area">
          <div data-slot="area-background"></div>
          <div data-slot="area-thumb">
            <input data-slot="area-x-input" />
            <input data-slot="area-y-input" />
          </div>
        </div>
        <div data-slot="channel-slider">
          <span data-slot="channel-label">Hue</span>
          <div data-slot="channel-slider-track"></div>
          <div data-slot="channel-slider-thumb"></div>
        </div>
        <input data-slot="channel-input" />
        <select data-slot="format-select">
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
        </select>
        <div data-slot="swatch-group">
          <div data-slot="swatch-row">${cells}</div>
        </div>
      </div>
    </div>`;
}

function render(props: ColorPickerMachineProps = {}, options: SceneOptions = {}) {
  const channel = options.channel ?? "hue";
  const harness = mountMachine<ColorPickerSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: "cp1",
    props: { defaultOpen: true, swatches: SWATCHES, swatchColumns: 4, ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      apply(host.firstElementChild as Element, api.getRootProps());
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("label", api.getLabelProps());
      put("trigger", api.getTriggerProps());
      put("trigger-swatch", api.getTriggerSwatchProps());
      put("hidden-input", api.getHiddenInputProps());
      put("content", api.getContentProps());
      put("close-trigger", api.getCloseTriggerProps());
      put("area", api.getAreaProps());
      put("area-background", api.getAreaBackgroundProps());
      put("area-thumb", api.getAreaThumbProps());
      put("area-x-input", api.getAreaXInputProps());
      put("area-y-input", api.getAreaYInputProps());
      put("channel-slider", api.getChannelSliderProps({ channel }));
      put("channel-label", api.getChannelLabelProps({ channel }));
      put("channel-slider-track", api.getChannelSliderTrackProps({ channel }));
      put("channel-slider-thumb", api.getChannelSliderThumbProps({ channel }));
      put("channel-input", api.getChannelInputProps({ channel: "hex" }));
      put("format-select", api.getFormatSelectProps());
      put("swatch-group", api.getSwatchGroupProps());
      put("swatch-row", api.getSwatchRowProps({ row: 0 }));
      for (const cell of host.querySelectorAll<HTMLElement>('[data-slot="swatch"]')) {
        apply(cell, api.getSwatchProps({ index: Number(cell.dataset.cell) }));
      }
    },
  });

  if (options.minimal === true) return harness;

  // The percentage maths needs a real box, and the knob's own length is what
  // shortens a channel's travel — the sheet owns those numbers in an app, so the
  // test has to supply them here.
  const area = harness.part("area");
  area.style.position = "relative";
  area.style.display = "block";
  area.style.inlineSize = `${AREA_SIZE}px`;
  area.style.blockSize = `${AREA_SIZE}px`;

  const slider = harness.part("channel-slider");
  slider.style.position = "relative";
  slider.style.display = "block";
  slider.style.inlineSize = `${TRACK_LENGTH}px`;
  slider.style.blockSize = `${KNOB}px`;

  const thumb = harness.part("channel-slider-thumb");
  thumb.style.position = "absolute";
  thumb.style.inlineSize = `${KNOB}px`;
  thumb.style.blockSize = `${KNOB}px`;

  return harness;
}

type PointerType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";

function pointAt(node: HTMLElement, type: PointerType, x: number, y: number): PointerEvent {
  const rect = node.getBoundingClientRect();
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: rect.left + x,
    clientY: rect.top + y,
  });
  node.dispatchEvent(event);
  return event;
}

const press = (node: HTMLElement, name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  node.dispatchEvent(event);
  return event;
};

describe("color-picker — the area", () => {
  it("moves both channels in one drag and eats the click it leaves behind", () => {
    const harness = render({ defaultValue: "hsb(200 0% 100%)" });
    const area = harness.part("area");

    pointAt(area, "pointerdown", AREA_SIZE / 2, AREA_SIZE / 2);
    expect(harness.api().color.s).toBe(50);
    expect(harness.api().color.v).toBe(50);

    // Diagonal: right is more saturation, up is more brightness — two axes from
    // one gesture, which is what makes the area an area.
    pointAt(area, "pointermove", AREA_SIZE * 0.8, AREA_SIZE * 0.2);
    expect(harness.api().color.s).toBe(80);
    expect(harness.api().color.v).toBe(80);

    pointAt(area, "pointerup", AREA_SIZE * 0.8, AREA_SIZE * 0.2);
    expect(harness.api().dragging).toBe(false);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    area.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("clamps a drag that leaves the box instead of dropping it", () => {
    const harness = render({ defaultValue: "hsb(200 50% 50%)" });
    const area = harness.part("area");

    pointAt(area, "pointerdown", AREA_SIZE / 2, AREA_SIZE / 2);
    pointAt(area, "pointermove", AREA_SIZE * 3, -AREA_SIZE);

    // Pointer capture keeps the gesture alive; the arithmetic keeps it in range.
    expect(harness.api().color.s).toBe(100);
    expect(harness.api().color.v).toBe(100);
    expect(harness.api().dragging).toBe(true);
  });

  it("puts the focus on the axis input the press belongs to", () => {
    const harness = render();
    pointAt(harness.part("area"), "pointerdown", 10, 10);
    expect(document.activeElement).toBe(harness.part("area-x-input"));
  });

  it("answers the four arrows from one tab stop, and consumes every one of them", () => {
    const harness = render({ defaultValue: "hsb(200 50% 50%)" });
    const input = harness.part("area-x-input");

    expect(press(input, "ArrowRight").defaultPrevented).toBe(true);
    expect(harness.api().color.s).toBe(51);
    press(input, "ArrowUp");
    expect(harness.api().color.v).toBe(51);
    press(input, "ArrowLeft", { shiftKey: true });
    expect(harness.api().color.s).toBe(41);
    // Shift moves the bounds onto the second axis: the only way to reach the
    // brightness extremes without a second tab stop.
    press(input, "Home", { shiftKey: true });
    expect(harness.api().color.v).toBe(0);
  });

  it("mirrors only left and right when the picker is drawn right-to-left", () => {
    const harness = render({ dir: "rtl", defaultValue: "hsb(200 50% 50%)" });
    const input = harness.part("area-x-input");

    press(input, "ArrowRight");
    expect(harness.api().color.s).toBe(49);
    press(input, "ArrowUp");
    expect(harness.api().color.v).toBe(51);
    // The APG says Home is *the minimum value*, not the left end.
    press(input, "Home");
    expect(harness.api().color.s).toBe(0);
  });
});

describe("color-picker — a channel track", () => {
  it("moves the value and the focus in one press", () => {
    const harness = render({ defaultValue: "hsb(0 100% 100%)" });
    const slider = harness.part("channel-slider");

    // The knob's centre travels a track shortened by one knob, so the midpoint of
    // the travel is the midpoint of the box.
    pointAt(slider, "pointerdown", TRACK_LENGTH / 2, KNOB / 2);
    expect(harness.api().color.h).toBe(180);
    expect(document.activeElement).toBe(harness.part("channel-slider-thumb"));

    pointAt(slider, "pointermove", TRACK_LENGTH, KNOB / 2);
    expect(harness.api().color.h).toBe(360);
    // Under the pointer at the right edge, the thumb is published there too.
    const thumb = harness.part("channel-slider-thumb");
    expect(thumb.getAttribute("aria-valuenow")).toBe("360");
    expect(thumb.style.getPropertyValue("--sui-color-picker-channel-percent")).toBe("100%");
    pointAt(slider, "pointerup", TRACK_LENGTH, KNOB / 2);
    expect(harness.api().dragging).toBe(false);
  });

  it("does not eat the next click on the rest of the panel", () => {
    // The swallower that stops a drag from also being a click is bound to the whole
    // surface, so the flag it reads has to die with the gesture. It did not: after
    // any track drag, the first click on a swatch, on Close or on the eyedropper
    // was cancelled and nothing happened (audit of 2026-09-05).
    const harness = render({ defaultValue: "#ffffff" });
    const slider = harness.part("channel-slider");
    const cells = (): HTMLElement[] => [
      ...harness.host.querySelectorAll<HTMLElement>('[role="gridcell"]'),
    ];

    pointAt(slider, "pointerdown", TRACK_LENGTH / 2, KNOB / 2);
    pointAt(slider, "pointermove", TRACK_LENGTH, KNOB / 2);
    pointAt(slider, "pointerup", TRACK_LENGTH, KNOB / 2);

    // Still eaten on the track it was dragged on — the swallower is narrowed, not
    // removed, and this is the assertion that says so.
    const onTrack = new MouseEvent("click", { bubbles: true, cancelable: true });
    slider.dispatchEvent(onTrack);
    expect(onTrack.defaultPrevented).toBe(true);

    const target = cells()[2] as HTMLElement;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(harness.api().value).toBe("#0000ff");
  });

  it("names the thumb with the label the panel actually rendered", () => {
    const harness = render();
    const thumb = harness.part("channel-slider-thumb");

    // The `channelLabel` part is in this scene, so the machine wires the IDREF —
    // and it resolves, which is the whole point of asking the DOM first.
    expect(thumb.getAttribute("aria-labelledby")).toBe("color-picker:cp1:channel-label:hue");
    expect(document.getElementById("color-picker:cp1:channel-label:hue")).not.toBeNull();
    expect(thumb.getAttribute("aria-label")).toBeNull();
  });

  it("names channel by channel, and this scene is the mixed shape", () => {
    // The hue slider owns a label and the hex field does not — the ordinary
    // composition, and the one this harness has drawn all along without asserting
    // it. A single flag for the surface answered "labelled" for the hex field too:
    // an `aria-labelledby` pointing at an id nobody rendered, on a control that was
    // then nameless (audit of 2026-09-05).
    const harness = render();
    const hex = harness.part("channel-input");

    expect(hex.getAttribute("aria-labelledby")).toBeNull();
    expect(hex.getAttribute("aria-label")).toBe("Hex");
    expect(harness.api().getChannelSliderThumbProps({ channel: "hue" })["aria-labelledby"]).toBe(
      "color-picker:cp1:channel-label:hue",
    );

    // And no IDREF anywhere in the panel points at nothing.
    const dangling = [...harness.host.querySelectorAll("[aria-labelledby]")]
      .flatMap((node) => (node.getAttribute("aria-labelledby") ?? "").split(/\s+/))
      .filter((id) => id !== "" && document.getElementById(id) === null);
    expect(dangling).toEqual([]);
  });
});

describe("color-picker — focus modality", () => {
  /**
   * Spec browser test #8: a programmatic `.focus()` matches `:focus-visible` on
   * all three engines, so the ring can never be what proves the modality — the
   * assertion has to land on `data-focus-source` itself.
   */
  it("posts the modality a keydown set, on the part that actually took the focus", () => {
    const harness = render();
    const thumb = harness.part("channel-slider-thumb");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    thumb.focus();
    expect(thumb.getAttribute("data-focus-source")).toBe("keyboard");

    thumb.blur();
    expect(thumb.hasAttribute("data-focus-source")).toBe(false);
  });
});

describe("color-picker — the swatch grid", () => {
  it("is a grid of rows of cells with exactly one tab stop", () => {
    const harness = render();
    const group = harness.part("swatch-group");

    expect(group.getAttribute("role")).toBe("grid");
    expect(harness.part("swatch-row").getAttribute("role")).toBe("row");

    const cells = [...group.querySelectorAll<HTMLElement>('[role="gridcell"]')];
    expect(cells).toHaveLength(SWATCHES.length);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    // Every cell is a child of a row, which is what `aria-required-parent` asks.
    for (const cell of cells) expect(cell.parentElement?.getAttribute("role")).toBe("row");
  });

  it("moves in reading order, changes row, and does not wrap off the bottom", () => {
    const harness = render();
    const cells = () => [...harness.host.querySelectorAll<HTMLElement>('[role="gridcell"]')];

    const first = cells()[0] as HTMLElement;
    first.focus();
    press(first, "ArrowRight");
    expect(document.activeElement).toBe(cells()[1]);

    press(cells()[1] as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(cells()[5]);

    // Four columns, eight cells: the last row has nowhere below it.
    press(cells()[5] as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(cells()[5]);

    // Home is the row's start, Ctrl+Home the grid's.
    press(cells()[5] as HTMLElement, "Home");
    expect(document.activeElement).toBe(cells()[4]);
    press(cells()[4] as HTMLElement, "Home", { ctrlKey: true });
    expect(document.activeElement).toBe(cells()[0]);
  });

  it("mirrors the arrows right-to-left and leaves Home and End alone", () => {
    const harness = render({ dir: "rtl" });
    const cells = () => [...harness.host.querySelectorAll<HTMLElement>('[role="gridcell"]')];

    const second = cells()[1] as HTMLElement;
    second.focus();
    press(second, "ArrowRight");
    expect(document.activeElement).toBe(cells()[0]);

    press(cells()[0] as HTMLElement, "End");
    expect(document.activeElement).toBe(cells()[3]);
  });

  it("selects on click and on Space, and says which cell holds the value", () => {
    const harness = render({ defaultValue: "#ffffff" });
    const cells = () => [...harness.host.querySelectorAll<HTMLElement>('[role="gridcell"]')];

    (cells()[2] as HTMLElement).click();
    expect(harness.api().value).toBe("#0000ff");
    expect(cells()[2]?.getAttribute("aria-selected")).toBe("true");

    const target = cells()[3] as HTMLElement;
    target.focus();
    press(target, " ");
    target.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }));
    expect(harness.api().value).toBe("#ffff00");
  });

  /**
   * The audit's second mandatory shape. This component has no per-cell disabled
   * state — a colour cannot be unavailable, and inventing one would be a feature
   * nobody asked for — so the equivalent is the whole picker: the grid must then
   * hold **no** tab stop at all rather than parking its only one somewhere
   * unreachable, which is the defect `toggle-group` shipped.
   *
   * One stop survives on purpose: the close trigger. A surface opened and then
   * disabled keeps it as its one tab stop, and in a sheet the cancel card is
   * already out of the tab order — disabling the close too would leave a modal
   * surface with no stop at all. It has to close, not only take the focus.
   */
  it("holds no tab stop but the close trigger once the open picker is disabled", () => {
    const harness = render();
    harness.setProps({ disabled: true });
    const cells = [...harness.host.querySelectorAll<HTMLElement>('[role="gridcell"]')];

    expect(cells).toHaveLength(SWATCHES.length);
    for (const cell of cells) expect(cell.hasAttribute("tabindex")).toBe(false);
    // And the thumb leaves the tab order entirely rather than sitting at -1, where
    // a script's `.focus()` would still reach it.
    expect(harness.part("channel-slider-thumb").hasAttribute("tabindex")).toBe(false);
    expect((harness.part("trigger") as HTMLButtonElement).disabled).toBe(true);

    const close = harness.part<HTMLButtonElement>("close-trigger");
    expect(close.disabled).toBe(false);
    expect(getTabbables(harness.host)).toEqual([close]);

    expect(harness.api().open).toBe(true);
    close.click();
    expect(harness.api().open).toBe(false);
  });
});

describe("color-picker — the fields and the format", () => {
  it("reverts on the first Escape and closes on the second", () => {
    const harness = render({ defaultValue: "#0088ff" });
    const input = harness.part<HTMLInputElement>("channel-input");

    input.focus();
    input.value = "#zz";
    // `change`, not `input`: this harness speaks the identity dialect, where
    // `onChange` is the native `change` event. React's own `onChange` fires on
    // `input`, which is why the field's typing path is proved again through the
    // adapter next door.
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(harness.api().getChannelInputProps({ channel: "hex" }).value).toBe("#zz");

    // The layer listens on the document in capture, so the veto lives there:
    // a `stopPropagation` from the field could never get in front of it.
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(harness.api().open).toBe(true);
    expect(harness.api().getChannelInputProps({ channel: "hex" }).value).toBe("#0088ff");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(harness.api().open).toBe(false);
  });

  it("changes format from the native select without dismissing the surface", () => {
    const harness = render();
    const select = harness.part<HTMLSelectElement>("format-select");

    // A `<select>` is the one native control in the anatomy, and its dropdown is
    // painted by the system outside the DOM — so it is excluded from the layer.
    select.value = "rgb";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(harness.api().format).toBe("rgb");
    expect(harness.api().open).toBe(true);
    expect(select.closest('[data-part~="color-picker:content"]')).not.toBeNull();
  });
});

describe("color-picker — the minimal shape", () => {
  /** The audit's first mandatory shape: none of the optional parts is rendered. */
  it("connects with nothing but a root and a trigger", () => {
    const harness = render({ defaultOpen: false }, { minimal: true });
    const trigger = harness.part("trigger");

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    // No label part, so the trigger is named by its value rather than pointing at
    // an id nobody rendered.
    expect(trigger.hasAttribute("aria-labelledby")).toBe(false);
    expect(trigger.getAttribute("aria-label")).toBe("#000000");
    // No surface, so no IDREF to it either.
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    trigger.click();
    expect(harness.api().open).toBe(true);
  });
});

describe("color-picker — the gamepad", () => {
  function withPad(props: ColorPickerMachineProps = {}): { harness: Harness; bus: IntentBus } {
    const bus = createIntentBus();
    // A scope underneath the picker's, standing in for the dialog it sits inside.
    extra.push(bus.pushScope(() => false));
    const harness = render({ intents: bus, defaultValue: "hsb(200 50% 50%)", ...props });
    return { harness, bus };
  }

  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  it("takes hold of a focused thumb on A, and says so on the root and the track", () => {
    const { harness, bus } = withPad();
    harness.part("channel-slider-thumb").focus();

    expect(pad(bus, "select").consumed).toBe(true);
    expect(harness.api().engaged).toBe(true);
    expect(harness.part("root").getAttribute("data-engaged")).toBe("");
    expect(harness.part("channel-slider").getAttribute("data-engaged")).toBe("");

    pad(bus, "moveRight");
    pad(bus, "moveRight");
    pad(bus, "moveRight");
    expect(harness.api().color.h).toBe(203);

    // `pushEngageScope` consumes `back`, so B lets go of the value instead of
    // popping the layer underneath — the surface has to still be there after.
    expect(pad(bus, "back").consumed).toBe(true);
    expect(harness.api().color.h).toBe(200);
    expect(harness.api().open).toBe(true);
    expect(harness.part("root").hasAttribute("data-engaged")).toBe(false);
  });

  it("takes hold of the area on both axes — the library's first two-dimensional engage", () => {
    const { harness, bus } = withPad();
    harness.part("area-x-input").focus();

    expect(pad(bus, "select").consumed).toBe(true);
    expect(harness.part("area").getAttribute("data-engaged")).toBe("");

    pad(bus, "moveRight");
    expect(harness.api().color.s).toBe(51);
    pad(bus, "moveUp");
    expect(harness.api().color.v).toBe(51);

    pad(bus, "select");
    expect(harness.api().engaged).toBe(false);
    expect(harness.api().color.s).toBe(51);
  });

  it("never engages from the keyboard, whatever is focused", () => {
    const { harness, bus } = withPad();
    harness.part("channel-slider-thumb").focus();

    // Enter belongs to the form around the picker, and a keyboard engage would
    // hand Escape the power to rewind a value the user had settled on.
    expect(bus.dispatch({ intent: "select", source: "keyboard" }).consumed).toBe(false);
    expect(harness.api().engaged).toBe(false);
  });

  it("closes the surface on B while nothing is held", () => {
    const { harness, bus } = withPad();
    expect(pad(bus, "back").consumed).toBe(true);
    expect(harness.api().open).toBe(false);
  });
});
