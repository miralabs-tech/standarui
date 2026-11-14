/**
 * The node half of `dialog`: no document, no framework, the shape a server render
 * has — and, unlike every other component in this folder, a machine that is also
 * *started* here.
 *
 * That is deliberate. The dialog is the first component whose whole job is side
 * effects (a focus trap, a scroll lock, an inert page, a layer on a stack), and
 * the promise the CDC makes is that the core is "du TypeScript pur, testable sans
 * DOM ni framework" (:49). So the open state is entered, its seven effects are
 * installed and torn down, and none of them is allowed to reach for a document
 * that does not exist. `scope.getDoc()` throws in this project; if an effect ever
 * calls it, this file is where that surfaces rather than in a page.
 *
 * `dialog.browser.test.ts` owns everything that needs a real engine — the trap,
 * the stack, `inert`, the gamepad.
 */

import { describe, expect, it, vi } from "vitest";
import type { DismissReason } from "../../interaction/layer-stack";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./dialog.connect";
import { machine } from "./dialog.machine";
import type { DialogApi, DialogMachineProps, DialogSchema } from "./dialog.types";

type Api = DialogApi<PlainPropTypes>;

const build = (props: DialogMachineProps = {}) =>
  connectWithoutDom<DialogSchema, Api>({ machine, connect, id: "d1", props });

/** The same harness with the mount effect run — a client with nothing to mount into. */
function run(props: DialogMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

describe("dialog without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    // Controlled wins over the default, including when it says closed.
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server, named by its label because no title has been found", () => {
    const harness = build({ defaultOpen: true, label: "Rename file" });
    const content = harness.api().getContentProps();

    expect(harness.service.status()).toBe("not-started");
    expect(content.role).toBe("dialog");
    expect(content["aria-modal"]).toBe("true");
    expect(content["aria-label"]).toBe("Rename file");
    // `hasTitle` is read from the DOM, and there is none: an IDREF may only point
    // at an id that has been proved to exist.
    expect(content["aria-labelledby"]).toBeUndefined();
    expect(content.tabIndex).toBe(-1);
    expect(content["data-state"]).toBe("open");
    expect(content["data-modal"]).toBe("");
    expect(content["data-presentation"]).toBe("center");
    expect(content["data-snav"]).toBe("container");
    expect(content["data-snav-trap"]).toBe("");
  });

  it("wears the role it is given — what lets alert-dialog reuse this machine", () => {
    const content = build({ role: "alertdialog", defaultOpen: true }).api().getContentProps();

    expect(content.role).toBe("alertdialog");
  });

  it("names the surface from aria-controls only while it is open", () => {
    const closed = build().api().getTriggerProps();
    const open = build({ defaultOpen: true }).api().getTriggerProps();

    expect(closed["aria-controls"]).toBeUndefined();
    expect(closed["aria-expanded"]).toBe("false");
    expect(open["aria-controls"]).toBe("dialog:d1:content");
    expect(open["aria-expanded"]).toBe("true");
    expect(open["aria-haspopup"]).toBe("dialog");
  });

  it("describes itself from what exists, and from nothing else", () => {
    expect(build().api().getContentProps()["aria-describedby"]).toBeUndefined();
    expect(
      build({ describedBy: "shortcut-hint" }).api().getContentProps()["aria-describedby"],
    ).toBe("shortcut-hint");
  });

  it("declares its parenthood, because once portalled the DOM cannot tell", () => {
    expect(build().api().getContentProps()["data-nested"]).toBeUndefined();
    expect(build({ parentId: "dialog:outer:content" }).api().getContentProps()["data-nested"]).toBe(
      "",
    );
  });

  it("refuses to trap focus when it is not modal — there is nothing to trap against", () => {
    expect(build({ modal: false, trapFocus: true }).service.prop("trapFocus")).toBe(false);
    expect(build({ modal: true }).service.prop("trapFocus")).toBe(true);
    expect(build({ modal: false }).api().getContentProps()["aria-modal"]).toBeUndefined();
    expect(build({ modal: false }).api().getContentProps()["data-snav-trap"]).toBeUndefined();
  });
});

describe("dialog — the state is a projection of the bindable", () => {
  it("opens from the trigger and reports it once", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    expect(harness.service.context.get("open")).toBe(true);
    expect(harness.service.state.get()).toBe("open");
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
  });

  it("closes from the close trigger", () => {
    const onOpenChange = vi.fn();
    const harness = run({ defaultOpen: true, onOpenChange });

    harness.service.send({ type: "CLOSE.CLICK" });

    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
  });

  it("never writes its own value when `open` is controlled, and follows the prop instead", () => {
    const onOpenChange = vi.fn();
    const harness = run({ open: false, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    // The whole point of the projection: a consumer that declines to update the
    // prop keeps the dialog closed, and that is the correct controlled semantics.
    expect(harness.service.context.get("open")).toBe(false);
    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).toHaveBeenCalledWith({ open: true });

    harness.setProps({ open: true });

    expect(harness.service.state.get()).toBe("open");
    expect(harness.api().open).toBe(true);
  });

  it("takes OPEN.SET from the api, and stays silent when it changes nothing", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.api().setOpen(false);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.service.state.get()).toBe("closed");

    harness.api().setOpen(true);

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
    expect(harness.service.state.get()).toBe("open");
  });

  it("does nothing at all on a disabled trigger", () => {
    const onOpenChange = vi.fn();
    const harness = run({ disabled: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.api().getTriggerProps().disabled).toBe(true);
    expect(harness.api().getTriggerProps()["data-disabled"]).toBe("");
  });
});

describe("dialog — canDismiss", () => {
  /**
   * Two locks, four reasons, and the cross-setting on purpose: each case pins the
   * lock that governs it *and* proves the other one has no say. `back` and
   * `escape` share `closeOnEscape` — a dialog Escape cannot close must not close
   * to a gamepad's B either.
   */
  it("refuses an outside dismissal by default when the role is alertdialog", () => {
    const onDismiss = vi.fn();
    const harness = run({ role: "alertdialog", defaultOpen: true, onDismiss });

    harness.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });

    // A click in the gutter cancelling a destructive confirmation is the accident
    // the role exists to prevent. Escape still works — that is a deliberate exit.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(harness.service.state.get()).toBe("open");
  });

  it("still lets a consumer ask for it back, and leaves a plain dialog alone", () => {
    const opted = run({ role: "alertdialog", defaultOpen: true, closeOnInteractOutside: true });
    opted.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
    expect(opted.service.state.get()).toBe("closed");

    const plain = run({ defaultOpen: true });
    plain.service.send({ type: "CONTENT.DISMISS", reason: "outside-pointer" });
    expect(plain.service.state.get()).toBe("closed");
  });

  const GOVERNED_BY_ESCAPE: readonly DismissReason[] = ["escape", "back"];

  function propsFor(reason: DismissReason, allowed: boolean): DialogMachineProps {
    return GOVERNED_BY_ESCAPE.includes(reason)
      ? { defaultOpen: true, closeOnEscape: allowed, closeOnInteractOutside: !allowed }
      : { defaultOpen: true, closeOnEscape: !allowed, closeOnInteractOutside: allowed };
  }

  const REASONS: readonly DismissReason[] = ["escape", "back", "outside-pointer", "focus-outside"];

  for (const reason of REASONS) {
    const lock = GOVERNED_BY_ESCAPE.includes(reason) ? "closeOnEscape" : "closeOnInteractOutside";

    it(`dismisses on ${reason} when ${lock} is on`, () => {
      const onDismiss = vi.fn();
      const harness = run({ ...propsFor(reason, true), onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).toHaveBeenCalledWith({ reason });
      expect(harness.service.state.get()).toBe("closed");
    });

    it(`holds on ${reason} when ${lock} is off`, () => {
      const onDismiss = vi.fn();
      const harness = run({ ...propsFor(reason, false), onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).not.toHaveBeenCalled();
      expect(harness.service.state.get()).toBe("open");
    });
  }
});

describe("dialog — presentation", () => {
  it("resolves `auto` from the density, and lets an explicit value win over it", () => {
    const auto = run();
    expect(auto.service.computed("presentation")).toBe("center");

    auto.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(auto.service.computed("presentation")).toBe("sheet");

    // iPad is not desktop and iPhone is not touch: the mapping is a decision, so
    // a consumer that made it explicitly is never second-guessed.
    const centred = run({ presentation: "center" });
    centred.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(centred.service.computed("presentation")).toBe("center");

    const sheet = run({ presentation: "sheet" });
    expect(sheet.service.computed("presentation")).toBe("sheet");
  });

  it("changes an attribute and nothing else when the density flips", () => {
    const harness = run({ defaultOpen: true });
    expect(harness.service.state.get()).toBe("open");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });

    // No state, no transition and no effect differs between the two: a sheet and
    // a centred modal are the same machine (spec §6).
    expect(harness.service.state.get()).toBe("open");
    expect(harness.api().getContentProps()["data-presentation"]).toBe("sheet");
    expect(harness.api().getBackdropProps()["data-presentation"]).toBe("sheet");
    expect(harness.api().getPositionerProps()["data-presentation"]).toBe("sheet");
  });
});

describe("dialog — with no document in the room", () => {
  it("has none to reach for", () => {
    // The premise of the file. Every assertion below is worthless if this passes.
    expect(() => build().service.scope.getDoc()).toThrow(/needs a document/);
  });

  it("runs a whole open, dismiss and stop cycle without touching one", () => {
    const onDismiss = vi.fn();
    const harness = build({ label: "Rename file", onDismiss });

    expect(() => {
      harness.service.start();
      harness.service.send({ type: "TRIGGER.CLICK" });
      harness.service.send({ type: "CONTENT.FOCUS" });
      harness.service.send({ type: "PARTS.SYNC" });
      harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
      harness.service.stop();
    }).not.toThrow();

    expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });
    expect(harness.service.state.get()).toBe("closed");
    // Nothing had focus, and "the body had it" is not a target worth restoring to.
    expect(harness.service.refs.get("finalFocusEl")).toBeNull();
  });

  /**
   * The direction now falls back to the document's root when no trigger is
   * rendered, and there is no root here either. The fallback has to answer
   * "nothing to read" the way a missing part does — never `scope.getDoc()`,
   * which throws exactly where this file stands.
   */
  it("resolves the surface direction with no root to read it from", () => {
    const harness = build({ defaultOpen: true, label: "Rename file" });

    expect(() => harness.service.start()).not.toThrow();
    expect(harness.service.context.get("surfaceDir")).toBe("ltr");
  });
});
