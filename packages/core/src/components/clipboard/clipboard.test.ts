/**
 * The node half of `clipboard`: no document, no framework, no clipboard API.
 *
 * The whole copy cycle is drivable here because the effects are the machine's
 * only contact with the page and every one of them answers silence to a missing
 * document — `performCopy` and `waitFeedbackReturn` find no trigger element, so
 * COPY.SUCCESS / COPY.ERROR / FEEDBACK.ELAPSED are sent by hand, which is
 * exactly what makes each transition assertable on its own.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./clipboard.connect";
import { machine } from "./clipboard.machine";
import type { ClipboardApi, ClipboardMachineProps, ClipboardSchema } from "./clipboard.types";

type Api = ClipboardApi<PlainPropTypes>;

const build = (props: ClipboardMachineProps = {}) =>
  connectWithoutDom<ClipboardSchema, Api>({ machine, connect, id: "c1", props });

const started = (props: ClipboardMachineProps = {}) => {
  const harness = build(props);
  harness.service.start();
  return harness;
};

describe("clipboard without a DOM", () => {
  it("resolves its defaults", () => {
    const { service } = build();

    expect(service.state.get()).toBe("idle");
    // No default: a defaulted `dir` is emitted as an attribute, and an attribute
    // overrides the direction the surrounding region already inherits.
    expect(service.prop("dir")).toBeUndefined();
    expect(service.prop("disabled")).toBe(false);
    expect(service.prop("copiedDuration")).toBe(2000);
    expect(service.prop("copiedText")).toBe("Copied to clipboard");
    expect(service.prop("copyFailedText")).toBe("Copy to clipboard failed");
  });

  it("moves to copying on a click, and stays idle while disabled", () => {
    const harness = started();
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("copying");

    const disabled = started({ disabled: true });
    disabled.service.send({ type: "TRIGGER.CLICK" });
    expect(disabled.service.state.get()).toBe("idle");
  });

  it("lands in copied on success, and reports the entry edge once", () => {
    const onCopiedChange = vi.fn();
    const harness = started({ onCopiedChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.SUCCESS" });

    expect(harness.service.state.get()).toBe("copied");
    expect(harness.api().copied).toBe(true);
    expect(onCopiedChange).toHaveBeenCalledTimes(1);
    expect(onCopiedChange).toHaveBeenCalledWith({ copied: true });
  });

  it("lands in error on failure, hands the error over, and never says copied", () => {
    const onCopiedChange = vi.fn();
    const onCopyError = vi.fn();
    const harness = started({ onCopiedChange, onCopyError });
    const failure = new Error("NotAllowedError");

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.ERROR", error: failure });

    expect(harness.service.state.get()).toBe("error");
    expect(onCopyError).toHaveBeenCalledWith({ error: failure });
    expect(onCopiedChange).not.toHaveBeenCalled();
  });

  it("returns to idle when the feedback elapses, reporting the exit edge", () => {
    const onCopiedChange = vi.fn();
    const harness = started({ onCopiedChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.SUCCESS" });
    harness.service.send({ type: "FEEDBACK.ELAPSED" });

    expect(harness.service.state.get()).toBe("idle");
    expect(onCopiedChange).toHaveBeenLastCalledWith({ copied: false });
    expect(onCopiedChange).toHaveBeenCalledTimes(2);
  });

  it("restarts a full cycle from copied, callbacks in true, false, true order", () => {
    const onCopiedChange = vi.fn();
    const harness = started({ onCopiedChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.SUCCESS" });
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("copying");

    harness.service.send({ type: "COPY.SUCCESS" });
    expect(harness.service.state.get()).toBe("copied");
    expect(onCopiedChange.mock.calls).toEqual([
      [{ copied: true }],
      [{ copied: false }],
      [{ copied: true }],
    ]);
  });

  it("absorbs a click during copying — no re-entry, no state change", () => {
    const harness = started();
    harness.service.send({ type: "TRIGGER.CLICK" });

    harness.service.send({ type: "TRIGGER.CLICK" });

    expect(harness.service.state.get()).toBe("copying");
    // The write in flight still decides: its success lands as usual.
    harness.service.send({ type: "COPY.SUCCESS" });
    expect(harness.service.state.get()).toBe("copied");
  });

  it("writes the value while uncontrolled, and only reports while controlled", () => {
    const onValueChange = vi.fn();
    const uncontrolled = started({ defaultValue: "a", onValueChange });

    uncontrolled.service.send({ type: "VALUE.SET", value: "b" });
    expect(uncontrolled.api().value).toBe("b");
    expect(onValueChange).toHaveBeenCalledWith({ value: "b" });

    const report = vi.fn();
    const controlled = started({ value: "locked", onValueChange: report });
    controlled.service.send({ type: "VALUE.SET", value: "changed" });
    expect(controlled.api().value).toBe("locked");
    expect(report).toHaveBeenCalledWith({ value: "changed" });
  });

  it("leaves copied the moment the value changes — the checkmark would be stale", () => {
    const harness = started({ defaultValue: "a" });
    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.SUCCESS" });

    harness.service.send({ type: "VALUE.SET", value: "b" });

    expect(harness.service.state.get()).toBe("idle");
  });

  it("leaves error on a value change too, and idle ignores it", () => {
    const harness = started({ defaultValue: "a" });
    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.ERROR", error: new Error("no") });
    harness.service.send({ type: "VALUE.SET", value: "b" });
    expect(harness.service.state.get()).toBe("idle");

    harness.service.send({ type: "VALUE.SET", value: "c" });
    expect(harness.service.state.get()).toBe("idle");
  });

  it("drives the same path from the imperative api, guard included", () => {
    const harness = started();
    harness.api().copy();
    expect(harness.service.state.get()).toBe("copying");

    const disabled = started({ disabled: true });
    disabled.api().copy();
    expect(disabled.service.state.get()).toBe("idle");
  });

  it("connects on a server: every part renders its resting attributes", () => {
    const harness = build({ defaultValue: "hello", copyLabel: "Copy" });
    const api = harness.api();

    const root = api.getRootProps();
    expect(root["data-part"]).toBe("clipboard:root");
    expect(root["data-state"]).toBe("idle");
    expect(root["data-copied"]).toBeUndefined();
    expect(root.dir).toBeUndefined();

    const label = api.getLabelProps();
    expect(label.for).toBe("clipboard:c1:input");

    const input = api.getInputProps();
    expect(input.id).toBe("clipboard:c1:input");
    expect(input.value).toBe("hello");
    expect(input.readOnly).toBe(true);
    expect(input["data-readonly"]).toBe("");

    const trigger = api.getTriggerProps();
    expect(trigger.type).toBe("button");
    expect(trigger["aria-label"]).toBe("Copy");
    expect(trigger.disabled).toBe(false);
    expect(api.getControlProps()["data-part"]).toBe("clipboard:control");
  });

  it("dresses the two indicator variants by state, and gives neither an id", () => {
    const harness = started();
    const idle = harness.api();
    expect(idle.getIndicatorProps().hidden).toBe(false);
    expect(idle.getIndicatorProps({ copied: true }).hidden).toBe(true);
    expect(idle.getIndicatorProps().id).toBeUndefined();
    expect(idle.getIndicatorProps({ copied: true })["aria-hidden"]).toBe("true");
    expect(idle.getIndicatorProps({ copied: true })["data-copied"]).toBe("");
    expect(idle.getIndicatorProps()["data-copied"]).toBeUndefined();

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "COPY.SUCCESS" });
    const copied = harness.api();
    expect(copied.getIndicatorProps().hidden).toBe(true);
    expect(copied.getIndicatorProps({ copied: true }).hidden).toBe(false);
    expect(copied.getRootProps()["data-copied"]).toBe("");
    expect(copied.getTriggerProps()["data-copied"]).toBe("");

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.api().getRootProps()["data-state"]).toBe("copying");
    harness.service.send({ type: "COPY.ERROR", error: new Error("no") });
    const errored = harness.api();
    expect(errored.getRootProps()["data-state"]).toBe("error");
    // The resting glyph shows through an error: the colour and the announcement
    // carry the failure, there is no third glyph.
    expect(errored.getIndicatorProps().hidden).toBe(false);
    expect(errored.getIndicatorProps({ copied: true }).hidden).toBe(true);
  });

  it("derives focus visibility from the captured modality, and blur clears it", () => {
    const harness = started();

    // No document, so a focus event is a guarded silence, never a crash.
    harness.service.send({ type: "TRIGGER.FOCUS" });
    expect(harness.api().focusSource).toBeNull();

    harness.service.context.set("focusSource", "keyboard");
    expect(harness.api().focusVisible).toBe(true);
    expect(harness.api().getTriggerProps()["data-focus-visible"]).toBe("");
    expect(harness.api().getTriggerProps()["data-focus-source"]).toBe("keyboard");

    harness.service.context.set("focusSource", "pointer");
    expect(harness.api().focusVisible).toBe(false);
    expect(harness.api().getTriggerProps()["data-focus-source"]).toBe("pointer");

    harness.service.send({ type: "TRIGGER.BLUR" });
    expect(harness.api().focusSource).toBeNull();
    expect(harness.api().getTriggerProps()["data-focus-source"]).toBeUndefined();
  });
});
