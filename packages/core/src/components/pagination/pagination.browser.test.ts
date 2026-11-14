/**
 * `pagination` against a real engine, with no framework in the room.
 *
 * This file also carries the machine-level behaviour a node test cannot reach:
 * the machine's two effects (`trackModality`, `captureIntents`) resolve a
 * document at `start()`, so events, guards and the watch can only be exercised
 * here — the same split `tabs` documents. The pure half (the truncation model,
 * the clamped page, the ARIA surface, the key claims) lives in
 * `pagination.test.ts`.
 *
 * The scene reconciles its cells from `api.pages` the way an adapter would:
 * keyed by page value, so a control that survives a window shift keeps its
 * node — and its focus, which several tests below stand on.
 */

import { createIntentBus, getTabbables, type IntentBus, setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ApplyProps,
  type DomPropTypes,
  type MachineHarness,
  mountMachine,
  unmountAll,
} from "../harness";
import { connect } from "./pagination.connect";
import { machine } from "./pagination.machine";
import type { PaginationApi, PaginationMachineProps, PaginationSchema } from "./pagination.types";

type Api = PaginationApi<DomPropTypes>;

interface SceneOptions {
  readonly id?: string;
  /** A focusable of the app's own, outside the nav — the `ownsFocus` foil. */
  readonly outside?: boolean;
}

interface Scene {
  readonly harness: MachineHarness<PaginationSchema, Api>;
  api(): Api;
  settle(next?: Partial<PaginationMachineProps>): void;
  root(): HTMLElement;
  item(page: number): HTMLElement;
  prev(): HTMLElement;
  next(): HTMLElement;
  /** The focusable controls, in DOM order. */
  controls(): HTMLElement[];
  ellipses(): HTMLElement[];
  outside(): HTMLButtonElement;
}

function render(props: Partial<PaginationMachineProps> = {}, options: SceneOptions = {}): Scene {
  const link = props.type === "link";
  const tag = link ? "a" : "button";

  const harness = mountMachine<PaginationSchema, Api>({
    machine,
    connect,
    html: `<nav data-slot="root"></nav>${
      options.outside === true ? `<button data-slot="outside">outside</button>` : ""
    }`,
    id: options.id ?? "p1",
    props: { count: 100, ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.querySelector('[data-slot="root"]') as HTMLElement;
      apply(root, api.getRootProps());

      const ensure = (key: string, cellTag: string, text: string): HTMLElement => {
        const existing = root.querySelector<HTMLElement>(`[data-key="${key}"]`);
        if (existing !== null) return existing;
        const node = root.ownerDocument.createElement(cellTag);
        node.dataset.key = key;
        node.textContent = text;
        root.append(node);
        return node;
      };

      const prev = ensure("prev", tag, "prev");
      apply(prev, api.getPrevTriggerProps());

      const order: HTMLElement[] = [prev];
      api.pages.forEach((entry, index) => {
        if (entry.type === "page") {
          const node = ensure(`p${entry.value}`, tag, String(entry.value));
          apply(node, api.getItemProps({ page: entry.value }));
          order.push(node);
        } else {
          const node = ensure(`e${index}`, "span", "");
          apply(node, api.getEllipsisProps({ index }));
          order.push(node);
        }
      });

      const next = ensure("next", tag, "next");
      apply(next, api.getNextTriggerProps());
      order.push(next);

      for (const child of [...root.children]) {
        if (!order.includes(child as HTMLElement)) child.remove();
      }
      let previous: Element | null = null;
      for (const node of order) {
        if (previous === null) {
          if (root.firstElementChild !== node) root.prepend(node);
        } else if (previous.nextElementSibling !== node) {
          previous.after(node);
        }
        previous = node;
      }
    },
  });

  const query = <T extends HTMLElement>(selector: string): T => {
    const node = harness.host.querySelector<T>(selector);
    if (node === null) throw new Error(`the scene has no ${selector}`);
    return node;
  };

  return {
    harness,
    api: (): Api => harness.api(),
    settle: (next: Partial<PaginationMachineProps> = {}): void => harness.setProps(next),
    root: (): HTMLElement => query('[data-slot="root"]'),
    item: (page: number): HTMLElement => query(`[data-key="p${page}"]`),
    prev: (): HTMLElement => query('[data-key="prev"]'),
    next: (): HTMLElement => query('[data-key="next"]'),
    controls: (): HTMLElement[] => [
      ...harness.host.querySelectorAll<HTMLElement>(
        '[data-part~="pagination:item"], [data-part~="pagination:prev-trigger"], [data-part~="pagination:next-trigger"]',
      ),
    ],
    ellipses: (): HTMLElement[] => [
      ...harness.host.querySelectorAll<HTMLElement>('[data-part~="pagination:ellipsis"]'),
    ],
    outside: (): HTMLButtonElement => query<HTMLButtonElement>('[data-slot="outside"]'),
  };
}

function press(node: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

function release(node: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

afterEach(() => {
  unmountAll();
  setInputModality(document, "pointer");
});

describe("pagination — the selection", () => {
  it("selects on click and reports the change exactly once", () => {
    const onPageChange = vi.fn();
    const scene = render({ onPageChange });

    scene.item(3).click();

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith({ page: 3, pageSize: 10 });
    expect(scene.item(3).getAttribute("aria-current")).toBe("page");
    expect(scene.item(3).getAttribute("data-current")).toBe("");
    expect(scene.item(1).getAttribute("aria-current")).toBeNull();

    // Re-clicking the current page is not a change.
    scene.item(3).click();
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it("lets a controlled page win, and never writes it itself", () => {
    const onPageChange = vi.fn();
    const scene = render({ page: 2, onPageChange });

    scene.item(4).click();

    expect(onPageChange).toHaveBeenCalledWith({ page: 4, pageSize: 10 });
    expect(scene.api().page).toBe(2);
    expect(scene.item(2).getAttribute("aria-current")).toBe("page");

    scene.settle({ page: 4 });
    expect(scene.api().page).toBe(4);
    expect(scene.item(4).getAttribute("aria-current")).toBe("page");
  });

  it("steps on the triggers and refuses silently at the bounds", () => {
    const onPageChange = vi.fn();
    const scene = render({ count: 30, defaultPage: 2, onPageChange });

    scene.next().click();
    expect(onPageChange).toHaveBeenLastCalledWith({ page: 3, pageSize: 10 });

    // At the bound the guard closes: no event, no wrap.
    scene.next().click();
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(scene.api().page).toBe(3);

    scene.prev().click();
    scene.prev().click();
    scene.prev().click();
    expect(scene.api().page).toBe(1);
    expect(onPageChange).toHaveBeenCalledTimes(3);
  });

  it("keeps the focus on a trigger that just reached the bound", () => {
    // The regression the aria-disabled decision exists for: hammering Next to
    // the end must never drop the focus on body.
    const scene = render({ count: 30, defaultPage: 2 });

    scene.next().focus();
    scene.next().click();

    expect(scene.next().getAttribute("aria-disabled")).toBe("true");
    expect(scene.next().hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(scene.next());
  });

  it("refuses every route when the nav is disabled", () => {
    const onPageChange = vi.fn();
    const scene = render({ disabled: true, onPageChange });

    scene.item(3).click();
    scene.next().click();
    scene.item(2).focus();
    press(scene.item(2), "PageDown");

    expect(onPageChange).not.toHaveBeenCalled();
    expect(scene.api().page).toBe(1);
    expect(scene.root().getAttribute("data-disabled")).toBe("");
  });
});

describe("pagination — the api", () => {
  it("clamps setPage into the range, both ways", () => {
    const onPageChange = vi.fn();
    const scene = render({ onPageChange });

    scene.api().setPage(99);
    expect(scene.api().page).toBe(10);
    expect(onPageChange).toHaveBeenLastCalledWith({ page: 10, pageSize: 10 });

    scene.api().setPage(0);
    expect(scene.api().page).toBe(1);
    expect(onPageChange).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 });
    expect(onPageChange).toHaveBeenCalledTimes(2);
  });

  it("keeps the first visible item visible through a page-size change", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const scene = render({ onPageChange, onPageSizeChange });

    scene.api().setPage(5);
    // Page 5 at size 10 starts at item 40; at size 20 that item is on page 3.
    scene.api().setPageSize(20);

    expect(onPageSizeChange).toHaveBeenCalledWith({ pageSize: 20 });
    expect(scene.api().pageSize).toBe(20);
    expect(scene.api().page).toBe(3);
    expect(onPageChange).toHaveBeenLastCalledWith({ page: 3, pageSize: 20 });
    expect(scene.api().pageRange).toEqual({ start: 40, end: 60 });
  });

  it("re-clamps a page left dangling by a shrinking count", () => {
    const onPageChange = vi.fn();
    const scene = render({ defaultPage: 10, onPageChange });
    expect(scene.api().page).toBe(10);

    scene.settle({ count: 30 });

    // The watch asks for the correction; an uncontrolled page takes it.
    expect(scene.api().page).toBe(3);
    expect(onPageChange).toHaveBeenLastCalledWith({ page: 3, pageSize: 10 });
  });

  it("steps from the api the way the triggers do", () => {
    const scene = render({ count: 30, defaultPage: 3 });

    scene.api().nextPage();
    expect(scene.api().page).toBe(3);

    scene.api().prevPage();
    expect(scene.api().page).toBe(2);
  });
});

describe("pagination — the keyboard, end to end", () => {
  it("keeps every control tabbable and no ellipsis", () => {
    const scene = render({ defaultPage: 5 });

    // prev · 1 · 4 5 6 · 10 · next — the two ellipses are not focusable.
    expect(getTabbables(scene.root())).toEqual(scene.controls());
    expect(scene.ellipses()).toHaveLength(2);
    for (const ellipsis of scene.ellipses()) {
      expect(getTabbables(scene.root())).not.toContain(ellipsis);
      expect(ellipsis.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("moves the focus with the arrows, ellipses skipped, and claims only what moved", () => {
    const scene = render({ defaultPage: 5 });
    scene.item(6).focus();

    // From 6 the next control is 10: the ellipsis between them is not a stop.
    const claimed = press(scene.item(6), "ArrowRight");
    expect(document.activeElement).toBe(scene.item(10));
    expect(claimed.defaultPrevented).toBe(true);

    press(scene.item(10), "ArrowLeft");
    expect(document.activeElement).toBe(scene.item(6));

    // Off-axis the arrow stays the browser's and the page keeps scrolling.
    const ignored = press(scene.item(6), "ArrowDown");
    expect(ignored.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(scene.item(6));
  });

  it("mirrors the arrows in RTL", () => {
    const scene = render({ dir: "rtl", defaultPage: 5 });
    scene.item(5).focus();

    press(scene.item(5), "ArrowRight");
    expect(document.activeElement).toBe(scene.item(4));

    press(scene.item(4), "ArrowLeft");
    expect(document.activeElement).toBe(scene.item(5));
  });

  it("stops at the ends without looping, and leaves Home and End to the page", () => {
    const scene = render({ defaultPage: 5 });
    scene.next().focus();

    // A pagination has hard ends: no wrap past the last control.
    press(scene.next(), "ArrowRight");
    expect(document.activeElement).toBe(scene.next());

    // And the two keys the bar gives back: the focus does not move, so the
    // browser's own "top of the document" / "bottom of the document" survives
    // inside the landmark.
    press(scene.next(), "Home");
    expect(document.activeElement).toBe(scene.next());

    scene.prev().focus();
    press(scene.prev(), "ArrowLeft");
    expect(document.activeElement).toBe(scene.prev());

    press(scene.prev(), "End");
    expect(document.activeElement).toBe(scene.prev());
  });

  it("pages on PageUp/PageDown without moving the focus", () => {
    const onPageChange = vi.fn();
    const scene = render({ defaultPage: 5, onPageChange });
    scene.item(5).focus();

    const claimed = press(scene.item(5), "PageDown");
    expect(claimed.defaultPrevented).toBe(true);
    expect(scene.api().page).toBe(6);
    // Page 5 is still in the model (it is the new page's neighbour), so the
    // focused node survived the window shift — and the focus stayed put.
    expect(document.activeElement).toBe(scene.item(5));

    press(scene.item(5), "PageUp");
    expect(scene.api().page).toBe(5);
    expect(onPageChange).toHaveBeenCalledTimes(2);
  });

  it("refuses PageUp/PageDown silently at the bounds", () => {
    const onPageChange = vi.fn();
    const scene = render({ count: 30, defaultPage: 1, onPageChange });
    scene.item(1).focus();

    press(scene.item(1), "PageUp");
    expect(onPageChange).not.toHaveBeenCalled();
    expect(scene.api().page).toBe(1);
  });

  it("does not replay a step an input system already consumed", () => {
    // The simulated keymap: a capture-phase listener that turns PageDown into
    // an intent and prevents the native event. The connect's head guard must
    // then stand aside — the step plays once, not twice.
    const scene = render({ defaultPage: 5 });
    scene.item(5).focus();
    const swallow = (event: KeyboardEvent): void => {
      if (event.key === "PageDown") event.preventDefault();
    };
    document.addEventListener("keydown", swallow, true);

    try {
      press(scene.item(5), "PageDown");
      expect(scene.api().page).toBe(5);
    } finally {
      // Removed even when the assertion throws: a leaked capture listener would
      // swallow PageDown for every test that runs after this one.
      document.removeEventListener("keydown", swallow, true);
    }
  });
});

describe("pagination — the focus ring and the press", () => {
  it("marks how the focus arrived, on the focused control only", () => {
    const scene = render();

    setInputModality(document, "keyboard");
    scene.item(2).focus();

    expect(scene.item(2).getAttribute("data-focus-visible")).toBe("");
    expect(scene.item(2).getAttribute("data-focus-source")).toBe("keyboard");
    expect(scene.item(1).hasAttribute("data-focus-source")).toBe(false);

    press(scene.item(2), "ArrowRight");
    expect(scene.item(3).getAttribute("data-focus-visible")).toBe("");
    expect(scene.item(2).hasAttribute("data-focus-visible")).toBe(false);
  });

  it("draws no ring when the pointer put the focus there", () => {
    const scene = render();

    setInputModality(document, "pointer");
    scene.item(2).focus();
    scene.item(2).click();

    expect(scene.item(2).getAttribute("data-focus-source")).toBe("pointer");
    expect(scene.item(2).hasAttribute("data-focus-visible")).toBe(false);
  });

  it("presses on pointerdown and lets go when the pointer leaves", () => {
    const scene = render();
    const item = scene.item(2);

    item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(item.getAttribute("data-pressed")).toBe("");

    item.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(item.hasAttribute("data-pressed")).toBe(false);
  });

  it("mirrors Enter and Space into the pressed visual without stealing the click", () => {
    const scene = render();
    scene.item(2).focus();

    const down = press(scene.item(2), "Enter");
    expect(down.defaultPrevented).toBe(false);
    expect(scene.item(2).getAttribute("data-pressed")).toBe("");

    release(scene.item(2), "Enter");
    expect(scene.item(2).hasAttribute("data-pressed")).toBe(false);

    press(scene.item(2), " ");
    expect(scene.item(2).getAttribute("data-pressed")).toBe("");
    release(scene.item(2), " ");
    expect(scene.item(2).hasAttribute("data-pressed")).toBe(false);
  });
});

describe("pagination — the gamepad", () => {
  interface Pad {
    readonly scene: Scene;
    readonly bus: IntentBus;
    readonly seen: string[];
  }

  function withPad(props: Partial<PaginationMachineProps> = {}, options: SceneOptions = {}): Pad {
    const bus = createIntentBus();
    const seen: string[] = [];
    bus.pushScope((event) => {
      seen.push(event.intent);
      return false;
    });
    return { scene: render({ ...props, intents: bus }, options), bus, seen };
  }

  it("pages on LT/RT while the focus is in the nav, without moving it", () => {
    const { scene, bus } = withPad({ defaultPage: 5 });
    scene.item(5).focus();

    expect(bus.dispatch({ intent: "pageDown", source: "gamepad" }).consumed).toBe(true);
    expect(scene.api().page).toBe(6);
    expect(document.activeElement).toBe(scene.item(5));

    bus.dispatch({ intent: "pageUp", source: "gamepad" });
    expect(scene.api().page).toBe(5);
  });

  it("answers nothing at all when the focus is elsewhere", () => {
    // Outside the nav PageUp/PageDown keep their first meaning — scrolling the
    // page — so the intent must fall through, unlike tabs' whole-root LB/RB.
    const { scene, bus, seen } = withPad({ defaultPage: 5 }, { outside: true });
    scene.outside().focus();

    const result = bus.dispatch({ intent: "pageDown", source: "gamepad" });

    expect(result.consumed).toBe(false);
    expect(seen).toEqual(["pageDown"]);
    expect(scene.api().page).toBe(5);
  });

  it("consumes the intent at the bound without paging", () => {
    // A user *in* the pagination leaning on LT must not see the page scroll by
    // surprise: the intent is eaten even though the guard refuses the step.
    const { scene, bus } = withPad({ count: 30, defaultPage: 1 });
    scene.item(1).focus();

    expect(bus.dispatch({ intent: "pageUp", source: "gamepad" }).consumed).toBe(true);
    expect(scene.api().page).toBe(1);
  });

  it("never claims a direction or B — the nav is a container, not a layer", () => {
    const { scene, bus, seen } = withPad({ defaultPage: 5 });
    scene.item(5).focus();

    expect(bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(false);
    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
    expect(seen).toEqual(["moveRight", "back"]);
    expect(scene.root().getAttribute("data-snav")).toBe("container");
  });

  it("gives its scope back when it is destroyed", () => {
    const { scene, bus } = withPad();
    expect(bus.depth()).toBe(2);

    scene.harness.destroy();

    expect(bus.depth()).toBe(1);
  });
});

describe("pagination — link mode", () => {
  const linkProps: Partial<PaginationMachineProps> = {
    type: "link",
    getPageUrl: ({ page }) => `#page-${page}`,
  };

  it("renders anchors with one href per page", () => {
    const scene = render({ ...linkProps, defaultPage: 5 });

    expect(scene.item(4).localName).toBe("a");
    expect(scene.item(4).getAttribute("href")).toBe("#page-4");
    expect(scene.item(5).getAttribute("aria-current")).toBe("page");
    // The current page keeps its href — a link to itself.
    expect(scene.item(5).getAttribute("href")).toBe("#page-5");
    expect(scene.prev().getAttribute("href")).toBe("#page-4");
    expect(scene.next().getAttribute("href")).toBe("#page-6");
  });

  it("still selects through the machine on click", () => {
    const onPageChange = vi.fn();
    const scene = render({ ...linkProps, onPageChange });

    scene.item(3).click();

    expect(onPageChange).toHaveBeenCalledWith({ page: 3, pageSize: 10 });
    expect(scene.item(3).getAttribute("aria-current")).toBe("page");
  });

  it("kills the navigation of a refused link", () => {
    // A dead link must not navigate the page: the trigger at its bound
    // prevents the click before anything else can read it.
    const scene = render({ ...linkProps, count: 30, defaultPage: 3 });

    const cancelled = !scene
      .next()
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(scene.next().getAttribute("aria-disabled")).toBe("true");
    expect(cancelled).toBe(true);
    expect(scene.api().page).toBe(3);
  });
});

describe("pagination — teardown", () => {
  it("stops cleanly, with nothing left listening", () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    const scene = render();
    const item = scene.item(2);

    scene.harness.destroy();
    item.click();

    expect(warnings).toEqual([]);
    spy.mockRestore();
  });
});
