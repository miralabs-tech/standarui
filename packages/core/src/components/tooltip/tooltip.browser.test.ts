/**
 * The tooltip against a real engine, driven with no framework at all.
 *
 * Everything here needs a page and could not be faked: the delay under a real
 * clock, the modality tracker that decides whether a focus warrants a surface,
 * the layer stack, the position, and — the one thing no other component in the
 * library has — two instances arguing over a slot that belongs to the document.
 * The machine's own arithmetic and the store's logic are proved without a
 * document in `tooltip.test.ts`.
 *
 * The delays are pushed down to tens of milliseconds rather than faked: fake
 * timers would also fake the `requestAnimationFrame` the position tracker
 * coalesces on, and the thing under test would stop being the thing that ships.
 */

import { createIntentBus, type IntentBus } from "@standarx/nav";
import { afterEach, describe, expect, it } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./tooltip.connect";
import { machine } from "./tooltip.machine";
import type { TooltipApi, TooltipMachineProps, TooltipSchema } from "./tooltip.types";

type Api = TooltipApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

const OPEN_DELAY = 40;
const WARM_DELAY = 10;

function markup(): string {
  return `
    <button data-slot="trigger" style="position:absolute;left:200px;top:200px;width:80px;height:24px">Rename</button>
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="positioner" style="width:120px">
      <div data-slot="content" style="width:120px;height:32px">Rename this file</div>
    </div>`;
}

/**
 * `warmDuration: 0` by default, and it is a test-isolation decision rather than a
 * behaviour one: the store is keyed on the document, so a cooldown left running
 * by one test is a shorter delay in the next. The one test that is about the
 * cooldown asks for it explicitly and waits it out.
 */
function render(props: TooltipMachineProps = {}, id = "t1") {
  return mountMachine<TooltipSchema, Api>({
    machine,
    connect,
    html: markup(),
    id,
    props: { openDelay: OPEN_DELAY, warmDelay: WARM_DELAY, warmDuration: 0, ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("trigger", api.getTriggerProps());
      put("positioner", api.getPositionerProps());
      put("content", api.getContentProps());
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function hover(node: HTMLElement, pointerType = "mouse"): void {
  node.dispatchEvent(new PointerEvent("pointerenter", { pointerType }));
}

function unhover(node: HTMLElement): void {
  node.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
}

/**
 * The modality is a document-wide store the machine only reads, so a test that
 * cares about it has to say which hands are on the page — and say it every time,
 * because the previous test's answer is still standing.
 */
function useKeyboard(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
}

function usePointer(): void {
  document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
}

const extra: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of extra.splice(0, extra.length)) dispose();
  unmountAll();
});

describe("tooltip in a page", () => {
  it("waits out the delay before it appears, and appears once it has", async () => {
    const harness = render();
    hover(slot(harness, "trigger"));

    expect(harness.service.state.get()).toBe("opening");
    expect(harness.api().open).toBe(false);

    await wait(OPEN_DELAY + 30);

    expect(harness.service.state.get()).toBe("open");
    expect(harness.api().open).toBe(true);
    expect(slot(harness, "content").getAttribute("data-state")).toBe("open");
  });

  it("forgets the whole thing when the pointer leaves mid-delay", async () => {
    const harness = render();
    const trigger = slot(harness, "trigger");

    hover(trigger);
    unhover(trigger);
    expect(harness.service.state.get()).toBe("closed");

    await wait(OPEN_DELAY + 30);
    expect(harness.api().open).toBe(false);
  });

  it("never opens on a touch pointer, where there is no hover to mean anything", async () => {
    const harness = render();
    hover(slot(harness, "trigger"), "touch");

    expect(harness.service.state.get()).toBe("closed");
    await wait(OPEN_DELAY + 30);
    expect(harness.api().open).toBe(false);
  });

  it("opens immediately on a focus that warrants a ring, and closes on the blur", async () => {
    const harness = render();
    useKeyboard();
    const trigger = slot(harness, "trigger");

    trigger.focus();
    await frames(2);

    // No delay: the user asked for this control, and a keyboard has no hover to
    // express the asking with.
    expect(harness.api().open).toBe(true);
    expect(trigger.getAttribute("aria-describedby")).toBe("tooltip:t1:content");

    slot(harness, "outside").focus();
    await frames(2);
    expect(harness.api().open).toBe(false);
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
  });

  it("stays shut on a focus the pointer caused, which is a click and not a request", async () => {
    const harness = render();
    usePointer();

    slot(harness, "trigger").focus();
    await frames(2);

    expect(harness.api().open).toBe(false);
  });

  it("closes on a press of its own trigger", async () => {
    const harness = render();
    const trigger = slot(harness, "trigger");
    hover(trigger);
    await wait(OPEN_DELAY + 30);
    expect(harness.api().open).toBe(true);

    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    await frames(2);

    expect(harness.api().open).toBe(false);
  });

  it("closes on Escape, and reports the reason it was given", async () => {
    const reasons: string[] = [];
    const harness = render({ onDismiss: (details) => reasons.push(details.reason) });
    hover(slot(harness, "trigger"));
    await wait(OPEN_DELAY + 30);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames(2);

    expect(harness.api().open).toBe(false);
    expect(reasons).toEqual(["escape"]);
  });

  it("closes when the page scrolls out from under it", async () => {
    const harness = render();
    hover(slot(harness, "trigger"));
    await wait(OPEN_DELAY + 30);
    expect(harness.api().open).toBe(true);

    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    await frames(2);

    expect(harness.api().open).toBe(false);
  });

  it("holds its ground when `closeOnScroll` is off", async () => {
    const harness = render({ closeOnScroll: false });
    hover(slot(harness, "trigger"));
    await wait(OPEN_DELAY + 30);

    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    await frames(2);

    expect(harness.api().open).toBe(true);
  });

  it("answers the gamepad back intent while it is the top layer", async () => {
    const bus: IntentBus = createIntentBus();
    const seen: string[] = [];
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    const harness = render({ intents: bus });
    hover(slot(harness, "trigger"));
    await wait(OPEN_DELAY + 30);

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    await frames(2);

    expect(harness.api().open).toBe(false);
    // And never a direction: a tooltip contains nothing to move through.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(seen).toContain("moveDown");
  });

  it("places itself against its trigger and publishes where it landed", async () => {
    const harness = render({ placement: "bottom-start", gap: 6 });
    hover(slot(harness, "trigger"));
    await wait(OPEN_DELAY + 30);
    await frames();

    const positioner = slot(harness, "positioner");
    const trigger = slot(harness, "trigger");
    const surface = positioner.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();

    expect(positioner.dataset["side"]).toBe("bottom");
    expect(positioner.dataset["align"]).toBe("start");
    // No arrow, so the whole gap is the air that was asked for — a tooltip sits
    // visibly closer to its control than a popover does.
    expect(surface.top - anchor.bottom).toBeCloseTo(6, 0);
    expect(harness.api().placement).toBe("bottom-start");
    expect(slot(harness, "content").getAttribute("data-side")).toBe("bottom");
  });

  it("renders no arrow, because the design has none", () => {
    const harness = render();

    expect(harness.host.querySelector('[data-part~="tooltip:arrow"]')).toBeNull();
    expect(Object.keys(harness.api())).not.toContain("getArrowProps");
  });
});

describe("two tooltips on one page", () => {
  it("shows one at a time — the second closes the first", async () => {
    const first = render({}, "t1");
    const second = render({}, "t2");

    hover(slot(first, "trigger"));
    await wait(OPEN_DELAY + 30);
    expect(first.api().open).toBe(true);

    hover(slot(second, "trigger"));
    await wait(OPEN_DELAY + 30);

    expect(second.api().open).toBe(true);
    expect(first.api().open).toBe(false);
  });

  it("opens the second on the short delay while the family is warm", async () => {
    const first = render({}, "t1");
    const second = render({}, "t2");

    hover(slot(first, "trigger"));
    await wait(OPEN_DELAY + 30);
    expect(first.api().open).toBe(true);

    // Still warm — one is up — so this must land inside the short delay and well
    // short of the long one. The window between them is what the assertion buys.
    hover(slot(second, "trigger"));
    await wait(WARM_DELAY + 15);

    expect(second.api().open).toBe(true);
  });

  it("stays warm through the cooldown after the last one closed", async () => {
    const first = render({ warmDuration: 200 }, "t1");
    const second = render({}, "t2");
    const trigger = slot(first, "trigger");

    hover(trigger);
    await wait(OPEN_DELAY + 30);
    unhover(trigger);
    await frames(2);
    expect(first.api().open).toBe(false);

    hover(slot(second, "trigger"));
    await wait(WARM_DELAY + 15);
    expect(second.api().open).toBe(true);

    // Leave the document cold for whatever runs next: the store outlives the
    // services, and a cooldown still ticking is a shorter delay in another test.
    unhover(slot(second, "trigger"));
    await wait(30);
  });
});
