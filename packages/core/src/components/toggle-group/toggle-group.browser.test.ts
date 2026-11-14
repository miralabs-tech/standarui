import { setInputModality } from "@standarx/nav";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./toggle-group.connect";
import { machine } from "./toggle-group.machine";
import type {
  ToggleGroupApi,
  ToggleGroupMachineProps,
  ToggleGroupSchema,
} from "./toggle-group.types";

type Api = ToggleGroupApi<DomPropTypes>;

const VALUES = ["day", "week", "month"] as const;

function render(props: ToggleGroupMachineProps = {}, disabledValue?: string) {
  return mountMachine<ToggleGroupSchema, Api>({
    machine,
    connect,
    html: `<div><span></span><span></span>${VALUES.map(() => "<button></button>").join("")}</div>`,
    id: "g1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getLabelProps());
      apply(root.children[1] as Element, api.getIndicatorProps());
      VALUES.forEach((value, index) => {
        apply(
          root.children[index + 2] as Element,
          api.getItemProps({ value, disabled: value === disabledValue }),
        );
      });
    },
  });
}

function items(harness: ReturnType<typeof render>): HTMLButtonElement[] {
  return [...harness.host.querySelectorAll<HTMLButtonElement>('[data-part~="toggle-group:item"]')];
}

afterEach(() => {
  unmountAll();
});

describe("toggle-group — single selection", () => {
  it("is a radio group, because that is the pattern single selection has", () => {
    const harness = render({ defaultValue: ["week"] });
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("radiogroup");
    expect(items(harness)[1]?.getAttribute("role")).toBe("radio");
    expect(items(harness)[1]?.getAttribute("aria-checked")).toBe("true");
    expect(items(harness)[0]?.getAttribute("aria-checked")).toBe("false");
    expect(items(harness)[0]?.hasAttribute("aria-pressed")).toBe(false);
  });

  it("marks how focus arrived, on the focused item and on no other", () => {
    const harness = render({ defaultValue: ["day"] });
    const [first, second] = items(harness);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    first?.focus();

    expect(first?.getAttribute("data-focus-source")).toBe("keyboard");
    // The composite has one focus; an attribute on every segment describes
    // nothing, and the ring would be drawn three times.
    expect(second?.hasAttribute("data-focus-source")).toBe(false);

    // An arrow is a real focus move, so the source is taken again — and the
    // ring travels with it.
    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(second?.getAttribute("data-focus-source")).toBe("keyboard");
    expect(second?.getAttribute("data-focus-visible")).toBe("");
    expect(first?.hasAttribute("data-focus-source")).toBe(false);
  });

  it("keeps the ring on the focused item when the pointer takes over", () => {
    const harness = render({ defaultValue: ["day"] });
    const [first] = items(harness);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    first?.focus();
    expect(first?.getAttribute("data-focus-visible")).toBe("");

    // Nothing refocused: this item is still the one the keyboard reached.
    setInputModality(document, "pointer");

    expect(first?.getAttribute("data-focus-source")).toBe("keyboard");
    expect(first?.getAttribute("data-focus-visible")).toBe("");
  });

  it("has something to point at once an item is selected, read from the DOM", () => {
    const harness = render({ defaultValue: ["month"] });

    expect(harness.part("indicator").hasAttribute("data-empty")).toBe(false);
  });

  it("has nothing to point at when nothing is selected", () => {
    const harness = render();

    expect(harness.part("indicator").getAttribute("data-empty")).toBe("");
  });

  it("selects on click and reports the new value", () => {
    const onValueChange = vi.fn();
    const harness = render({ onValueChange });

    items(harness)[1]?.click();

    expect(onValueChange).toHaveBeenCalledWith({ value: ["week"] });
    expect(items(harness)[1]?.getAttribute("data-state")).toBe("on");
  });

  it("keeps exactly one tab stop, on the selected item", () => {
    const harness = render({ defaultValue: ["week"] });

    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("puts the tab stop on the first item when nothing is selected", () => {
    const harness = render();

    expect(items(harness).map((item) => item.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves and selects on the arrow keys, which is what a radio group does", () => {
    const onValueChange = vi.fn();
    const harness = render({ defaultValue: ["day"], onValueChange });
    const list = items(harness);
    list[0]?.focus();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    list[0]?.dispatchEvent(event);

    expect(document.activeElement).toBe(list[1]);
    expect(onValueChange).toHaveBeenCalledWith({ value: ["week"] });
    // Claimed, so the page does not scroll under the composite.
    expect(event.defaultPrevented).toBe(true);
  });

  it("mirrors the arrows in RTL", () => {
    const harness = render({ dir: "rtl", defaultValue: ["week"] });
    const list = items(harness);
    list[1]?.focus();

    list[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(document.activeElement).toBe(list[0]);
  });

  it("wraps, and steps over a disabled item", () => {
    const harness = render({ defaultValue: ["day"] }, "week");
    const list = items(harness);
    list[0]?.focus();

    list[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(list[2]);

    list[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(list[0]);
  });

  it("goes to the ends on Home and End", () => {
    const harness = render();
    const list = items(harness);
    list[1]?.focus();

    list[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(list[2]);

    list[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(list[0]);
  });

  it("leaves Shift+arrow alone — it belongs to range selection", () => {
    const harness = render();
    const list = items(harness);
    list[0]?.focus();

    list[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );

    expect(document.activeElement).toBe(list[0]);
  });

  it("answers both axes, because a radio group does", () => {
    const harness = render({ defaultValue: ["day"] });
    const list = items(harness);
    list[0]?.focus();

    // APG is explicit: Right *or* Down moves to and checks the next radio,
    // whatever the orientation. Only the multiple-selection group is restricted
    // to its own axis.
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    list[0]?.dispatchEvent(event);

    expect(document.activeElement).toBe(list[1]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps a selection once one is made — a radio group has no deselect", () => {
    const harness = render({ defaultValue: ["day"] });

    items(harness)[0]?.click();

    expect(harness.api().value).toEqual(["day"]);
  });

  it("clears only when the consumer opted into a nullable control", () => {
    const harness = render({ defaultValue: ["day"], deselectable: true });

    items(harness)[0]?.click();

    expect(harness.api().value).toEqual([]);
  });

  it("never parks the tab stop on a disabled item", () => {
    // Nothing selected, first item disabled: if the only tabindex=0 lands on a
    // disabled button the browser skips it and the whole composite falls out of
    // the tab order.
    const harness = render({}, "day");

    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("does not park it there when the disabled item is the selected one either", () => {
    const harness = render({ defaultValue: ["day"] }, "day");
    const tabbable = items(harness).filter((item) => item.tabIndex === 0);

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.disabled).toBe(false);
  });

  it("names itself through its label part, once one is rendered", () => {
    const harness = render();

    expect(harness.part("root").getAttribute("aria-labelledby")).toBe("toggle-group:g1:label");
    expect(harness.part("label").id).toBe("toggle-group:g1:label");
  });
});

describe("toggle-group — multiple selection", () => {
  it("is a group of pressed buttons, not a radio group", () => {
    const harness = render({ multiple: true, defaultValue: ["day", "month"] });

    expect(harness.part("root").getAttribute("role")).toBe("group");
    expect(items(harness)[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(items(harness)[1]?.getAttribute("aria-pressed")).toBe("false");
    expect(items(harness)[0]?.hasAttribute("role")).toBe(false);
  });

  it("adds and removes without touching the others", () => {
    const harness = render({ multiple: true, defaultValue: ["day"] });

    items(harness)[2]?.click();
    expect(harness.api().value).toEqual(["day", "month"]);

    items(harness)[0]?.click();
    expect(harness.api().value).toEqual(["month"]);
  });

  it("moves without selecting on the arrow keys", () => {
    const onValueChange = vi.fn();
    const harness = render({ multiple: true, onValueChange });
    const list = items(harness);
    list[0]?.focus();

    list[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(document.activeElement).toBe(list[1]);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("toggle-group — disabled", () => {
  it("refuses every path when the group is disabled", () => {
    const onValueChange = vi.fn();
    const harness = render({ disabled: true, onValueChange });
    const list = items(harness);

    expect(list[0]?.disabled).toBe(true);
    list[0]?.click();
    list[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

/**
 * The geometry the shipped sheet gives these parts in `"content"` sizing, reduced
 * to the declarations under test: auto columns sized by the label, and a pill
 * placed only by the two custom properties the machine measured. The label text
 * and the heights differ from segment to segment, so no arithmetic on an index
 * could place the pill and a failure here is the machine's rather than a font's.
 */
const CONTENT_SHEET = `
  [data-slot="seg"] { position: relative; display: inline-grid; grid-auto-flow: column;
    grid-auto-columns: auto; gap: 4px; padding: 2px; margin: 0; font: 12px/1 monospace; }
  [data-slot="seg"][data-orientation="vertical"] { grid-auto-flow: row; }
  [data-slot="seg"] > button { margin: 0; padding: 0 6px; border: 0; font: inherit; }
  [data-slot="seg"] > button:nth-of-type(1) { block-size: 20px; }
  [data-slot="seg"] > button:nth-of-type(2) { block-size: 32px; }
  [data-slot="seg"] > button:nth-of-type(3) { block-size: 14px; }
  [data-slot="seg"] > [data-part~="toggle-group:indicator"] { position: absolute;
    inset-block: 2px; inset-inline-start: var(--sui-indicator-offset, 0);
    inline-size: var(--sui-indicator-size, 0); }
  [data-slot="seg"][data-orientation="vertical"] > [data-part~="toggle-group:indicator"] {
    inset-block: var(--sui-indicator-offset, 0) auto; inset-inline: 2px;
    inline-size: auto; block-size: var(--sui-indicator-size, 0); }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CONTENT_SHEET;
  document.head.append(style);
});

function renderContent(props: ToggleGroupMachineProps = {}) {
  return mountMachine<ToggleGroupSchema, Api>({
    machine,
    connect,
    html: `<div data-slot="seg"><span>Range</span><span></span><button>Day</button><button>Week</button><button>Month</button></div>`,
    id: "g2",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getLabelProps());
      apply(root.children[1] as Element, api.getIndicatorProps());
      VALUES.forEach((value, index) => {
        apply(root.children[index + 2] as Element, api.getItemProps({ value }));
      });
    },
  });
}

/**
 * Layout boxes are whole pixels, so the pill is within a pixel of its segment and
 * not exactly on it; what a transform or a stale number would cost is far more.
 */
function near(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

function expectPillOn(
  harness: ReturnType<typeof renderContent>,
  value: string,
  axis: "horizontal" | "vertical" = "horizontal",
): void {
  const pill = harness.part("indicator").getBoundingClientRect();
  const item = harness.host
    .querySelector(`[data-part~="toggle-group:item"][data-value="${value}"]`)
    ?.getBoundingClientRect();
  if (item === undefined) throw new Error(`the scene has no item ${value}`);

  if (axis === "vertical") {
    near(pill.top, item.top);
    near(pill.height, item.height);
    return;
  }
  near(pill.left, item.left);
  near(pill.width, item.width);
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function immediate(harness: ReturnType<typeof renderContent>): boolean {
  return harness.part("indicator").hasAttribute("data-immediate");
}

describe("toggle-group — sizing", () => {
  it("measures the default sizing too, and marks nothing for it", async () => {
    const harness = renderContent({ defaultValue: ["day"] });
    items(harness)[2]?.click();
    await frame();

    const root = harness.part("root");
    const month = items(harness)[2];
    if (month === undefined) throw new Error("the scene has no third item");
    expect(root.hasAttribute("data-sizing")).toBe(false);
    expect(Number.parseFloat(root.style.getPropertyValue("--sui-indicator-offset"))).toBeCloseTo(
      month.getBoundingClientRect().left - root.getBoundingClientRect().left - root.clientLeft,
      1,
    );
    expect(Number.parseFloat(root.style.getPropertyValue("--sui-indicator-size"))).toBeCloseTo(
      month.getBoundingClientRect().width,
      1,
    );
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expectPillOn(harness, "month");
  });

  it("follows a label edited in place in the default sizing", async () => {
    const harness = renderContent({ defaultValue: ["week"] });
    await frame();
    const day = items(harness)[0];
    if (day === undefined) throw new Error("the scene has no first item");

    day.style.paddingInline = "60px";
    await frame();

    expectPillOn(harness, "week");
  });

  it("measures again once the web fonts are ready, which no observer reports", async () => {
    const OriginalObserver = window.ResizeObserver;
    const original = Object.getOwnPropertyDescriptor(document, "fonts");
    let loaded: VoidFunction = () => {};
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    Object.defineProperty(document, "fonts", { configurable: true, get: () => ({ ready }) });
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    try {
      const harness = renderContent({ defaultValue: ["week"] });
      await frame();
      const day = items(harness)[0];
      const week = items(harness)[1];
      if (day === undefined || week === undefined) throw new Error("the scene has no items");

      day.style.paddingInline = "60px";
      await frame();
      const pill = harness.part("indicator").getBoundingClientRect();
      expect(Math.abs(pill.left - week.getBoundingClientRect().left)).toBeGreaterThan(20);

      loaded();
      await ready;
      await frame();
      expectPillOn(harness, "week");
    } finally {
      window.ResizeObserver = OriginalObserver;
      if (original === undefined) Reflect.deleteProperty(document, "fonts");
      else Object.defineProperty(document, "fonts", original);
    }
  });

  it("lands the pill on the active segment, whatever its label measures", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["week"] });

    expect(harness.part("root").getAttribute("data-sizing")).toBe("content");
    expect(harness.part("indicator").hasAttribute("data-empty")).toBe(false);
    expectPillOn(harness, "week");
  });

  it("lands it in RTL, where the offset is counted from the right edge", () => {
    const harness = renderContent({ sizing: "content", dir: "rtl", defaultValue: ["month"] });

    expectPillOn(harness, "month");
    expect(harness.part("indicator").getBoundingClientRect().left).toBeLessThan(
      items(harness)[0]?.getBoundingClientRect().left ?? 0,
    );
  });

  it("lands it on the block axis when vertical", () => {
    const harness = renderContent({
      sizing: "content",
      orientation: "vertical",
      defaultValue: ["month"],
    });

    expectPillOn(harness, "month", "vertical");
  });

  it("snaps for a first paint, and travels for a choice", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    expect(immediate(harness)).toBe(true);

    items(harness)[2]?.click();

    expect(immediate(harness)).toBe(false);
    expectPillOn(harness, "month");
  });

  it("does not let the observers' first delivery cancel a travel in flight", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });

    items(harness)[1]?.click();
    await frame();

    expect(immediate(harness)).toBe(false);
    expectPillOn(harness, "week");
  });

  it("snaps rather than travels from an empty selection", () => {
    const harness = renderContent({ sizing: "content" });
    expect(harness.part("indicator").getAttribute("data-empty")).toBe("");

    items(harness)[1]?.click();

    expect(immediate(harness)).toBe(true);
    expect(harness.part("indicator").hasAttribute("data-empty")).toBe(false);
    expectPillOn(harness, "week");
  });

  it("follows a controlled value change as a choice", async () => {
    const harness = renderContent({ sizing: "content", value: ["day"] });
    await frame();

    harness.setProps({ value: ["month"] });

    expect(immediate(harness)).toBe(false);
    expectPillOn(harness, "month");
  });

  it("snaps when a label is edited in place, in a root whose own box does not move", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["week"] });
    harness.part("root").style.inlineSize = "300px";
    await frame();

    items(harness)[0]?.click();
    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);
    const before = harness.part("indicator").getBoundingClientRect().left;

    // A characterData mutation: no child list changes, and the fixed root keeps
    // its size while the stretched columns redistribute.
    (items(harness)[0]?.firstChild as Text).nodeValue = "Day of the month";

    await vi.waitFor(() => {
      expect(harness.part("indicator").getBoundingClientRect().left).not.toBeCloseTo(before, 1);
    });
    expectPillOn(harness, "week");
    expect(immediate(harness)).toBe(true);
  });

  it("snaps when the root is resized", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    harness.part("root").style.inlineSize = "300px";
    await frame();

    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    harness.part("root").style.inlineSize = "360px";

    await vi.waitFor(() => {
      expect(immediate(harness)).toBe(true);
    });
    expectPillOn(harness, "week");
  });

  it("snaps when only the root moves the segments, which resize nothing", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    const root = harness.part("root");
    root.style.boxSizing = "border-box";
    root.style.inlineSize = "300px";
    root.style.justifyContent = "start";
    await frame();

    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    root.style.paddingInlineStart = "20px";

    await vi.waitFor(() => {
      expect(immediate(harness)).toBe(true);
    });
    expectPillOn(harness, "week");
  });

  it("settles when a child mutation moves the segments and resizes nothing", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    const root = harness.part("root");
    root.style.boxSizing = "border-box";
    root.style.inlineSize = "300px";
    root.style.justifyContent = "start";
    await frame();

    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    const spacer = document.createElement("span");
    spacer.textContent = "A wider spacer";
    spacer.style.order = "-1";
    root.append(spacer);

    // One microtask, before any frame: the observers of the segments' own boxes
    // have nothing to report here, and the mutation is what `ITEMS.SYNC` answers.
    await Promise.resolve();

    expect(immediate(harness)).toBe(true);
    expectPillOn(harness, "week");
  });

  it("does not let a child mutation that moves nothing cancel a travel in flight", async () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    await frame();

    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    const hidden = document.createElement("span");
    hidden.hidden = true;
    harness.part("root").append(hidden);
    await frame();

    expect(immediate(harness)).toBe(false);
    expectPillOn(harness, "week");
  });

  it("lands rather than springs when switched back to the default sizing", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    harness.setProps({ sizing: "equal" });

    expect(immediate(harness)).toBe(true);
    expect(harness.part("root").hasAttribute("data-sizing")).toBe(false);
    expectPillOn(harness, "week");
  });

  it("settles rather than travels when a default group's axis flips", () => {
    const harness = renderContent({ defaultValue: ["day"] });
    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    harness.setProps({ orientation: "vertical" });

    expect(immediate(harness)).toBe(true);
  });

  it("creates the indicator observers for a default group, and no more when the sizing changes", async () => {
    const Original = window.ResizeObserver;
    let created = 0;
    window.ResizeObserver = class extends Original {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        created += 1;
      }
    };

    try {
      const harness = renderContent({ defaultValue: ["day"] });
      await frame();
      // The scroll edge tracker's, on the root, then the indicator's: the root and
      // each of the three segments.
      expect(created).toBe(5);

      harness.setProps({ sizing: "content" });
      expect(created).toBe(5);
    } finally {
      window.ResizeObserver = Original;
    }
  });

  it("keeps measuring after a switch from the default sizing at runtime", () => {
    const harness = renderContent({ defaultValue: ["day"] });
    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    harness.setProps({ sizing: "content" });

    expect(harness.part("root").getAttribute("data-sizing")).toBe("content");
    expect(immediate(harness)).toBe(true);
    expectPillOn(harness, "week");
  });

  it("snaps on a second switch to content, though a measured offset is still held", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    items(harness)[1]?.click();
    harness.setProps({ sizing: "equal" });
    items(harness)[2]?.click();
    expect(immediate(harness)).toBe(false);

    harness.setProps({ sizing: "content" });

    expect(immediate(harness)).toBe(true);
    expectPillOn(harness, "month");
  });

  it("settles rather than travels when the axis flips", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["month"] });
    items(harness)[1]?.click();
    items(harness)[2]?.click();
    expect(immediate(harness)).toBe(false);

    harness.setProps({ orientation: "vertical" });

    expect(immediate(harness)).toBe(true);
  });

  it("snaps rather than travels when a deselectable choice is cleared", () => {
    const harness = renderContent({ sizing: "content", deselectable: true, defaultValue: ["day"] });
    items(harness)[1]?.click();
    expect(immediate(harness)).toBe(false);

    items(harness)[1]?.click();

    expect(harness.part("indicator").getAttribute("data-empty")).toBe("");
    expect(immediate(harness)).toBe(true);
  });

  it("measures the layout box of a segment that is scaled while it is chosen", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    const target = items(harness)[2];
    if (target === undefined) throw new Error("the segment did not render");
    // What `:active` does to the item the pointer is holding, held still.
    target.style.scale = "0.5";

    target.click();

    const root = harness.part("root").getBoundingClientRect();
    const pill = harness.part("indicator").getBoundingClientRect();
    near(pill.left, root.left + target.offsetLeft);
    near(pill.width, target.offsetWidth);
    expect(target.getBoundingClientRect().width).toBeLessThan(target.offsetWidth * 0.6);
  });

  it("measures in CSS pixels when an ancestor is scaled, as a dialog is while it enters", () => {
    const harness = renderContent({ sizing: "content", defaultValue: ["day"] });
    harness.host.style.scale = "0.5";
    harness.host.style.transformOrigin = "0 0";

    items(harness)[1]?.click();

    expectPillOn(harness, "week");
  });

  it("has nothing to point at in multiple selection", () => {
    const harness = renderContent({
      sizing: "content",
      multiple: true,
      defaultValue: ["day", "month"],
    });

    expect(harness.part("indicator").getAttribute("data-empty")).toBe("");
    expect(harness.part("root").style.getPropertyValue("--sui-indicator-size")).toBe("");
  });

  it("keeps the keyboard where it was", () => {
    const onValueChange = vi.fn();
    const harness = renderContent({ sizing: "content", defaultValue: ["day"], onValueChange });
    const list = items(harness);
    list[0]?.focus();

    list[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(document.activeElement).toBe(list[1]);
    expect(onValueChange).toHaveBeenCalledWith({ value: ["week"] });
    expectPillOn(harness, "week");
  });
});

describe("toggle-group — the drawn bar", () => {
  function renderFrame(): ReturnType<typeof mountMachine<ToggleGroupSchema, Api>> {
    return mountMachine<ToggleGroupSchema, Api>({
      machine,
      connect,
      html: `<style>[data-part~="toggle-group:root"]{display:flex;inline-size:120px;overflow:auto hidden;scrollbar-width:none}[data-part~="toggle-group:item"]{flex:none;inline-size:100px}</style><div><div><span></span>${VALUES.map(() => "<button></button>").join("")}</div><div><div></div></div></div>`,
      id: "g1",
      props: { defaultValue: ["day"] },
      paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
        const frame = host.children[1] as HTMLElement;
        const root = frame.children[0] as HTMLElement;
        const bar = frame.children[1] as HTMLElement;
        apply(frame, api.getFrameProps());
        apply(root, api.getRootProps());
        apply(root.children[0] as Element, api.getIndicatorProps());
        VALUES.forEach((value, index) => {
          apply(root.children[index + 1] as Element, api.getItemProps({ value }));
        });
        apply(bar, api.getScrollbarProps());
        apply(bar.children[0] as Element, api.getThumbProps());
      },
    });
  }

  it("shows the bar and places the thumb while the root scrolls", async () => {
    const harness = renderFrame();
    const bar = harness.part("scrollbar");
    const thumb = harness.part("thumb");
    const root = harness.part("root");

    await vi.waitFor(() => expect(root.hasAttribute("data-scroll-inline")).toBe(true));
    await vi.waitFor(() => expect(bar.getAttribute("data-state")).toBe("visible"));
    expect(thumb.style.getPropertyValue("--sui-scroll-thumb-length")).not.toBe("");

    root.scrollLeft = 100;
    await vi.waitFor(() =>
      expect(thumb.style.getPropertyValue("--sui-scroll-thumb-offset")).not.toBe("0px"),
    );
  });

  it("stops following the root once the machine stops", async () => {
    const harness = renderFrame();
    const bar = harness.part("scrollbar");
    const root = harness.part("root");
    await vi.waitFor(() => expect(bar.getAttribute("data-state")).toBe("visible"));

    harness.service.stop();
    root.style.inlineSize = "1000px";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(bar.getAttribute("data-state")).toBe("visible");
  });
});
