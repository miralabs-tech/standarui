/**
 * The node half of `color-picker`: no document anywhere, the open surface
 * included.
 *
 * The colour arithmetic is next door in `utils/color.test.ts` — it belongs to
 * every consumer of the module, not to this component. What is here is what a
 * machine can answer alone: the presentation resolution, the pure `initialState`,
 * the step grammar on both axes, the engage hold with its snapshot, the draft
 * discipline of the fields, the swatch store, and the two-dimensional keyboard.
 * Anything that needs a box to measure, a real focus or a real gesture lives in
 * `color-picker.browser.test.ts`.
 */

import { createIntentBus, type IntentBus } from "@standarx/nav";
import { describe, expect, it, vi } from "vitest";
import { getGridKeyAction, getGridNextIndex } from "../../collection/grid-collection";
import type { MachineParams } from "../../machine/types";
import { type ColorValue, parseColor, toRgb255 } from "../../utils/color";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./color-picker.connect";
import { machine } from "./color-picker.machine";
import { getAreaKeyEvent, getChannelKeyEvent } from "./color-picker.props";
import type {
  ColorPickerApi,
  ColorPickerEyedropper,
  ColorPickerMachineProps,
  ColorPickerSchema,
} from "./color-picker.types";
import { eyedropper } from "./eyedropper";

type Api = ColorPickerApi<PlainPropTypes>;

const build = (props: ColorPickerMachineProps = {}, id = "cp1") =>
  connectWithoutDom<ColorPickerSchema, Api>({ machine, connect, id, props });

function run(props: ColorPickerMachineProps = {}, id = "cp1") {
  const harness = build(props, id);
  harness.service.start();
  return harness;
}

const open = (props: ColorPickerMachineProps = {}) => run({ defaultOpen: true, ...props });

/** What a prop getter's key handler is handed, minus everything it never reads. */
function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
    ...init,
  } as unknown as KeyboardEvent;
}

describe("color-picker without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
    // The inline panel is open from the first byte the server writes, and it is
    // read from the prop — no density, no document, no environment.
    expect(build({ presentation: "inline" }).service.state.get()).toBe("open");
  });

  it("connects the trigger and the surface with no document to reach for", () => {
    const harness = build({ defaultValue: "#0088ff" });
    const trigger = harness.api().getTriggerProps();

    expect(harness.service.status()).toBe("not-started");
    expect(trigger.id).toBe("color-picker:cp1:trigger");
    expect(trigger.type).toBe("button");
    expect(trigger["aria-haspopup"]).toBe("dialog");
    expect(trigger["aria-expanded"]).toBe("false");
    // Withheld while the surface is unmounted: an IDREF pointing at nothing is a
    // dangling reference *and* an axe failure.
    expect(trigger["aria-controls"]).toBeUndefined();
    // Named by the value, because the swatch inside it is decoration.
    expect(trigger["aria-label"]).toBe("#0088ff");
    expect(trigger["data-state"]).toBe("closed");
    expect(trigger["data-variant"]).toBe("well");

    const content = build({ defaultOpen: true }).api().getContentProps();
    expect(content.role).toBe("dialog");
    expect(content["aria-controls"]).toBeUndefined();
    expect(content["aria-label"]).toBe("Color picker");
    expect(content.tabIndex).toBe(-1);
    expect(content["data-presentation"]).toBe("popup");
  });

  it("calls the surface a dialog only where it is one, and the inline panel a group", () => {
    expect(open().api().getContentProps().role).toBe("dialog");
    expect(open({ presentation: "sheet" }).api().getContentProps().role).toBe("dialog");
    // Always open, never modal and with no way out: an embedded panel, not a dialog.
    const inline = run({ presentation: "inline" }).api().getContentProps();
    expect(inline.role).toBe("group");
    expect(inline["aria-modal"]).toBeUndefined();
    expect(inline["aria-label"]).toBe("Color picker");
  });

  it("ignores `modal` inline, where there is nothing to trap and nothing to close", () => {
    const inline = run({ presentation: "inline", modal: true }).api().getContentProps();
    expect(inline.role).toBe("group");
    expect(inline["aria-modal"]).toBeUndefined();
    expect(inline["data-snav-trap"]).toBeUndefined();

    const popup = open({ modal: true }).api().getContentProps();
    expect(popup["aria-modal"]).toBe("true");
    expect(popup["data-snav-trap"]).toBe("");
  });

  it("marks the area's two range inputs read-only, like every other control of the panel", () => {
    const locked = open({ readOnly: true }).api();
    expect(locked.getAreaXInputProps()["aria-readonly"]).toBe("true");
    expect(locked.getAreaYInputProps()["aria-readonly"]).toBe("true");
    expect(locked.getChannelSliderThumbProps({ channel: "hue" })["aria-readonly"]).toBe("true");

    const free = open().api();
    expect(free.getAreaXInputProps()["aria-readonly"]).toBeUndefined();
    expect(free.getAreaYInputProps()["aria-readonly"]).toBeUndefined();
  });

  it("resolves the presentation from the density, and a declared one wins", () => {
    const harness = run();
    expect(harness.api().presentation).toBe("popup");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(harness.api().presentation).toBe("sheet");

    const pinned = run({ presentation: "popup" });
    pinned.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(pinned.api().presentation).toBe("popup");
    expect(run({ presentation: "inline" }).api().presentation).toBe("inline");
  });

  it("publishes the colour as custom properties the sheet can paint with", () => {
    const root = build({ defaultValue: "rgb(0 136 255 / 0.5)" }).api().getRootProps();
    const style = root.style as Record<string, string>;

    expect(style["--sui-color-picker-value"]).toBe("rgb(0 136 255 / 0.5)");
    expect(style["--sui-color-picker-opaque"]).toBe("rgb(0 136 255)");
    expect(style["--sui-color-picker-alpha"]).toBe("0.5");
    // The number *and* the colour: composing `hsl()` from an unregistered custom
    // property is fragile, and `@property` is not part of the contract.
    expect(style["--sui-color-picker-hue"]).toBe("208");
    expect(style["--sui-color-picker-hue-color"]).toBe("hsl(208 100% 50%)");
  });
});

describe("color-picker — the value", () => {
  it("reports one change per distinct colour, never one per write", () => {
    const onValueChange = vi.fn();
    const harness = open({ defaultValue: "#000000", onValueChange });

    harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
    harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
    harness.service.send({ type: "VALUE.SET", value: "rgb(255 0 0)" });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toMatchObject({ value: "#ff0000" });
  });

  it("keeps the hue a black cannot carry, so the area does not jump on the way back up", () => {
    const harness = open({ defaultValue: "hsb(280 80% 80%)" });

    harness.service.send({ type: "VALUE.SET", value: "#000000" });
    expect(harness.api().color.h).toBe(280);

    harness.service.send({ type: "CHANNEL.SET", channel: "brightness", value: 80 });
    expect(harness.api().color.h).toBe(280);
    expect(toRgb255(harness.api().color)).toEqual(
      toRgb255(parseColor("hsb(280 80% 80%)") as ColorValue),
    );
  });

  it("formats the hidden input in the current format and withholds it when disabled", () => {
    const harness = open({ defaultValue: "#0088ff", name: "tint" });
    expect(harness.api().getHiddenInputProps()).toMatchObject({
      type: "hidden",
      name: "tint",
      value: "#0088ff",
    });

    harness.service.send({ type: "FORMAT.SET", format: "rgb" });
    expect(harness.api().getHiddenInputProps().value).toBe("rgb(0 136 255)");

    // Native rule: a disabled control is not submitted.
    expect(build({ disabled: true }).api().getHiddenInputProps().disabled).toBe(true);
  });

  it("pins alpha at 1 when the component has no alpha channel", () => {
    const harness = open({ alpha: false, defaultValue: "#0088ff" });
    expect(harness.api().channels).toEqual(["hue"]);

    harness.service.send({ type: "VALUE.SET", value: "rgb(0 136 255 / 0.2)" });
    expect(harness.api().color.a).toBe(1);
    expect(harness.api().value).toBe("#0088ff");
  });

  it("puts the form's initial value back on reset", () => {
    const harness = open({ defaultValue: "#0088ff" });
    harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
    expect(harness.api().value).toBe("#ff0000");

    harness.service.send({ type: "FORM.RESET" });
    expect(harness.api().value).toBe("#0088ff");
  });

  it("switches the visible channels with the format", () => {
    const harness = open();
    expect(harness.api().channels).toEqual(["hue", "alpha"]);

    harness.service.send({ type: "FORMAT.SET", format: "rgb" });
    expect(harness.api().channels).toEqual(["red", "green", "blue", "alpha"]);
  });
});

describe("color-picker — the two axes", () => {
  it("moves one step per arrow and ten per Shift, on the axis the key names", () => {
    const harness = open({ defaultValue: "hsb(200 50% 50%)" });

    harness.service.send({ type: "AREA.ADJUST", axis: "x", direction: "increment", large: false });
    expect(harness.api().color.s).toBe(51);

    harness.service.send({ type: "AREA.ADJUST", axis: "x", direction: "increment", large: true });
    expect(harness.api().color.s).toBe(61);

    harness.service.send({ type: "AREA.ADJUST", axis: "y", direction: "decrement", large: true });
    expect(harness.api().color.v).toBe(40);

    harness.service.send({ type: "AREA.SET_EXTREME", axis: "x", edge: "max" });
    expect(harness.api().color.s).toBe(100);
    harness.service.send({ type: "AREA.SET_EXTREME", axis: "y", edge: "min" });
    expect(harness.api().color.v).toBe(0);
  });

  it("maps the eight keys onto the two axes, and mirrors only left and right", () => {
    expect(getAreaKeyEvent("ArrowRight", { dir: "ltr", shiftKey: false })).toEqual({
      type: "AREA.ADJUST",
      axis: "x",
      direction: "increment",
      large: false,
    });
    expect(getAreaKeyEvent("ArrowRight", { dir: "rtl", shiftKey: false })).toMatchObject({
      axis: "x",
      direction: "decrement",
    });
    // Up and down have no writing order to follow.
    expect(getAreaKeyEvent("ArrowUp", { dir: "rtl", shiftKey: false })).toMatchObject({
      axis: "y",
      direction: "increment",
    });
    expect(getAreaKeyEvent("ArrowUp", { dir: "ltr", shiftKey: true })).toMatchObject({
      axis: "y",
      large: true,
    });
    expect(getAreaKeyEvent("PageUp", { dir: "ltr", shiftKey: false })).toMatchObject({
      axis: "y",
      direction: "increment",
      large: true,
    });
    // The APG says Home is *the minimum value*, not the left end.
    expect(getAreaKeyEvent("Home", { dir: "rtl", shiftKey: false })).toEqual({
      type: "AREA.SET_EXTREME",
      axis: "x",
      edge: "min",
    });
    // Shift moves the bounds onto the second axis — the only way to reach them
    // from a single tab stop.
    expect(getAreaKeyEvent("End", { dir: "ltr", shiftKey: true })).toEqual({
      type: "AREA.SET_EXTREME",
      axis: "y",
      edge: "max",
    });
    expect(getAreaKeyEvent("Enter", { dir: "ltr", shiftKey: false })).toBeNull();
  });

  it("consumes every key it maps, so the native range's own step never runs too", () => {
    const harness = open();
    const input = harness.api().getAreaXInputProps() as { onKeyDown(event: KeyboardEvent): void };

    for (const name of ["ArrowLeft", "ArrowUp", "Home", "End", "PageUp", "PageDown"]) {
      const prevented = vi.fn();
      input.onKeyDown(key({ key: name, preventDefault: prevented }));
      expect(prevented, name).toHaveBeenCalledTimes(1);
    }
    const untouched = vi.fn();
    input.onKeyDown(key({ key: "Tab", preventDefault: untouched }));
    expect(untouched).not.toHaveBeenCalled();
  });

  it("gives the area one tab stop and two readable values", () => {
    const api = open({ defaultValue: "hsb(210 50% 80%)" }).api();
    const x = api.getAreaXInputProps() as Record<string, unknown>;
    const y = api.getAreaYInputProps() as Record<string, unknown>;

    expect(api.getAreaProps().role).toBe("group");
    expect(x.type).toBe("range");
    expect(x.tabIndex).toBeUndefined();
    expect(x["aria-label"]).toBe("Saturation");
    expect(x["aria-valuetext"]).toBe("Saturation 50%, brightness 80%, azure");
    // The second axis exists so its value is published and a pad can aim at it,
    // never so a Tab can land on it.
    expect(y.tabIndex).toBe(-1);
    expect(y["aria-label"]).toBe("Brightness");
    expect(y["aria-valuetext"]).toBe("Brightness 80%, saturation 50%, azure");
  });

  it("takes a value pushed by an assistive technology through the native change", () => {
    const harness = open({ defaultValue: "hsb(210 50% 80%)" });
    harness.service.send({ type: "AREA.SET", axis: "y", value: 25 });
    expect(harness.api().color.v).toBe(25);
    expect(harness.api().color.s).toBe(50);
  });
});

describe("color-picker — the channels", () => {
  it("wraps the one circular channel and clamps the others", () => {
    const harness = open({ defaultValue: "hsb(359 100% 100%)" });

    harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: false });
    expect(harness.api().color.h).toBe(0);

    harness.service.send({ type: "CHANNEL.DECREMENT", channel: "hue", large: false });
    expect(harness.api().color.h).toBe(359);

    harness.service.send({ type: "CHANNEL.SET_MAX", channel: "alpha" });
    expect(harness.api().color.a).toBe(1);
    harness.service.send({ type: "CHANNEL.DECREMENT", channel: "alpha", large: true });
    expect(harness.api().color.a).toBeCloseTo(0.9, 6);
    harness.service.send({ type: "CHANNEL.SET_MIN", channel: "alpha" });
    expect(harness.api().color.a).toBe(0);
  });

  it("sends the hue thumb to its right edge on End, where it reads 360 and not 0", () => {
    const harness = open({ defaultValue: "hsb(200 100% 100%)" });
    const thumb = () => harness.api().getChannelSliderThumbProps({ channel: "hue" });
    const percent = () =>
      (thumb().style as Record<string, string>)["--sui-color-picker-channel-percent"];

    harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
    expect(thumb()["aria-valuenow"]).toBe(360);
    expect(thumb()["aria-valuemax"]).toBe(360);
    expect(percent()).toBe("100%");
    expect(harness.api().value).toBe("#ff0000");

    harness.service.send({ type: "CHANNEL.SET_MIN", channel: "hue" });
    expect(thumb()["aria-valuenow"]).toBe(0);
    expect(percent()).toBe("0%");
    expect(harness.api().value).toBe("#ff0000");

    // Still circular past the edge: one more step starts the track again.
    harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
    harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: false });
    expect(thumb()["aria-valuenow"]).toBe(1);
  });

  type Harness = ReturnType<typeof open>;
  const thumbOf = (harness: Harness) =>
    harness.api().getChannelSliderThumbProps({ channel: "hue" });
  const percentOf = (harness: Harness) =>
    (thumbOf(harness).style as Record<string, string>)["--sui-color-picker-channel-percent"];

  /**
   * React's order: the callback only records, and the parent's new `value`
   * comes down after the event has returned — by which time `onValueChangeEnd`
   * has read the colour against the string the parent still held.
   */
  function controlled(value: string, props: ColorPickerMachineProps = {}) {
    const onValueChange = vi.fn((_details: { value: string }) => {});
    const onValueChangeEnd = vi.fn();
    const harness: Harness = open({ value, onValueChange, onValueChangeEnd, ...props });
    const answer = (): void => {
      const sent = onValueChange.mock.lastCall?.[0].value;
      if (sent !== undefined) harness.setProps({ value: sent });
    };
    return { harness, onValueChange, onValueChangeEnd, answer };
  }

  function expectRightEdge(harness: Harness): void {
    expect(thumbOf(harness)["aria-valuenow"]).toBe(360);
    expect(percentOf(harness)).toBe("100%");
    expect(harness.api().color.h).toBe(360);
    expect(harness.api().value).toBe("#ff0000");
  }

  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  describe("a controlled hue track on End", () => {
    it("reads 360 once the parent hands back, after the event, the string End sent", () => {
      const { harness, onValueChange, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      answer();
      expectRightEdge(harness);
      expect(onValueChange).toHaveBeenCalledOnce();
      expect(onValueChange.mock.calls[0]?.[0]).toMatchObject({ value: "#ff0000" });
    });

    it("lands on the step it took, not on the hex the step went through", () => {
      const { harness, answer } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.DECREMENT", channel: "hue", large: false });
      answer();
      expect(harness.api().color.h).toBe(199);
      expect(thumbOf(harness)["aria-valuenow"]).toBe(199);
    });

    it("reads 360 when the parent already held the string End emits, answered or not", () => {
      const answered = controlled("#ff0000");
      expect(thumbOf(answered.harness)["aria-valuenow"]).toBe(0);
      answered.harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      answered.answer();
      expectRightEdge(answered.harness);
      expect(answered.onValueChange).toHaveBeenCalledOnce();

      const silent = controlled("#ff0000");
      silent.harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expectRightEdge(silent.harness);
    });

    it("reads 360 at the pad's end as at the keyboard's End", () => {
      const bus = createIntentBus();
      const held = controlled("hsb(200 100% 100%)", { intents: bus });
      held.harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "end");
      held.answer();
      expectRightEdge(held.harness);
      expect(held.harness.api().engaged).toBe(true);

      const keys = controlled("hsb(200 100% 100%)", { intents: createIntentBus() });
      keys.harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      keys.answer();
      expectRightEdge(keys.harness);
    });

    it("puts 360 back on B once End has been confirmed", () => {
      const bus = createIntentBus();
      const { harness, answer } = controlled("hsb(200 100% 100%)", { intents: bus });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "end");
      answer();
      pad(bus, "select");
      expectRightEdge(harness);

      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "moveRight");
      answer();
      expect(thumbOf(harness)["aria-valuenow"]).toBe(1);

      pad(bus, "back");
      answer();
      expect(harness.api().engaged).toBe(false);
      expectRightEdge(harness);
    });

    it("stays on the parent's colour when the parent keeps a different string", () => {
      const { harness, onValueChange } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expect(onValueChange).toHaveBeenCalledOnce();
      expect(thumbOf(harness)["aria-valuenow"]).toBe(200);
      expect(harness.api().color.h).toBe(200);
    });

    it("keeps a black the parent holds when it rejects a colour, hue and saturation too", () => {
      const { harness, onValueChange } = controlled("#000000");
      harness.service.send({ type: "VALUE.SET", value: "#00ff00" });
      expect(onValueChange.mock.lastCall?.[0]).toMatchObject({ value: "#00ff00" });
      expect(harness.api().color).toMatchObject({ h: 0, s: 0, v: 0 });
      expect(thumbOf(harness)["aria-valuenow"]).toBe(0);

      harness.service.send({ type: "CHANNEL.INCREMENT", channel: "brightness", large: false });
      expect(onValueChange.mock.lastCall?.[0]).toMatchObject({ value: "#030303" });
    });

    it("forgets the emission once the parent pushes other strings", () => {
      const { harness, answer } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      answer();
      expect(thumbOf(harness)["aria-valuenow"]).toBe(360);

      harness.setProps({ value: "#00ff00" });
      expect(harness.api().color.h).toBe(120);
      harness.setProps({ value: "#ff0000" });
      expect(thumbOf(harness)["aria-valuenow"]).toBe(0);
      expect(harness.api().color.h).toBe(0);
    });
  });

  describe("a controlled picker's end of gesture", () => {
    const entry = { value: "#00aaff", color: expect.objectContaining({ h: 200 }) };
    // R37: where the reported colour is the one the parent holds, the report is the
    // parent's own string, not the formatted spelling of it.
    const given = { value: "hsb(200 100% 100%)", color: expect.objectContaining({ h: 200 }) };

    it("reports the colour End wrote, before the parent has answered", () => {
      const { harness, onValueChangeEnd } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd).toHaveBeenCalledWith({
        value: "#ff0000",
        color: expect.objectContaining({ h: 360 }),
      });
    });

    it("reports the entry colour on B, not the colour B cancelled", () => {
      const bus = createIntentBus();
      const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)", {
        intents: bus,
      });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "moveRight");
      answer();
      pad(bus, "moveRight");
      answer();
      expect(harness.api().color.h).toBe(202);

      pad(bus, "back");
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
      answer();
      expect(harness.api().color.h).toBe(200);
    });

    it("reports the entry colour on Cancel, not the colour Cancel undid", () => {
      const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: true });
      answer();
      expect(harness.api().color.h).toBe(236);

      harness.service.send({ type: "CANCEL.CLICK" });
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
      answer();
      expect(harness.api().color.h).toBe(200);
      expect(harness.api().open).toBe(false);
    });

    it("moves a parent that listens to the end of the gesture alone", () => {
      const onValueChangeEnd = vi.fn((_details: { value: string }) => {});
      const harness: Harness = open({ value: "hsb(200 100% 100%)", onValueChangeEnd });
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      const reported = onValueChangeEnd.mock.lastCall?.[0].value;
      if (reported !== undefined) harness.setProps({ value: reported });
      expectRightEdge(harness);
    });

    it("reports a write that lands on the held colour, not an earlier emission still pending", () => {
      const { harness, onValueChange, onValueChangeEnd } = controlled("hsb(200 100% 100%)", {
        swatches: ["#00aaff", "#ff0000"],
      });
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expect(onValueChange.mock.lastCall?.[0]).toMatchObject({ value: "#ff0000" });

      harness.service.send({ type: "SWATCH.SELECT", index: 0 });
      expect(onValueChangeEnd).toHaveBeenCalledTimes(2);
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
    });

    it("reports a write that lands on the held colour, uncontrolled", () => {
      const onValueChange = vi.fn();
      const onValueChangeEnd = vi.fn();
      const harness = open({
        defaultValue: "hsb(200 100% 100%)",
        swatches: ["#00aaff"],
        onValueChange,
        onValueChangeEnd,
      });
      harness.service.send({ type: "SWATCH.SELECT", index: 0 });
      expect(onValueChange).not.toHaveBeenCalled();
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
    });

    it("keeps reporting the held colour after a refused form reset when the next gesture writes", () => {
      const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)");
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      answer();
      expectRightEdge(harness);

      harness.service.send({ type: "FORM.RESET" });
      expectRightEdge(harness);
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "alpha" });
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual({
        value: "#ff0000",
        color: expect.objectContaining({ h: 360 }),
      });
    });

    it("forgets a reported write even when there was no end callback to report it to", () => {
      const onValueChange = vi.fn();
      const harness: Harness = open({ value: "hsb(200 100% 100%)", onValueChange });
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
      expect(onValueChange.mock.lastCall?.[0]).toMatchObject({ value: "#ff0000" });

      const onValueChangeEnd = vi.fn();
      harness.setProps({ onValueChangeEnd });
      harness.service.send({ type: "VALUE.SET", value: "#zz" });
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
    });

    it("reports the held colour after a hold the surface closed on", () => {
      const bus = createIntentBus();
      const { harness, onValueChangeEnd } = controlled("hsb(200 100% 100%)", { intents: bus });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "moveRight");
      harness.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
      expect(harness.api().open).toBe(false);

      harness.service.send({ type: "TRIGGER.CLICK" });
      harness.service.send({ type: "VALUE.SET", value: "#zz" });
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
      harness.service.send({ type: "CHANNEL.SET_MAX", channel: "alpha" });
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
    });

    it("reports the entry colour on B to a parent that listens to the end of the gesture alone", () => {
      const bus = createIntentBus();
      const onValueChangeEnd = vi.fn((_details: { value: string }) => {});
      const harness: Harness = open({
        value: "hsb(200 100% 100%)",
        onValueChangeEnd,
        intents: bus,
      });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "moveRight");
      pad(bus, "moveRight");
      pad(bus, "back");
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);

      const reported = onValueChangeEnd.mock.lastCall?.[0].value;
      if (reported !== undefined) harness.setProps({ value: reported });
      expect(harness.api().color.h).toBe(200);
    });

    it("reports the entry colour on B to a parent that absorbs every write", () => {
      const bus = createIntentBus();
      const { harness, onValueChangeEnd } = controlled("hsb(200 100% 100%)", { intents: bus });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      pad(bus, "end");
      pad(bus, "back");
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
    });

    it("reports the held colour for a drag released back on it", () => {
      const onValueChangeEnd = vi.fn();
      const harness: Harness = open({ value: "hsb(200 100% 100%)", onValueChangeEnd });
      harness.service.send({ type: "CHANNEL.PRESS", channel: "hue", percent: 0.6 });
      harness.service.send({ type: "CHANNEL.DRAG", percent: 200 / 360 });
      harness.service.send({ type: "CHANNEL.DRAG_END", moved: true });
      expect(onValueChangeEnd).toHaveBeenCalledOnce();
      expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
    });

    /** A parent that sets its state from the end of the gesture alone, after the event. */
    function endOnly(value: string, props: ColorPickerMachineProps = {}) {
      const onValueChangeEnd = vi.fn((_details: { value: string }) => {});
      const harness: Harness = open({ value, onValueChangeEnd, ...props });
      const answer = (): void => {
        const reported = onValueChangeEnd.mock.lastCall?.[0].value;
        if (reported !== undefined) harness.setProps({ value: reported });
      };
      return { harness, onValueChangeEnd, answer };
    }

    const type = (harness: Harness, channel: "hex" | "hue", text: string): void => {
      harness.service.send({ type: "INPUT.CHANGE", channel, text });
      harness.service.send({ type: "INPUT.COMMIT", channel });
    };

    const held = { value: expect.any(String), color: expect.objectContaining({ h: 201 }) };
    const red = { value: "#ff0000", color: expect.objectContaining({ h: 0 }) };

    describe("a typed value", () => {
      it("reports an accepted draft once and a rejected one not at all, uncontrolled", () => {
        const onValueChangeEnd = vi.fn();
        const harness = open({ defaultValue: "#0088ff", onValueChangeEnd });
        type(harness, "hex", "#zz");
        type(harness, "hue", "abc");
        expect(onValueChangeEnd).not.toHaveBeenCalled();

        type(harness, "hex", "#ff0000");
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(red);

        type(harness, "hue", "120");
        expect(onValueChangeEnd).toHaveBeenCalledTimes(2);
        expect(onValueChangeEnd.mock.lastCall?.[0].color).toMatchObject({ h: 120 });
      });

      it("reports the typed colour before a parent that adopts every change has answered", () => {
        const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)");
        type(harness, "hex", "#zz");
        expect(onValueChangeEnd).not.toHaveBeenCalled();
        type(harness, "hex", "#ff0000");
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(red);
        answer();
        expect(harness.api().value).toBe("#ff0000");
      });

      it("moves a parent that listens to the end of the gesture alone", () => {
        const { harness, onValueChangeEnd, answer } = endOnly("hsb(200 100% 100%)");
        type(harness, "hex", "#ff0000");
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        answer();
        expect(harness.api().value).toBe("#ff0000");
      });

      // R36: the cancel puts back the opening colour, past any hold, and reports it.
      it("reports the hex at its commit, and the opening colour at a later cancel, after a validated hold", () => {
        const bus = createIntentBus();
        const { harness, onValueChangeEnd, answer } = endOnly("hsb(200 100% 100%)", {
          intents: bus,
        });
        harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
        pad(bus, "moveRight");
        pad(bus, "select");
        answer();
        expect(onValueChangeEnd).toHaveBeenCalledOnce();

        type(harness, "hex", "#ff0000");
        expect(onValueChangeEnd).toHaveBeenCalledTimes(2);
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(red);
        answer();
        harness.service.send({ type: "CANCEL.CLICK" });
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
      });

      it("does not hand a cancel the hex a parent refused at its commit", () => {
        const bus = createIntentBus();
        const { harness, onValueChangeEnd, answer } = endOnly("hsb(200 100% 100%)", {
          intents: bus,
        });
        harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
        pad(bus, "moveRight");
        pad(bus, "select");
        answer();
        type(harness, "hex", "#ff0000");
        harness.service.send({ type: "CANCEL.CLICK" });
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
        answer();
        expect(harness.api().color.h).toBe(200);
      });
    });

    describe("a write left without a report", () => {
      /** A validated hold of one step: the hold's snapshot is gone, and Cancel puts back the opening colour (R36). */
      function holdOneStep(harness: Harness, bus: IntentBus, answer: () => void, to = 201): void {
        harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
        pad(bus, "moveRight");
        answer();
        pad(bus, "select");
        answer();
        expect(harness.api().color.h).toBe(to);
      }

      /**
       * Created at hue 200, the reset's target, then reopened at hue 100: the
       * cancel's colour and the reset's are two different colours.
       */
      const opening = { value: "#55ff00", color: expect.objectContaining({ h: 100 }) };
      function reopenAt100(harness: Harness): void {
        harness.service.send({ type: "CLOSE.CLICK" });
        harness.setProps({ value: "hsb(100 100% 100%)" });
        harness.service.send({ type: "TRIGGER.CLICK" });
        expect(harness.api().open).toBe(true);
        expect(harness.api().color.h).toBe(100);
      }

      it("reports the opening colour, not a refused reset, on a cancel after a finished hold", () => {
        const bus = createIntentBus();
        const adopts = controlled("hsb(200 100% 100%)", { intents: bus });
        reopenAt100(adopts.harness);
        holdOneStep(adopts.harness, bus, adopts.answer, 101);
        adopts.harness.service.send({ type: "FORM.RESET" });
        adopts.harness.service.send({ type: "CANCEL.CLICK" });
        expect(adopts.onValueChangeEnd.mock.lastCall?.[0]).toEqual(opening);

        const other = createIntentBus();
        const listens = endOnly("hsb(200 100% 100%)", { intents: other });
        reopenAt100(listens.harness);
        holdOneStep(listens.harness, other, listens.answer, 101);
        listens.harness.service.send({ type: "FORM.RESET" });
        listens.harness.service.send({ type: "CANCEL.CLICK" });
        expect(listens.onValueChangeEnd.mock.lastCall?.[0]).toEqual(opening);
        listens.answer();
        expect(listens.harness.api().color.h).toBe(100);
      });

      it("reports the opening colour, not a press still down, on a cancel after a finished hold", () => {
        const bus = createIntentBus();
        const { harness, onValueChangeEnd, answer } = endOnly("hsb(200 100% 100%)", {
          intents: bus,
        });
        holdOneStep(harness, bus, answer);
        harness.service.send({ type: "AREA.PRESS", x: 0.25, y: 0.25 });
        harness.service.send({ type: "CANCEL.CLICK" });
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(entry);
        answer();
        expect(harness.api().color).toMatchObject({ h: 200, s: 100, v: 100 });
      });

      it("reports the opening colour, not the accepted reset, on a cancel after a finished hold, uncontrolled", () => {
        const bus = createIntentBus();
        const onValueChangeEnd = vi.fn();
        const harness = open({
          defaultValue: "hsb(200 100% 100%)",
          onValueChangeEnd,
          intents: bus,
        });
        harness.service.send({ type: "CLOSE.CLICK" });
        harness.service.send({ type: "VALUE.SET", value: "hsb(100 100% 100%)" });
        harness.service.send({ type: "TRIGGER.CLICK" });
        holdOneStep(harness, bus, () => {}, 101);
        harness.service.send({ type: "FORM.RESET" });
        expect(harness.api().color.h).toBe(200);
        harness.service.send({ type: "CANCEL.CLICK" });
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(opening);
        expect(harness.api().color.h).toBe(100);
      });

      it.each([
        { type: "SWATCH.SELECT", index: 0 },
        { type: "SWATCH.SELECT", index: 9 },
        { type: "VALUE.SET", value: "#zz" },
      ] as const)(
        "reports the held colour, not a refused reset, on %o, which writes nothing",
        (gesture) => {
          const bus = createIntentBus();
          const adopts = controlled("hsb(200 100% 100%)", { intents: bus, swatches: ["red"] });
          holdOneStep(adopts.harness, bus, adopts.answer);
          adopts.harness.service.send({ type: "FORM.RESET" });
          adopts.harness.service.send(gesture);
          expect(adopts.onValueChangeEnd.mock.lastCall?.[0]).toEqual(held);

          const other = createIntentBus();
          const listens = endOnly("hsb(200 100% 100%)", { intents: other, swatches: ["red"] });
          holdOneStep(listens.harness, other, listens.answer);
          listens.harness.service.send({ type: "FORM.RESET" });
          listens.harness.service.send(gesture);
          expect(listens.onValueChangeEnd.mock.lastCall?.[0]).toEqual(held);
        },
      );

      it.each(["select", "tab"] as const)(
        "reports the held colour when a hold that a refused reset ran inside ends on %s without a step",
        (end) => {
          const bus = createIntentBus();
          const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)", {
            intents: bus,
          });
          harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: false });
          answer();
          harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
          harness.service.send({ type: "FORM.RESET" });
          if (end === "select") pad(bus, "select");
          else harness.service.send({ type: "FOCUS.OUT" });
          expect(harness.api().engaged).toBe(false);
          expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(held);
        },
      );

      it("reports what the parent pushed after an accepted reset, not the reset", () => {
        const { harness, onValueChangeEnd, answer } = controlled("hsb(200 100% 100%)");
        harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: false });
        answer();
        harness.service.send({ type: "FORM.RESET" });
        answer();
        expect(harness.api().color.h).toBe(200);
        harness.setProps({ value: "#123456" });
        harness.service.send({ type: "VALUE.SET", value: "#zz" });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#123456");
      });

      it.each(["step", "press"] as const)(
        "reports the held colour, not a %s the surface closed on",
        (gesture) => {
          const bus = createIntentBus();
          const { harness, onValueChangeEnd, answer } = endOnly("hsb(200 100% 100%)", {
            intents: bus,
          });
          if (gesture === "step") {
            harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
            pad(bus, "moveRight");
          } else {
            harness.service.send({ type: "AREA.PRESS", x: 0.25, y: 0.25 });
          }
          harness.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
          expect(harness.api().open).toBe(false);
          expect(onValueChangeEnd).not.toHaveBeenCalled();

          harness.service.send({ type: "VALUE.SET", value: "#zz" });
          expect(onValueChangeEnd).toHaveBeenCalledOnce();
          expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(given);
          answer();
          expect(harness.api().color).toMatchObject({ h: 200, s: 100, v: 100 });
        },
      );

      it("reports the step the surface closed on, uncontrolled, where it was kept", () => {
        const bus = createIntentBus();
        const onValueChangeEnd = vi.fn();
        const harness = open({
          defaultValue: "hsb(200 100% 100%)",
          onValueChangeEnd,
          intents: bus,
        });
        harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
        pad(bus, "moveRight");
        harness.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
        harness.service.send({ type: "VALUE.SET", value: "#zz" });
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual(held);
      });
    });

    // R37: a report whose colour is the one the parent holds is the parent's own
    // string, so a parent that re-parses what it is told does not drift off it.
    describe("the colour the parent holds, reported", () => {
      const own = "hsb(200 60% 80%)";

      const scenes: readonly {
        readonly name: string;
        readonly play: (harness: Harness, bus: IntentBus) => void;
      }[] = [
        {
          name: "a gesture that writes nothing",
          play: (harness) => harness.service.send({ type: "VALUE.SET", value: "#zz" }),
        },
        {
          name: "B in the middle of a hold",
          play: (harness, bus) => {
            harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
            pad(bus, "moveRight");
            pad(bus, "moveRight");
            pad(bus, "back");
          },
        },
        {
          name: "Cancel in the middle of a hold",
          play: (harness, bus) => {
            harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
            pad(bus, "moveRight");
            harness.service.send({ type: "CANCEL.CLICK" });
          },
        },
        {
          name: "a drag brought back on the held hue",
          play: (harness) => {
            harness.service.send({ type: "CHANNEL.PRESS", channel: "hue", percent: 0.6 });
            harness.service.send({ type: "CHANNEL.DRAG", percent: 200 / 360 });
            harness.service.send({ type: "CHANNEL.DRAG_END", moved: true });
          },
        },
        {
          name: "a write of the held string itself",
          play: (harness) => harness.service.send({ type: "VALUE.SET", value: own }),
        },
      ];

      it.each(scenes)("hands back the string it holds after $name", ({ play }) => {
        const bus = createIntentBus();
        const { harness, onValueChangeEnd, answer } = endOnly(own, { intents: bus });
        const before = harness.api().color;
        const hueNow = thumbOf(harness)["aria-valuenow"];

        play(harness, bus);
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe(own);

        answer();
        expect(harness.api().color).toEqual(before);
        expect(thumbOf(harness)["aria-valuenow"]).toBe(hueNow);
      });

      it("hands the same string back whatever the format the readout is in", () => {
        const { harness, onValueChangeEnd } = endOnly(own, { defaultFormat: "rgb" });
        harness.service.send({ type: "VALUE.SET", value: own });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe(own);
      });

      it("still formats a colour that is not the one the parent holds", () => {
        const { harness, onValueChangeEnd } = endOnly(own);
        harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#cc5252");
      });

      // A string the picker cannot read leaves the cell uncontrolled: whatever it
      // takes is reported formatted, and the parent that adopts it re-syncs.
      it.each(["", "red", "oklch(60% 0.2 30)", "color(display-p3 1 0 0)"])(
        "reports the formatted colour, not the unreadable string %j the parent holds",
        (unreadable) => {
          const { harness, onValueChangeEnd, answer } = endOnly(unreadable);
          harness.service.send({ type: "VALUE.SET", value: "#b32424" });
          expect(onValueChangeEnd).toHaveBeenCalledOnce();
          expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#b32424");

          answer();
          expect(harness.api().value).toBe("#b32424");
          harness.service.send({ type: "VALUE.SET", value: "#zz" });
          expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#b32424");
        },
      );

      it("reports the formatted colour once the parent's string stopped parsing", () => {
        const { harness, onValueChangeEnd, answer } = endOnly(own);
        harness.setProps({ value: "#12" });
        harness.service.send({ type: "VALUE.SET", value: "#zz" });
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0]).toEqual({
          value: "#52a3cc",
          color: expect.objectContaining({ h: 200 }),
        });

        answer();
        expect(harness.api().value).toBe("#52a3cc");
      });

      // The picker reads a grey with the hue it already had (0 here), not the 200
      // the notation spells, so the formatted spelling would be `hsb(0 0% 50%)`:
      // the report is the parent's string because that colour is the one held.
      it("hands back an achromatic string whose notation hue the picker does not keep", () => {
        const { harness, onValueChangeEnd } = endOnly("hsb(200 0% 50%)");
        expect(harness.api().color.h).toBe(0);
        harness.service.send({ type: "VALUE.SET", value: "#zz" });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("hsb(200 0% 50%)");
      });

      // A hue that sRGB cannot carry is still a change: the held string must not
      // come back over it, or the parent re-adopts it and the write is undone.
      it.each([
        {
          name: "hue on a black",
          held: "hsb(0 0% 0%)",
          props: {},
          play: { type: "CHANNEL.SET", channel: "hue", value: 200 },
          value: "#000000",
          color: { h: 200, s: 0 },
        },
        {
          name: "saturation on a black",
          held: "hsb(0 0% 0%)",
          props: {},
          play: { type: "CHANNEL.SET", channel: "saturation", value: 20 },
          value: "#000000",
          color: { h: 0, s: 20 },
        },
        {
          name: "hue on a grey, in hsl",
          held: "hsl(10 0% 50%)",
          props: {},
          play: { type: "CHANNEL.SET", channel: "hue", value: 200 },
          value: "#808080",
          color: { h: 200, s: 0 },
        },
        {
          name: "hue on a grey, in hsb",
          held: "hsb(10 0% 50%)",
          props: {},
          play: { type: "CHANNEL.SET", channel: "hue", value: 200 },
          value: "#808080",
          color: { h: 200, s: 0 },
        },
        {
          name: "the area's right edge on a black rgb string, read in hsb",
          held: "rgb(0 0 0)",
          props: { defaultFormat: "hsb" },
          play: { type: "AREA.SET_EXTREME", axis: "x", edge: "max" },
          value: "hsb(0 100% 0%)",
          color: { h: 0, s: 100 },
        },
      ] as const)("reports the colour that moved, not the string held, for $name", (scene) => {
        const { harness, onValueChangeEnd } = endOnly(scene.held, scene.props);
        harness.service.send(scene.play);
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0].value).not.toBe(scene.held);
        expect(onValueChangeEnd.mock.lastCall?.[0]).toMatchObject({
          value: scene.value,
          color: scene.color,
        });
      });

      it("tells a parent that listens to both callbacks the same string twice, on a black", () => {
        const { harness, onValueChange, onValueChangeEnd, answer } = controlled("hsb(0 0% 0%)", {
          defaultFormat: "hsb",
        });
        harness.service.send({ type: "CHANNEL.SET", channel: "hue", value: 200 });
        answer();
        expect(onValueChange.mock.lastCall?.[0].value).toBe("hsb(200 0% 0%)");
        expect(onValueChangeEnd).toHaveBeenCalledOnce();
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("hsb(200 0% 0%)");
        expect(harness.api().color.h).toBe(200);
      });

      it("still formats the colour of an uncontrolled picker, held or not", () => {
        const onValueChangeEnd = vi.fn();
        const harness = open({ defaultValue: own, onValueChangeEnd });
        harness.service.send({ type: "VALUE.SET", value: own });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#52a3cc");
        harness.service.send({ type: "CHANNEL.SET_MAX", channel: "hue" });
        expect(onValueChangeEnd.mock.lastCall?.[0].value).toBe("#cc5252");
      });
    });
  });

  it("gives every channel a large step worth a tenth of its own range", () => {
    const harness = open({ defaultValue: "hsb(180 50% 50%)" });

    // The channel this test exists for: a tenth of 0→360 is 36, where ten of the
    // channel's own units would be 10 — the rounding error `largeStep` documents.
    harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: true });
    expect(harness.api().color.h).toBe(216);

    harness.service.send({ type: "CHANNEL.DECREMENT", channel: "saturation", large: true });
    expect(harness.api().color.s).toBe(40);

    harness.service.send({ type: "CHANNEL.DECREMENT", channel: "alpha", large: true });
    expect(harness.api().color.a).toBeCloseTo(0.9, 6);
  });

  it("reads an explicit largeStep in channel units, the way it reads step", () => {
    const harness = open({ defaultValue: "hsb(180 50% 50%)", largeStep: 5 });

    harness.service.send({ type: "CHANNEL.INCREMENT", channel: "hue", large: true });
    expect(harness.api().color.h).toBe(185);

    harness.service.send({ type: "CHANNEL.DECREMENT", channel: "alpha", large: true });
    expect(harness.api().color.a).toBeCloseTo(0.95, 6);
  });

  it("publishes a slider per channel, with a value a reader can say", () => {
    const api = open({ defaultValue: "hsb(210 50% 80%)" }).api();
    const thumb = api.getChannelSliderThumbProps({ channel: "hue" }) as Record<string, unknown>;

    expect(thumb.role).toBe("slider");
    expect(thumb.id).toBe("color-picker:cp1:channel-slider-thumb:hue");
    expect(thumb.tabIndex).toBe(0);
    expect(thumb["aria-valuemin"]).toBe(0);
    expect(thumb["aria-valuemax"]).toBe(360);
    expect(thumb["aria-valuenow"]).toBe(210);
    expect(thumb["aria-valuetext"]).toBe("210°, azure");
    // No `channelLabel` rendered, so the library's own name stands in rather than
    // an IDREF pointing at nothing.
    expect(thumb["aria-label"]).toBe("Hue");
    expect(thumb["aria-labelledby"]).toBeUndefined();

    const alpha = api.getChannelSliderThumbProps({ channel: "alpha" }) as Record<string, unknown>;
    expect(alpha["aria-valuemax"]).toBe(1);
    expect(alpha["aria-valuetext"]).toBe("100%");
    // Red, green and blue: the number is the whole story, and repeating it as a
    // `valuetext` makes some readers say it twice.
    const red = api.getChannelSliderThumbProps({ channel: "red" }) as Record<string, unknown>;
    expect(red["aria-valuetext"]).toBeUndefined();
  });

  it("mirrors left and right on a channel, and never Home or End", () => {
    expect(getChannelKeyEvent("ArrowRight", "hue", { dir: "ltr", shiftKey: false })).toMatchObject({
      type: "CHANNEL.INCREMENT",
      channel: "hue",
      large: false,
    });
    expect(getChannelKeyEvent("ArrowRight", "hue", { dir: "rtl", shiftKey: false })).toMatchObject({
      type: "CHANNEL.DECREMENT",
    });
    expect(getChannelKeyEvent("ArrowUp", "hue", { dir: "rtl", shiftKey: false })).toMatchObject({
      type: "CHANNEL.INCREMENT",
    });
    expect(getChannelKeyEvent("Home", "hue", { dir: "rtl", shiftKey: false })).toEqual({
      type: "CHANNEL.SET_MIN",
      channel: "hue",
    });
    expect(getChannelKeyEvent("ArrowRight", "hue", { dir: "ltr", shiftKey: true })).toMatchObject({
      large: true,
    });
  });
});

describe("color-picker — the fields", () => {
  it("never writes the colour while typing, and only marks the field on a bad commit", () => {
    const harness = open({ defaultValue: "#0088ff" });

    harness.service.send({ type: "INPUT.CHANGE", channel: "hex", text: "#zz" });
    expect(harness.api().value).toBe("#0088ff");
    expect(harness.api().getChannelInputProps({ channel: "hex" }).value).toBe("#zz");

    harness.service.send({ type: "INPUT.COMMIT", channel: "hex" });
    const field = harness.api().getChannelInputProps({ channel: "hex" }) as Record<string, unknown>;
    // The *field* is invalid, not the component: the value has not moved.
    expect(field["data-invalid"]).toBe("");
    expect(harness.api().getRootProps()["data-invalid"]).toBeUndefined();
    expect(harness.api().value).toBe("#0088ff");

    harness.service.send({ type: "INPUT.REVERT", channel: "hex" });
    expect(harness.api().getChannelInputProps({ channel: "hex" }).value).toBe("#0088ff");
    expect(
      (harness.api().getChannelInputProps({ channel: "hex" }) as Record<string, unknown>)[
        "data-invalid"
      ],
    ).toBeUndefined();
  });

  it("commits a good hex and a good number, and reads opacity in per cent", () => {
    const harness = open({ defaultValue: "#000000" });

    harness.service.send({ type: "INPUT.CHANGE", channel: "hex", text: "0088ff" });
    harness.service.send({ type: "INPUT.COMMIT", channel: "hex" });
    expect(harness.api().value).toBe("#0088ff");

    harness.service.send({ type: "FORMAT.SET", format: "rgb" });
    harness.service.send({ type: "INPUT.CHANGE", channel: "red", text: "128" });
    harness.service.send({ type: "INPUT.COMMIT", channel: "red" });
    expect(harness.api().rgb.r).toBe(128);

    // The field shows "100 %" and the channel runs 0…1 — the field's unit is
    // converted on the way in, and shown on the way out.
    expect(harness.api().getChannelInputProps({ channel: "alpha" }).value).toBe("100");
    harness.service.send({ type: "INPUT.CHANGE", channel: "alpha", text: "40" });
    harness.service.send({ type: "INPUT.COMMIT", channel: "alpha" });
    expect(harness.api().color.a).toBeCloseTo(0.4, 6);
  });

  it("empties every draft when the format changes", () => {
    const harness = open({ defaultFormat: "rgb", defaultValue: "#0088ff" });

    harness.service.send({ type: "INPUT.CHANGE", channel: "red", text: "255" });
    harness.service.send({ type: "INPUT.CHANGE", channel: "green", text: "nope" });
    harness.service.send({ type: "INPUT.COMMIT", channel: "green" });
    expect(harness.api().getChannelInputProps({ channel: "red" }).value).toBe("255");

    // A draft holding "255" would land on a channel that now means hue: a
    // silently wrong value at the next blur is worse than a retyped one.
    harness.service.send({ type: "FORMAT.SET", format: "hsl" });
    expect(harness.api().getChannelInputProps({ channel: "red" }).value).toBe("0");
    expect(
      (harness.api().getChannelInputProps({ channel: "green" }) as Record<string, unknown>)[
        "data-invalid"
      ],
    ).toBeUndefined();
  });
});

describe("color-picker — the swatch grid", () => {
  const PALETTE = ["#ff0000", "#00ff00", "#0000ff", "#ffffff"];

  it("is a grid of rows of cells, with one tab stop for the whole collection", () => {
    const api = open({ swatches: PALETTE, swatchColumns: 2 }).api();

    expect(api.getSwatchGroupProps().role).toBe("grid");
    expect(api.getSwatchRowProps({ row: 0 }).role).toBe("row");
    expect(api.getSwatchProps({ index: 0 }).role).toBe("gridcell");
    expect(api.swatchRows).toBe(2);

    const stops = PALETTE.map(
      (_value, index) => (api.getSwatchProps({ index }) as { tabIndex: number }).tabIndex,
    );
    expect(stops.filter((value) => value === 0)).toHaveLength(1);
  });

  it("navigates in reading order, mirrored right-to-left, and bounds Home to its row", () => {
    // The grid module owns the mirror since it gained `dir`; this asserts the
    // table the component relies on rather than restating it.
    expect(getGridKeyAction("ArrowRight", { dir: "rtl" })).toBe("left");
    expect(getGridKeyAction("Home", { dir: "rtl" })).toBe("rowStart");
    expect(getGridKeyAction("Home", { dir: "rtl", ctrlKey: true })).toBe("gridStart");
    expect(getGridKeyAction("End", { ctrlKey: true })).toBe("gridEnd");

    const grid = { count: 60, columns: 12 };
    // Off the last column continues on the next row — the reading order.
    expect(getGridNextIndex(11, "right", grid)).toBe(12);
    // Off the last row stays put without `loopSwatches`.
    expect(getGridNextIndex(55, "down", grid)).toBe(55);
    expect(getGridNextIndex(55, "down", { ...grid, loop: true })).toBe(7);
    // A ragged last row never runs past the end.
    expect(getGridNextIndex(56, "rowEnd", { count: 58, columns: 12 })).toBe(57);
    expect(getGridNextIndex(11, "pageDown", { count: 58, columns: 12, page: 1 })).toBe(23);
  });

  it("selects a cell and keeps the roving stop on the selection", () => {
    const harness = open({ swatches: PALETTE, swatchColumns: 2 });
    harness.service.send({ type: "SWATCH.SELECT", index: 2 });

    expect(harness.api().value).toBe("#0000ff");
    const cell = harness.api().getSwatchProps({ index: 2 }) as Record<string, unknown>;
    expect(cell["aria-selected"]).toBe("true");
    expect(cell.tabIndex).toBe(0);
    expect((harness.api().getSwatchProps({ index: 0 }) as { tabIndex: number }).tabIndex).toBe(-1);
  });

  it("adds the current colour, de-duplicates, and drops the oldest when full", () => {
    const harness = open({ maxSwatches: 3 });

    for (const value of ["#111111", "#222222", "#111111", "#333333", "#444444"]) {
      harness.service.send({ type: "VALUE.SET", value });
      harness.service.send({ type: "SWATCH.ADD" });
    }

    // The panel is a list of what was just used: a full one drops its oldest
    // rather than refusing the newest.
    expect(harness.api().swatches).toEqual(["#222222", "#333333", "#444444"]);
  });

  it("keeps the add button out of the grid, where a button would be nested-interactive", () => {
    const trigger = open().api().getSwatchTriggerProps() as Record<string, unknown>;
    expect(trigger.role).toBeUndefined();
    expect(trigger.type).toBe("button");
    expect(trigger["aria-label"]).toBe("Add current color");
  });
});

describe("color-picker — the gamepad hold", () => {
  function withPad(props: ColorPickerMachineProps = {}): {
    harness: ReturnType<typeof open>;
    bus: IntentBus;
  } {
    const bus = createIntentBus();
    return { harness: open({ intents: bus, defaultValue: "hsb(200 50% 50%)", ...props }), bus };
  }

  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  it("refuses to engage when no intent bus is wired", () => {
    const harness = open();
    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    expect(harness.api().engaged).toBe(false);
  });

  it("holds a channel, adjusts it, and reports once when A lets go", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus } = withPad({ onValueChangeEnd });

    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    expect(harness.api().engaged).toBe(true);
    expect(harness.api().engagedTarget).toBe("hue");
    expect(harness.api().getRootProps()["data-engaged"]).toBe("");
    expect(harness.api().getChannelSliderProps({ channel: "hue" })["data-engaged"]).toBe("");

    expect(pad(bus, "moveRight").consumed).toBe(true);
    pad(bus, "moveRight");
    pad(bus, "moveRight");
    expect(harness.api().color.h).toBe(203);
    // Inside a hold the hold *is* the gesture: three adjustments, no report.
    expect(onValueChangeEnd).not.toHaveBeenCalled();

    expect(pad(bus, "select").consumed).toBe(true);
    expect(harness.api().engaged).toBe(false);
    expect(harness.api().color.h).toBe(203);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });

  it("puts the entry colour back on B, and does not close the surface doing it", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus } = withPad({ onValueChangeEnd });

    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    pad(bus, "moveRight");
    pad(bus, "moveRight");
    expect(harness.api().color.h).toBe(202);

    // `pushEngageScope` consumes `back`, which is what keeps B from popping the
    // layer underneath — the surface has to still be there afterwards.
    expect(pad(bus, "back").consumed).toBe(true);
    expect(harness.api().color.h).toBe(200);
    expect(harness.api().open).toBe(true);
    expect(harness.api().engaged).toBe(false);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });

  it("holds the area on both axes at once — the library's first two-dimensional engage", () => {
    const { harness, bus } = withPad();
    harness.service.send({ type: "CHANNEL.ENGAGE", target: "area" });

    expect(harness.api().getAreaProps()["data-engaged"]).toBe("");
    pad(bus, "moveRight");
    expect(harness.api().color.s).toBe(51);
    pad(bus, "moveUp");
    expect(harness.api().color.v).toBe(51);
    pad(bus, "pageUp");
    expect(harness.api().color.v).toBe(61);
    pad(bus, "home");
    expect(harness.api().color.s).toBe(0);
  });

  it("ends the hold by committing when the focus leaves, and keeps what was set", () => {
    const onValueChangeEnd = vi.fn();
    const { harness, bus } = withPad({ onValueChangeEnd });

    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    pad(bus, "moveRight");
    harness.service.send({ type: "FOCUS.OUT" });

    // Somebody who tabs wants to leave; losing their value on the way would be a
    // surprise. B stays the only cancel.
    expect(harness.api().engaged).toBe(false);
    expect(harness.api().color.h).toBe(201);
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    // And the scope really left: a later intent reaches nobody.
    expect(pad(bus, "moveRight").consumed).toBe(false);
  });

  it("overwrites the snapshot on every hold rather than clearing it on the way out", () => {
    const { harness, bus } = withPad();

    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    pad(bus, "moveRight");
    pad(bus, "select");
    expect(harness.api().color.h).toBe(201);

    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    pad(bus, "moveRight");
    pad(bus, "back");
    // Restored to the second hold's entry, not to the first's.
    expect(harness.api().color.h).toBe(201);
  });
});

describe("color-picker — the screen picker", () => {
  it("writes nothing and announces nothing when the pick is cancelled", () => {
    const onValueChange = vi.fn();
    const onValueChangeEnd = vi.fn();
    const harness = open({ defaultValue: "#0088ff", onValueChange, onValueChangeEnd, eyedropper });

    harness.service.send({ type: "EYEDROPPER.DISMISS", reason: "abort" });

    expect(harness.api().value).toBe("#0088ff");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onValueChangeEnd).not.toHaveBeenCalled();
  });

  it("refuses to open while the engine has not answered for it", () => {
    const harness = open({ eyedropper });
    // `eyedropperSupported` starts false and is written by an effect after mount;
    // a machine with no window has nothing to write.
    expect(harness.api().eyedropperSupported).toBe(false);
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    expect(harness.api().value).toBe("#000000");
  });

  it("takes a result as a value, once", () => {
    const onValueChangeEnd = vi.fn();
    const harness = open({ onValueChangeEnd, eyedropper });
    harness.service.send({ type: "EYEDROPPER.RESULT", sRGBHex: "#ff8800" });

    expect(harness.api().value).toBe("#ff8800");
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });
});

describe("color-picker — the screen picker is opt-in", () => {
  // A stand-in rather than the module: a node test has no window for the real one
  // to read, and what is asked here is whether the machine delegates at all.
  function standIn() {
    return {
      detect: vi.fn(({ context }: MachineParams<ColorPickerSchema>) => {
        context.set("eyedropperSupported", true);
      }),
      open: vi.fn(),
    } satisfies ColorPickerEyedropper;
  }

  it("hands the detection and the pick to the module it is given", () => {
    const module = standIn();
    const harness = open({ eyedropper: module });

    expect(module.detect).toHaveBeenCalledTimes(1);
    expect(harness.api().eyedropperSupported).toBe(true);
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    expect(module.open).toHaveBeenCalledTimes(1);
  });

  it("opens no pick without the module, whatever the engine answered", () => {
    const harness = open();
    expect(harness.api().eyedropperSupported).toBe(false);

    // Forced: the flag a module wrote before being withdrawn stays written.
    harness.service.context.set("eyedropperSupported", true);
    const getWin = vi
      .spyOn(harness.service.scope, "getWin")
      .mockReturnValue({} as Window & typeof globalThis);
    harness.service.send({ type: "EYEDROPPER.OPEN" });

    expect(getWin).not.toHaveBeenCalled();
  });
});

describe("color-picker — the screen picker follows its prop after the mount", () => {
  type Params = MachineParams<ColorPickerSchema>;

  function standIn(supported: boolean) {
    return {
      detect: vi.fn(({ context }: Params) => {
        context.set("eyedropperSupported", supported);
      }),
      open: vi.fn(({ refs }: Params) => {
        refs.set("eyedropperAbort", new AbortController());
      }),
    } satisfies ColorPickerEyedropper;
  }

  it("withdraws the part when the module is removed", () => {
    const harness = open({ eyedropper: standIn(true) });
    expect(harness.api().eyedropperSupported).toBe(true);

    harness.setProps({ eyedropper: undefined });

    expect(harness.api().eyedropperSupported).toBe(false);
  });

  it("offers the part when a module arrives on an engine that has the API", () => {
    const module = standIn(true);
    const harness = open();
    expect(harness.api().eyedropperSupported).toBe(false);

    harness.setProps({ eyedropper: module });

    expect(module.detect).toHaveBeenCalledTimes(1);
    expect(harness.api().eyedropperSupported).toBe(true);
  });

  it("reads the new module's answer when one replaces another", () => {
    const harness = open({ eyedropper: standIn(true) });

    harness.setProps({ eyedropper: standIn(false) });
    expect(harness.api().eyedropperSupported).toBe(false);

    harness.setProps({ eyedropper: standIn(true) });
    expect(harness.api().eyedropperSupported).toBe(true);
  });

  it("calls off a pick in flight when the module goes away", () => {
    const harness = open({ eyedropper: standIn(true) });
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    const pick = harness.service.refs.get("eyedropperAbort");
    expect(pick?.signal.aborted).toBe(false);

    harness.setProps({ eyedropper: undefined });

    expect(pick?.signal.aborted).toBe(true);
    expect(harness.service.refs.get("eyedropperAbort")).toBeNull();
    // Nothing is left to open a second one either.
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    expect(harness.service.refs.get("eyedropperAbort")).toBeNull();
  });

  /** What the real module's disposer does: calls off a pick and drops the handle. */
  function withCleanup(name: string, log: string[]) {
    return {
      detect: vi.fn(({ context, refs }: Params) => {
        log.push(`${name}.detect`);
        context.set("eyedropperSupported", true);
        return () => {
          log.push(`${name}.cleanup`);
          refs.get("eyedropperAbort")?.abort();
          refs.set("eyedropperAbort", null);
        };
      }),
      open: vi.fn(({ refs }: Params) => {
        refs.set("eyedropperAbort", new AbortController());
      }),
    } satisfies ColorPickerEyedropper;
  }

  it("calls off a pick opened through a module that arrived after the mount, when the picker stops", () => {
    const harness = open();
    harness.setProps({ eyedropper: withCleanup("late", []) });
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    const pick = harness.service.refs.get("eyedropperAbort");
    expect(pick?.signal.aborted).toBe(false);

    harness.service.stop();

    expect(pick?.signal.aborted).toBe(true);
    expect(harness.service.refs.get("eyedropperAbort")).toBeNull();
  });

  it("runs each module's cleanup once, in order, as one replaces the next", () => {
    const log: string[] = [];
    const harness = open({ eyedropper: withCleanup("A", log) });

    harness.setProps({ eyedropper: withCleanup("B", log) });
    harness.service.stop();

    expect(log).toEqual(["A.detect", "A.cleanup", "B.detect", "B.cleanup"]);
  });

  it("ignores an answer that arrives after the module was withdrawn", () => {
    let answer: VoidFunction = () => {};
    const slow = {
      detect: ({ context }: Params) => {
        answer = () => context.set("eyedropperSupported", true);
      },
      open: vi.fn(),
    } satisfies ColorPickerEyedropper;
    const harness = open();

    harness.setProps({ eyedropper: slow });
    harness.setProps({ eyedropper: undefined });
    answer();

    expect(harness.api().eyedropperSupported).toBe(false);
  });

  it("does not call off a pick itself when the module is replaced; ending it is the outgoing module's cleanup", () => {
    const harness = open({ eyedropper: standIn(true) });
    harness.service.send({ type: "EYEDROPPER.OPEN" });
    const pick = harness.service.refs.get("eyedropperAbort");

    harness.setProps({ eyedropper: standIn(true) });

    expect(pick?.signal.aborted).toBe(false);
    expect(harness.service.refs.get("eyedropperAbort")).toBe(pick);
    expect(harness.api().eyedropperSupported).toBe(true);
  });
});

describe("color-picker — the surface", () => {
  it("locks dismissal behind the two props that own it", () => {
    const locked = open({ closeOnEscape: false });
    locked.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(locked.api().open).toBe(true);

    const outside = open({ closeOnInteractOutside: false });
    outside.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
    expect(outside.api().open).toBe(true);

    const both = open({ onDismiss: vi.fn() });
    both.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(both.api().open).toBe(false);
  });

  it("puts the entry colour back when the sheet's cancel card is pressed", () => {
    const harness = open({ defaultValue: "#0088ff" });
    harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
    harness.service.send({ type: "CANCEL.CLICK" });

    expect(harness.api().value).toBe("#0088ff");
    expect(harness.api().open).toBe(false);
  });

  // Decision 68: Escape and B are the sheet's cancel; a closing drag, a press
  // outside and a popup keep what was picked.
  it("puts the opening colour back on a sheet's Escape and B only", () => {
    const cases = [
      ["sheet", "escape", "#0088ff"],
      ["sheet", "back", "#0088ff"],
      ["sheet", "drag", "#ff0000"],
      ["sheet", "outside-pointer", "#ff0000"],
      ["popup", "escape", "#ff0000"],
      ["popup", "back", "#ff0000"],
    ] as const;
    for (const [presentation, reason, kept] of cases) {
      const harness = open({ presentation, defaultValue: "#0088ff" });
      harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
      harness.service.send({ type: "CONTENT.DISMISS", reason });
      expect([presentation, reason, harness.api().value]).toEqual([presentation, reason, kept]);
      expect(harness.api().open).toBe(false);
    }
  });

  // R36: a hold takes its own snapshot; the cancel still reads the opening one.
  it("puts the opening colour back on the cancel after a committed hold", () => {
    const bus = createIntentBus();
    const harness = open({ presentation: "sheet", intents: bus, defaultValue: "#0088ff" });
    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    bus.dispatch({ intent: "moveRight", source: "gamepad" });
    bus.dispatch({ intent: "select", source: "gamepad" });
    expect(harness.api().value).not.toBe("#0088ff");

    harness.service.send({ type: "CANCEL.CLICK" });
    expect(harness.api().value).toBe("#0088ff");
    expect(harness.api().open).toBe(false);
  });

  // Decision 68: during a hold, Escape is B — the hold goes back to its start and
  // the surface stays; the next Escape is the surface's own.
  it("lets a hold go on Escape and stays open, then dismisses on the next one", () => {
    const cases = [
      ["sheet", "#0088ff"],
      ["popup", "#ff0000"],
    ] as const;
    for (const [presentation, closedOn] of cases) {
      const bus = createIntentBus();
      const onDismiss = vi.fn();
      const harness = open({ presentation, intents: bus, defaultValue: "#0088ff", onDismiss });
      harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
      harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
      bus.dispatch({ intent: "moveRight", source: "gamepad" });
      expect(harness.api().value).not.toBe("#ff0000");

      harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
      expect([presentation, harness.api().open, harness.api().engaged]).toEqual([
        presentation,
        true,
        false,
      ]);
      expect(harness.api().value).toBe("#ff0000");
      expect(onDismiss).not.toHaveBeenCalled();

      harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
      expect([presentation, harness.api().value, harness.api().open]).toEqual([
        presentation,
        closedOn,
        false,
      ]);
      expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });
    }
  });

  // A parent that keeps `open` refuses the close: the cancel still ends the hold,
  // or a later B would put the hold's start back over the colour it restored.
  it("ends a hold on the cancel even when the parent keeps the surface open", () => {
    const bus = createIntentBus();
    const harness = run({
      presentation: "sheet",
      open: true,
      intents: bus,
      defaultValue: "#0088ff",
    });
    harness.service.send({ type: "VALUE.SET", value: "#ff0000" });
    harness.service.send({ type: "CHANNEL.ENGAGE", target: "hue" });
    bus.dispatch({ intent: "moveRight", source: "gamepad" });

    harness.service.send({ type: "CANCEL.CLICK" });
    expect(harness.api().open).toBe(true);
    expect(harness.api().engaged).toBe(false);
    expect(harness.api().value).toBe("#0088ff");
    bus.dispatch({ intent: "back", source: "gamepad" });
    expect(harness.api().value).toBe("#0088ff");
  });

  it("tells `onDismiss` why the surface went, and stays silent when it was simply closed", () => {
    const onDismiss = vi.fn();
    const harness = open({ onDismiss });
    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(onDismiss).toHaveBeenLastCalledWith({ reason: "escape" });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
    expect(onDismiss).toHaveBeenLastCalledWith({ reason: "outside-pointer" });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "CANCEL.CLICK" });
    expect(onDismiss).toHaveBeenLastCalledWith({ reason: "back" });
    expect(onDismiss).toHaveBeenCalledTimes(3);

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "CLOSE.CLICK" });
    expect(harness.api().open).toBe(false);
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.api().open).toBe(true);
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.api().open).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it("has nothing to close in `inline`, and says so", () => {
    const harness = run({ presentation: "inline" });
    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    harness.service.send({ type: "OPEN.SET", open: false });

    expect(harness.api().open).toBe(true);
    expect(harness.service.state.get()).toBe("open");
  });

  it("opens from the trigger unless the picker is disabled or read-only", () => {
    const harness = run();
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.api().open).toBe(true);

    for (const props of [{ disabled: true }, { readOnly: true }]) {
      const locked = run(props);
      locked.service.send({ type: "TRIGGER.CLICK" });
      expect(locked.api().open).toBe(false);
    }
  });
});

/**
 * The eight accessible names the panel owes when the consumer renders no label
 * part of its own. They stay English by default — these controls are icon-only
 * and the sheet draws no `:empty` glyph, so withholding a name would ship a
 * nameless button — but they go through one named seam, the shape `toast` and
 * `pagination` already use.
 *
 * Asserted on both sides on purpose. The default half proves the library still
 * owes a name; the override half proves the seam is reachable, which is the thing
 * that did not exist before 2026-09-06. Two of the eight are unreachable by any
 * part prop and are the reason the seam had to be a machine prop rather than a
 * `mergeProps` argument: the area's two hidden range inputs, and the
 * `aria-valuetext` composed inside the getter.
 */
describe("the names the panel owes", () => {
  it("defaults every one of them to English", () => {
    const api = open().api();

    expect(api.getCloseTriggerProps()["aria-label"]).toBe("Close");
    expect(api.getAreaProps()["aria-label"]).toBe("Saturation and brightness");
    expect(api.getFormatSelectProps()["aria-label"]).toBe("Color format");
    expect(api.getSwatchGroupProps()["aria-label"]).toBe("Color swatches");
    expect(api.getSwatchTriggerProps()["aria-label"]).toBe("Add current color");
    expect(api.getEyedropperTriggerProps()["aria-label"]).toBe("Pick a color from the screen");
    expect(api.getAreaXInputProps()["aria-label"]).toBe("Saturation");
    expect(api.getAreaYInputProps()["aria-label"]).toBe("Brightness");
  });

  it("lets one prop replace all eight, the area's hidden inputs included", () => {
    const api = open({
      translations: {
        closeLabel: "Fermer",
        areaLabel: "Saturation et luminosité",
        formatSelectLabel: "Format de couleur",
        swatchGroupLabel: "Échantillons",
        swatchTriggerLabel: "Ajouter la couleur courante",
        eyedropperLabel: "Prélever une couleur à l'écran",
        channelLabel: (channel) => `canal ${channel}`,
      },
    }).api();

    expect(api.getCloseTriggerProps()["aria-label"]).toBe("Fermer");
    expect(api.getAreaProps()["aria-label"]).toBe("Saturation et luminosité");
    expect(api.getFormatSelectProps()["aria-label"]).toBe("Format de couleur");
    expect(api.getSwatchGroupProps()["aria-label"]).toBe("Échantillons");
    expect(api.getSwatchTriggerProps()["aria-label"]).toBe("Ajouter la couleur courante");
    expect(api.getEyedropperTriggerProps()["aria-label"]).toBe("Prélever une couleur à l'écran");
    expect(api.getAreaXInputProps()["aria-label"]).toBe("canal saturation");
    expect(api.getAreaYInputProps()["aria-label"]).toBe("canal brightness");
  });

  /**
   * The sentence a reader actually speaks on every drag. It is composed inside the
   * getter from three values, so no part prop can reach it: before the seam, a
   * French panel announced its area in English and had no way not to.
   */
  it("hands the area's spoken sentence its three parts, and takes a replacement", () => {
    const plain = open({ defaultValue: "hsl(0 100% 50%)" }).api();
    expect(plain.getAreaXInputProps()["aria-valuetext"]).toMatch(
      /^Saturation \d+%, brightness \d+%, /,
    );
    expect(plain.getAreaYInputProps()["aria-valuetext"]).toMatch(
      /^Brightness \d+%, saturation \d+%, /,
    );

    const translated = open({
      defaultValue: "hsl(0 100% 50%)",
      translations: {
        areaValueText: ({ lead, saturation, brightness, colorName }) =>
          `${lead === "saturation" ? "S" : "L"} ${saturation}/${brightness} ${colorName}`,
      },
    }).api();

    // The colour name is spelled out rather than read back off the api, which does
    // not publish it: the point of the assertion is that the seam is handed the
    // name at all, and `hsl(0 100% 50%)` is `red` on any machine.
    expect(translated.getAreaXInputProps()["aria-valuetext"]).toBe("S 100/100 red");
    expect(translated.getAreaYInputProps()["aria-valuetext"]).toBe("L 100/100 red");
  });
});

describe("the naming hub", () => {
  /**
   * `aria-labelledby` replaces an element's text outright, so pointing the trigger
   * at its `label` part alone dropped the colour out of the name: a picker with a
   * label announced "Tint" and never which colour it held, while one without a
   * label announced the colour. The button names its own id alongside the label,
   * which is how ARIA says "and my own contents".
   */
  it("keeps the colour in the trigger's name when a label part is rendered", () => {
    const bare = build({ defaultValue: "#0088ff" }).api().getTriggerProps();
    expect(bare["aria-label"]).toBe("#0088ff");
    expect(bare["aria-labelledby"]).toBeUndefined();

    const harness = build({ defaultValue: "#0088ff" });
    harness.service.context.set("hasLabel", true);
    const labelled = harness.api().getTriggerProps();
    // The label first, then the button's own contents — never the label alone.
    expect(labelled["aria-labelledby"]).toBe("color-picker:cp1:label color-picker:cp1:trigger");
    expect(labelled["aria-label"]).toBeUndefined();
  });

  /**
   * `presentation="inline"` renders no trigger at all, so a hub that stopped there
   * left the only thing on screen tied to nothing a `field` had said.
   */
  it("carries the field's naming onto the surface, which is all there is inline", () => {
    const api = build({
      presentation: "inline",
      labelledBy: "outside-label",
      describedBy: "outside-hint",
    }).api();
    const content = api.getContentProps();

    expect(content["aria-labelledby"]).toBe("outside-label");
    expect(content["aria-describedby"]).toBe("outside-hint");
    // The library's own default steps aside once something else names it.
    expect(content["aria-label"]).toBeUndefined();

    const unnamed = build({ presentation: "inline" }).api().getContentProps();
    expect(unnamed["aria-label"]).toBe("Color picker");
  });
});

describe("the modality the parts publish", () => {
  /**
   * `architecture.md:51`: a composite posts `data-focus-source` on the focused
   * item and nowhere else. The swatch grid posted it on all forty-two cells until
   * 2026-09-06 — and no test asked, which is why nobody saw it.
   *
   * The roving cell is the one cell that can hold the focus, which is the same
   * predicate `tabIndex` is built from a line above.
   */
  it("puts the modality on the roving swatch alone", () => {
    const harness = open({ swatches: ["#ff0000", "#00ff00", "#0000ff"] });
    harness.service.context.set("focusSource", "keyboard");
    harness.service.send({ type: "SWATCH.HIGHLIGHT", index: 1 });

    const api = harness.api();
    expect(api.getSwatchProps({ index: 1 })["data-focus-source"]).toBe("keyboard");
    expect(api.getSwatchProps({ index: 0 })["data-focus-source"]).toBeUndefined();
    expect(api.getSwatchProps({ index: 2 })["data-focus-source"]).toBeUndefined();
  });
});

describe("the form state the picker carries", () => {
  /**
   * `aria-invalid` on the trigger, `required` as data on the root.
   *
   * The trigger declares no `role`, so it is an implicit `button`: the only
   * role-specific ARIA state it admits is `aria-expanded` and `aria-pressed`.
   * `aria-invalid` keeps its place because it is a global attribute, which rides
   * on any role; `aria-required` is not global, so the role threw it away and axe
   * counted it under `aria-allowed-attr`. The root publishes it as data instead —
   * the shape `checkbox-group.connect.ts:55-60` settled — and it is the root
   * because `presentation="inline"` renders no trigger.
   */
  it("keeps invalid on the control and publishes required as data on the root", () => {
    const plain = build().api();
    expect(plain.getTriggerProps()["aria-invalid"]).toBeUndefined();
    expect(plain.getRootProps()["data-required"]).toBeUndefined();

    const marked = build({ required: true, invalid: true }).api();
    expect(marked.getTriggerProps()["aria-invalid"]).toBe("true");
    expect(marked.getTriggerProps()["aria-required"]).toBeUndefined();
    expect(marked.getRootProps()["data-required"]).toBe("");
  });

  /** No trigger to carry it: the root answers in every presentation. */
  it("publishes required on an inline picker, which has no trigger at all", () => {
    const inline = build({ required: true, presentation: "inline" }).api();
    expect(inline.getRootProps()["data-required"]).toBe("");
  });
});
