/**
 * The popover against a real engine, driven with no framework at all.
 *
 * Everything here needs a page and could not be faked: a box to measure a
 * placement against, the layer stack, `inert`, the two frames the focus handling
 * waits for, and the intent bus with a scope underneath it. The machine's own
 * arithmetic is proved without a document in `popover.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { createIntentBus, type IntentBus } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./popover.connect";
import { machine } from "./popover.machine";
import type { PopoverApi, PopoverMachineProps, PopoverSchema } from "./popover.types";

type Api = PopoverApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

interface SceneOptions {
  /** Left out to prove the name falls back to `aria-label` until one appears. */
  readonly title?: boolean;
  /** Left out to prove focus lands on the surface when nothing inside can take it. */
  readonly tabbables?: boolean;
  readonly arrow?: boolean;
  /** Left out to build the shape `composed.tsx` calls legal: no control opens it. */
  readonly trigger?: boolean;
  readonly id?: string;
}

// The arrow is sized inline because the effect *measures* it: the sheet is the
// single source of truth for that size in an app, and here the fixture is.
const ARROW_LENGTH = 46;
const ARROW_DEPTH = 10.5;

function markup(options: SceneOptions): string {
  const title = options.title === false ? "" : `<h2 data-slot="title">Share</h2>`;
  const tabbables =
    options.tabbables === false
      ? ""
      : `<input data-slot="field" /><button data-slot="close">Done</button>`;
  const arrow =
    options.arrow === false
      ? ""
      : `<div data-slot="arrow" style="width:${ARROW_LENGTH}px;height:${ARROW_DEPTH}px"><div data-slot="arrow-tip"></div></div>`;
  const trigger =
    options.trigger === false
      ? ""
      : `<button data-slot="trigger" style="position:absolute;left:200px;top:200px;width:80px;height:24px">Share</button>`;
  return `
    ${trigger}
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="positioner" style="width:160px">
      <div data-slot="content" style="width:160px;height:80px">
        ${title}
        <p data-slot="description">Anyone with the link.</p>
        ${tabbables}
      </div>
      ${arrow}
    </div>
    <div data-slot="backdrop"></div>`;
}

function render(props: PopoverMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<PopoverSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: options.id ?? "p1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("trigger", api.getTriggerProps());
      put("backdrop", api.getBackdropProps());
      put("positioner", api.getPositionerProps());
      put("content", api.getContentProps());
      put("arrow", api.getArrowProps());
      put("arrow-tip", api.getArrowTipProps());
      put("title", api.getTitleProps());
      put("description", api.getDescriptionProps());
      put("close", api.getCloseTriggerProps());
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

function frames(count = 3): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function open(harness: Harness): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  trigger.click();
  await frames();
}

/**
 * Down *and* up, because that is what an outside interaction is: the decision is
 * taken on pointerdown and confirmed on pointerup, so a pointer that goes down
 * inside and comes up outside is a drag and dismisses nothing.
 */
function pointerOn(node: HTMLElement): void {
  for (const type of ["pointerdown", "pointerup"]) {
    node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }));
  }
}

const extra: VoidFunction[] = [];

afterEach(() => {
  unmountAll();
  for (const dispose of extra.splice(0, extra.length)) dispose();
});

describe("popover — where it lands", () => {
  it("moves with a translate, never with top or left", async () => {
    const harness = render();
    await open(harness);
    const positioner = slot(harness, "positioner");

    // A reposition must never cost a layout pass, so the offset is a transform
    // and the two inset properties stay pinned at zero.
    expect(positioner.style.transform).toMatch(/^translate3d\(/);
    expect(positioner.style.top).toBe("0px");
    expect(positioner.style.left).toBe("0px");
    expect(positioner.style.position).toBe("fixed");
  });

  it("publishes the side it landed on, on the floating node and in the markup alike", async () => {
    const harness = render({ placement: "bottom-start" });
    await open(harness);

    // Written by the effect, straight onto the node...
    expect(slot(harness, "positioner").dataset["side"]).toBe("bottom");
    expect(slot(harness, "positioner").dataset["align"]).toBe("start");
    // ...and reported back through `POSITION.SYNC`, which is what the content and
    // the arrow render from. The two have to agree or the arrow points the wrong
    // way on a surface that flipped.
    expect(slot(harness, "content").dataset["side"]).toBe("bottom");
    expect(slot(harness, "arrow").dataset["side"]).toBe("bottom");
    expect(harness.api().placement).toBe("bottom-start");
  });

  it("places the arrow and keeps it off the corner", async () => {
    const harness = render({ placement: "bottom", arrowPadding: 20 });
    await open(harness);
    const arrow = slot(harness, "arrow");

    const x = Number.parseFloat(arrow.style.getPropertyValue("--sui-arrow-x"));
    expect(Number.isNaN(x)).toBe(false);
    // The surface is 160 wide and the arrow's box 46, so the clamp window is
    // [20, 94]. Anything outside it would put the spur on the rounded corner.
    expect(x).toBeGreaterThanOrEqual(20);
    expect(x).toBeLessThanOrEqual(160 - ARROW_LENGTH - 20);
  });

  it("adds the arrow's depth to the gap, because the positioner never does", async () => {
    // `arrowSize` only ever clamps the cross axis — measured in the positioner —
    // so a popover that forgot this addition would drive its tip 2.5px into its
    // own anchor and nothing downstream would catch it.
    const withArrow = render({ placement: "bottom", gap: 8 });
    await open(withArrow);
    const withArrowY = readTranslateY(slot(withArrow, "positioner"));

    const withoutArrow = render({ placement: "bottom", gap: 8 }, { arrow: false, id: "p2" });
    await open(withoutArrow);
    const withoutArrowY = readTranslateY(slot(withoutArrow, "positioner"));

    // Between 10 and 11 rather than exactly 10.5: `computePosition` rounds its
    // result to whole pixels, so a fractional depth lands on either side of
    // itself depending on where the anchor's own edge fell.
    const added = withArrowY - withoutArrowY;
    expect(added).toBeGreaterThanOrEqual(Math.floor(ARROW_DEPTH));
    expect(added).toBeLessThanOrEqual(Math.ceil(ARROW_DEPTH));
  });

  it("floors the surface at the anchor's width, and never clamps it down to one", async () => {
    // `matchWidth` is a floor: this 160px surface over an 80px trigger keeps its
    // own width and nothing is written onto it. The anchor's width is published
    // all the same, which is what the sheet's `min-inline-size` reads.
    const harness = render({ matchWidth: true });
    await open(harness);
    const positioner = slot(harness, "positioner");

    expect(positioner.style.width).toBe("160px");
    expect(positioner.style.getPropertyValue("--sui-anchor-width")).toBe("80px");
  });

  it("anchors to a rect with no anchor element at all", async () => {
    // The virtual-anchor path: a caret, a text range, a point on a canvas.
    const harness = render({
      getAnchorRect: () => ({ x: 40, y: 60, width: 0, height: 0 }),
      placement: "bottom",
    });
    await open(harness);

    const positioner = slot(harness, "positioner");
    expect(positioner.style.transform).toMatch(/^translate3d\(/);
    expect(positioner.style.getPropertyValue("--sui-anchor-width")).toBe("0px");
  });

  it("publishes the room it has, which is what lets the surface cap itself in CSS", async () => {
    const harness = render();
    await open(harness);
    const positioner = slot(harness, "positioner");

    expect(positioner.style.getPropertyValue("--sui-available-height")).toMatch(/px$/);
    expect(positioner.style.getPropertyValue("--sui-available-width")).toMatch(/px$/);
    expect(positioner.style.getPropertyValue("--sui-transform-origin")).not.toBe("");
  });

  it("wipes the anchored styles when it becomes a sheet", async () => {
    const harness = render();
    await open(harness);
    const positioner = slot(harness, "positioner");
    expect(positioner.style.transform).not.toBe("");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    await frames();

    // Cleared on the way *in* to the sheet, never on the way out of the anchored
    // pass: a disposer runs while `open` is going false with the node still
    // mounted, and the surface would snap to 0,0 mid-exit.
    expect(positioner.style.transform).toBe("");
    expect(positioner.style.position).toBe("");
    expect(positioner.style.getPropertyValue("--sui-transform-origin")).toBe("");
    expect(slot(harness, "content").dataset["presentation"]).toBe("sheet");
  });
});

function readTranslateY(node: HTMLElement): number {
  const match = /translate3d\([^,]+,\s*([-\d.]+)px/.exec(node.style.transform);
  if (match?.[1] === undefined) throw new Error(`no translate on ${node.dataset["slot"]}`);
  return Number.parseFloat(match[1]);
}

describe("popover — the focus", () => {
  it("moves into the surface on open and back to the trigger on close", async () => {
    const harness = render();
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "field"));

    harness.api().setOpen(false);
    await frames();

    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });

  it("lands on the surface itself when nothing inside can take it", async () => {
    const harness = render({}, { tabbables: false });
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "content"));
  });

  it("leaves the focus alone when the user has already moved on", async () => {
    const harness = render();
    await open(harness);

    const elsewhere = slot(harness, "outside");
    elsewhere.focus();
    harness.api().setOpen(false);
    await frames();

    // Closing a non-modal surface while someone is typing somewhere else must
    // not yank the caret back.
    expect(document.activeElement).toBe(elsewhere);
  });

  it("is entered with Tab from the trigger when it did not take the focus itself", async () => {
    const harness = render({ autoFocus: false });
    const trigger = slot(harness, "trigger");
    trigger.focus();
    trigger.click();
    await frames();

    // `proxy-tab-focus` handles leaving the surface and never entering it, so
    // without this the next Tab jumps straight past a surface just opened.
    expect(document.activeElement).toBe(trigger);

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    trigger.dispatchEvent(event);
    await frames();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(slot(harness, "field"));
  });
});

describe("popover — the dismissals", () => {
  it("closes on Escape, and holds when the lock says so", async () => {
    const harness = render();
    await open(harness);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();
    expect(harness.api().open).toBe(false);

    const locked = render({ closeOnEscape: false }, { id: "p3" });
    await open(locked);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();
    expect(locked.api().open).toBe(true);
  });

  it("separates a pointer leaving from a focus leaving, which is the pair it exists for", async () => {
    const onDismiss = vi.fn();
    // "Close when the user clicks away, but survive the caret moving on" — the
    // combination a popover hung off a text field wants, and the one that was
    // inexpressible while a focus departure was reported as a pointer one.
    const harness = render({ closeOnFocusOutside: false, onDismiss });
    await open(harness);

    slot(harness, "outside").focus();
    await frames();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(harness.api().open).toBe(true);

    pointerOn(slot(harness, "outside"));
    await frames();

    expect(onDismiss).toHaveBeenCalledWith({ reason: "outside-pointer" });
  });

  it("reports a focus leaving under its own reason when that lock is open", async () => {
    const onDismiss = vi.fn();
    const harness = render({ onDismiss });
    await open(harness);

    slot(harness, "outside").focus();
    await frames();

    expect(onDismiss).toHaveBeenCalledWith({ reason: "focus-outside" });
  });

  it("does not close then reopen when the trigger is clicked", async () => {
    const harness = render();
    await open(harness);

    const trigger = slot(harness, "trigger");
    pointerOn(trigger);
    trigger.click();
    await frames();

    // Without the trigger in the layer's exclude list this dismisses on
    // pointerdown and reopens on the click, and the popover never closes.
    expect(harness.api().open).toBe(false);
  });

  it("answers Escape only at the top of the stack", async () => {
    const harness = render();
    await open(harness);

    const above = document.createElement("div");
    document.body.append(above);
    const onDismiss = vi.fn();
    extra.push(trackDismissableLayer(above, { id: "layer:above", type: "menu", onDismiss }), () =>
      above.remove(),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();

    expect(onDismiss).toHaveBeenCalledWith("escape");
    expect(harness.api().open).toBe(true);
  });
});

describe("popover — the gamepad", () => {
  function withPad(props: PopoverMachineProps = {}): {
    harness: Harness;
    bus: IntentBus;
    seen: string[];
  } {
    const bus = createIntentBus();
    const seen: string[] = [];
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    return { harness: render({ ...props, intents: bus }), bus, seen };
  }

  it("closes the top layer on B", async () => {
    const { harness, bus } = withPad();
    const onDismiss = vi.fn();
    harness.setProps({ onDismiss });
    await open(harness);

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    expect(harness.api().open).toBe(false);
  });

  it("holds on B when Escape is locked — the two share one lock", async () => {
    const { harness, bus } = withPad({ closeOnEscape: false });
    await open(harness);

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().open).toBe(true);
  });

  /**
   * The divergence from the dialog, stated as a test rather than as a comment.
   * A trapped scope answers `consumed` for everything it declines, and the
   * spatial engine sits at the bottom of the stack — so a trapped surface makes
   * its own interior unreachable to a d-pad. The popover confines the pad with
   * `data-snav-trap` on the content and lets the directions travel.
   */
  it("never swallows a direction", async () => {
    const { harness, bus, seen } = withPad();
    await open(harness);

    const result = bus.dispatch({ intent: "moveDown", source: "gamepad" });

    expect(result.consumed).toBe(false);
    expect(seen).toEqual(["moveDown"]);
    expect(slot(harness, "content").dataset["snavTrap"]).toBe("");
    expect(harness.api().open).toBe(true);
  });

  it("pops its scope when it closes", async () => {
    const { harness, bus } = withPad();
    await open(harness);
    const openDepth = bus.depth();

    harness.api().setOpen(false);
    await frames();

    expect(bus.depth()).toBe(openDepth - 1);
  });
});

describe("popover — inside another layer", () => {
  it("does not dismiss its parent when something inside it is clicked", async () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const onParentDismiss = vi.fn();
    extra.push(
      trackDismissableLayer(parent, {
        id: "dialog:outer:content",
        type: "dialog",
        modal: true,
        onDismiss: onParentDismiss,
      }),
      () => parent.remove(),
    );

    // Declared parenthood, because once both are portalled the DOM cannot tell.
    const harness = render({ parentId: "dialog:outer:content" });
    await open(harness);

    pointerOn(slot(harness, "field"));
    await frames();

    expect(onParentDismiss).not.toHaveBeenCalled();
    expect(harness.api().open).toBe(true);
    expect(slot(harness, "content").dataset["nested"]).toBe("");
  });
});

describe("popover — the direction carried across the portal", () => {
  function inRtlPage(): void {
    const root = document.documentElement;
    const before = root.getAttribute("dir");
    root.setAttribute("dir", "rtl");
    extra.push(() => {
      if (before === null) root.removeAttribute("dir");
      else root.setAttribute("dir", before);
    });
  }

  /** The page stays LTR, so only the anchor can be the source of the `rtl`. */
  it("reads the anchor before the page", async () => {
    const harness = render({}, { id: "rtl-order" });
    slot(harness, "trigger").setAttribute("dir", "rtl");
    await open(harness);

    expect(slot(harness, "content").getAttribute("dir")).toBe("rtl");
  });

  /**
   * `composed.tsx` calls a popover with no trigger and no anchor part a real
   * shape — a caret menu, a surface driven from a store — and `getAnchorRect`
   * positions it without an element. The anchor is the only node the direction
   * was read from, and resolving against a missing one answers `"ltr"` flat.
   */
  it("falls back to the page when nothing anchors it", async () => {
    inRtlPage();
    const harness = render(
      { getAnchorRect: () => ({ x: 200, y: 200, width: 80, height: 24 }) },
      { id: "rtl-store", trigger: false },
    );
    // This harness does not portal: without an LTR parent in the way, the
    // surface would inherit `rtl` and a fallback reading it would pass too.
    slot(harness, "positioner").setAttribute("dir", "ltr");
    harness.api().setOpen(true);
    await frames();

    expect(slot(harness, "content").getAttribute("dir")).toBe("rtl");
  });
});
