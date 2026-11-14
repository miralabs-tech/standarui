/**
 * The node half of `collapsible`: no document, no framework, the shape a server
 * render has. Unlike `toggle`, the service is also *started* here — the whole
 * lifecycle, `syncSize` entries included, must run without reaching for a
 * document (`scope.getDoc()` throws in this project, so any effect or action
 * that grabs one surfaces here rather than in a page).
 *
 * Everything that needs a real engine — the measured custom properties, the
 * presence exit, the focus ring — is in `collapsible.browser.test.ts` and the
 * React adapter's browser suite.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./collapsible.connect";
import { machine } from "./collapsible.machine";
import type {
  CollapsibleApi,
  CollapsibleMachineProps,
  CollapsibleSchema,
} from "./collapsible.types";

type Api = CollapsibleApi<PlainPropTypes>;

const build = (props: CollapsibleMachineProps = {}) =>
  connectWithoutDom<CollapsibleSchema, Api>({ machine, connect, id: "c1", props });

function run(props: CollapsibleMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

describe("collapsible without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server", () => {
    const harness = build({ defaultOpen: true });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps()["data-state"]).toBe("open");
    expect(api.getTriggerProps()["aria-expanded"]).toBe("true");
    expect(api.getTriggerProps().type).toBe("button");
    expect(api.getIndicatorProps()["aria-hidden"]).toBe("true");
    expect(api.getContentProps()["data-state"]).toBe("open");
  });

  it("starts, plays the entry `syncSize` with no node to measure, and does not throw", () => {
    const harness = run({ defaultOpen: true });

    expect(harness.service.status()).toBe("started");
    // The close boundary replays it, still with no document in the room.
    harness.service.send({ type: "OPEN.SET", open: false });
    expect(harness.service.state.get()).toBe("closed");
    expect(() => harness.service.stop()).not.toThrow();
  });

  it("toggles on TRIGGER.CLICK, and two clicks come home", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("open");
    expect(harness.api().open).toBe(true);

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("closed");

    expect(onOpenChange.mock.calls).toEqual([[{ open: true }], [{ open: false }]]);
  });

  it("ignores the trigger while disabled, but OPEN.SET still lands — the API is not disabled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ disabled: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).not.toHaveBeenCalled();

    harness.service.send({ type: "OPEN.SET", open: true });
    expect(harness.service.state.get()).toBe("open");
    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
  });

  it("never writes itself when it is controlled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ open: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    // The consumer was asked and declined to answer; the content stays open,
    // which is exactly what "controlled" is supposed to mean.
    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
    expect(harness.service.state.get()).toBe("open");
    expect(harness.api().open).toBe(true);
  });

  it("follows the controlled prop back down, and lifts the animated latch for it", () => {
    const harness = run({ open: false });

    expect(harness.service.context.get("animated")).toBe(false);
    harness.setProps({ open: true });

    expect(harness.service.state.get()).toBe("open");
    expect(harness.service.context.get("animated")).toBe(true);
  });

  it("holds `animated` false at start — a defaultOpen first paint is immediate", () => {
    expect(run().service.context.get("animated")).toBe(false);
    expect(run({ defaultOpen: true }).service.context.get("animated")).toBe(false);
    expect(run({ defaultOpen: true }).api().getContentProps()["data-immediate"]).toBe("");
  });

  it("lifts the latch on the first real toggle, and never lowers it again", () => {
    const harness = run();

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.context.get("animated")).toBe(true);
    expect(harness.api().getContentProps()["data-immediate"]).toBeUndefined();

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.context.get("animated")).toBe(true);
  });

  it("captures the focus source on TRIGGER.FOCUS and clears it on TRIGGER.BLUR", () => {
    const harness = run();

    expect(harness.api().focusSource).toBeNull();
    harness.service.send({ type: "TRIGGER.FOCUS" });
    // No document, no tracker: the default is the honest answer here.
    expect(harness.api().focusSource).toBe("pointer");
    expect(harness.api().focusVisible).toBe(false);

    harness.service.send({ type: "TRIGGER.BLUR" });
    expect(harness.api().focusSource).toBeNull();
  });

  it("uses the native disabled attribute — the trigger is a plain button", () => {
    const trigger = build({ disabled: true }).api().getTriggerProps();

    expect(trigger.disabled).toBe(true);
    expect(trigger["aria-disabled"]).toBeUndefined();
    expect(trigger["data-disabled"]).toBe("");
  });

  it("names the content from aria-controls only while it is in the document", () => {
    expect(build().api().getTriggerProps()["aria-controls"]).toBeUndefined();
    expect(build({ defaultOpen: true }).api().getTriggerProps()["aria-controls"]).toBe(
      "collapsible:c1:content",
    );
    // `keepMounted` holds the node in the tree while closed, so the IDREF is
    // honest there too.
    expect(build({ keepMounted: true }).api().getTriggerProps()["aria-controls"]).toBe(
      "collapsible:c1:content",
    );
  });

  it("poses `hidden` only on keepMounted-closed content", () => {
    expect(build().api().getContentProps().hidden).toBeUndefined();
    expect(build({ keepMounted: true }).api().getContentProps().hidden).toBe(true);
    expect(
      build({ keepMounted: true, defaultOpen: true }).api().getContentProps().hidden,
    ).toBeUndefined();
  });

  it("poses `inert` on a closed content that is not kept, the one still leaving (R132)", () => {
    expect(build().api().getContentProps().inert).toBe(true);
    expect(build({ defaultOpen: true }).api().getContentProps().inert).toBeUndefined();
    expect(build({ keepMounted: true }).api().getContentProps().inert).toBeUndefined();
  });

  it("carries dir onto root and content, for the sheet's RTL mirror", () => {
    const api = build({ dir: "rtl" }).api();

    expect(api.getRootProps().dir).toBe("rtl");
    expect(api.getContentProps().dir).toBe("rtl");
  });
});
