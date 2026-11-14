/**
 * The node half of `popover`: no document anywhere, including for the open state.
 *
 * The popover installs one effect more than the dialog and the extra one is the
 * position tracker, which is the most DOM-hungry thing in the library. So the same
 * promise gets the same proof: the open state is entered, its eight effects are
 * installed and torn down, and not one of them reaches for a document that does
 * not exist. `scope.getDoc()` throws in this project; if an effect ever calls it,
 * this file is where that surfaces rather than in a page.
 *
 * Everything that needs a real engine — the tracker's arithmetic, the arrow, the
 * layer stack, the gamepad — is in `popover.browser.test.ts`.
 */

import { describe, expect, it, vi } from "vitest";
import type { DismissReason } from "../../interaction/layer-stack";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./popover.connect";
import { machine } from "./popover.machine";
import type { PopoverApi, PopoverMachineProps, PopoverSchema } from "./popover.types";

type Api = PopoverApi<PlainPropTypes>;

const build = (props: PopoverMachineProps = {}) =>
  connectWithoutDom<PopoverSchema, Api>({ machine, connect, id: "p1", props });

function run(props: PopoverMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

describe("popover without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server, named by its label because no title has been found", () => {
    const harness = build({ defaultOpen: true, label: "Share options" });
    const content = harness.api().getContentProps();

    expect(harness.service.status()).toBe("not-started");
    expect(content.role).toBe("dialog");
    expect(content["aria-label"]).toBe("Share options");
    expect(content["aria-labelledby"]).toBeUndefined();
    expect(content.tabIndex).toBe(-1);
    expect(content["data-state"]).toBe("open");
    expect(content["data-presentation"]).toBe("anchored");
  });

  it("is not modal, which is the whole definition — and says so in three places", () => {
    const content = build({ defaultOpen: true }).api().getContentProps();

    expect(content["aria-modal"]).toBeUndefined();
    expect(content["data-modal"]).toBeUndefined();
    expect(build().service.prop("modal")).toBe(false);

    const modal = build({ modal: true, defaultOpen: true }).api().getContentProps();
    expect(modal["aria-modal"]).toBe("true");
    expect(modal["data-modal"]).toBe("");
  });

  it("keeps the spatial trap even when it is not modal, unlike the dialog", () => {
    // A popover is left with B, not by walking out of the bottom of it.
    const content = build({ defaultOpen: true }).api().getContentProps();

    expect(content["data-snav"]).toBe("container");
    expect(content["data-snav-trap"]).toBe("");
  });

  it("names the surface from aria-controls only while it is open", () => {
    const closed = build().api().getTriggerProps();
    const open = build({ defaultOpen: true }).api().getTriggerProps();

    expect(closed["aria-controls"]).toBeUndefined();
    expect(closed["aria-expanded"]).toBe("false");
    expect(open["aria-controls"]).toBe("popover:p1:content");
    expect(open["aria-expanded"]).toBe("true");
    expect(open["aria-haspopup"]).toBe("dialog");
  });

  it("describes itself from what exists, and from nothing else", () => {
    expect(build().api().getContentProps()["aria-describedby"]).toBeUndefined();
    expect(
      build({ describedBy: "shortcut-hint" }).api().getContentProps()["aria-describedby"],
    ).toBe("shortcut-hint");
  });

  it("refuses to trap focus unless it is modal, and locks focus-outside to the same fact", () => {
    expect(build({ trapFocus: true }).service.prop("trapFocus")).toBe(false);
    expect(build({ modal: true }).service.prop("trapFocus")).toBe(true);
    // A non-modal surface is the one a focus can walk out of, so that is the one
    // whose default is to close when it does.
    expect(build().service.prop("closeOnFocusOutside")).toBe(true);
    expect(build({ modal: true }).service.prop("closeOnFocusOutside")).toBe(false);
    expect(
      build({ modal: true, closeOnFocusOutside: true }).service.prop("closeOnFocusOutside"),
    ).toBe(true);
  });

  it("publishes the placement it was asked for before anything has measured", () => {
    const api = build({ placement: "right-start", defaultOpen: true }).api();

    expect(api.placement).toBe("right-start");
    expect(api.getContentProps()["data-side"]).toBe("right");
    expect(api.getContentProps()["data-align"]).toBe("start");
    // The positioner carries neither: the effect writes them onto that node
    // directly, and an adapter rendering them too would fight it every commit.
    expect(api.getPositionerProps()["data-side"]).toBeUndefined();
    expect(api.getPositionerProps()["data-align"]).toBeUndefined();
    // A bare side means centred, spelled out rather than left absent.
    expect(build().api().getContentProps()["data-align"]).toBe("center");
  });
});

describe("popover — the trigger is a disclosure", () => {
  it("toggles, which is the one event where it differs from the dialog", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("open");

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("closed");

    expect(onOpenChange.mock.calls).toEqual([[{ open: true }], [{ open: false }]]);
  });

  it("does nothing at all when it is disabled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ disabled: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.api().getTriggerProps()["data-disabled"]).toBe("");
  });

  it("never writes itself when it is controlled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ open: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    // The consumer was asked and declined to answer; the surface stays open,
    // which is exactly what "controlled" is supposed to mean.
    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
    expect(harness.service.state.get()).toBe("open");
  });

  it("stays quiet when `OPEN.SET` changes nothing", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.service.send({ type: "OPEN.SET", open: false });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("popover — the three dismissal locks", () => {
  /**
   * Four reasons, three locks, and the cross-setting is the point of the table:
   * each case pins the lock that governs it *and* proves the other two have no
   * say. `escape` and `back` share one — a popover Escape cannot close must not
   * close to a gamepad's B either — while `focus-outside` has its own, which is
   * the whole reason the popover has a third boolean at all.
   */
  const LOCKS = {
    escape: "closeOnEscape",
    back: "closeOnEscape",
    // No drawer decorates this surface today, and the row is here anyway: the lock
    // belongs to the family, not to whoever happens to be draggable this week.
    drag: "closeOnEscape",
    "focus-outside": "closeOnFocusOutside",
    "outside-pointer": "closeOnInteractOutside",
  } as const satisfies Record<DismissReason, keyof PopoverMachineProps>;

  const ALL_LOCKS = ["closeOnEscape", "closeOnFocusOutside", "closeOnInteractOutside"] as const;

  function propsFor(reason: DismissReason, allowed: boolean): PopoverMachineProps {
    const governing = LOCKS[reason];
    const props: Record<string, unknown> = { defaultOpen: true };
    for (const lock of ALL_LOCKS) props[lock] = lock === governing ? allowed : !allowed;
    return props as PopoverMachineProps;
  }

  for (const reason of Object.keys(LOCKS) as DismissReason[]) {
    it(`dismisses on ${reason} when ${LOCKS[reason]} is on`, () => {
      const onDismiss = vi.fn();
      const harness = run({ ...propsFor(reason, true), onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).toHaveBeenCalledWith({ reason });
      expect(harness.service.state.get()).toBe("closed");
    });

    it(`holds on ${reason} when ${LOCKS[reason]} is off`, () => {
      const onDismiss = vi.fn();
      const harness = run({ ...propsFor(reason, false), onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).not.toHaveBeenCalled();
      expect(harness.service.state.get()).toBe("open");
    });
  }
});

describe("popover — presentation is an attribute, never a state", () => {
  it("resolves `auto` from the density, and an explicit value wins over it", () => {
    const harness = run({ defaultOpen: true });
    expect(harness.api().presentation).toBe("anchored");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(harness.api().presentation).toBe("sheet");

    const declared = run({ defaultOpen: true, presentation: "anchored" });
    declared.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    // An iPad is `touch` and is the one platform where the anchored popover
    // exists, so the mapping has to stay a declaration.
    expect(declared.api().presentation).toBe("anchored");
  });

  it("changes one attribute and stays open across the flip", () => {
    const harness = run({ defaultOpen: true });
    const before = harness.api().getContentProps();

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    const after = harness.api().getContentProps();

    expect(before["data-presentation"]).toBe("anchored");
    expect(after["data-presentation"]).toBe("sheet");
    // `reenter` tears the open state down and builds it back; what it must not do
    // is change the state itself, the name, or the placement.
    expect(harness.service.state.get()).toBe("open");
    expect(after["data-state"]).toBe("open");
    expect(after["data-side"]).toBe(before["data-side"]);
    expect(after.id).toBe(before.id);
  });
});

describe("popover — the placement is reported back", () => {
  it("writes what the positioner landed on, which is not always what was asked", () => {
    const harness = run({ defaultOpen: true, placement: "bottom" });

    // What `onPositioned` sends after a flip.
    harness.service.send({ type: "POSITION.SYNC", placement: "top-end" });

    expect(harness.api().placement).toBe("top-end");
    expect(harness.api().getContentProps()["data-side"]).toBe("top");
    expect(harness.api().getContentProps()["data-align"]).toBe("end");
    expect(harness.api().getArrowProps()["data-side"]).toBe("top");
  });
});

describe("popover — a whole life cycle with no document in the room", () => {
  it("opens, installs eight effects, dismisses and stops without reaching for one", () => {
    const onDismiss = vi.fn();
    const harness = run({ onDismiss, intents: null });

    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("open");

    // The prop getters are what an adapter calls on every render, so they run
    // here too rather than being assumed harmless.
    const api = harness.api();
    api.getPositionerProps();
    api.getContentProps();
    api.getArrowProps();
    api.getArrowTipProps();
    api.getBackdropProps();
    api.getAnchorProps();

    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(harness.service.state.get()).toBe("closed");
    expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });

    expect(() => harness.service.stop()).not.toThrow();
  });
});
