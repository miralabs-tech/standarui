/**
 * The picker against a real engine, with no framework in the room.
 *
 * Most of this machine is a value and an openness, and that half is proved without
 * a document in `date-picker.test.ts`. Four things need a page and are what is
 * here: where the focus lands when the surface opens and where it goes back to,
 * the surface positioned against a real anchor, the layer stack answering Escape,
 * and the d-pad arriving through a real intent bus — including the intents this
 * picker deliberately lets fall through to the grid underneath it.
 *
 * The grid in the fixture is a bare `role="gridcell"` with a roving tab stop and
 * no calendar behind it, on purpose: `focusInitialCell` asks ARIA rather than the
 * calendar's own vocabulary, and a fixture that mounted a real calendar would hide
 * whether that is true.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { createIntentBus, getTabbables, type IntentBus } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./date-picker.connect";
import { machine } from "./date-picker.machine";
import type { DatePickerApi, DatePickerMachineProps, DatePickerSchema } from "./date-picker.types";

type Api = DatePickerApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

interface SceneOptions {
  /** Left out to prove the surface names itself from the trigger until one exists. */
  readonly title?: boolean;
  /** Left out to prove the focus falls back when the surface holds no grid. */
  readonly grid?: boolean;
  readonly id?: string;
  /** Absent by default: a `close-trigger` is a composition point, not a fixture. */
  readonly close?: "named" | "nameless";
  /** Strips the trigger's caption, which is the only thing naming it here. */
  readonly namelessTrigger?: boolean;
}

function markup(options: SceneOptions): string {
  const title = options.title === true ? `<h2 data-slot="title">Pick a date</h2>` : "";
  const caption = options.namelessTrigger === true ? "" : "Open";
  const close =
    options.close === undefined
      ? ""
      : `<button data-slot="close"${options.close === "named" ? ` aria-label="Close"` : ""}></button>`;
  const grid =
    options.grid === false
      ? `<button data-slot="inside">Today</button>`
      : `<table role="grid">
           <tbody>
             <tr>
               <td role="gridcell" tabindex="-1" data-slot="cell-8">8</td>
               <td role="gridcell" tabindex="0" data-slot="cell-9">9</td>
             </tr>
           </tbody>
         </table>`;
  return `
    <div data-slot="root">
      <span data-slot="label">Due date</span>
      <button data-slot="trigger" style="position:absolute;left:200px;top:200px;width:80px;height:24px">${caption}</button>
      <button data-slot="clear">Clear</button>
    </div>
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="backdrop"></div>
    <div data-slot="positioner">
      <div data-slot="content" style="width:240px;height:200px">
        ${title}
        ${grid}
        ${close}
        <button data-slot="cancel">Cancel</button>
      </div>
    </div>`;
}

function render(props: DatePickerMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<DatePickerSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: options.id ?? "p1",
    props: { locale: "en-US", ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("root", api.getRootProps());
      put("label", api.getLabelProps());
      put("trigger", api.getTriggerProps());
      put("clear", api.getClearTriggerProps());
      put("backdrop", api.getBackdropProps());
      put("positioner", api.getPositionerProps());
      put("content", api.getContentProps());
      put("title", api.getTitleProps());
      put("cancel", api.getCancelTriggerProps());
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

/** The window's focus first, as `realKey` takes it in the React harness (R81). */
async function realKey(keys: string): Promise<void> {
  if (!document.hasFocus()) window.focus();
  await userEvent.keyboard(keys);
}

async function open(harness: Harness): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  trigger.click();
  await frames();
}

const extra: VoidFunction[] = [];

/**
 * The name warnings are dev-only `console.warn` calls, and the engine writes one of
 * its own when an event lands on a stopped service — so they are collected and read
 * by fragment rather than counted off a bare spy.
 */
function captureWarnings(): readonly string[] {
  const messages: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    messages.push(String(args[0]));
  });
  extra.push(() => {
    spy.mockRestore();
  });
  return messages;
}

function matching(messages: readonly string[], fragment: string): readonly string[] {
  return messages.filter((message) => message.includes(fragment));
}

afterEach(() => {
  unmountAll();
  for (const dispose of extra.splice(0, extra.length)) dispose();
});

describe("date-picker — the focus", () => {
  /**
   * The APG's Date Picker Dialog opens onto the day, and the day is the grid's one
   * roving tab stop. The entry runs after `focusContent`, which is the ordering
   * that makes this land on the cell rather than on the surface.
   */
  it("opens onto the grid's roving cell and hands the trigger back on close", async () => {
    const harness = render();
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "cell-9"));

    harness.api().setOpen(false);
    await frames();

    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });

  it("falls back to the first tabbable when the surface holds no grid", async () => {
    const harness = render({}, { grid: false });
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "inside"));
  });

  it("leaves the focus where a person put it", async () => {
    const harness = render();
    await open(harness);
    slot(harness, "outside").focus();
    await frames();

    harness.api().setOpen(false);
    await frames();

    // The disposer is the restore, and it only fires while the focus is still
    // inside: whoever clicked away has already said where they want to be.
    expect(document.activeElement).toBe(slot(harness, "outside"));
  });

  /**
   * A density flip re-enters `open` — the position tracker has to leave, the scroll
   * lock has to arrive — and until 2026-09-06 it replayed the two focus-moving
   * pieces with it: `focusContent`'s disposer handed the focus back to the trigger
   * on the way out, its install took it into the surface again, and the entry
   * `focusInitialCell` parked it on the day. Whatever a person was doing, a docked
   * mouse or a runtime `data-sui-density` moved them onto the grid.
   *
   * The cancel card stands in here for the segmented field, which is the real
   * victim and sits outside the surface entirely — inside is the harder case,
   * because it is the one the disposer also acts on.
   */
  it("leaves the focus where it is when the density flips under an open surface", async () => {
    const harness = render();
    await open(harness);
    slot(harness, "cancel").focus();
    await frames();

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    await frames();

    expect(harness.api().presentation).toBe("sheet");
    expect(document.activeElement).toBe(slot(harness, "cancel"));
  });
});

/**
 * Two parts this component cannot name for the consumer, and every sibling surface
 * already says so out loud: `select` for its trigger, `dialog`, `menu` and `popover`
 * for the button that closes them. This one said nothing at all until 2026-09-06.
 */
describe("date-picker — the names it cannot invent", () => {
  const NO_NAME = "a date picker has no accessible name";
  const NO_CLOSE_NAME = "a date picker close trigger has no accessible name";

  it("says so when nothing names the trigger, and holds its tongue when something does", () => {
    const messages = captureWarnings();

    render({}, { namelessTrigger: true });
    expect(matching(messages, NO_NAME)).toHaveLength(1);

    // `label` is one of the two ways in; a `field` above hands down the other.
    render({ label: "Due date" }, { namelessTrigger: true, id: "p7" });
    expect(matching(messages, NO_NAME)).toHaveLength(1);
  });

  it("says so for a close trigger left anonymous, once the surface is open", async () => {
    const messages = captureWarnings();
    const anonymous = render({}, { close: "nameless" });

    // The part is in the fixture's markup from the start, but the check belongs to
    // the open state — a surface nobody opened names nothing.
    expect(matching(messages, NO_CLOSE_NAME)).toHaveLength(0);

    await open(anonymous);
    expect(matching(messages, NO_CLOSE_NAME)).toHaveLength(1);

    await open(render({}, { close: "named", id: "p8" }));
    expect(matching(messages, NO_CLOSE_NAME)).toHaveLength(1);
  });
});

describe("date-picker — the surface", () => {
  it("moves with a translate and publishes where it landed", async () => {
    const harness = render({ placement: "bottom-start" });
    await open(harness);
    const positioner = slot(harness, "positioner");

    expect(positioner.style.transform).toMatch(/^translate3d\(/);
    expect(positioner.style.position).toBe("fixed");
    expect(slot(harness, "content").dataset.side).toBe("bottom");
    expect(slot(harness, "content").dataset.align).toBe("start");
  });

  /**
   * `matchWidth` is `false` here where the select's is `true`, and this is the
   * measurable half of that divergence: nothing is written onto the surface, so a
   * month keeps its seven columns whatever the field beside it measures.
   */
  it("never takes its width from the anchor", async () => {
    const harness = render();
    await open(harness);

    const positioner = slot(harness, "positioner");
    expect(positioner.style.width).toBe("");
    // The anchor's width is still published — a sheet that wants to read it can —
    // but nothing clamps the surface onto it.
    expect(positioner.style.getPropertyValue("--sui-anchor-width")).toBe("80px");
  });

  it("takes the anchored geometry back off a sheet", async () => {
    const harness = render();
    await open(harness);
    expect(slot(harness, "positioner").style.transform).toMatch(/^translate3d\(/);

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    await frames();

    // `PRESENTATION.SYNC` re-enters `open`, and the position effect's sheet branch
    // clears what the popup pass left on install rather than on teardown.
    expect(harness.api().presentation).toBe("sheet");
    expect(slot(harness, "positioner").style.transform).toBe("");
    expect(slot(harness, "positioner").style.position).toBe("");
  });

  it("moves its name onto a title the moment one is rendered", async () => {
    const bare = render();
    await open(bare);
    expect(slot(bare, "content").getAttribute("aria-labelledby")).toBe("date-picker:p1:trigger");

    const titled = render({}, { title: true, id: "p2" });
    await open(titled);
    expect(slot(titled, "content").getAttribute("aria-labelledby")).toBe("date-picker:p2:title");
  });

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
});

/**
 * Decision 61, the shape `color-picker` already pins: a surface opened and then
 * disabled stays open, and its close trigger is the one part `disabled` does not
 * reach. The trigger goes inert, so the close is the only button left that a Tab
 * user can land on and press — it has to take the focus and it has to close.
 */
describe("date-picker — disabled while open", () => {
  it("stays open and keeps its close trigger in the tab order", async () => {
    const harness = render({}, { close: "named" });
    await open(harness);
    harness.setProps({ disabled: true });

    expect(harness.api().open).toBe(true);
    expect(slot<HTMLButtonElement>(harness, "trigger").disabled).toBe(true);

    const close = slot<HTMLButtonElement>(harness, "close");
    expect(close.disabled).toBe(false);
    expect(close.hasAttribute("tabindex")).toBe(false);
    expect(getTabbables(slot(harness, "content"))).toContain(close);
  });

  it("closes from its close trigger on a click", async () => {
    const harness = render({}, { close: "named" });
    await open(harness);
    harness.setProps({ disabled: true });

    slot(harness, "close").click();
    await frames();
    expect(harness.api().open).toBe(false);
  });

  it("closes from its close trigger on a real Enter", async () => {
    const harness = render({}, { close: "named" });
    await open(harness);
    harness.setProps({ disabled: true });

    await realKey("{Tab}");
    expect(document.activeElement).toBe(slot(harness, "close"));
    await realKey("{Enter}");
    await frames();
    expect(harness.api().open).toBe(false);
  });

  it("still closes on a real Escape", async () => {
    const harness = render({}, { close: "named" });
    await open(harness);
    harness.setProps({ disabled: true });

    await realKey("{Escape}");
    await frames();
    expect(harness.api().open).toBe(false);
  });

  it("still closes on the pad's B", async () => {
    const bus = createIntentBus();
    const harness = render({ intents: bus }, { close: "named" });
    await open(harness);
    harness.setProps({ disabled: true });

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    expect(harness.api().open).toBe(false);
  });
});

describe("date-picker — the gamepad", () => {
  function withPad(
    props: DatePickerMachineProps = {},
    options: SceneOptions = {},
  ): {
    harness: Harness;
    bus: IntentBus;
    seen: string[];
  } {
    const bus = createIntentBus();
    const seen: string[] = [];
    // Pushed first, so it sits *under* the picker's own scope — which is exactly
    // where a calendar's scope sits, since an adapter starts a child's machine
    // before the parent's watchers run.
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    return { harness: render({ ...props, intents: bus }, options), bus, seen };
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
   * The whole of §7's "B ferme, LT/RT vers le calendrier": this scope is pushed on
   * top of the calendar's, so anything it claimed would be taken away from the
   * component that already answers it. It claims exactly one intent.
   */
  it("lets every other intent fall through to the grid underneath", async () => {
    const { harness, bus, seen } = withPad();
    await open(harness);

    for (const intent of ["moveLeft", "moveRight", "pageUp", "pageDown", "select"] as const) {
      expect(bus.dispatch({ intent, source: "gamepad" }).consumed).toBe(false);
    }

    expect(seen).toEqual(["moveLeft", "moveRight", "pageUp", "pageDown", "select"]);
    expect(harness.api().open).toBe(true);
  });

  it("answers B only at the top of the stack", async () => {
    const { harness, bus } = withPad();
    await open(harness);

    const above = document.createElement("div");
    document.body.append(above);
    extra.push(
      trackDismissableLayer(above, { id: "layer:above", type: "menu", onDismiss: () => undefined }),
      () => above.remove(),
    );

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().open).toBe(true);
  });

  it("pops its scope when it closes", async () => {
    const { harness, bus } = withPad();
    const before = bus.depth();
    await open(harness);
    expect(bus.depth()).toBe(before + 1);

    harness.api().setOpen(false);
    await frames();

    expect(bus.depth()).toBe(before);
  });
});
