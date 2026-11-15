import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createInputSystem,
  createIntentBus,
  type InputSystem,
  type IntentBus,
  spatialPlugin,
} from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./radio-group.connect";
import { machine } from "./radio-group.machine";
import type { RadioGroupApi, RadioGroupMachineProps, RadioGroupSchema } from "./radio-group.types";

type Api = RadioGroupApi<DomPropTypes>;

const VALUES = ["small", "medium", "large"] as const;

/**
 * The geometry the shipped sheet gives these parts, reduced to the declarations
 * under test: the root positions the highlight, and the highlight is placed by
 * the two custom properties the machine measured. Row heights are explicit and
 * all different, so no arithmetic on an index could place them and a failure
 * here is the machine's rather than a font's.
 */
const SHEET = `
  [data-slot="track"] { position: relative; display: grid; gap: 6px; inline-size: 200px;
    margin: 0; padding: 0; border: 0; font: 12px/1 monospace; }
  [data-slot="track"] > * { margin: 0; padding: 0; border: 0; }
  [data-slot="track"] > label:nth-of-type(1) { block-size: 24px; }
  [data-slot="track"] > label:nth-of-type(2) { block-size: 40px; }
  [data-slot="track"] > label:nth-of-type(3) { block-size: 16px; }
  [data-slot="separator"] { block-size: 1px; }
  [data-slot="indicator"] { position: absolute; inset-inline: 0;
    inset-block-start: var(--sui-indicator-offset, 0);
    block-size: var(--sui-indicator-size, 0); }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

/**
 * `id` is a parameter because the scope id is what `getById` resolves against,
 * and two scenes sharing one id make every machine but the first read the other
 * scene's root — a test that mounts two groups then measures the wrong one, and
 * passes while doing it.
 */
function render(props: RadioGroupMachineProps = {}, disabledValue?: string, id = "r1") {
  return mountMachine<RadioGroupSchema, Api>({
    machine,
    connect,
    html: `<div><span></span>${VALUES.map(
      () => "<label><input /><span></span><span></span></label>",
    ).join("")}</div>`,
    id,
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getLabelProps());
      VALUES.forEach((value, index) => {
        const itemProps = { value, disabled: value === disabledValue };
        const item = root.children[index + 1] as HTMLElement;
        apply(item, api.getItemProps(itemProps));
        apply(item.children[0] as Element, api.getItemHiddenInputProps(itemProps));
        apply(item.children[1] as Element, api.getItemControlProps(itemProps));
        apply(item.children[2] as Element, api.getItemTextProps(itemProps));
      });
    },
  });
}

/**
 * The shape `apps/docs/demos/radio-group-basic.tsx` ships: a label, the
 * highlight, a separator entry and three items — six children in the track for
 * an item count of three, which is the shape the old `100% / itemCount`
 * arithmetic could never place. `data-motion="none"` because the offset travels
 * on a spring, and a rect read while one is playing comes back part-way there.
 */
function renderList(props: RadioGroupMachineProps = {}) {
  return mountMachine<RadioGroupSchema, Api>({
    machine,
    connect,
    html: `<div data-slot="track" data-motion="none">
        <span data-slot="label"></span>
        <span data-slot="indicator"></span>
        <div data-slot="separator" role="separator"></div>
        ${VALUES.map(() => "<label><input /><span></span><span></span></label>").join("")}
      </div>`,
    id: "r2",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      apply(root.children[0] as Element, api.getLabelProps());
      apply(root.children[1] as Element, api.getIndicatorProps());
      VALUES.forEach((value, index) => {
        const itemProps = { value };
        const item = root.children[index + 3] as HTMLElement;
        apply(item, api.getItemProps(itemProps));
        apply(item.children[0] as Element, api.getItemHiddenInputProps(itemProps));
        apply(item.children[1] as Element, api.getItemControlProps(itemProps));
        apply(item.children[2] as Element, api.getItemTextProps(itemProps));
      });
    },
  });
}

/**
 * The assertion the whole highlight story reduces to: the element the sheet
 * places from `--sui-indicator-offset` / `--sui-indicator-size` lands exactly
 * on the checked item. Stated in engine coordinates rather than in expected
 * numbers, so it holds whatever the rows measure.
 */
function expectHighlightOn(harness: ReturnType<typeof renderList>, value: string): void {
  const pill = harness.part("indicator").getBoundingClientRect();
  const item = harness.host
    .querySelector(`[data-part~="radio-group:item"][data-value="${value}"]`)
    ?.getBoundingClientRect();
  if (item === undefined) throw new Error(`the scene has no item ${value}`);

  expect(pill.top).toBeCloseTo(item.top, 1);
  expect(pill.height).toBeCloseTo(item.height, 1);
}

/** Two rendering opportunities: what a `ResizeObserver` reports on. */
function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function inputs(harness: ReturnType<typeof render>): HTMLInputElement[] {
  return [
    ...harness.host.querySelectorAll<HTMLInputElement>(
      '[data-part~="radio-group:item-hidden-input"]',
    ),
  ];
}

afterEach(() => {
  unmountAll();
});

describe("radio-group", () => {
  it("is a radiogroup of real radios sharing one name", () => {
    const harness = render();
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("radiogroup");
    expect(root.getAttribute("aria-labelledby")).toBe("radio-group:r1:label");

    const names = new Set(inputs(harness).map((input) => input.name));
    expect(names.size).toBe(1);
    // Derived from the scope id, so two groups on one page never merge.
    expect([...names][0]).toBe("radio-group:r1:root");
  });

  it("takes the name it is given", () => {
    const harness = render({ name: "size" });

    expect(inputs(harness)[0]?.name).toBe("size");
  });

  it("checks the selected radio and nothing else", () => {
    const harness = render({ defaultValue: "medium" });

    expect(inputs(harness).map((input) => input.checked)).toEqual([false, true, false]);
    expect(harness.host.querySelectorAll('[data-state="checked"]').length).toBeGreaterThan(0);
  });

  it("selects from the input's own change event", () => {
    const onValueChange = vi.fn();
    const harness = render({ onValueChange });

    inputs(harness)[2]?.click();

    expect(onValueChange).toHaveBeenCalledWith({ value: "large" });
    expect(harness.api().value).toBe("large");
  });

  it("lands the indicator on the checked item, in a track that also holds a label and a separator", () => {
    const harness = renderList({ defaultValue: "large" });

    // Six children for three items, rows of three different heights: the number
    // the machine posts is a measurement or it is nothing.
    expectHighlightOn(harness, "large");
  });

  it("moves the indicator with the selection", () => {
    const harness = renderList({ defaultValue: "small" });

    expectHighlightOn(harness, "small");
    inputs(harness)[1]?.click();
    expectHighlightOn(harness, "medium");
  });

  it("does not let the observer cancel the spring a choice armed", async () => {
    const harness = renderList({ defaultValue: "small" });

    inputs(harness)[1]?.click();
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);

    // A `ResizeObserver` delivers the size it was armed with at the first
    // rendering opportunity, which lands here — after the choice. Taken as a
    // layout event it lowers `data-immediate` mid-flight, and the highlight
    // jumps to its destination instead of travelling to it.
    await frame();

    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expectHighlightOn(harness, "medium");
  });

  it("has nowhere to put the indicator when nothing is selected", () => {
    const harness = renderList();

    expect(harness.part("root").style.getPropertyValue("--sui-indicator-offset")).toBe("");
    expect(harness.part("indicator").getAttribute("data-empty")).toBe("");
  });

  it("does not travel for a first paint or a resize, and does for a choice", async () => {
    const harness = renderList({ defaultValue: "small" });

    // The highlight must not slide in from `inset-block-start: 0` on page load.
    expect(harness.part("indicator").getAttribute("data-immediate")).toBe("");

    inputs(harness)[2]?.click();
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expect(harness.part("indicator").hasAttribute("data-empty")).toBe(false);

    // A layout that moved is not a selection either. Spent on the gap and not
    // on the root's width: the offset is `item.top - root.top` in a vertical
    // track, so a root that grows sideways moves nothing and would leave the
    // highlight exactly where it was — a remeasure the machine is right to call
    // a non-event. The observer reports on its own frame, so this is the one
    // place the test has to wait.
    harness.part("root").style.gap = "24px";
    await vi.waitFor(() => {
      expect(harness.part("indicator").getAttribute("data-immediate")).toBe("");
    });
    expectHighlightOn(harness, "large");
  });

  it("settles rather than travels when the track is reshaped after a choice", () => {
    const harness = renderList({ defaultValue: "small" });

    inputs(harness)[2]?.click();
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);

    // An orientation flip is a layout, not a second choice — but the service
    // keeps the last *delivered* event (`machine/service.ts:98`), so an action
    // reached from `watch` still reads `ITEM.SELECT` here, minutes after the
    // click if need be. A guard written against the event type cannot see the
    // difference; only the watch can, by tracking the two halves apart. This is
    // the assertion that holds it to that. Geometry is left out on purpose: the
    // sheet this scene installs places the vertical axis only.
    harness.setProps({ orientation: "horizontal" });

    expect(harness.part("indicator").getAttribute("data-immediate")).toBe("");
  });

  /**
   * The two arms of the same cause. A controlled group changes its value through
   * the prop, which is the first track of the watch — a choice, and a choice is
   * the one thing allowed to travel. Neither arm clicks that value into place, so
   * the only thing separating them is which event the service happens to be
   * holding when `syncIndicator` reads `event.type`.
   */
  it("travels for a controlled value change after the observer reported", async () => {
    const harness = renderList({ value: "small" });

    // The observer's first delivery lands here and becomes the last *delivered*
    // event, so the guard inside `syncIndicator` is now reading a vestige that
    // has nothing to do with the change about to happen.
    await frame();
    harness.setProps({ value: "large" });

    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expectHighlightOn(harness, "large");
  });

  it("travels for a controlled value change after a click, from the very same cause", async () => {
    const harness = renderList({ value: "small" });
    await frame();

    // A click on a controlled group cannot move the value — the prop pins it —
    // but it does deliver `ITEM.SELECT`. The prop change that follows is the
    // identical cause to the arm above; only the vestige differs.
    inputs(harness)[2]?.click();
    harness.setProps({ value: "large" });

    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expectHighlightOn(harness, "large");
  });

  it("lands rather than travels when a group that emptied fills again", async () => {
    const harness = renderList({ value: "large" });
    await frame();

    // The deselection is itself a value change, and the pill still had an offset
    // to leave — so it arms. What arms has to come down with the offset it was
    // armed for, or the next choice travels up from `inset-block-start: 0`,
    // which is the one thing `data-immediate` exists to prevent. A latch that
    // only ever refuses to rise is not a latch.
    harness.setProps({ value: null });
    harness.setProps({ value: "large" });

    expect(harness.part("indicator").getAttribute("data-immediate")).toBe("");
    expectHighlightOn(harness, "large");
  });

  it("does not let an unrelated child mutation cancel a travel in flight", async () => {
    const harness = renderList({ defaultValue: "small" });
    await frame();

    inputs(harness)[2]?.click();
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);

    // `observeChildren` watches `subtree: true`, so any node a consumer swaps
    // anywhere under the root sends `ITEMS.SYNC` — a `renderOption` that renders
    // from its own state does it on every keystroke. The rows have explicit
    // heights here, so this one moves nothing, and a remeasure that finds the
    // box where it already was may not settle a choice still travelling.
    harness.host
      .querySelector('[data-part~="radio-group:item"][data-value="small"]')
      ?.append(document.createElement("span"));
    await frame();

    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);
    expectHighlightOn(harness, "large");
  });

  it("settles when a child mutation does move the rows", async () => {
    const harness = renderList({ defaultValue: "small" });
    await frame();

    inputs(harness)[2]?.click();
    expect(harness.part("indicator").hasAttribute("data-immediate")).toBe(false);

    // The other half of the previous test, and the reason `ITEMS.SYNC` judges on
    // the geometry rather than settling outright: a mutation that really does
    // move the rows is a layout, and a layout has to *be* where it belongs.
    //
    // Swapping the separator for a `label` rather than inserting one: the scene
    // paints its parts by child index, so anything that shifts them repaints the
    // wrong nodes. A replacement keeps every index and still moves the rows,
    // because the sheet sizes them by `nth-of-type` and the items all slide one
    // along. The item list is untouched, so this reaches the machine through
    // `ITEMS.SYNC` alone and not through the watch.
    harness.part("root").children[2]?.replaceWith(document.createElement("label"));

    await vi.waitFor(() => {
      expect(harness.part("indicator").getAttribute("data-immediate")).toBe("");
    });
    expectHighlightOn(harness, "large");
  });

  it("makes the checked radio the one tab stop", () => {
    const harness = render({ defaultValue: "medium" });
    const list = inputs(harness);

    expect(list.map((input) => input.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    list[1]?.focus();
    expect(document.activeElement).toBe(list[1]);
  });

  it("makes the first radio the tab stop when nothing is checked", () => {
    const harness = render();

    expect(inputs(harness).map((input) => input.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
  });

  it("skips a disabled radio, checked or first, for the tab stop", () => {
    const first = render({}, "small", "r1");
    const checked = render({ defaultValue: "medium" }, "medium", "r3");

    expect(inputs(first).map((input) => input.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(inputs(checked).map((input) => input.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
  });

  it("moves the tab stop with the focus, then the value, and drops it when disabled", () => {
    const harness = render({ defaultValue: "small" });
    const list = inputs(harness);

    list[2]?.focus();
    expect(list.map((input) => input.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);

    list[2]?.blur();
    expect(list.map((input) => input.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    list[1]?.click();
    expect(list.map((input) => input.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);

    harness.setProps({ disabled: true });
    expect(list.every((input) => input.getAttribute("tabindex") !== "0")).toBe(true);
  });

  it("refuses to change while read-only, and says so", () => {
    const onValueChange = vi.fn();
    const harness = render({ readOnly: true, defaultValue: "small", onValueChange });

    // On the group, not on the radios: ARIA 1.2 allows `aria-readonly` on
    // `radiogroup` only, and a radio carrying it fails `aria-allowed-attr`.
    expect(harness.part("root").getAttribute("aria-readonly")).toBe("true");
    expect(inputs(harness).some((input) => input.hasAttribute("aria-readonly"))).toBe(false);

    harness.api().setValue("large");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(harness.api().value).toBe("small");
  });

  it("disables one item without disabling the group", () => {
    const harness = render({}, "medium");

    expect(inputs(harness).map((input) => input.disabled)).toEqual([false, true, false]);
    expect(harness.part("root").hasAttribute("data-disabled")).toBe(false);
  });

  it("carries invalid and required onto the group and its inputs", () => {
    const harness = render({ invalid: true, required: true });

    expect(harness.part("root").getAttribute("aria-invalid")).toBe("true");
    expect(harness.part("root").getAttribute("aria-required")).toBe("true");
    expect(inputs(harness)[0]?.required).toBe(true);
  });

  it("reports without writing while controlled", () => {
    const onValueChange = vi.fn();
    const harness = render({ value: "small", onValueChange });

    inputs(harness)[1]?.click();

    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
    expect(harness.api().value).toBe("small");

    harness.setProps({ value: "medium" });
    expect(harness.api().value).toBe("medium");
  });
});

/**
 * Every road onto a radio that does not check it: read-only arrows, the pad
 * through the spatial engine, a programmatic `focus()`. The stop has to be
 * where the focus is, or Tab and Shift+Tab land on the old stop inside the
 * group instead of leaving it.
 */
describe("radio-group tab stop, on a radio reached without checking it", () => {
  let system: InputSystem | null = null;

  afterEach(() => {
    system?.destroy();
    system = null;
  });

  function renderBetween(props: RadioGroupMachineProps = {}) {
    return mountMachine<RadioGroupSchema, Api>({
      machine,
      connect,
      html: `<button type="button">Before</button><div data-slot="track">${VALUES.map(
        () => "<label><input /><span></span><span></span></label>",
      ).join("")}</div><button type="button">After</button>`,
      id: "tab1",
      props,
      paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
        const root = host.children[1] as HTMLElement;
        apply(root, api.getRootProps());
        VALUES.forEach((value, index) => {
          const itemProps = { value };
          const item = root.children[index] as HTMLElement;
          apply(item, api.getItemProps(itemProps));
          apply(item.children[0] as Element, api.getItemHiddenInputProps(itemProps));
          apply(item.children[1] as Element, api.getItemControlProps(itemProps));
          apply(item.children[2] as Element, api.getItemTextProps(itemProps));
        });
      },
    });
  }

  function where(): string {
    const active = document.activeElement;
    return active instanceof HTMLInputElement ? active.value : (active?.textContent ?? "");
  }

  async function press(keys: string): Promise<string> {
    // The window's focus first, as `realKey` takes it in the React harness (R81).
    if (!document.hasFocus()) window.focus();
    await userEvent.keyboard(keys);
    await frame();
    return where();
  }

  function button(harness: ReturnType<typeof renderBetween>, label: string): HTMLElement {
    const found = [...harness.host.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    );
    if (found === undefined) throw new Error(`no button ${label}`);
    return found;
  }

  it("leaves on Shift+Tab after a read-only ArrowDown", async () => {
    const harness = renderBetween({ readOnly: true });
    button(harness, "Before").focus();

    expect(await press("{Tab}")).toBe("small");
    expect(await press("{ArrowDown}")).toBe("medium");
    expect(harness.api().value).toBe(null);
    expect(await press("{Shift>}{Tab}{/Shift}")).toBe("Before");
  });

  it("leaves on Tab after a read-only ArrowUp off the checked radio", async () => {
    const harness = renderBetween({ readOnly: true, defaultValue: "large" });
    button(harness, "Before").focus();

    expect(await press("{Tab}")).toBe("large");
    expect(await press("{ArrowUp}")).toBe("medium");
    expect(harness.api().value).toBe("large");
    expect(await press("{Tab}")).toBe("After");
  });

  it("leaves on Shift+Tab after a read-only d-pad move through the spatial engine", async () => {
    system = createInputSystem({ plugins: [spatialPlugin()] });
    const harness = renderBetween({ readOnly: true, intents: system });
    button(harness, "Before").focus();

    expect(await press("{Tab}")).toBe("small");
    system.emit({ intent: "moveDown", source: "gamepad" });
    await frame();
    expect(where()).toBe("medium");
    expect(harness.api().value).toBe(null);
    expect(await press("{Shift>}{Tab}{/Shift}")).toBe("Before");
  });

  it("leaves on Shift+Tab after a programmatic focus past the first radio", async () => {
    const harness = renderBetween();
    inputs(harness)[2]?.focus();
    await frame();

    expect(await press("{Shift>}{Tab}{/Shift}")).toBe("Before");
  });

  it("leaves on Tab after a programmatic focus before the checked radio", async () => {
    const harness = renderBetween({ defaultValue: "large" });
    inputs(harness)[0]?.focus();
    await frame();

    expect(await press("{Tab}")).toBe("After");
    expect(harness.api().value).toBe("large");
  });
});

/**
 * The d-pad, which reaches a radio group by a road the arrow keys never take.
 * An arrow key is the browser's: it moves the focus and checks what it landed on,
 * in one step nothing here arranges. A pad has no such privilege — its intent
 * reaches the spatial engine, which moves the real focus and nothing else — so
 * the group has to claim the move itself or the two inputs disagree.
 */
describe("radio-group on a d-pad", () => {
  let scenes = 0;

  function withPad(
    props: RadioGroupMachineProps = {},
    disabledValue?: string,
  ): { harness: ReturnType<typeof render>; bus: IntentBus } {
    const bus = createIntentBus();
    // One id per scene: two of these are mounted side by side below, and the
    // machine reads its own root back by id.
    scenes += 1;
    const harness = render({ intents: bus, ...props }, disabledValue, `pad${scenes}`);
    return { harness, bus };
  }

  it("moves and checks, exactly as the arrows do", () => {
    const { harness, bus } = withPad();
    const list = inputs(harness);
    list[0]?.focus();
    expect(harness.api().value).toBe(null);

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);

    // Both halves asserted, because the defect was exactly one of them: the pad
    // used to carry the focus down and leave the checked radio behind it.
    expect(document.activeElement).toBe(list[1]);
    expect(harness.api().value).toBe("medium");
  });

  it("steps over a disabled item, as the native arrows do", () => {
    const { harness, bus } = withPad({}, "medium");
    const list = inputs(harness);
    list[0]?.focus();

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(document.activeElement).toBe(list[2]);
    expect(harness.api().value).toBe("large");
  });

  it("hands the move back at the end of the group, so the d-pad can walk out", () => {
    const { harness, bus } = withPad();
    const list = inputs(harness);
    list[2]?.focus();

    // Declined, not swallowed: the spatial engine at the bottom of the stack is
    // what carries the focus out of the group. The arrows wrap instead, because
    // their way out is Tab — and a pad has no Tab.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(document.activeElement).toBe(list[2]);
    expect(harness.api().value).toBe(null);
  });

  it("never claims the axis it does not lay out on", () => {
    const vertical = withPad();
    inputs(vertical.harness)[0]?.focus();

    // A sideways press leaves the group rather than being swallowed by it.
    expect(vertical.bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(false);
    expect(vertical.harness.api().value).toBe(null);

    const horizontal = withPad({ orientation: "horizontal" });
    inputs(horizontal.harness)[0]?.focus();

    expect(horizontal.bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(horizontal.bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(true);
    expect(horizontal.harness.api().value).toBe("medium");
  });

  it("follows the resolved direction, so RTL reverses the pad as it reverses the arrows", () => {
    const { harness, bus } = withPad({ orientation: "horizontal", dir: "rtl" });
    inputs(harness)[1]?.focus();

    expect(bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(true);
    expect(harness.api().value).toBe("small");
  });

  it("never claims Home or End, which do nothing to a native radio group", () => {
    const { harness, bus } = withPad();
    inputs(harness)[0]?.focus();

    // The divergence read backwards: a pad that could jump to an end the arrows
    // cannot reach is no more the same control than one that failed to check.
    expect(bus.dispatch({ intent: "home", source: "gamepad" }).consumed).toBe(false);
    expect(bus.dispatch({ intent: "end", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().value).toBe(null);
  });

  it("never claims the keyboard, whose arrows the browser already serves", () => {
    const { harness, bus } = withPad();
    inputs(harness)[0]?.focus();

    // Consuming would `preventDefault` the very key that moves and checks:
    // `@standarx/nav`, `input-system.ts` suppresses the native default for a claimed intent.
    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" }).consumed).toBe(false);
    expect(harness.api().value).toBe(null);
  });

  /**
   * R16. `"native"` ends the walk without consuming, so the spatial engine
   * underneath never sees an arrow the browser serves — in `app` mode it would
   * otherwise move the focus without checking. The engine stands in as the scope
   * pushed first, which the bus asks last.
   */
  function withEngine(props: RadioGroupMachineProps = {}): {
    harness: ReturnType<typeof render>;
    bus: IntentBus;
    reached: string[];
  } {
    const bus = createIntentBus();
    const reached: string[] = [];
    bus.pushScope(
      (event) => {
        reached.push(`${event.source}:${event.intent}`);
        return false;
      },
      { base: true },
    );
    scenes += 1;
    const harness = render({ intents: bus, ...props }, undefined, `pad${scenes}`);
    return { harness, bus, reached };
  }

  it("keeps the engine off the keyboard arrows of its own axis, but hands it the ends", () => {
    const { harness, bus, reached } = withEngine();
    const list = inputs(harness);
    list[0]?.focus();

    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" }).consumed).toBe(false);
    list[2]?.focus();
    expect(bus.dispatch({ intent: "moveUp", source: "keyboard" }).consumed).toBe(false);
    expect(reached).toEqual([]);

    // A remote's arrows arrive as these keys and it has no Tab: the native
    // group would wrap and keep it in, so the end is the engine's way out.
    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" }).consumed).toBe(false);
    list[0]?.focus();
    expect(bus.dispatch({ intent: "moveUp", source: "keyboard" }).consumed).toBe(false);
    expect(reached).toEqual(["keyboard:moveDown", "keyboard:moveUp"]);
    expect(harness.api().value).toBe(null);
  });

  it("follows the orientation, so a horizontal group keeps left and right", () => {
    const { harness, bus, reached } = withEngine({ orientation: "horizontal", dir: "rtl" });
    inputs(harness)[1]?.focus();

    bus.dispatch({ intent: "moveLeft", source: "keyboard" });
    bus.dispatch({ intent: "moveRight", source: "keyboard" });
    bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(reached).toEqual(["keyboard:moveDown"]);
  });

  it("hands the engine every keyboard intent it does not serve natively", () => {
    const { harness, bus, reached } = withEngine();
    inputs(harness)[0]?.focus();

    bus.dispatch({ intent: "moveRight", source: "keyboard" });
    bus.dispatch({ intent: "moveLeft", source: "keyboard" });
    bus.dispatch({ intent: "home", source: "keyboard" });

    expect(reached).toEqual(["keyboard:moveRight", "keyboard:moveLeft", "keyboard:home"]);
  });

  it("hands the engine the keyboard arrows while read-only, so nothing checks", () => {
    const { harness, bus, reached } = withEngine({ readOnly: true, defaultValue: "small" });
    inputs(harness)[0]?.focus();

    bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(reached).toEqual(["keyboard:moveDown"]);
  });

  it("hands the engine the keyboard arrows while the focus is outside or on no radio", () => {
    const { harness, bus, reached } = withEngine();
    const outside = document.createElement("button");
    harness.host.append(outside);
    outside.focus();
    bus.dispatch({ intent: "moveDown", source: "keyboard" });

    const link = document.createElement("button");
    harness.part("root").append(link);
    link.focus();
    bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(reached).toEqual(["keyboard:moveDown", "keyboard:moveDown"]);
  });

  it("answers nothing while the focus is elsewhere", () => {
    const { harness, bus } = withPad();
    const outside = document.createElement("button");
    harness.host.append(outside);
    outside.focus();

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().value).toBe(null);
  });

  it("lets the move fall through while read-only", () => {
    const { harness, bus } = withPad({ readOnly: true, defaultValue: "small" });
    inputs(harness)[0]?.focus();

    // Falling through rather than swallowing: a group nobody may change still
    // has to be crossable on a pad, and moving out is the spatial engine's job.
    // `disabled` has no arm here on purpose — a disabled group disables every
    // radio, so the focus never gets inside to ask.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().value).toBe("small");
  });

  it("declines while the focus is inside the group but on none of its radios", () => {
    const { harness, bus } = withPad();
    // What `renderOption` buys a consumer who puts a link in a row. The group
    // holds the focus, so it is asked — and has no radio to move *from*.
    const link = document.createElement("button");
    harness.part("root").append(link);
    link.focus();

    // Entering a group never checks anything, on a pad no more than on Tab.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().value).toBe(null);
    expect(document.activeElement).toBe(link);
  });

  it("declines rather than select into a row whose radio the consumer replaced away", () => {
    const bus = createIntentBus();
    // The shape `renderOption` buys: `composed.tsx` names dropping the hidden
    // input as a supported cost, so the middle row here has a label, a control
    // and a text — and no radio. Selecting into it would write a value no
    // `<input>` carries and consume the intent that was the way out.
    const harness = mountMachine<RadioGroupSchema, Api>({
      machine,
      connect,
      html: `<div>
          <label><input /><span></span></label>
          <label><span></span></label>
          <label><input /><span></span></label>
        </div>`,
      id: "no-input",
      props: { intents: bus },
      paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
        const root = host.firstElementChild as HTMLElement;
        apply(root, api.getRootProps());
        VALUES.forEach((value, index) => {
          const itemProps = { value };
          const item = root.children[index] as HTMLElement;
          apply(item, api.getItemProps(itemProps));
          if (index === 1) {
            apply(item.children[0] as Element, api.getItemTextProps(itemProps));
            return;
          }
          apply(item.children[0] as Element, api.getItemHiddenInputProps(itemProps));
          apply(item.children[1] as Element, api.getItemTextProps(itemProps));
        });
      },
    });

    const first = harness.host.querySelector<HTMLInputElement>("input");
    first?.focus();

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(harness.api().value).toBe(null);
    expect(document.activeElement).toBe(first);
  });

  it("never adopts the items of a group nested in one of its own rows", () => {
    const outer = withPad();
    const inner = withPad();
    // The inner group's root moves inside the outer group's last row — the
    // shape a consumer writes when an option opens a sub-choice.
    const row = outer.harness.host.querySelectorAll('[data-part~="radio-group:item"]')[2];
    row?.append(inner.harness.part("root"));

    const list = inputs(outer.harness);
    list[2]?.focus();

    // The outer group is at its own end: the inner rows are not its business,
    // and a pad pressing on must leave rather than dive into them.
    expect(outer.bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(outer.harness.api().value).toBe(null);
    expect(inner.harness.api().value).toBe(null);
  });

  it("follows the direction the document resolves when no prop declares one", () => {
    const { harness, bus } = withPad({ orientation: "horizontal" });
    // No `dir` prop: `resolveDir` has to read it off the tree, and it is read
    // at dispatch rather than held from a measurement made earlier.
    harness.host.setAttribute("dir", "rtl");
    inputs(harness)[1]?.focus();

    expect(bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(true);
    expect(harness.api().value).toBe("small");
  });

  it("brings the row into view, not the clipped radio inside it", () => {
    const { harness, bus } = withPad();
    // A scroller shorter than the group, with rows tall enough that the third
    // starts well below the fold. The radio is a 1×1 clipped box at the row's
    // start corner, so a scroll aimed at it guarantees that corner alone.
    const root = harness.part("root");
    root.style.cssText = "display: grid; gap: 0; block-size: 60px; overflow-y: auto";
    for (const item of root.querySelectorAll<HTMLElement>('[data-part~="radio-group:item"]')) {
      item.style.cssText = "display: block; block-size: 50px";
    }
    const list = inputs(harness);
    list[1]?.focus();
    root.scrollTop = 0;

    bus.dispatch({ intent: "moveDown", source: "gamepad" });

    const row = root.querySelectorAll<HTMLElement>('[data-part~="radio-group:item"]')[2];
    const rowBox = row?.getBoundingClientRect();
    const scrollerBox = root.getBoundingClientRect();
    if (rowBox === undefined) throw new Error("the scene has no third row");

    expect(rowBox.bottom).toBeLessThanOrEqual(scrollerBox.bottom + 1);
    expect(rowBox.top).toBeGreaterThanOrEqual(scrollerBox.top - 1);
  });
});
