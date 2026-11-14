/**
 * The toast against a real engine, with no framework in the room.
 *
 * Everything here needs a page: the focus that must *not* move, the hotkey, the
 * hand-off when a card leaves under the focus, the announcer's live regions, the
 * measured stack, the top layer. The store's arithmetic and the machine's guards
 * are settled without a document in `toast.test.ts`.
 *
 * The harness renders the cards itself and drives one `createPresence` per node —
 * which is exactly what an adapter does, and the only way an exit can be observed
 * at all. **The stylesheet is not decoration**: without a real transition an exit
 * lasts one frame, and asserting `data-state="closed"` on a card becomes a race
 * that WebKit loses every time. It also *reorders* the cards to `api.toasts` on
 * every paint, which is what keyed children give React for free: a harness that
 * appended would paint a pile the store never described, and prove the machine
 * against a DOM no adapter produces.
 */

import { createIntentBus, type IntentBus } from "@standarx/nav";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPresence, type Presence } from "../../presence/presence";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./toast.connect";
import { machine } from "./toast.machine";
import { createToaster } from "./toast.store";
import type { ToastApi, Toaster, ToastGroupMachineProps, ToastGroupSchema } from "./toast.types";

type Api = ToastApi<DomPropTypes>;

const EXIT = 60;

const SHEET = `
  [data-part~="toast:root"] {
    display: block;
    height: 40px;
    opacity: 1;
    transition: opacity ${EXIT}ms linear;
  }
  [data-part~="toast:root"][data-state="closed"] { opacity: 0; }
`;

let style: HTMLStyleElement;

beforeAll(() => {
  style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

afterAll(() => {
  style.remove();
});

interface Scene {
  readonly toaster: Toaster;
  api(): Api;
  group(): HTMLElement;
  cards(): HTMLElement[];
  card(id: string): HTMLElement;
}

function render(options: Partial<ToastGroupMachineProps> = {}, id = "g1"): Scene {
  const toaster = options.toaster ?? createToaster({ duration: 120 });
  const nodes = new Map<string, { node: HTMLElement; presence: Presence }>();

  const harness = mountMachine<ToastGroupSchema, Api>({
    machine,
    connect,
    html: '<div data-slot="group"></div>',
    id,
    props: { ...options, toaster },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const group = host.querySelector<HTMLElement>('[data-slot="group"]');
      if (group === null) return;
      apply(group, api.getGroupProps());

      const live = new Set<string>();
      for (const record of api.toasts) {
        live.add(record.id);
        let entry = nodes.get(record.id);
        if (entry === undefined) {
          const node = document.createElement("div");
          node.innerHTML =
            '<span data-slot="indicator"></span><div data-slot="title"></div>' +
            '<div data-slot="description"></div><button data-slot="action"></button>' +
            '<button data-slot="close"></button>';
          group.append(node);
          const presence = createPresence({
            onExitComplete: () => api.notifyExit(record.id),
            timeout: 400,
          });
          presence.setPresent(true, node);
          entry = { node, presence };
          nodes.set(record.id, entry);
        }

        apply(entry.node, api.getRootProps(record));
        const slot = (name: string): HTMLElement | null =>
          entry?.node.querySelector<HTMLElement>(`[data-slot="${name}"]`) ?? null;

        const title = slot("title");
        if (title !== null) {
          apply(title, api.getTitleProps(record));
          title.textContent = record.title;
        }
        const description = slot("description");
        if (description !== null) {
          apply(description, api.getDescriptionProps(record));
          description.textContent = record.description ?? "";
        }
        const indicator = slot("indicator");
        if (indicator !== null) apply(indicator, api.getIndicatorProps(record));
        const action = slot("action");
        if (action !== null) apply(action, api.getActionTriggerProps(record));
        const close = slot("close");
        if (close !== null) apply(close, api.getCloseTriggerProps(record));

        entry.presence.setPresent(record.status === "visible", entry.node);
      }

      // Document order is `api.toasts` order, which is what keyed children give
      // React for free and a harness that only appended did not: the store is
      // newest-first, so appending each arrival painted the pile back to front.
      // Only the nodes genuinely out of place move, and a node on its way out is
      // stepped over rather than shuffled — moving an element re-inserts it, which
      // blurs whatever it contains, and the hand-off has usually just put the
      // focus there. React's reconciler moves the same minimum for the same reason.
      const ordered = api.toasts
        .map((record) => nodes.get(record.id)?.node)
        .filter((node): node is HTMLElement => node !== undefined);
      const placed = new Set<Element>(ordered);
      let cursor: Element | null = group.firstElementChild;
      for (const node of ordered) {
        while (cursor !== null && !placed.has(cursor)) cursor = cursor.nextElementSibling;
        if (cursor === node) {
          cursor = cursor.nextElementSibling;
          continue;
        }
        group.insertBefore(node, cursor);
      }

      for (const [key, entry] of [...nodes]) {
        if (live.has(key)) continue;
        entry.presence.destroy();
        entry.node.remove();
        nodes.delete(key);
      }
    },
  });

  return {
    toaster,
    api: (): Api => harness.api(),
    group: (): HTMLElement => harness.part("group"),
    cards: (): HTMLElement[] => [
      ...harness.host.querySelectorAll<HTMLElement>('[data-part~="toast:root"]'),
    ],
    card: (id: string): HTMLElement => {
      const node = nodes.get(id)?.node;
      if (node === undefined) throw new Error(`no card for "${id}"`);
      return node;
    },
  };
}

function press(node: Element, key: string): void {
  node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function pointer(node: Element, type: "pointerenter" | "pointerleave"): void {
  node.dispatchEvent(new PointerEvent(type, { bubbles: false }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function outside(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "elsewhere";
  document.body.append(button);
  return button;
}

const region = (politeness: "polite" | "assertive"): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-sui-live-region="${politeness}"]`);

afterEach(() => {
  unmountAll();
  for (const node of document.querySelectorAll("button")) node.remove();
  for (const live of document.querySelectorAll("[data-sui-live-region]")) {
    live.textContent = "";
  }
});

describe("toast — the focus it must never take", () => {
  it("leaves the caret exactly where it was, whatever the severity", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const scene = render();
    scene.toaster.create({ title: "Upload failed", type: "error" });

    expect(document.activeElement).toBe(input);
    expect(scene.cards()).toHaveLength(1);
    input.remove();
  });

  it("answers the hotkey with the region, and answers nothing when there is none", () => {
    const button = outside();
    button.focus();
    const scene = render();

    press(button, "F6");
    expect(document.activeElement).toBe(button);

    scene.toaster.create({ title: "Saved" });
    press(button, "F6");
    expect(document.activeElement).toBe(scene.group());
  });
});

describe("toast — the clock", () => {
  it("holds while the pointer is on the region and runs again when it leaves", async () => {
    const scene = render();
    const id = scene.toaster.create({ title: "Saved" });

    pointer(scene.group(), "pointerenter");
    expect(scene.group().getAttribute("data-paused")).toBe("");
    await wait(200);
    expect(scene.toaster.getVisibleToasts()[0]?.status).toBe("visible");

    pointer(scene.group(), "pointerleave");
    expect(scene.group().hasAttribute("data-paused")).toBe(false);
    // On the store, not on the card. `data-state="closed"` is what the card wears
    // *during* its exit, and polling for a transient is a race the assertion
    // cannot win: WebKit finishes the 60ms exit and unmounts the node before the
    // first probe runs, so the card is gone rather than closed. That the clock
    // resumed is a fact about the queue, and the queue is where it is asked.
    await vi.waitFor(() => {
      expect(scene.toaster.getVisibleToasts().some((toast) => toast.id === id)).toBe(false);
    });
  });

  it("holds while the focus is inside it", async () => {
    const button = outside();
    button.focus();
    const scene = render();
    const id = scene.toaster.create({ title: "Saved" });

    scene.card(id).focus();
    await wait(200);
    expect(scene.toaster.getVisibleToasts()[0]?.status).toBe("visible");

    button.focus();
    // The same race as the pointer case above, and it needs the same answer.
    // `dismissing` is a transient the toast wears on its way out, so polling for it
    // is a race the assertion cannot win — webkit finishes the exit and drops the
    // toast from the queue before the first probe, and `getVisibleToasts()[0]` is
    // then `undefined` rather than late. What the resumed clock actually promises
    // is that the toast *leaves*, and the hold is already proved by the
    // `visible` assertion above.
    await vi.waitFor(() => {
      expect(scene.toaster.getVisibleToasts().some((toast) => toast.id === id)).toBe(false);
    });
  });
});

describe("toast — the keyboard", () => {
  it("walks the stack without wrapping at either end", () => {
    const scene = render({ toaster: createToaster({ duration: 60_000 }) });
    const first = scene.toaster.create({ title: "a" });
    const second = scene.toaster.create({ title: "b" });
    const third = scene.toaster.create({ title: "c" });

    // Front to back: the newest card is index 0.
    scene.card(third).focus();
    press(scene.card(third), "ArrowDown");
    expect(document.activeElement).toBe(scene.card(second));

    press(scene.card(second), "ArrowDown");
    expect(document.activeElement).toBe(scene.card(first));

    press(scene.card(first), "ArrowDown");
    expect(document.activeElement).toBe(scene.card(first));

    press(scene.card(first), "Home");
    expect(document.activeElement).toBe(scene.card(third));

    press(scene.card(third), "ArrowUp");
    expect(document.activeElement).toBe(scene.card(third));

    press(scene.card(third), "End");
    expect(document.activeElement).toBe(scene.card(first));
  });

  it("hands the focus on when the card under it leaves, and gives it back at the end", async () => {
    const button = outside();
    button.focus();
    const scene = render({ toaster: createToaster({ duration: 60_000 }) });
    const first = scene.toaster.create({ title: "a" });
    const second = scene.toaster.create({ title: "b" });

    scene.card(second).focus();
    press(scene.card(second), "Escape");

    // The exit is running — asked of the store rather than of the card, for the
    // same reason as the clock above: `data-state="closed"` is transient and
    // WebKit can finish the exit before the assertion reads it. What matters here
    // is that the focus has already moved on, because a focus left on a card that
    // is fading out is invisible.
    expect(scene.toaster.getVisibleToasts().find((toast) => toast.id === second)?.status).toBe(
      "dismissing",
    );
    expect(document.activeElement).toBe(scene.card(first));

    await vi.waitFor(() => {
      expect(scene.cards()).toHaveLength(1);
    });

    press(scene.card(first), "Escape");
    expect(document.activeElement).toBe(button);
    await vi.waitFor(() => {
      expect(scene.cards()).toHaveLength(0);
    });
  });
});

describe("toast — what the sheet is handed", () => {
  it("indexes the stack, counts it, and re-indexes when one leaves", async () => {
    const scene = render({ toaster: createToaster({ duration: 60_000 }) });
    const first = scene.toaster.create({ title: "a" });
    const second = scene.toaster.create({ title: "b" });

    expect(scene.group().style.getPropertyValue("--sui-toast-count")).toBe("2");
    expect(scene.card(second).style.getPropertyValue("--sui-toast-index")).toBe("0");
    expect(scene.card(first).style.getPropertyValue("--sui-toast-index")).toBe("1");

    scene.toaster.remove(second);
    await vi.waitFor(() => {
      expect(scene.group().style.getPropertyValue("--sui-toast-count")).toBe("1");
    });
    expect(scene.card(first).style.getPropertyValue("--sui-toast-index")).toBe("0");
  });

  it("measures the expanded offset as the height of everything in front of it", async () => {
    const scene = render({ toaster: createToaster({ duration: 60_000 }) });
    const first = scene.toaster.create({ title: "a" });
    scene.toaster.create({ title: "b" });

    // 40px cards from the harness sheet, plus the 8px fallback gap — the sheet
    // that ships states `--sui-toast-gap`, and this one deliberately does not.
    await vi.waitFor(() => {
      expect(scene.card(first).style.getPropertyValue("--sui-toast-offset")).toBe("48px");
    });
    expect(scene.group().style.getPropertyValue("--sui-toast-stack-size")).toBe("88px");
  });

  it("reaches the top layer where the platform has one", () => {
    const scene = render();
    scene.toaster.create({ title: "Saved" });
    const group = scene.group();

    if (typeof group.showPopover !== "function") {
      expect(group.hasAttribute("popover")).toBe(false);
      return;
    }
    expect(group.getAttribute("popover")).toBe("manual");
    expect(group.matches(":popover-open")).toBe(true);
  });
});

describe("toast — what it says out loud", () => {
  it("speaks through the document's own live region, politely or not", async () => {
    const scene = render();
    scene.toaster.create({ title: "Saved", description: "All changes stored" });

    await vi.waitFor(() => {
      expect(region("polite")?.textContent).toBe("Saved. All changes stored");
    });

    scene.toaster.create({ title: "Upload failed", type: "error" });
    await vi.waitFor(() => {
      expect(region("assertive")?.textContent).toBe("Upload failed");
    });
  });

  it("says a queued toast only once it is on screen, and repeats an update", async () => {
    const toaster = createToaster({ max: 1, duration: 60_000 });
    const scene = render({ toaster });
    const first = toaster.create({ title: "First" });
    const queued = toaster.create({ title: "Queued" });

    await vi.waitFor(() => {
      expect(region("polite")?.textContent).toBe("First");
    });
    expect(scene.cards()).toHaveLength(1);

    toaster.update(first, { title: "First, again" });
    await vi.waitFor(() => {
      expect(region("polite")?.textContent).toBe("First, again");
    });

    toaster.remove(first);
    await vi.waitFor(() => {
      expect(region("polite")?.textContent).toBe("Queued");
    });
    expect(toaster.isVisible(queued)).toBe(true);
  });
});

describe("toast — the gamepad", () => {
  function withIntents(): { bus: IntentBus; scene: Scene } {
    const bus = createIntentBus();
    return { bus, scene: render({ intents: bus, toaster: createToaster({ duration: 60_000 }) }) };
  }

  it("answers B only while the focus is already in the region", () => {
    const button = outside();
    button.focus();
    const { bus, scene } = withIntents();
    const id = scene.toaster.create({ title: "Saved" });

    // Outside: never consumed — the toasts are not on the layer stack, and B goes
    // on dismissing whatever really is.
    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
    expect(scene.toaster.getVisibleToasts()[0]?.status).toBe("visible");

    scene.card(id).focus();
    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    expect(scene.toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("moves the focus with the d-pad, exactly as the arrows do", () => {
    const { bus, scene } = withIntents();
    const first = scene.toaster.create({ title: "a" });
    const second = scene.toaster.create({ title: "b" });

    scene.card(second).focus();
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(document.activeElement).toBe(scene.card(first));

    bus.dispatch({ intent: "moveUp", source: "gamepad" });
    expect(document.activeElement).toBe(scene.card(second));
  });
});

describe("toast — the ceiling", () => {
  it("shows three, keeps the rest, and promotes one when a slot frees up", async () => {
    const toaster = createToaster({ max: 3, duration: 60_000 });
    const scene = render({ toaster });
    const created = ["a", "b", "c", "d", "e"].map((title) => toaster.create({ title }));

    expect(scene.cards()).toHaveLength(3);
    expect(toaster.getQueuedCount()).toBe(2);

    // The ceiling was reached at the third creation, so the front of the stack is
    // `c` and the last two never mounted at all.
    toaster.dismiss(created[2] as string);
    await vi.waitFor(() => {
      expect(toaster.getQueuedCount()).toBe(1);
    });
    expect(scene.cards()).toHaveLength(3);
    expect(toaster.isVisible(created[3] as string)).toBe(true);
  });
});
