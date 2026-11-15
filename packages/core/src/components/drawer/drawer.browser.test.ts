/**
 * The drawer against a real engine, with no framework at all.
 *
 * `drawer.test.ts` already proves the track arithmetic — resolution, stepping,
 * the release table, the four edges under the intent grammar — against a machine
 * with no document in the room. What cannot be faked there is everything this
 * file is about: a pointer that captures, a scroller that claims a gesture before
 * the sheet can have it, a custom property written straight onto a node, and the
 * seam between `interaction/drag-axis` and this machine, which is where a sign
 * can be wrong without either side being wrong on its own.
 *
 * `packages/react/src/components/drawer/drawer.browser.test.tsx` runs the parts
 * that only exist once the decorator is composed onto a real dialog: the tab
 * order inside a focus trap, the dismissal lock, axe.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { createIntentBus, type IntentBus } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./drawer.connect";
import { machine } from "./drawer.machine";
import type { DrawerApi, DrawerMachineProps, DrawerSchema } from "./drawer.types";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

type Api = DrawerApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

/** The surface is 200 px tall at `maxDetent: 1`, so one detent step is 100 px. */
const SURFACE = 200;

interface SceneOptions {
  /** A scroller between the finger and the surface — the §12-19 arbitration. */
  readonly scroller?: boolean;
  readonly dir?: "ltr" | "rtl";
  /**
   * An inline drawer is `SURFACE` **wide** instead of tall, and the distinction is
   * not cosmetic: `beginDrag` divides the surface's box on the gesture's axis by
   * `maxDetent` to get the track it travels. Left at the viewport's width, a 60 px
   * drag is a few percent of the track and lands back on the detent it started
   * from — a test that would report a sign error and an arithmetic error
   * identically.
   */
  readonly axis?: "block" | "inline";
}

/**
 * The textarea's width is pinned, and it is not cosmetic. A textarea's intrinsic
 * size is the engine's own business, and WebKit's overflows the 200 px inline
 * scene — so the surface really did have inline scroll room,
 * `gestureBelongsToSurface` really did refuse the gesture, and only the `end` edge
 * saw it: that one asks whether a scroller can still travel toward its end, while
 * `start` asks about `scrollLeft` and reads zero. The arbitration was right and the
 * scene was accidentally a horizontal scroller — caught by CI on one engine out of
 * three, which is the whole reason the matrix exists.
 */
function markup(options: SceneOptions): string {
  const scroller =
    options.scroller === true
      ? `<div data-slot="scroller" style="block-size: 60px; overflow: auto">
           <button data-slot="deep">Deep</button>
           <div style="block-size: 400px"></div>
         </div>`
      : "";
  const box =
    options.axis === "inline"
      ? `inset-block: 0; inset-inline-start: 0; inline-size: ${SURFACE}px`
      : `inset-block-end: 0; inset-inline: 0; block-size: ${SURFACE}px`;
  return `
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="backdrop"></div>
    <div data-slot="positioner" style="position: fixed; inset: 0">
      <div
        data-slot="content"
        dir="${options.dir ?? "ltr"}"
        style="position: absolute; ${box}"
      >
        ${scroller}
        <textarea data-slot="text" style="inline-size: 40px"></textarea>
        <button data-slot="body">Body</button>
        <div data-slot="grabber"></div>
      </div>
    </div>
    <main data-slot="page">Behind</main>`;
}

function render(props: DrawerMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<DrawerSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: "k1",
    props: { open: true, ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("positioner", api.getPositionerProps());
      put("backdrop", api.getBackdropProps());
      put("content", api.getContentProps());
      if (api.hasTrack) put("grabber", api.getGrabberProps());
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

/**
 * `timeStamp` is a read-only getter on the prototype, and a constructed event gets
 * whatever the clock said when it was built. Shadowing it with an own property is
 * the only way to assert a velocity rather than a range — the pattern
 * `drag-axis.browser.test.ts` introduced, and the reason a flick here is a number
 * and not a hope.
 */
function pointer(
  node: HTMLElement,
  type: string,
  at: number,
  coords: { x?: number; y?: number },
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: coords.x ?? 0,
    clientY: coords.y ?? 0,
  });
  Object.defineProperty(event, "timeStamp", { value: at });
  node.dispatchEvent(event);
  return event;
}

/** A whole gesture along the block axis, from `from` to `to` over `ms`. */
function dragBlock(node: HTMLElement, from: number, to: number, ms: number): void {
  pointer(node, "pointerdown", 0, { y: from });
  pointer(node, "pointermove", ms / 2, { y: (from + to) / 2 });
  pointer(node, "pointermove", ms, { y: to });
  pointer(node, "pointerup", ms, { y: to });
}

function dragInline(node: HTMLElement, from: number, to: number, ms: number): void {
  pointer(node, "pointerdown", 0, { x: from });
  pointer(node, "pointermove", ms / 2, { x: (from + to) / 2 });
  pointer(node, "pointermove", ms, { x: to });
  pointer(node, "pointerup", ms, { x: to });
}

function key(node: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

const extra: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of extra.splice(0, extra.length)) dispose();
  unmountAll();
});

describe("drawer — the grabber's keyboard", () => {
  it("walks the track with the arrows and stops at both ends", () => {
    const harness = render({ detents: [0.3, 0.6, 1], defaultDetent: 0.6 });
    const grabber = harness.part("grabber");

    key(grabber, { key: "ArrowUp" });
    expect(harness.api().detent).toBe(1);
    // No wrap: a keystroke is discrete and wrapping would close by accident.
    key(grabber, { key: "ArrowUp" });
    expect(harness.api().detent).toBe(1);

    key(grabber, { key: "ArrowDown" });
    key(grabber, { key: "ArrowDown" });
    expect(harness.api().detent).toBe(0.3);
    key(grabber, { key: "ArrowDown" });
    expect(harness.api().detent).toBe(0.3);
  });

  it("sends Home to the smallest detent and End to the largest", () => {
    const harness = render({ detents: [0.3, 0.6, 1], defaultDetent: 0.6 });

    key(harness.part("grabber"), { key: "End" });
    expect(harness.api().detent).toBe(1);
    key(harness.part("grabber"), { key: "Home" });
    expect(harness.api().detent).toBe(0.3);
  });

  it("ignores an auto-repeat, so a held arrow does not run the track", () => {
    const harness = render({ detents: [0.3, 0.6, 1], defaultDetent: 0.3 });

    key(harness.part("grabber"), { key: "ArrowUp", repeat: true });
    expect(harness.api().detent).toBe(0.3);
  });

  it("acts on Space at keyup and holds the page still at keydown", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });
    const grabber = harness.part("grabber");

    const down = key(grabber, { key: " " });
    // Held, not acted on: this is what stops the page scrolling under an open
    // sheet, and it is what a native control does.
    expect(down.defaultPrevented).toBe(true);
    expect(harness.api().detent).toBe(0.5);

    const up = new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
    grabber.dispatchEvent(up);
    expect(harness.api().detent).toBe(1);
  });

  it("toggles on Enter at keydown", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });

    key(harness.part("grabber"), { key: "Enter" });
    expect(harness.api().detent).toBe(1);
  });

  it("leaves Escape alone — it belongs to the surface this decorates", () => {
    const harness = render();

    const event = key(harness.part("grabber"), { key: "Escape" });
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("drawer — Ctrl+arrow from inside the content", () => {
  it("changes detent from a button in the body", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });

    const event = key(slot(harness, "body"), { key: "ArrowUp", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(harness.api().detent).toBe(1);
  });

  it("does not steal it from a textarea, where it walks the caret", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });

    const event = key(slot(harness, "text"), { key: "ArrowUp", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(harness.api().detent).toBe(0.5);
  });

  it("leaves a bare arrow in the body to whatever is under it", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });

    const event = key(slot(harness, "body"), { key: "ArrowUp" });
    expect(event.defaultPrevented).toBe(false);
    expect(harness.api().detent).toBe(0.5);
  });

  it("stands down on a single-detent sheet, which has no track to walk", () => {
    const harness = render({ detents: [1] });

    const event = key(slot(harness, "body"), { key: "ArrowUp", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it("rings the pill for a keyboard and leaves it dark for a pointer", () => {
    const harness = render({ detents: [0.5, 1] });
    const grabber = harness.part("grabber");

    // The document's modality store decides this, and the prop getter cannot: it
    // is DOM-free by contract, so while it named the source itself it named the
    // same one every time — `"keyboard"` — and the pill wore its ring after a
    // mouse press and after a touch, which on a sheet is the *primary* gesture.
    // Driven from a node outside the surface on purpose: a pointerdown on the
    // sheet would arm the drag tracker and leave a pointer captured behind this
    // test. Read through `getAttribute`, never a property: the false side of
    // this pair is an absent attribute, and an absent attribute has no property.
    key(slot(harness, "outside"), { key: "Tab" });
    grabber.focus();
    expect(grabber.getAttribute("data-focus-source")).toBe("keyboard");
    expect(grabber.getAttribute("data-focus-visible")).toBe("");

    grabber.blur();
    pointer(slot(harness, "outside"), "pointerdown", 0, {});
    grabber.focus();
    expect(grabber.getAttribute("data-focus-source")).toBe("pointer");
    expect(grabber.getAttribute("data-focus-visible")).toBe(null);
  });
});

describe("drawer — the gesture", () => {
  it("captures the pointer at the threshold and publishes the offset, then hands it to the settle", async () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const content = harness.part("content");
    const capture = vi.spyOn(content, "setPointerCapture");

    // Not at the press: a capture there retargets the release to the content, and
    // the click of a tap on a link inside it lands on the content instead.
    pointer(content, "pointerdown", 0, { y: 100 });
    expect(capture).not.toHaveBeenCalled();

    // The move that crosses the threshold only *starts* the gesture — it reports a
    // drag start and returns, so the first offset a sheet ever sees is the second
    // move's. Asserting on one move would be asserting on the threshold.
    pointer(content, "pointermove", 16, { y: 120 });
    expect(capture).toHaveBeenCalledWith(1);
    expect(harness.api().dragging).toBe(true);

    pointer(content, "pointermove", 32, { y: 140 });
    expect(content.style.getPropertyValue("--sui-drag-offset")).toBe("40px");

    pointer(content, "pointerup", 300, { y: 140 });
    expect(harness.api().dragging).toBe(false);

    // The offset is **not** cleared at the release: the settle owns it from here,
    // animating it back to zero from wherever the finger and the new detent left
    // it, and `data-settling` is what tells the sheet to stop transitioning the
    // same axis while WAAPI drives it.
    expect(content.hasAttribute("data-settling")).toBe(true);
    expect(content.style.getPropertyValue("--sui-drag-offset")).not.toBe("");

    await Promise.allSettled(content.getAnimations().map((animation) => animation.finished));
    // One more turn for the `.then` the machine attached to that promise.
    await Promise.resolve();

    // Cleared on the way out: a stale offset would leave the sheet parked beside
    // the detent it says it is at.
    expect(content.style.getPropertyValue("--sui-drag-offset")).toBe("");
    expect(content.hasAttribute("data-settling")).toBe(false);
  });

  it("publishes progress on the content while the finger owns it", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const content = harness.part("content");

    dragBlock(content, 100, 150, 300);
    // Back to 1 at rest, which is what the scrim and the receding page read.
    expect(content.style.getPropertyValue("--sui-drawer-progress")).toBe("1");
  });

  it("hands the scrim the same progress, and marks it dragging", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const content = harness.part("content");
    const backdrop = harness.part("backdrop");

    // The scrim is a **sibling** of the positioner the surface sits in — the
    // adapter's own composition test renders exactly that shape — so nothing
    // published on the content can reach it by inheritance. While the property
    // was written on two elements and the scrim was neither, the veil stayed at
    // full strength as the sheet was dragged out from under it: a defect no unit
    // case can see, because the whole of it is which element the value lands on.
    pointer(content, "pointerdown", 0, { y: 100 });
    pointer(content, "pointermove", 16, { y: 120 });
    pointer(content, "pointermove", 32, { y: 140 });

    const progress = backdrop.style.getPropertyValue("--sui-drawer-progress");
    expect(Number.parseFloat(progress)).toBeCloseTo(0.8, 2);
    // Same number on both, which is the point: `motion.md:209` says the two
    // surfaces are only sold by moving on one value.
    expect(progress).toBe(content.style.getPropertyValue("--sui-drawer-progress"));
    // And the marker that lets the sheet silence the scrim's transition, without
    // which the veil trails the surface by the dialog's fade.
    expect(backdrop.hasAttribute("data-dragging")).toBe(true);

    pointer(content, "pointerup", 300, { y: 140 });
    expect(backdrop.style.getPropertyValue("--sui-drawer-progress")).toBe("1");
    expect(backdrop.hasAttribute("data-dragging")).toBe(false);

    // The cleanup is the half that breaks: a scrim left holding a fraction is a
    // dialog whose backdrop never comes back to full on its next open.
    harness.setProps({ open: false });
    expect(backdrop.style.getPropertyValue("--sui-drawer-progress")).toBe("");
  });

  it("does not move `aria-valuenow` under the finger, and moves it once at the commit", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const content = harness.part("content");
    const grabber = harness.part("grabber");

    expect(grabber.getAttribute("aria-valuenow")).toBe("100");

    pointer(content, "pointerdown", 0, { y: 100 });
    pointer(content, "pointermove", 16, { y: 160 });
    // A value read at 60 Hz drowns a screen reader; the measurement is a ref, not
    // context, and this is the observable half of that decision.
    expect(harness.part("grabber").getAttribute("aria-valuenow")).toBe("100");

    pointer(content, "pointerup", 300, { y: 160 });
    expect(harness.part("grabber").getAttribute("aria-valuenow")).toBe("50");
  });

  it("swallows the click a drag leaves behind", () => {
    const harness = render();
    const content = harness.part("content");
    const clicked = vi.fn();
    content.addEventListener("click", clicked);

    dragBlock(content, 100, 150, 300);
    content.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(clicked).not.toHaveBeenCalled();
  });
});

describe("drawer — the scroller arbitration", () => {
  /**
   * The most important behaviour in the component, and the first defect of every
   * drawer on the web: a list inside a sheet has to eat the drag that would scroll
   * it, and hand it over only once it is parked at the edge the gesture pulls from.
   */
  it("leaves the gesture to a scroller that still has room, and takes it once parked", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 }, { scroller: true });
    const scroller = slot(harness, "scroller");
    const deep = slot(harness, "deep");

    scroller.scrollTop = 120;
    dragBlock(deep, 100, 160, 300);
    // The sheet never moved: the list had somewhere to go.
    expect(harness.api().detent).toBe(1);
    expect(harness.api().dragging).toBe(false);

    scroller.scrollTop = 0;
    dragBlock(deep, 100, 160, 300);
    // Parked at its top, the list gives the gesture up and the sheet answers.
    expect(harness.api().detent).toBe(0.5);
  });

  it("still answers a gesture that starts on the surface beside the list", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 }, { scroller: true });
    slot(harness, "scroller").scrollTop = 120;

    dragBlock(slot(harness, "body"), 100, 160, 300);
    expect(harness.api().detent).toBe(0.5);
  });
});

describe("drawer — the release", () => {
  it("dismisses on a flick below the smallest detent and says why", () => {
    const onDismissRequest = vi.fn();
    const onDragEnd = vi.fn();
    const harness = render({ detents: [0.5], defaultDetent: 0.5, onDismissRequest, onDragEnd });

    // 80 px in 16 ms is 5 px/ms — a flick by any reading of the threshold.
    dragBlock(harness.part("content"), 100, 180, 16);

    expect(onDismissRequest).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ dismissed: true }));
  });

  it("never dismisses when `dismissible` is false, and falls back to the smallest", () => {
    const onDismissRequest = vi.fn();
    const harness = render({
      detents: [0.5, 1],
      defaultDetent: 0.5,
      dismissible: false,
      onDismissRequest,
    });

    // From the *smallest* rung, so the flick has nowhere below to fall but the
    // dismissal — the case a flick from the top rung would never reach.
    dragBlock(harness.part("content"), 100, 180, 16);

    expect(onDismissRequest).not.toHaveBeenCalled();
    expect(harness.api().detent).toBe(0.5);
  });

  it("reads a parked finger as stopped rather than as the flick it was", () => {
    const onDismissRequest = vi.fn();
    const harness = render({ detents: [0.5], defaultDetent: 0.5, onDismissRequest });
    const content = harness.part("content");

    pointer(content, "pointerdown", 0, { y: 100 });
    pointer(content, "pointermove", 8, { y: 140 });
    pointer(content, "pointermove", 16, { y: 180 });
    // Held still for 400 ms — no `pointermove` fires while a finger rests, so the
    // window alone would still describe the throw.
    pointer(content, "pointerup", 416, { y: 180 });

    expect(onDismissRequest).not.toHaveBeenCalled();
  });

  it("puts the sheet back where it was when the pointer is cancelled", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const content = harness.part("content");

    pointer(content, "pointerdown", 0, { y: 100 });
    pointer(content, "pointermove", 16, { y: 160 });
    content.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));

    expect(harness.api().detent).toBe(1);
    expect(content.style.getPropertyValue("--sui-drag-offset")).toBe("");
  });
});

describe("drawer — what the sheet is told", () => {
  it("calls itself full only at the top of a track that reaches the whole viewport", () => {
    const full = render({ detents: [0.5, 1], defaultDetent: 1 });
    expect(full.part("content").getAttribute("data-detent-position")).toBe("full");

    const partial = render({ detents: [0.5, 1], defaultDetent: 0.5 });
    expect(partial.part("content").getAttribute("data-detent-position")).toBe("partial");

    // A sheet whose largest detent is 0.6 is never edge to edge, so it never
    // drops the material — a fact no index could have supplied.
    const short = render({ detents: [0.3, 0.6], defaultDetent: 0.6 });
    expect(short.part("content").getAttribute("data-detent-position")).toBe("partial");
  });

  it("puts the geometry in the content's own style, on every part that needs an edge", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5 });
    const content = harness.part("content");

    expect(content.style.getPropertyValue("--sui-drawer-detent")).toBe("0.5");
    expect(content.style.getPropertyValue("--sui-drawer-detent-max")).toBe("1");
    for (const part of ["positioner", "backdrop", "content", "grabber"]) {
      expect(harness.part(part).getAttribute("data-edge")).toBe("bottom");
    }
  });

  it("renders no grabber on a single-detent sheet", () => {
    const harness = render({ detents: [1] });

    expect(harness.api().hasTrack).toBe(false);
    expect(slot(harness, "grabber").hasAttribute("role")).toBe(false);
  });
});

describe("drawer — the receding page behind", () => {
  it("marks the page and publishes progress on it, and takes both back on close", () => {
    // Outside the harness markup on purpose: `trackStack` resolves the element
    // during `start()`, so a getter closing over the harness would be called
    // before the harness exists — and a throw in there leaves the whole mount
    // unregistered, which is a stale `#drawer:k1:content` every later test then
    // resolves instead of its own. That is how this file first went red.
    const page = document.createElement("main");
    document.body.append(page);
    extra.push(() => page.remove());

    const harness = render({ detents: [0.5, 1], stack: true, stackElement: () => page });

    expect(page.hasAttribute("data-sui-stacked")).toBe(true);
    expect(page.style.getPropertyValue("--sui-drawer-progress")).toBe("1");

    harness.setProps({ open: false });

    // The cleanup is the half that breaks — a page left shrunk after a close is
    // the defect, and it is invisible to anything that only asserts the install.
    expect(page.hasAttribute("data-sui-stacked")).toBe(false);
    expect(page.style.getPropertyValue("--sui-drawer-progress")).toBe("");
  });
});

describe("drawer — the gamepad", () => {
  function withPad(props: DrawerMachineProps = {}): {
    harness: Harness;
    bus: IntentBus;
    seen: string[];
  } {
    const bus = createIntentBus();
    const seen: string[] = [];
    // A scope underneath the drawer's, standing in for the dialog it decorates.
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5, intents: bus, ...props });
    harness.part("grabber").focus();
    return { harness, bus, seen };
  }

  const pad = (bus: IntentBus, intent: Parameters<IntentBus["dispatch"]>[0]["intent"]) =>
    bus.dispatch({ intent, source: "gamepad" });

  it("takes hold on A and says so on the grabber", () => {
    const { harness, bus } = withPad();

    expect(pad(bus, "select").consumed).toBe(true);
    expect(harness.api().engaged).toBe(true);
    expect(harness.part("grabber").hasAttribute("data-engaged")).toBe(true);
  });

  it("walks the track with the d-pad once it has hold", () => {
    const { harness, bus } = withPad();
    pad(bus, "select");

    pad(bus, "moveUp");
    expect(harness.api().detent).toBe(1);
  });

  it("restores the detent it took hold at on B, and does not close", () => {
    const { harness, bus, seen } = withPad();
    pad(bus, "select");
    pad(bus, "moveUp");
    expect(harness.api().detent).toBe(1);

    expect(pad(bus, "back").consumed).toBe(true);
    expect(harness.api().detent).toBe(0.5);
    expect(harness.api().engaged).toBe(false);
    // Consumed by the grip, so nothing underneath — the dialog — ever saw it.
    expect(seen).not.toContain("back");

    // The second B is the one that reaches the surface and closes it.
    pad(bus, "back");
    expect(seen).toContain("back");
  });

  it("claims nothing while the grabber does not have the focus", () => {
    const { harness, bus } = withPad();
    harness.part("grabber").blur();

    expect(pad(bus, "select").consumed).toBe(false);
    expect(harness.api().engaged).toBe(false);
  });
});

describe("drawer — the four edges under a real pointer", () => {
  /**
   * The seam, and the only place it can be read.
   *
   * `drag-axis` reports a signed travel along an axis, already mirrored for RTL;
   * the machine reads a positive number as "toward closed". Those two are only the
   * same statement on the edges a closing drag runs *with* the axis. `drawer.test.ts`
   * covers the sign for the intent grammar, where `growSign` applies it — the drag
   * path has no such step, and nothing else in the suite dispatches a real pointer
   * at an edge other than `bottom`.
   */
  it("closes a bottom sheet when the finger goes down", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1, edge: "bottom" });

    dragBlock(harness.part("content"), 100, 160, 300);
    expect(harness.api().detent).toBe(0.5);
  });

  it("closes a top sheet when the finger goes up", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1, edge: "top" });

    dragBlock(harness.part("content"), 160, 100, 300);
    expect(harness.api().detent).toBe(0.5);
  });

  it("closes an end drawer when the finger goes toward the inline end", () => {
    const harness = render(
      { detents: [0.5, 1], defaultDetent: 1, edge: "end" },
      { axis: "inline" },
    );

    dragInline(harness.part("content"), 100, 160, 300);
    expect(harness.api().detent).toBe(0.5);
  });

  it("closes a start drawer when the finger goes toward the inline start", () => {
    const harness = render(
      { detents: [0.5, 1], defaultDetent: 1, edge: "start" },
      { axis: "inline" },
    );

    dragInline(harness.part("content"), 160, 100, 300);
    expect(harness.api().detent).toBe(0.5);
  });

  it("mirrors a start drawer in RTL, where its own edge is on the right", () => {
    const harness = render(
      { detents: [0.5, 1], defaultDetent: 1, edge: "start", dir: "rtl" },
      { axis: "inline", dir: "rtl" },
    );

    // Toward the inline start in RTL is rightward, and `drag-axis` has already
    // mirrored it — so the same logical gesture reaches the machine as the LTR one.
    dragInline(harness.part("content"), 100, 160, 300);
    expect(harness.api().detent).toBe(0.5);
  });
});

describe("drawer — the minimal form", () => {
  it("is operable with a positioner and a content alone, at one detent", () => {
    const harness = render({ detents: [1] });

    expect(harness.api().detent).toBe(1);
    expect(harness.api().hasTrack).toBe(false);
    expect(harness.part("content").getAttribute("data-detent-position")).toBe("full");
  });

  it("freezes the track under `disabled` and leaves the surface alone", () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 0.5, disabled: true });

    key(harness.part("grabber"), { key: "ArrowUp" });
    expect(harness.api().detent).toBe(0.5);

    dragBlock(harness.part("content"), 100, 160, 300);
    expect(harness.api().detent).toBe(0.5);
    expect(harness.part("grabber").hasAttribute("data-disabled")).toBe(true);
  });
});

/**
 * A real mouse, because the defect lives in the engine's click dispatch: a click
 * goes to the common ancestor of where the press went down and where it came up,
 * and a capture taken at the press sent the release to the content — so a link
 * inside an open drawer never activated (standardoc-web, 390 px).
 */
describe("drawer — a link inside the content, under a real mouse", () => {
  function withLink(harness: Harness): { link: HTMLAnchorElement; clicks: EventTarget[] } {
    const link = document.createElement("a");
    link.href = "#drawer-link";
    link.textContent = "Link";
    link.style.cssText = "display: block; block-size: 80px";
    harness.part("content").prepend(link);
    const clicks: EventTarget[] = [];
    link.addEventListener("click", (event) => {
      if (event.target !== null) clicks.push(event.target);
      event.preventDefault();
    });
    return { link, clicks };
  }

  it("activates the link on a click", async () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const { link, clicks } = withLink(harness);
    const box = link.getBoundingClientRect();
    const x = box.left + 20;
    const y = box.top + box.height / 2;

    await commands.mouse([
      { type: "down", x, y },
      { type: "up", x, y },
    ]);

    expect(clicks).toEqual([link]);
    expect(harness.api().detent).toBe(1);
  });

  it("drives the sheet from a drag that starts on the link, and swallows its click", async () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1 });
    const { link, clicks } = withLink(harness);
    const content = harness.part("content");
    const box = link.getBoundingClientRect();
    const x = box.left + 20;
    const y = box.top + 10;
    let offset = "";
    let dragged = false;
    const observer = new MutationObserver(() => {
      if (harness.api().dragging) dragged = true;
      const value = content.style.getPropertyValue("--sui-drag-offset");
      if (value !== "") offset = value;
    });
    observer.observe(content, { attributes: true, attributeFilter: ["style", "data-dragging"] });
    extra.push(() => observer.disconnect());

    await commands.mouse([
      { type: "down", x, y },
      { type: "move", x, y: y + 20 },
      { type: "move", x, y: y + 40 },
      { type: "move", x, y: y + 60 },
      { type: "up", x, y: y + 60 },
    ]);

    expect(dragged).toBe(true);
    expect(offset).not.toBe("");
    expect(clicks).toEqual([]);
  });
});

describe("drawer — a grabber-only drag under a real mouse", () => {
  it("starts when the move that crosses the threshold lands outside the 24 px grabber", async () => {
    const harness = render({ detents: [0.5, 1], defaultDetent: 1, dragFrom: "grabber" });
    const grabber = harness.part("grabber");
    grabber.style.cssText = "block-size: 24px";
    const content = harness.part("content");
    const box = grabber.getBoundingClientRect();
    const x = box.left + 20;
    const y = box.top + box.height / 2;
    // Read while the finger owns the sheet: after the release the settle rewrites
    // the offset against whichever detent it lands on.
    const offsets: number[] = [];
    const observer = new MutationObserver(() => {
      const value = content.style.getPropertyValue("--sui-drag-offset");
      if (value !== "" && harness.api().dragging) offsets.push(Number.parseFloat(value));
    });
    observer.observe(content, { attributes: true, attributeFilter: ["style"] });
    extra.push(() => observer.disconnect());

    await commands.mouse([
      { type: "down", x, y },
      { type: "move", x, y: y + 40 },
      { type: "move", x, y: y + 60 },
      { type: "up", x, y: y + 60 },
    ]);

    expect(Math.max(...offsets)).toBeCloseTo(60, -1);
  });
});
