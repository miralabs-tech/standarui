/**
 * `tabs` against a real engine, with no framework in the room.
 *
 * Almost nothing this machine does can be faked. The trigger order, the single
 * tab stop, where the focus lands when a tab closes and — above all — where the
 * indicator goes are all read back from layout, so a node test could only assert
 * what a stub was told to answer. The arithmetic behind the pill is tested pure
 * in `utils/indicator-rect.test.ts`; what is proved here is that the machine
 * feeds it the right boxes, and that the number it posts really does put an
 * absolutely positioned element on the selected tab in every layout the library
 * claims to support.
 *
 * The tab list the harness paints is the shape a consumer writes: a list holding
 * the indicator and the triggers, and one panel per tab. Every panel is painted,
 * always, and neither unmounted nor hidden — that is deliberate. The reference
 * reactivity runs its trackers *before* its listeners (see the head of
 * `reactivity.ts`), so a harness that mounted or revealed a panel during a paint
 * would have the machine measure it one pass too early and would be reporting on
 * its own ordering bug. `lazyMount`, `keepMounted` and the exit animation belong
 * to an adapter that owns that order; they are tested in `@standarui/react`.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createIntentBus, getTabbables, type IntentBus, setInputModality } from "../../nav";
import {
  type ApplyProps,
  type DomPropTypes,
  type MachineHarness,
  mountMachine,
  unmountAll,
} from "../harness";
import { connect } from "./tabs.connect";
import { machine } from "./tabs.machine";
import type { TabsApi, TabsMachineProps, TabsSchema } from "./tabs.types";

type Api = TabsApi<DomPropTypes>;

interface TabSpec {
  readonly value: string;
  readonly disabled?: boolean;
  /** Explicit, and different per tab: no arithmetic on an index could place these. */
  readonly width?: number;
  readonly height?: number;
  readonly panel?: string;
}

interface SceneOptions {
  /** An editor's tab bar: the track is narrower than its tabs and scrolls. */
  readonly narrow?: boolean;
  /** A focusable of the app's own, inside the root and outside the list. */
  readonly chrome?: boolean;
  readonly id?: string;
}

const OVERVIEW: TabSpec = { value: "overview", width: 60, height: 30 };
const ACTIVITY: TabSpec = { value: "activity", width: 100, height: 50 };
const SETTINGS: TabSpec = { value: "settings", width: 40, height: 20 };
const THREE: readonly TabSpec[] = [OVERVIEW, ACTIVITY, SETTINGS];

/**
 * The geometry the shipped sheet gives these parts, reduced to the two
 * declarations under test: the track positions the pill, and the pill is placed
 * by the two custom properties the machine measured. Everything else is sized
 * explicitly, so a failure here is the machine's and never a font's.
 */
const SHEET = `
  [data-slot="root"] { inline-size: 320px; font: 12px/1 monospace; }
  [data-slot="list"] { position: relative; display: flex; align-items: flex-start;
    margin: 0; padding: 0; border: 0; }
  [data-slot="list"][data-orientation="vertical"] { flex-direction: column; }
  [data-slot="list"] button { flex: none; box-sizing: border-box; margin: 0; padding: 0;
    border: 0; font: inherit; }
  [data-narrow] [data-slot="list"] { inline-size: 120px; overflow-x: auto; }
  [data-slot="indicator"] { position: absolute; inset-block: 0;
    inset-inline-start: var(--sui-indicator-offset, 0);
    inline-size: var(--sui-indicator-size, 0); }
  [data-slot="indicator"][data-orientation="vertical"] {
    inset-block: var(--sui-indicator-offset, 0) auto; inset-inline: 0;
    inline-size: auto; block-size: var(--sui-indicator-size, 0); }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

function ensure(
  parent: HTMLElement,
  tag: string,
  value: string,
  role: string,
  create: (node: HTMLElement) => void,
): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(`[data-tab="${value}"][data-role="${role}"]`);
  if (existing !== null) return existing;
  const node = document.createElement(tag);
  node.dataset.tab = value;
  node.dataset.role = role;
  create(node);
  parent.append(node);
  return node;
}

interface Scene {
  readonly harness: MachineHarness<TabsSchema, Api>;
  /** The tab list as the consumer holds it — splice it, then repaint. */
  readonly tabs: TabSpec[];
  api(): Api;
  /** New props, or simply the repaint an adapter owes after its own state moved. */
  settle(next?: TabsMachineProps): void;
  list(): HTMLElement;
  indicator(): HTMLElement;
  triggers(): HTMLButtonElement[];
  tab(value: string): HTMLButtonElement;
  closer(value: string): HTMLButtonElement;
  panel(value: string): HTMLElement;
  chrome(): HTMLButtonElement;
}

function render(
  props: TabsMachineProps = {},
  spec: readonly TabSpec[] = THREE,
  options: SceneOptions = {},
): Scene {
  const tabs = spec.map((tab) => ({ ...tab }));
  const closable = props.closable === true;

  const harness = mountMachine<TabsSchema, Api>({
    machine,
    connect,
    // `data-motion="reduced"` so `scrollActiveIntoView` scrolls synchronously.
    // The machine resolves motion exactly as the sheet does — attribute before
    // media query — which is what makes pinning it here legitimate.
    html: `<div data-slot="root" data-motion="reduced"${options.narrow === true ? " data-narrow" : ""}>
        <div data-slot="list"><span data-slot="indicator"></span></div>
        <div data-slot="panels"></div>
        ${options.chrome === true ? `<button data-slot="chrome">chrome</button>` : ""}
      </div>`,
    id: options.id ?? "t1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.querySelector('[data-slot="root"]') as HTMLElement;
      const list = host.querySelector('[data-slot="list"]') as HTMLElement;
      const panels = host.querySelector('[data-slot="panels"]') as HTMLElement;
      const indicator = host.querySelector('[data-slot="indicator"]') as HTMLElement;

      apply(root, api.getRootProps());
      apply(list, api.getListProps());
      apply(indicator, api.getIndicatorProps());

      const alive = new Set(tabs.map((tab) => tab.value));
      for (const node of [...list.children, ...panels.children]) {
        const value = (node as HTMLElement).dataset.tab;
        if (value !== undefined && !alive.has(value)) node.remove();
      }

      const order: Element[] = [];
      for (const tab of tabs) {
        const trigger = ensure(list, "button", tab.value, "trigger", (node) => {
          node.textContent = tab.value;
          node.style.inlineSize = `${tab.width ?? 60}px`;
          node.style.blockSize = `${tab.height ?? 30}px`;
        });
        apply(trigger, api.getTriggerProps({ value: tab.value, disabled: tab.disabled }));
        order.push(trigger);

        if (closable) {
          const closer = ensure(list, "button", tab.value, "close", (node) => {
            node.textContent = "x";
            node.setAttribute("aria-label", `Close ${tab.value}`);
            node.style.inlineSize = "16px";
            node.style.blockSize = `${tab.height ?? 30}px`;
          });
          apply(closer, api.getCloseTriggerProps({ value: tab.value }));
          order.push(closer);
        }

        const panel = ensure(panels, "div", tab.value, "panel", (node) => {
          node.innerHTML = tab.panel ?? `<p>${tab.value}</p>`;
        });
        apply(panel, api.getContentProps({ value: tab.value }));
      }

      // Only ever moves a node that is actually out of place — a re-append that
      // changed nothing would still emit a mutation record, and `trackTriggers`
      // would read it as the tab list churning on every paint.
      let previous: Element = indicator;
      for (const node of order) {
        if (previous.nextElementSibling !== node) previous.after(node);
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
    tabs,
    api: (): Api => harness.api(),
    settle: (next: TabsMachineProps = {}): void => harness.setProps(next),
    list: (): HTMLElement => query('[data-slot="list"]'),
    indicator: (): HTMLElement => query('[data-slot="indicator"]'),
    triggers: (): HTMLButtonElement[] => [
      ...harness.host.querySelectorAll<HTMLButtonElement>('[data-part~="tabs:trigger"]'),
    ],
    tab: (value: string): HTMLButtonElement =>
      query<HTMLButtonElement>(`[data-tab="${value}"][data-role="trigger"]`),
    closer: (value: string): HTMLButtonElement =>
      query<HTMLButtonElement>(`[data-tab="${value}"][data-role="close"]`),
    panel: (value: string): HTMLElement => query(`[data-tab="${value}"][data-role="panel"]`),
    chrome: (): HTMLButtonElement => query<HTMLButtonElement>('[data-slot="chrome"]'),
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

/** A whole key press, both halves. Space is answered on the second one. */
function tap(node: Element, key: string, init: KeyboardEventInit = {}): void {
  press(node, key, init);
  release(node, key, init);
}

/** What a mutation observer needs: it reports on its own turn, never inline. */
function observed(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The assertion the whole indicator story reduces to: the element the sheet
 * places from `--sui-indicator-offset` / `--sui-indicator-size` lands exactly
 * on the selected tab. Stated in engine coordinates rather than in expected
 * numbers, so it holds identically in LTR, RTL, vertical and scrolled — the four
 * layouts where a hand-computed number would only prove the test's own
 * arithmetic.
 */
function expectPillOn(scene: Scene, value: string, axis: "inline" | "block" = "inline"): void {
  const pill = scene.indicator().getBoundingClientRect();
  const tab = scene.tab(value).getBoundingClientRect();
  if (axis === "inline") {
    expect(pill.left).toBeCloseTo(tab.left, 1);
    expect(pill.width).toBeCloseTo(tab.width, 1);
  } else {
    expect(pill.top).toBeCloseTo(tab.top, 1);
    expect(pill.height).toBeCloseTo(tab.height, 1);
  }
}

afterEach(() => {
  unmountAll();
  setInputModality(document, "pointer");
});

describe("tabs — the selection", () => {
  it("honours the default it was given", () => {
    const scene = render({ defaultValue: "activity" });

    expect(scene.api().value).toBe("activity");
    expect(scene.tab("activity").getAttribute("aria-selected")).toBe("true");
    expect(scene.tab("overview").getAttribute("aria-selected")).toBe("false");
    expect(scene.triggers().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("settles on the first selectable tab when it was given nothing", () => {
    // The APG invariant — a tab list always has exactly one selected tab —
    // without the consumer having to pass a `defaultValue` to get it.
    const scene = render();

    expect(scene.api().value).toBe("overview");
    expect(scene.list().style.getPropertyValue("--sui-active-index")).toBe("0");
    expect(scene.list().style.getPropertyValue("--sui-item-count")).toBe("3");
  });

  it("steps over a disabled first tab when it settles", () => {
    const scene = render({}, [{ ...OVERVIEW, disabled: true }, ACTIVITY, SETTINGS]);

    // The tab stop rides on the selection: parked on a disabled button the
    // composite's only `tabindex="0"` is skipped, and the whole list falls out
    // of the tab order.
    expect(scene.api().value).toBe("activity");
    expect(scene.triggers().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("selects on click and reports the change exactly once", () => {
    const onValueChange = vi.fn();
    const scene = render({ defaultValue: "overview", onValueChange });

    scene.tab("activity").click();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith({ value: "activity" });

    // Re-selecting what is already selected is not a change, and a tab bar is
    // clicked on repeatedly.
    scene.tab("activity").click();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("lets a controlled value win, and never writes it itself", () => {
    const onValueChange = vi.fn();
    const scene = render({ value: "settings", onValueChange });

    scene.tab("overview").click();

    expect(onValueChange).toHaveBeenCalledWith({ value: "overview" });
    // The consumer did not move it, so it did not move.
    expect(scene.api().value).toBe("settings");
    expect(scene.tab("settings").getAttribute("aria-selected")).toBe("true");

    scene.settle({ value: "overview" });
    expect(scene.api().value).toBe("overview");
  });

  it("keeps a tab stop when a controlled consumer holds its value at null", () => {
    // `null` is a value here and not an absence, and `syncTriggers` is right not
    // to settle it on the consumer's behalf — it can only ask, through
    // `onValueChange`. But the single tab stop cannot be *derived* from the
    // selection, or a list with nothing selected leaves every trigger at `-1` and
    // falls out of the tab order altogether.
    const scene = render({ value: null });

    expect(scene.api().value).toBeNull();
    expect(scene.triggers().every((tab) => tab.getAttribute("aria-selected") === "false")).toBe(
      true,
    );
    expect(scene.triggers().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(getTabbables(scene.list())).toEqual([scene.tab("overview")]);
  });

  it("puts that fallback stop on the first tab able to take it", () => {
    const scene = render({ value: null }, [{ ...OVERVIEW, disabled: true }, ACTIVITY, SETTINGS]);

    expect(scene.triggers().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(getTabbables(scene.list())).toEqual([scene.tab("activity")]);
  });

  it("refuses a disabled tab, by every route it has", () => {
    const onValueChange = vi.fn();
    const scene = render({ defaultValue: "overview", onValueChange }, [
      OVERVIEW,
      { ...ACTIVITY, disabled: true },
      SETTINGS,
    ]);

    expect(scene.tab("activity").disabled).toBe(true);
    scene.tab("activity").click();
    press(scene.tab("activity"), "Enter");

    expect(onValueChange).not.toHaveBeenCalled();
    expect(scene.api().value).toBe("overview");
  });

  it("refuses every route when the whole list is disabled, and keeps its value", () => {
    const onValueChange = vi.fn();
    const scene = render({ defaultValue: "activity", disabled: true, onValueChange });

    expect(scene.triggers().every((tab) => tab.disabled)).toBe(true);
    scene.tab("overview").click();
    press(scene.tab("overview"), "ArrowRight");
    scene.api().selectNext();

    // Nothing is selectable, and a disabled list has no tab stop to protect:
    // clearing the selection here would erase the consumer's state and report a
    // change nobody made.
    expect(onValueChange).not.toHaveBeenCalled();
    expect(scene.api().value).toBe("activity");
    expect(scene.list().getAttribute("data-disabled")).toBe("");
  });

  it("re-reads the tabs when one is taken away, and rescues a dangling value", async () => {
    const scene = render({ defaultValue: "settings" });
    expect(scene.list().style.getPropertyValue("--sui-item-count")).toBe("3");

    scene.tabs.splice(2, 1);
    scene.settle();
    await observed();

    expect(scene.list().style.getPropertyValue("--sui-item-count")).toBe("2");
    // The selected tab is gone: the machine settles on the first selectable one
    // rather than leaving a tab list with nothing selected and no tab stop.
    expect(scene.api().value).toBe("overview");
    expect(scene.list().style.getPropertyValue("--sui-active-index")).toBe("0");
  });
});

describe("tabs — activation mode", () => {
  it("follows the focus in `automatic`, which is the APG default", () => {
    const scene = render({ defaultValue: "overview" });

    scene.tab("activity").focus();

    expect(scene.api().value).toBe("activity");
    expect(scene.api().focusedValue).toBe("activity");
  });

  it("waits for Enter or Space in `manual`", () => {
    const scene = render({ defaultValue: "overview", activationMode: "manual" });

    scene.tab("activity").focus();
    expect(scene.api().focusedValue).toBe("activity");
    expect(scene.api().value).toBe("overview");

    press(scene.tab("activity"), "Enter");
    expect(scene.api().value).toBe("activity");

    scene.tab("settings").focus();
    tap(scene.tab("settings"), " ");
    expect(scene.api().value).toBe("settings");
  });

  it("answers Enter on the way down and Space on the way up", () => {
    // `research/input.md` §1, the rule across the library and the browser's own
    // behaviour for a button: Enter fires as the key goes down, Space when it
    // comes back up — which is what lets someone who changed their mind slide off
    // the tab before letting go.
    const scene = render({ defaultValue: "overview", activationMode: "manual" });

    scene.tab("activity").focus();
    press(scene.tab("activity"), " ");
    expect(scene.api().value).toBe("overview");

    release(scene.tab("activity"), " ");
    expect(scene.api().value).toBe("activity");
  });

  it("reads a held key as one press", () => {
    const onValueChange = vi.fn();
    const scene = render({ defaultValue: "overview", activationMode: "manual", onValueChange });

    scene.tab("activity").focus();
    press(scene.tab("activity"), "Enter");
    press(scene.tab("activity"), "Enter", { repeat: true });
    press(scene.tab("activity"), "Enter", { repeat: true });

    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("forgets the focused tab when the focus leaves", () => {
    const scene = render({ defaultValue: "overview" }, THREE, { chrome: true });

    scene.tab("activity").focus();
    expect(scene.api().focusedValue).toBe("activity");

    scene.chrome().focus();
    expect(scene.api().focusedValue).toBeNull();
    expect(scene.tab("activity").hasAttribute("data-focus-source")).toBe(false);
  });
});

describe("tabs — the keyboard, end to end", () => {
  it("moves along its own axis and claims only what it moved on", () => {
    const scene = render({ defaultValue: "overview" });
    scene.tab("overview").focus();

    const claimed = press(scene.tab("overview"), "ArrowRight");
    expect(document.activeElement).toBe(scene.tab("activity"));
    expect(claimed.defaultPrevented).toBe(true);

    // Off-axis: the page has to keep scrolling under a horizontal tab list.
    const ignored = press(scene.tab("activity"), "ArrowDown");
    expect(document.activeElement).toBe(scene.tab("activity"));
    expect(ignored.defaultPrevented).toBe(false);
  });

  it("mirrors the arrows in RTL", () => {
    const scene = render({ dir: "rtl", defaultValue: "activity" });
    scene.tab("activity").focus();

    press(scene.tab("activity"), "ArrowRight");
    expect(document.activeElement).toBe(scene.tab("overview"));

    press(scene.tab("overview"), "ArrowLeft");
    expect(document.activeElement).toBe(scene.tab("activity"));
  });

  it("runs down the column when it is vertical", () => {
    const scene = render({ orientation: "vertical", defaultValue: "overview" });
    scene.tab("overview").focus();

    press(scene.tab("overview"), "ArrowDown");
    expect(document.activeElement).toBe(scene.tab("activity"));

    // Left and right are the page's again, whichever way the list runs.
    expect(press(scene.tab("activity"), "ArrowRight").defaultPrevented).toBe(false);
  });

  it("goes to the ends on Home and End", () => {
    const scene = render({ defaultValue: "activity" });
    scene.tab("activity").focus();

    press(scene.tab("activity"), "End");
    expect(document.activeElement).toBe(scene.tab("settings"));

    press(scene.tab("settings"), "Home");
    expect(document.activeElement).toBe(scene.tab("overview"));
  });

  it("wraps at both ends, and stops at them when told not to", () => {
    const looping = render({ defaultValue: "settings" });
    looping.tab("settings").focus();
    press(looping.tab("settings"), "ArrowRight");
    expect(document.activeElement).toBe(looping.tab("overview"));

    press(looping.tab("overview"), "ArrowLeft");
    expect(document.activeElement).toBe(looping.tab("settings"));

    const bounded = render({ defaultValue: "settings", loopFocus: false }, THREE, { id: "t2" });
    bounded.tab("settings").focus();
    press(bounded.tab("settings"), "ArrowRight");
    expect(document.activeElement).toBe(bounded.tab("settings"));
  });

  it("steps over a disabled tab instead of landing on it", () => {
    const scene = render({ defaultValue: "overview" }, [
      OVERVIEW,
      { ...ACTIVITY, disabled: true },
      SETTINGS,
    ]);
    scene.tab("overview").focus();

    press(scene.tab("overview"), "ArrowRight");
    expect(document.activeElement).toBe(scene.tab("settings"));

    press(scene.tab("settings"), "Home");
    expect(document.activeElement).toBe(scene.tab("overview"));

    press(scene.tab("overview"), "End");
    expect(document.activeElement).toBe(scene.tab("settings"));
  });

  it("leaves Shift+arrow to whoever owns ranges", () => {
    const scene = render({ defaultValue: "overview" });
    scene.tab("overview").focus();

    press(scene.tab("overview"), "ArrowRight", { shiftKey: true });

    expect(document.activeElement).toBe(scene.tab("overview"));
  });
});

describe("tabs — the focus ring", () => {
  it("marks how the focus arrived, on the focused tab and on no other", () => {
    const scene = render({ defaultValue: "overview" });

    setInputModality(document, "keyboard");
    scene.tab("overview").focus();

    expect(scene.tab("overview").getAttribute("data-focus-source")).toBe("keyboard");
    expect(scene.tab("overview").getAttribute("data-focus-visible")).toBe("");
    expect(scene.tab("activity").hasAttribute("data-focus-source")).toBe(false);

    // An arrow is a real focus move, so the source is read again and the ring
    // travels with it.
    press(scene.tab("overview"), "ArrowRight");
    expect(scene.tab("activity").getAttribute("data-focus-visible")).toBe("");
    expect(scene.tab("overview").hasAttribute("data-focus-visible")).toBe(false);
  });

  it("draws no ring when the pointer put the focus there", () => {
    // The memory this test exists for: a programmatic `focus()` matches
    // `:focus-visible` on all three engines, so the defect is always the ring
    // that is *there* under a mouse, never the one that is missing.
    const scene = render({ defaultValue: "overview" });

    setInputModality(document, "pointer");
    scene.tab("activity").focus();
    scene.tab("activity").click();

    expect(scene.tab("activity").getAttribute("data-focus-source")).toBe("pointer");
    expect(scene.tab("activity").hasAttribute("data-focus-visible")).toBe(false);
  });

  it("holds the source it landed with when the modality moves on", () => {
    const scene = render({ defaultValue: "overview" });

    setInputModality(document, "keyboard");
    scene.tab("overview").focus();
    // Nothing was refocused: this is still the tab the keyboard reached.
    setInputModality(document, "pointer");

    expect(scene.tab("overview").getAttribute("data-focus-source")).toBe("keyboard");
    expect(scene.tab("overview").getAttribute("data-focus-visible")).toBe("");
  });
});

describe("tabs — the indicator", () => {
  it("lands on the selected tab, measured and not derived from an index", () => {
    // 60, 100 and 40 wide: no arithmetic on an index could place the third one.
    const scene = render({ defaultValue: "overview" });
    expectPillOn(scene, "overview");

    scene.tab("settings").click();
    expectPillOn(scene, "settings");
    expect(scene.list().style.getPropertyValue("--sui-indicator-size")).toBe("40px");
    expect(scene.list().style.getPropertyValue("--sui-indicator-offset")).toBe("160px");
  });

  it("follows an arrow as well as a click", () => {
    const scene = render({ defaultValue: "overview" });
    scene.tab("overview").focus();

    press(scene.tab("overview"), "ArrowRight");

    expectPillOn(scene, "activity");
  });

  it("places itself from the start edge in RTL, with no second rule", () => {
    const scene = render({ dir: "rtl", defaultValue: "activity" });

    expectPillOn(scene, "activity");
    // Logical, so the number is the same in both directions — which is the whole
    // reason the sheet consumes it as `inset-inline-start`.
    expect(scene.list().style.getPropertyValue("--sui-indicator-offset")).toBe("60px");
  });

  it("runs down the block axis when the list is vertical", () => {
    const scene = render({ orientation: "vertical", defaultValue: "activity" });

    expectPillOn(scene, "activity", "block");
    expect(scene.list().style.getPropertyValue("--sui-indicator-size")).toBe("50px");
  });

  it("stays on its tab in a scrolled track, in both directions", () => {
    for (const dir of ["ltr", "rtl"] as const) {
      const scene = render({ dir, defaultValue: "overview" }, THREE, {
        narrow: true,
        id: `t-${dir}`,
      });

      scene.tab("settings").click();

      // The regression this guards: the offset is measured against the list's
      // padding box with the scroll added back, and RTL counts that scroll down
      // from zero. Drop the sign and the pill sits 160px from its tab — in RTL
      // only, which is exactly how it would ship.
      expect(scene.list().scrollWidth).toBeGreaterThan(scene.list().clientWidth);
      expectPillOn(scene, "settings");
      unmountAll();
    }
  });

  it("does not travel for a first paint or a resize, and does for a choice", async () => {
    const scene = render({ defaultValue: "overview" });

    // A pill must not slide in from `inset-inline-start: 0` on page load.
    expect(scene.indicator().getAttribute("data-immediate")).toBe("");

    scene.tab("activity").click();
    expect(scene.indicator().hasAttribute("data-immediate")).toBe(false);
    expect(scene.indicator().hasAttribute("data-empty")).toBe(false);

    // A window that moved is not a selection either. The observer reports on its
    // own frame, so this is the one place the test has to wait.
    scene.tab("activity").style.inlineSize = "140px";
    await vi.waitFor(() => {
      expect(scene.indicator().getAttribute("data-immediate")).toBe("");
    });
    expectPillOn(scene, "activity");
  });

  it("is still on its tab once the document's fonts have settled", async () => {
    const scene = render({ defaultValue: "activity" });

    // The machine hangs a one-shot on `fonts.ready`, because a webfont arriving
    // after the first paint moves every tab and the pill has to follow without
    // playing a spring. What this can hold is the outcome and the flag — a
    // measurement that lands *after* the promise resolves and does not animate.
    // It cannot attribute that measurement to the one-shot rather than to the
    // resize observer, which sees the same page: the remeasure path itself is
    // what the resize test above pins, and the teardown suite proves this
    // particular promise is disarmed when the service stops.
    await document.fonts.ready;
    await observed();

    expectPillOn(scene, "activity");
    expect(scene.indicator().getAttribute("data-immediate")).toBe("");
  });

  it("has nothing to point at once the last tab is gone", async () => {
    const scene = render({ defaultValue: "overview" }, [OVERVIEW]);

    scene.tabs.length = 0;
    scene.settle();
    await observed();

    expect(scene.api().value).toBeNull();
    expect(scene.indicator().getAttribute("data-empty")).toBe("");
    expect(scene.list().style.getPropertyValue("--sui-active-index")).toBe("-1");
  });
});

describe("tabs — an overflowing bar", () => {
  it("brings the newly selected tab back into view", () => {
    const scene = render({ defaultValue: "overview" }, THREE, { narrow: true });
    expect(scene.list().scrollLeft).toBe(0);

    scene.tab("settings").click();

    const list = scene.list().getBoundingClientRect();
    const tab = scene.tab("settings").getBoundingClientRect();
    expect(scene.list().scrollLeft).toBeGreaterThan(0);
    expect(tab.right).toBeLessThanOrEqual(list.right + 1);
    expect(tab.left).toBeGreaterThanOrEqual(list.left - 1);
  });

  it("leaves the scroll alone when the consumer turned it off", () => {
    const scene = render({ defaultValue: "overview", scrollActiveIntoView: false }, THREE, {
      narrow: true,
    });

    scene.tab("settings").click();

    expect(scene.list().scrollLeft).toBe(0);
  });
});

describe("tabs — the panel", () => {
  it("takes a tab stop only when it holds nothing tabbable", () => {
    const scene = render({ defaultValue: "overview" }, [
      { ...OVERVIEW, panel: "<p>plain text</p>" },
      { ...ACTIVITY, panel: `<a href="#x">a link</a>` },
    ]);

    // Measured, not assumed: a panel of plain text is unreachable by keyboard
    // unless it takes a stop of its own.
    expect(scene.panel("overview").tabIndex).toBe(0);
    const stops = getTabbables(document.body);
    expect(stops.indexOf(scene.panel("overview"))).toBe(stops.indexOf(scene.tab("overview")) + 1);

    scene.tab("activity").click();

    // And a panel holding a link must not put an empty stop in front of it.
    expect(scene.panel("activity").hasAttribute("tabindex")).toBe(false);
    expect(getTabbables(document.body)).not.toContain(scene.panel("activity"));
  });

  it("names the tab that describes it, both ways round", () => {
    const scene = render({ defaultValue: "overview" });

    expect(scene.panel("overview").getAttribute("role")).toBe("tabpanel");
    expect(scene.panel("overview").getAttribute("aria-labelledby")).toBe(scene.tab("overview").id);
    expect(scene.tab("overview").getAttribute("aria-controls")).toBe(scene.panel("overview").id);
    expect(scene.panel("overview").getAttribute("data-state")).toBe("active");
    expect(scene.panel("activity").getAttribute("data-state")).toBe("inactive");
  });
});

describe("tabs — closing", () => {
  interface Closable {
    readonly scene: Scene;
    readonly onClose: (details: { value: string }) => void;
  }

  function closable(spec: readonly TabSpec[] = THREE): Closable {
    const onClose = vi.fn((details: { value: string }) => {
      const index = scene.tabs.findIndex((tab) => tab.value === details.value);
      if (index !== -1) scene.tabs.splice(index, 1);
    });
    const scene = render({ closable: true, defaultValue: "overview", onClose }, spec);
    return { scene, onClose };
  }

  it("asks the consumer to remove the tab, once, and moves to the next one", async () => {
    const { scene, onClose } = closable();
    scene.tab("overview").focus();

    scene.closer("overview").click();
    scene.settle();
    await observed();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ value: "overview" });
    expect(document.activeElement).toBe(scene.tab("activity"));
    // The closed tab was the selected one, so the selection follows the focus.
    expect(scene.api().value).toBe("activity");
    expect(scene.triggers()).toHaveLength(2);
  });

  it("moves the focus on from a close button that is about to disappear", async () => {
    const { scene } = closable();
    scene.closer("overview").focus();

    scene.closer("overview").click();
    scene.settle();
    await observed();

    // The close button goes with its tab, so the focus has to be sent somewhere
    // before it is: left alone it would fall to the body, which is the one place
    // a keyboard user cannot come back from.
    expect(document.activeElement).toBe(scene.tab("activity"));
  });

  it("falls back to the previous tab when there is no next one", async () => {
    const { scene } = closable();
    scene.tab("settings").focus();

    press(scene.tab("settings"), "Delete");
    scene.settle();
    await observed();

    expect(document.activeElement).toBe(scene.tab("activity"));
    expect(scene.api().value).toBe("activity");
  });

  it("closes on the middle button, the way every editor's tab bar does", async () => {
    const { scene, onClose } = closable();

    scene
      .tab("activity")
      .dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    scene.settle();
    await observed();

    expect(onClose).toHaveBeenCalledWith({ value: "activity" });
    // Closing a background tab leaves the selection where it was, and does not
    // pull the focus into the bar — a middle click is aimed at one tab, not at
    // the tab list, and in `automatic` mode a focus landing here would drag the
    // selection with it.
    expect(scene.api().value).toBe("overview");
    expect(document.activeElement).not.toBe(scene.tab("settings"));
  });

  it("leaves nothing selected once the last tab is closed", async () => {
    const { scene } = closable([OVERVIEW]);
    scene.tab("overview").focus();

    press(scene.tab("overview"), "Delete");
    scene.settle();
    await observed();

    expect(scene.api().value).toBeNull();
    expect(scene.triggers()).toHaveLength(0);
  });

  it("stays shut when the consumer never opened it", () => {
    const onClose = vi.fn();
    const scene = render({ defaultValue: "overview", onClose });

    press(scene.tab("overview"), "Delete");
    scene.tab("overview").dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the close button out of the tab order", () => {
    const { scene } = closable();

    expect(scene.closer("overview").tabIndex).toBe(-1);
    // One stop for the whole composite, and it is the selected tab. The keyboard
    // route to closing is `Delete`, per APG.
    expect(getTabbables(scene.list())).toEqual([scene.tab("overview")]);
  });
});

describe("tabs — the gamepad", () => {
  interface Pad {
    readonly scene: Scene;
    readonly bus: IntentBus;
    readonly seen: string[];
  }

  function withPad(
    props: TabsMachineProps = {},
    spec: readonly TabSpec[] = THREE,
    options: SceneOptions = {},
  ): Pad {
    const bus = createIntentBus();
    const seen: string[] = [];
    bus.pushScope((event) => {
      seen.push(event.intent);
      return false;
    });
    return { scene: render({ ...props, intents: bus }, spec, options), bus, seen };
  }

  it("steps the selection on the shoulder buttons, wrapping like the arrows do", () => {
    const { scene, bus } = withPad({ defaultValue: "overview" });
    scene.tab("overview").focus();

    expect(bus.dispatch({ intent: "tabNext", source: "gamepad" }).consumed).toBe(true);
    expect(scene.api().value).toBe("activity");
    expect(document.activeElement).toBe(scene.tab("activity"));

    bus.dispatch({ intent: "tabPrev", source: "gamepad" });
    expect(scene.api().value).toBe("overview");

    bus.dispatch({ intent: "tabPrev", source: "gamepad" });
    expect(scene.api().value).toBe("settings");
  });

  it("reaches in from anywhere in the root without stealing the focus", () => {
    const { scene, bus } = withPad({ defaultValue: "overview" }, THREE, { chrome: true });
    scene.chrome().focus();

    bus.dispatch({ intent: "tabNext", source: "gamepad" });

    expect(scene.api().value).toBe("activity");
    // A shoulder button pressed while somebody is reading must not tear them out
    // of what they were reading.
    expect(document.activeElement).toBe(scene.chrome());
  });

  it("answers nothing at all when the focus is elsewhere on the page", () => {
    const { scene, bus, seen } = withPad({ defaultValue: "overview" });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    const result = bus.dispatch({ intent: "tabNext", source: "gamepad" });

    expect(result.consumed).toBe(false);
    expect(seen).toEqual(["tabNext"]);
    expect(scene.api().value).toBe("overview");
    outside.remove();
  });

  it("lets the nested tab list win, whatever order the two mounted in", () => {
    // Mounted inner-first on purpose: React plays a child's effects before its
    // parent's, so a nested `tabs` pushes its scope *under* the one that
    // contains it and the stack would answer with the outer machine. The guard
    // reads the tree, which is the thing that is actually nested.
    const bus = createIntentBus();
    const inner = render({ intents: bus, defaultValue: "overview" }, THREE, { id: "inner" });
    const outer = render({ intents: bus, defaultValue: "overview" }, THREE, { id: "outer" });
    outer.panel("overview").append(inner.harness.host);

    inner.tab("overview").focus();
    bus.dispatch({ intent: "tabNext", source: "gamepad" });

    expect(inner.api().value).toBe("activity");
    expect(outer.api().value).toBe("overview");
  });

  it("never claims B — a tab list is not a layer", () => {
    const { scene, bus, seen } = withPad({ defaultValue: "overview" });
    scene.tab("overview").focus();

    const result = bus.dispatch({ intent: "back", source: "gamepad" });

    // A `tabs` that swallowed B would make a dialog containing tabs impossible
    // to leave.
    expect(result.consumed).toBe(false);
    expect(seen).toEqual(["back"]);
  });

  it("never claims a direction either", () => {
    const { scene, bus, seen } = withPad({ defaultValue: "overview" });
    scene.tab("overview").focus();

    // The scope is deliberately not `trapped`: a trapping scope answers
    // `consumed` to everything it declines, and the spatial engine is at the
    // bottom of the stack — so a trapping tab list would make its own panel
    // unreachable to a d-pad.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(seen).toEqual(["moveDown"]);
    expect(scene.list().getAttribute("data-snav")).toBe("container");
  });

  it("gives its scope back when it is destroyed", () => {
    const { scene, bus } = withPad({ defaultValue: "overview" });
    expect(bus.depth()).toBe(2);

    scene.harness.destroy();

    expect(bus.depth()).toBe(1);
  });
});

describe("tabs — teardown", () => {
  it("stops watching the list once it is gone", async () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    const scene = render({ defaultValue: "overview" });
    const list = scene.list();

    scene.harness.destroy();
    // The observers are disconnected and the `fonts.ready` one-shot is disarmed.
    // Either one still live would `send` into a stopped service — the library's
    // only leak detector, and not something a teardown may spend.
    list.append(document.createElement("button"));
    await document.fonts.ready;
    await observed();

    expect(warnings).toEqual([]);
    spy.mockRestore();
  });
});

describe("tabs — the drawn bar", () => {
  it("shows the bar and places the thumb while the list scrolls", async () => {
    const harness = mountMachine<TabsSchema, Api>({
      machine,
      connect,
      html: `<style>[data-part~="tabs:list"]{display:flex;inline-size:120px;overflow:auto hidden;scrollbar-width:none}[data-part~="tabs:trigger"]{flex:none;inline-size:100px}</style><div><div><span></span>${THREE.map(() => "<button></button>").join("")}</div><div><div></div></div></div>`,
      id: "t9",
      props: { defaultValue: THREE[0]?.value ?? "" },
      paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
        const root = host.children[1] as HTMLElement;
        const list = root.children[0] as HTMLElement;
        const bar = root.children[1] as HTMLElement;
        apply(root, api.getRootProps());
        apply(list, api.getListProps());
        apply(list.children[0] as Element, api.getIndicatorProps());
        THREE.forEach((tab, index) => {
          apply(list.children[index + 1] as Element, api.getTriggerProps({ value: tab.value }));
        });
        apply(bar, api.getScrollbarProps());
        apply(bar.children[0] as Element, api.getThumbProps());
      },
    });
    const list = harness.part("list");
    const bar = harness.part("scrollbar");
    const thumb = harness.part("thumb");

    await vi.waitFor(() => expect(list.hasAttribute("data-scroll-inline")).toBe(true));
    await vi.waitFor(() => expect(bar.getAttribute("data-state")).toBe("visible"));
    expect(thumb.style.getPropertyValue("--sui-scroll-thumb-length")).not.toBe("");

    list.scrollLeft = 100;
    await vi.waitFor(() =>
      expect(thumb.style.getPropertyValue("--sui-scroll-thumb-offset")).not.toBe("0px"),
    );
  });
});
