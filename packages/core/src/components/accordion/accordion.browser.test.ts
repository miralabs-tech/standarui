/**
 * `accordion` against a real engine, with no framework in the room.
 *
 * Most of this machine cannot be faked. The header order, where an arrow key
 * lands, whether a nested accordion's headers belong to its parent, and above all
 * *when* a closed panel is allowed to take `hidden` are all read back from a live
 * document, and a node test could only assert what a stub was told to answer.
 *
 * **One measurement is deliberately proved on the other side of the fence.** The
 * reference reactivity runs its trackers *before* its listeners (see the head of
 * `reactivity.ts`), so in this harness `syncCollapses` sees the DOM of the render
 * before the one that caused it. On a close that is exactly right — the panel is
 * still open, so `scrollHeight` is the height the exit has to travel, and this
 * file asserts it. On an open it is one pass early: the panel still carries
 * `hidden`, the user agent's own `[hidden] { display: none }` is in force, and
 * `scrollHeight` reads 0. That is the harness's ordering and not the machine's —
 * `tabs.browser.test.ts` states the same limit for the same reason — so the open
 * measurement is asserted in `@standarui/react`, which owns the "DOM before
 * watch" order the hard rules require of an adapter.
 *
 * The exit is never asserted with a timer. No stylesheet is loaded here, so the
 * close animation does not exist and the presence completes on the very next
 * frame; anything but `waitFor` is a race webkit loses.
 */

import { getTabbables, setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ApplyProps,
  type DomPropTypes,
  type MachineHarness,
  mountMachine,
  unmountAll,
} from "../harness";
import { connect } from "./accordion.connect";
import { machine } from "./accordion.machine";
import type { AccordionApi, AccordionMachineProps, AccordionSchema } from "./accordion.types";

type Api = AccordionApi<DomPropTypes>;

interface ItemSpec {
  readonly value: string;
  readonly disabled?: boolean;
}

const THREE: readonly ItemSpec[] = [{ value: "general" }, { value: "billing" }, { value: "team" }];

/**
 * A hand-written accordion inside a panel — no second machine, because what is
 * under test is the *filter*, not a second instance. `getTriggerEls` keeps only
 * the headers whose nearest `accordion:root` is this one; without that, the outer
 * machine's `End` would land on somebody else's last header.
 */
const NESTED = `<div data-scope="accordion" data-part="accordion:root" data-slot="nested-root">
  <button type="button" data-scope="accordion" data-part="accordion:trigger"
          data-value="nested" data-slot="nested-trigger">nested</button>
  <div data-scope="accordion" data-part="accordion:content" data-value="nested"
       data-slot="nested-content" hidden="until-found">the nested panel</div>
</div>`;

interface SceneOptions {
  readonly items?: readonly ItemSpec[];
  readonly nested?: boolean;
  readonly id?: string;
}

function markup(items: readonly ItemSpec[], nested: boolean): string {
  const blocks = items.map(
    (item) => `
      <div data-slot="item" data-item="${item.value}">
        <h3 data-slot="header" data-item="${item.value}">
          <button data-slot="trigger" data-item="${item.value}">
            <span data-slot="indicator" data-item="${item.value}"></span>
            ${item.value}
          </button>
        </h3>
        <div data-slot="content" data-item="${item.value}">
          <div data-slot="body" data-item="${item.value}">
            <p>The ${item.value} panel, long enough to have a height of its own.</p>
            <a href="#${item.value}">${item.value} link</a>
            ${nested && item.value === "billing" ? NESTED : ""}
          </div>
        </div>
      </div>`,
  );
  return `<div data-slot="root">${blocks.join("")}</div>`;
}

interface Scene {
  readonly harness: MachineHarness<AccordionSchema, Api>;
  api(): Api;
  settle(next?: AccordionMachineProps): void;
  root(): HTMLElement;
  item(value: string): HTMLElement;
  trigger(value: string): HTMLButtonElement;
  indicator(value: string): HTMLElement;
  content(value: string): HTMLElement;
  body(value: string): HTMLElement;
  nestedTrigger(): HTMLButtonElement;
  nestedContent(): HTMLElement;
}

function render(props: AccordionMachineProps = {}, options: SceneOptions = {}): Scene {
  const items = options.items ?? THREE;

  const harness = mountMachine<AccordionSchema, Api>({
    machine,
    connect,
    html: markup(items, options.nested === true),
    id: options.id ?? "a1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const at = (slot: string, value?: string): HTMLElement => {
        const selector =
          value === undefined
            ? `[data-slot="${slot}"]`
            : `[data-slot="${slot}"][data-item="${value}"]`;
        const node = host.querySelector<HTMLElement>(selector);
        if (node === null) throw new Error(`the scene has no ${selector}`);
        return node;
      };

      apply(at("root"), api.getRootProps());
      for (const item of items) {
        const { value, disabled } = item;
        apply(at("item", value), api.getItemProps({ value, disabled }));
        apply(at("header", value), api.getHeaderProps({ value, disabled }));
        apply(at("trigger", value), api.getTriggerProps({ value, disabled }));
        apply(at("indicator", value), api.getIndicatorProps({ value, disabled }));
        apply(at("content", value), api.getContentProps({ value }));
        apply(at("body", value), api.getBodyProps({ value }));
      }
    },
  });

  const query = <T extends HTMLElement>(selector: string): T => {
    const node = harness.host.querySelector<T>(selector);
    if (node === null) throw new Error(`the scene has no ${selector}`);
    return node;
  };
  const slot = <T extends HTMLElement>(name: string, value: string): T =>
    query<T>(`[data-slot="${name}"][data-item="${value}"]`);

  return {
    harness,
    api: (): Api => harness.api(),
    settle: (next: AccordionMachineProps = {}): void => harness.setProps(next),
    root: (): HTMLElement => query('[data-slot="root"]'),
    item: (value: string): HTMLElement => slot("item", value),
    trigger: (value: string): HTMLButtonElement => slot<HTMLButtonElement>("trigger", value),
    indicator: (value: string): HTMLElement => slot("indicator", value),
    content: (value: string): HTMLElement => slot("content", value),
    body: (value: string): HTMLElement => slot("body", value),
    nestedTrigger: (): HTMLButtonElement =>
      query<HTMLButtonElement>('[data-slot="nested-trigger"]'),
    nestedContent: (): HTMLElement => query('[data-slot="nested-content"]'),
  };
}

function press(node: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

/** What find-in-page fires just before it reveals the text it landed on. */
function beforematch(node: Element): void {
  node.dispatchEvent(new Event("beforematch", { bubbles: true, composed: true }));
}

function heightVar(node: HTMLElement): number {
  return Number.parseFloat(node.style.getPropertyValue("--sui-collapse-height"));
}

afterEach(() => {
  unmountAll();
  setInputModality(document, "pointer");
});

describe("accordion — opening and closing", () => {
  it("honours the default it was given, and hides everything else", () => {
    const scene = render({ defaultValue: ["billing"] });

    expect(scene.api().value).toEqual(["billing"]);
    expect(scene.content("billing").hasAttribute("hidden")).toBe(false);
    expect(scene.content("general").getAttribute("hidden")).toBe("");
    expect(scene.trigger("billing").getAttribute("aria-expanded")).toBe("true");
    expect(scene.trigger("general").getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on a press, and every part says so", () => {
    const scene = render();

    scene.trigger("general").click();

    expect(scene.content("general").hasAttribute("hidden")).toBe(false);
    expect(scene.trigger("general").getAttribute("aria-expanded")).toBe("true");
    for (const node of [
      scene.item("general"),
      scene.trigger("general"),
      scene.indicator("general"),
      scene.content("general"),
      scene.body("general"),
    ]) {
      expect(node.getAttribute("data-state")).toBe("open");
    }
  });

  it("defers `hidden` until the exit is over, and measures the height it travels", async () => {
    const scene = render({ defaultValue: ["general"] });
    const content = scene.content("general");
    const opened = content.getBoundingClientRect().height;
    expect(opened).toBeGreaterThan(0);

    scene.trigger("general").click();

    // The close is announced immediately — that is what starts the animation —
    // and the panel is still in the layout, because `hidden` is `display: none`
    // and would cancel the very animation it is waiting for.
    expect(content.getAttribute("data-state")).toBe("closed");
    expect(content.hasAttribute("hidden")).toBe(false);
    // Measured on the panel as it stood open, which is the distance the exit has
    // to cover. `--sui-collapse-height` is what the keyframes interpolate to.
    // `scrollHeight` is an integer, so a pixel of rounding is expected and named
    // rather than papered over.
    expect(heightVar(content)).toBeGreaterThan(0);
    expect(Math.abs(heightVar(content) - opened)).toBeLessThanOrEqual(1);

    await vi.waitFor(() => {
      expect(content.getAttribute("hidden")).toBe("");
    });
    expect(content.getAttribute("data-state")).toBe("closed");
  });

  it("makes a leaving panel inert and gives it back on the way in (R132)", async () => {
    const scene = render({ defaultValue: ["general"] });
    const content = scene.content("general");
    expect(content.hasAttribute("inert")).toBe(false);

    scene.trigger("general").click();
    expect(content.hasAttribute("hidden")).toBe(false);
    expect(content.hasAttribute("inert")).toBe(true);

    // At rest `hidden` takes over, and `inert` goes: it would hide the panel
    // from find-in-page.
    await vi.waitFor(() => {
      expect(content.hasAttribute("hidden")).toBe(true);
    });
    expect(content.hasAttribute("inert")).toBe(false);

    scene.trigger("general").click();
    expect(content.hasAttribute("inert")).toBe(false);

    // Re-opened mid-exit: the attribute leaves with the exit.
    scene.trigger("general").click();
    expect(content.hasAttribute("inert")).toBe(true);
    scene.trigger("general").click();
    expect(content.hasAttribute("inert")).toBe(false);
  });

  it("keeps one panel at a time, and lets the open one close", async () => {
    const scene = render({ defaultValue: ["general"] });

    scene.trigger("billing").click();
    expect(scene.api().value).toEqual(["billing"]);
    await vi.waitFor(() => {
      expect(scene.content("general").hasAttribute("hidden")).toBe(true);
    });

    scene.trigger("billing").click();
    expect(scene.api().value).toEqual([]);
  });

  it("refuses to close the last panel when the consumer asked it to", () => {
    // Radix's default, and this library's opt-in: the `<details>` this component
    // replaces close freely, so `deselectable` starts true.
    const scene = render({ defaultValue: ["general"], deselectable: false });

    scene.trigger("general").click();

    expect(scene.api().value).toEqual(["general"]);
    expect(scene.trigger("general").getAttribute("aria-expanded")).toBe("true");
  });

  it("opens panels independently in multiple mode", () => {
    const scene = render({ multiple: true, defaultValue: ["general"] });

    scene.trigger("team").click();
    expect(scene.api().value).toEqual(["general", "team"]);

    // `deselectable` is ignored here: several panels open means any of them may
    // close, whatever the prop says.
    scene.trigger("general").click();
    expect(scene.api().value).toEqual(["team"]);
  });

  it("reports a controlled value without writing it", () => {
    const onValueChange = vi.fn();
    const scene = render({ value: ["general"], onValueChange });

    scene.trigger("billing").click();

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toEqual({ value: ["billing"] });
    expect(scene.api().value).toEqual(["general"]);
    expect(scene.content("general").hasAttribute("hidden")).toBe(false);
  });

  it("says nothing when the same values arrive in another order", () => {
    const onValueChange = vi.fn();
    const scene = render({ multiple: true, value: ["general", "team"], onValueChange });

    scene.settle({ value: ["team", "general"] });

    // Order is not meaning. A group that reported a change here would loop
    // against a consumer that normalises its own array.
    expect(onValueChange).not.toHaveBeenCalled();
    expect(scene.content("general").hasAttribute("hidden")).toBe(false);
    expect(scene.content("team").hasAttribute("hidden")).toBe(false);
  });

  it("takes a value from the api, past the rule that governs a press", () => {
    const scene = render({ defaultValue: ["general"], deselectable: false });

    scene.api().close("general");
    expect(scene.api().value).toEqual([]);

    scene.api().open("team");
    expect(scene.api().value).toEqual(["team"]);

    scene.api().setValue(["billing"]);
    expect(scene.api().value).toEqual(["billing"]);
  });
});

describe("accordion — the keyboard", () => {
  it("answers Enter and Space with nothing of its own", () => {
    // A real `<button>` turns both into a click, and `TRIGGER.TOGGLE` is not
    // idempotent — a handler here would toggle the panel twice for one press.
    // What is provable in a synthetic dispatch is the absence of that second
    // path: the keys reach the machine through the browser's click or not at all.
    const onValueChange = vi.fn();
    const scene = render({ onValueChange });
    const trigger = scene.trigger("general");

    press(trigger, "Enter");
    trigger.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(onValueChange).not.toHaveBeenCalled();

    trigger.click();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("walks the headers with the vertical arrows and wraps at the ends", () => {
    const scene = render();
    scene.trigger("general").focus();

    press(scene.trigger("general"), "ArrowDown");
    expect(document.activeElement).toBe(scene.trigger("billing"));

    press(scene.trigger("billing"), "ArrowUp");
    expect(document.activeElement).toBe(scene.trigger("general"));

    press(scene.trigger("general"), "ArrowUp");
    expect(document.activeElement).toBe(scene.trigger("team"));
  });

  it("stops at the ends when the loop is off", () => {
    const scene = render({ loopFocus: false });
    scene.trigger("general").focus();

    press(scene.trigger("general"), "ArrowUp");
    expect(document.activeElement).toBe(scene.trigger("general"));
  });

  it("jumps to the first and last activable header", () => {
    const scene = render(
      {},
      { items: [{ value: "general" }, { value: "billing" }, { value: "team", disabled: true }] },
    );
    scene.trigger("general").focus();

    press(scene.trigger("general"), "End");
    expect(document.activeElement).toBe(scene.trigger("billing"));

    press(scene.trigger("billing"), "Home");
    expect(document.activeElement).toBe(scene.trigger("general"));
  });

  it("steps over a disabled header instead of parking on it", () => {
    const scene = render(
      {},
      { items: [{ value: "general" }, { value: "billing", disabled: true }, { value: "team" }] },
    );
    scene.trigger("general").focus();

    press(scene.trigger("general"), "ArrowDown");
    expect(document.activeElement).toBe(scene.trigger("team"));
  });

  it("leaves the horizontal arrows to the browser", () => {
    const scene = render();

    expect(press(scene.trigger("general"), "ArrowLeft").defaultPrevented).toBe(false);
    expect(press(scene.trigger("general"), "ArrowRight").defaultPrevented).toBe(false);
  });

  it("keeps every header in the tab order, and the open panel with them", () => {
    // No roving here, unlike a tab list: APG makes every accordion header a stop,
    // and a panel that is open is ordinary flow content the user tabs through.
    const scene = render({ defaultValue: ["general"] });
    const stops = getTabbables(scene.root());

    expect(stops).toContain(scene.trigger("general"));
    expect(stops).toContain(scene.trigger("billing"));
    expect(stops).toContain(scene.trigger("team"));
    expect(stops).toContain(scene.body("general").querySelector("a"));
    // A closed panel is `hidden`, so nothing inside it is reachable.
    expect(stops).not.toContain(scene.body("billing").querySelector("a"));
  });

  it("owns its own headers and none of a nested accordion's", () => {
    const scene = render({ defaultValue: ["billing"] }, { nested: true });
    scene.trigger("billing").focus();

    press(scene.trigger("billing"), "ArrowDown");

    // The nested trigger sits between them in DOM order; a bare query would have
    // walked straight into it.
    expect(document.activeElement).toBe(scene.trigger("team"));
    expect(document.activeElement).not.toBe(scene.nestedTrigger());
  });
});

describe("accordion — focus and modality", () => {
  it("rings a header the keyboard reached, and not one a pointer did", () => {
    const scene = render();

    setInputModality(document, "keyboard");
    scene.trigger("general").focus();
    expect(scene.trigger("general").getAttribute("data-focus-visible")).toBe("");
    expect(scene.trigger("general").getAttribute("data-focus-source")).toBe("keyboard");

    scene.trigger("general").blur();
    setInputModality(document, "pointer");
    scene.trigger("general").focus();
    // A programmatic `focus()` matches `:focus-visible` on all three engines, so
    // the ring cannot ride on that pseudo-class: it rides on the modality the
    // focus arrived under, which is the only thing that knows the difference.
    expect(scene.trigger("general").hasAttribute("data-focus-visible")).toBe(false);
    expect(scene.trigger("general").getAttribute("data-focus-source")).toBe("pointer");
  });

  it("names the focused header only", () => {
    const scene = render();
    setInputModality(document, "keyboard");

    scene.trigger("billing").focus();

    expect(scene.api().focusedValue).toBe("billing");
    expect(scene.trigger("general").hasAttribute("data-focus-source")).toBe(false);

    scene.trigger("billing").blur();
    expect(scene.api().focusedValue).toBeNull();
  });
});

describe("accordion — disabled", () => {
  it("declines every event while the group is disabled", () => {
    const onValueChange = vi.fn();
    const scene = render({ disabled: true, onValueChange });
    scene.trigger("general").focus();
    const focused = document.activeElement;

    scene.harness.service.send({ type: "TRIGGER.TOGGLE", value: "general" });
    scene.harness.service.send({ type: "TRIGGER.NAVIGATE", action: "next", value: "general" });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(scene.api().value).toEqual([]);
    expect(document.activeElement).toBe(focused);
  });

  it("still answers the api, which is the consumer's own hand", () => {
    const scene = render({ disabled: true });

    scene.api().setValue(["team"]);

    expect(scene.api().value).toEqual(["team"]);
  });
});

describe("accordion — find-in-page", () => {
  it("asks for `until-found` only when the consumer opted in", () => {
    expect(render().content("general").getAttribute("hidden")).toBe("");
    expect(
      render({ hiddenUntilFound: true }, { id: "a2" }).content("general").getAttribute("hidden"),
    ).toBe("until-found");
  });

  it("opens the panel the browser is about to reveal, without animating it", () => {
    const onValueChange = vi.fn();
    const scene = render({ hiddenUntilFound: true, onValueChange });

    // The real find-in-page is not scriptable; the event it fires is.
    beforematch(scene.content("billing"));

    expect(scene.api().value).toEqual(["billing"]);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    // The browser is already scrolling to the text. A 350ms expansion under that
    // scroll would move the very line it is taking the reader to.
    expect(scene.content("billing").getAttribute("data-immediate")).toBe("");
    expect(scene.content("general").hasAttribute("data-immediate")).toBe(false);
  });

  it("says nothing twice for a panel that is already open", () => {
    const onValueChange = vi.fn();
    const scene = render({ hiddenUntilFound: true, defaultValue: ["billing"], onValueChange });

    beforematch(scene.content("billing"));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(scene.api().value).toEqual(["billing"]);
  });

  it("declines a disabled item, and a nested accordion's panel", () => {
    const onValueChange = vi.fn();
    const scene = render(
      { hiddenUntilFound: true, defaultValue: ["billing"], onValueChange },
      {
        items: [{ value: "general" }, { value: "billing" }, { value: "team", disabled: true }],
        nested: true,
      },
    );

    beforematch(scene.content("team"));
    expect(onValueChange).not.toHaveBeenCalled();

    // `beforematch` is delegated on the root and reaches a child accordion's
    // panels too; only this root's own are answered.
    beforematch(scene.nestedContent());
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("accordion — the first paint", () => {
  it("does not animate a panel nobody opened", () => {
    // Seeded before the first `connect`, so the attribute is on the very first
    // painted markup rather than being released by an effect an adapter may or
    // may not re-render after.
    const scene = render({ defaultValue: ["general"] });

    expect(scene.content("general").getAttribute("data-immediate")).toBe("");
    // A closed panel needs no gate: it is `hidden`, and the sheet keys the exit
    // animation on the absence of that attribute.
    expect(scene.content("billing").hasAttribute("data-immediate")).toBe(false);

    scene.trigger("billing").click();

    expect(scene.content("billing").hasAttribute("data-immediate")).toBe(false);
    // The panel this press closed animates out, however it was revealed.
    expect(scene.content("general").hasAttribute("data-immediate")).toBe(false);
  });

  it("animates a panel find-in-page revealed once it is chosen again", () => {
    const scene = render({ hiddenUntilFound: true, multiple: true });

    beforematch(scene.content("billing"));
    expect(scene.content("billing").getAttribute("data-immediate")).toBe("");

    scene.trigger("billing").click();
    expect(scene.content("billing").hasAttribute("data-immediate")).toBe(false);
  });
});

describe("accordion — teardown", () => {
  it("gives every collapse back, and the leak detector can still see one", () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    const scene = render({ defaultValue: ["general"] });

    scene.harness.destroy();
    // The witness: forty assertions of "nothing screamed" are worth nothing
    // unless one of them proves a scream would be heard.
    scene.harness.service.send({ type: "TRIGGER.TOGGLE", value: "general" });

    // The prefix is part of the witness: `invariant.ts` puts `[standarui] ` on
    // every warning it emits, so an assertion without it would pass only against
    // a warning that came from somewhere else.
    expect(warnings).toEqual([
      '[standarui] event "TRIGGER.TOGGLE" was sent after the service stopped',
    ]);
    spy.mockRestore();
  });

  it("stops answering a `beforematch` once it is gone", () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    const scene = render({ hiddenUntilFound: true });
    const content = scene.content("billing");

    scene.harness.destroy();
    beforematch(content);

    expect(warnings).toEqual([]);
    spy.mockRestore();
  });
});
