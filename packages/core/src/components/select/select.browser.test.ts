/**
 * The select against a real engine, driven with no framework at all.
 *
 * Everything here needs a page for the menu's reason: **the collection is the
 * DOM.** Which item the roving lands on, what the typeahead matches, what the
 * commit captures as a label and what the form submits are all interactions
 * with live elements — `select.test.ts` deliberately watches the same machine
 * answer "no items", and every rule about *which* item wins is proved here.
 *
 * The one arrangement the menu never had: a real `<form>` around the hidden
 * mirror, because the select's contract with it (submission, `required`
 * validation, `reset`) is the half of the component the menu does not have.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { isScrollLocked } from "../../a11y/scroll-lock";
import { createIntentBus } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./select.connect";
import { machine } from "./select.machine";
import type { SelectApi, SelectMachineProps, SelectSchema } from "./select.types";

type Api = SelectApi<DomPropTypes>;
type Harness = ReturnType<typeof mountMachine<SelectSchema, Api>>;

interface ItemSpec {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly symbol?: boolean;
}

/**
 * Two items starting with the same letter (Banana, Blueberry) so a repeated
 * keystroke has something to cycle through, and one disabled item in the middle
 * so every traversal has to step over something.
 */
const ITEMS: readonly ItemSpec[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "blueberry", label: "Blueberry" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "elderberry", label: "Elderberry" },
];

function itemMarkup(item: ItemSpec): string {
  const symbol = item.symbol === true ? `<span data-slot="symbol:${item.value}"></span>` : "";
  return `<div data-slot="item:${item.value}" style="height:28px">${symbol}<span data-slot="indicator:${item.value}"></span><span data-slot="text:${item.value}">${item.label}</span></div>`;
}

interface SceneOptions {
  readonly props?: SelectMachineProps;
  readonly items?: readonly ItemSpec[];
  /** Caps the surface so the scroll affordance has something to say. */
  readonly contentHeight?: string;
  /**
   * The list's natural width. The default is wider than the 140px trigger, which
   * is the shape the width contract exists for; a scene that wants the other
   * direction asks for a narrow one.
   */
  readonly contentWidth?: string;
  /** Renders the sheet's Cancel card, the way the adapter only does in `sheet`. */
  readonly cancel?: boolean;
  /**
   * A `<label for>` over the trigger, on by default. A `role="combobox"` takes no
   * name from its contents, so a fixture without one is the very shape the machine
   * warns about — and every scene here would print it. Turned off by the tests
   * that read the warning.
   */
  readonly named?: boolean;
}

function markup(options: SceneOptions): string {
  const items = options.items ?? ITEMS;
  const height = options.contentHeight === undefined ? "" : `height:${options.contentHeight};`;
  const width = options.contentWidth ?? "190px";
  // The trigger's derived id, written out: the markup exists before the machine
  // does, and `scene()` pins the scope id to "s1". This is the `field` shape —
  // the native association, no IDREF (`select.tsx`, `ids: { trigger: … }`).
  const label =
    options.named === false
      ? ""
      : `<label data-slot="trigger-label" for="select:s1:trigger">Fruit</label>`;
  // The positioner deliberately carries no width of its own: it is the box under
  // test, and a seeded one made `matchWidth: false` unfalsifiable — the machine
  // writes nothing there and the assertion read the fixture back. The list's
  // width belongs to the content, which is what really sizes the surface.
  return `
    <form data-slot="form">
      ${label}
      <button data-slot="trigger" type="button" style="position:absolute;left:40px;top:200px;width:140px;height:28px">
        <span data-slot="value-text"></span>
        <span data-slot="chevron"></span>
      </button>
      <select data-slot="hidden-select"></select>
    </form>
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="backdrop"></div>
    <div data-slot="positioner" style="position:absolute;left:0;top:0">
      <div data-slot="content" style="width:${width};${height}overflow-y:auto">
        <div data-slot="group">
          <div data-slot="group-label">Fruits</div>
          ${items.map((item) => itemMarkup(item)).join("")}
        </div>
        <div data-slot="separator"></div>
        ${options.cancel === true ? `<button data-slot="cancel">Cancel</button>` : ""}
      </div>
    </div>`;
}

function paint(host: HTMLElement, api: Api, apply: ApplyProps, items: readonly ItemSpec[]): void {
  const put = (slot: string, values: Record<string, unknown>): void => {
    const node = host.querySelector(`[data-slot="${slot}"]`);
    if (node !== null) apply(node, values);
  };
  put("trigger", api.getTriggerProps());
  put("value-text", api.getValueTextProps());
  put("chevron", api.getIndicatorProps());
  put("backdrop", api.getBackdropProps());
  put("positioner", api.getPositionerProps());
  put("content", api.getContentProps());
  put("group", api.getItemGroupProps({ id: "fruits", label: true }));
  put("group-label", api.getItemGroupLabelProps({ htmlFor: "fruits" }));
  put("separator", api.getSeparatorProps());
  put("cancel", api.getCancelTriggerProps());

  // The adapter's `<option>` mirror, restated by hand: one option, the
  // selection, so the form has something to submit and `required` something to
  // refuse. Written before the props so the select's `value` finds its option.
  const mirror = host.querySelector<HTMLSelectElement>(`[data-slot="hidden-select"]`);
  if (mirror !== null) {
    const value = api.value ?? "";
    const label = api.valueLabel ?? value;
    mirror.innerHTML = `<option value="${value}">${label}</option>`;
    apply(mirror, api.getHiddenSelectProps());
    mirror.value = value;
  }

  for (const item of items) {
    if (host.querySelector(`[data-slot="item:${item.value}"]`) === null) continue;
    put(`item:${item.value}`, api.getItemProps(item));
    put(`text:${item.value}`, api.getItemTextProps());
    put(`indicator:${item.value}`, api.getItemIndicatorProps({ value: item.value }));
    if (item.symbol === true) put(`symbol:${item.value}`, api.getItemSymbolProps());
  }
}

function scene(options: SceneOptions = {}): Harness {
  const items = options.items ?? ITEMS;
  return mountMachine<SelectSchema, Api>({
    machine,
    connect,
    id: "s1",
    html: markup(options),
    props: options.props,
    paint: (host, api, apply) => paint(host, api, apply, items),
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

const item = (harness: Harness, value: string): HTMLElement => slot(harness, `item:${value}`);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function press(
  key: string,
  node: HTMLElement = document.activeElement as HTMLElement,
  init: KeyboardEventInit = {},
): void {
  node.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

function releaseKey(key: string, node: HTMLElement = document.activeElement as HTMLElement): void {
  node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
}

/** Down *and* up: an outside interaction decides on down and confirms on up. */
function pointerOn(node: HTMLElement): void {
  for (const name of ["pointerdown", "pointerup"]) {
    node.dispatchEvent(
      new PointerEvent(name, {
        bubbles: true,
        composed: true,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  }
}

function hover(node: HTMLElement): void {
  const rect = node.getBoundingClientRect();
  node.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      composed: true,
      pointerType: "mouse",
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
    }),
  );
}

async function openWithPointer(harness: Harness): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  trigger.click();
  await frames();
}

async function openWithKeyboard(harness: Harness, key = "Enter"): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  press(key, trigger);
  await frames();
}

const focusedValue = (): string | null =>
  (document.activeElement as HTMLElement | null)?.getAttribute("data-value") ?? null;

const extra: VoidFunction[] = [];

afterEach(() => {
  unmountAll();
  for (const dispose of extra.splice(0, extra.length)) dispose();
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-sui-density");
});

describe("select — opening, and a focus that is always real", () => {
  it("opens from a click onto the first enabled item, with the real focus on it", async () => {
    const harness = scene();
    await openWithPointer(harness);

    const content = slot(harness, "content");
    expect(harness.api().open).toBe(true);
    // Never a virtual focus (règle dure).
    expect(content.hasAttribute("aria-activedescendant")).toBe(false);
    // No selection yet, so the first enabled item takes the highlight — a
    // select, unlike a menu, always opens onto something.
    expect(focusedValue()).toBe("apple");
    expect(item(harness, "apple").tabIndex).toBe(0);
    expect(item(harness, "banana").tabIndex).toBe(-1);
  });

  it("opens onto the selected item, whatever key or button opened it", async () => {
    const harness = scene({ props: { defaultValue: "blueberry" } });
    await openWithKeyboard(harness, "ArrowDown");

    expect(focusedValue()).toBe("blueberry");
    expect(item(harness, "blueberry").getAttribute("aria-selected")).toBe("true");
  });

  it("lets Home and End force an end past the selection (APG select-only)", async () => {
    const home = scene({ props: { defaultValue: "blueberry" } });
    await openWithKeyboard(home, "Home");
    expect(focusedValue()).toBe("apple");
    unmountAll();

    const end = scene({ props: { defaultValue: "apple" } });
    await openWithKeyboard(end, "End");
    expect(focusedValue()).toBe("elderberry");
  });

  it("opens on the space bar's release, so the key never leaks into the listbox", async () => {
    const harness = scene();
    const trigger = slot(harness, "trigger");
    trigger.focus();

    press(" ", trigger);
    expect(harness.api().open).toBe(false);

    releaseKey(" ", trigger);
    await frames();

    expect(harness.api().open).toBe(true);
    expect(focusedValue()).toBe("apple");
  });

  it("stays open for the release of the press that opened it, and toggles on a real second click", async () => {
    const harness = scene();
    const trigger = slot(harness, "trigger");

    pointerOn(trigger);
    trigger.click();
    await frames();
    expect(harness.api().open).toBe(true);

    await sleep(320);
    pointerOn(trigger);
    trigger.click();
    await frames();

    expect(harness.api().open).toBe(false);
  });

  it("hands the focus back to the trigger when it closes", async () => {
    const harness = scene();
    await openWithKeyboard(harness);

    harness.api().setOpen(false);
    await frames();

    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });
});

describe("select — the roving", () => {
  it("moves the real focus with the arrows, skipping the disabled item and looping", async () => {
    const harness = scene();
    await openWithKeyboard(harness);
    expect(focusedValue()).toBe("apple");

    press("ArrowDown");
    expect(focusedValue()).toBe("banana");
    expect(item(harness, "banana").getAttribute("data-focus-source")).toBe("keyboard");

    press("ArrowDown");
    press("ArrowDown");
    // `cherry` sits in between and is never the answer.
    expect(focusedValue()).toBe("elderberry");

    press("ArrowDown");
    // Native desktop menus wrap, and so does the default.
    expect(focusedValue()).toBe("apple");
    press("ArrowUp");
    expect(focusedValue()).toBe("elderberry");
  });

  it("stops at the ends when loopFocus is off", async () => {
    const harness = scene({ props: { loopFocus: false } });
    await openWithKeyboard(harness);

    press("ArrowUp");
    expect(focusedValue()).toBe("apple");
    press("End");
    press("ArrowDown");
    expect(focusedValue()).toBe("elderberry");
  });

  it("pages the highlight by ten and clamps at both ends (APG select-only, optional half)", async () => {
    const harness = scene();
    await openWithKeyboard(harness);
    expect(focusedValue()).toBe("apple");

    // Five items against a page of ten: PageDown is the whole list, and the
    // clamp is what the assertion is about — `loopFocus` is on and an arrow key
    // here would have wrapped back to `apple`.
    press("PageDown");
    expect(focusedValue()).toBe("elderberry");
    press("PageDown");
    expect(focusedValue()).toBe("elderberry");

    press("PageUp");
    expect(focusedValue()).toBe("apple");
    press("PageUp");
    expect(focusedValue()).toBe("apple");
  });

  it("highlights under a mouse and clears when the pointer leaves", async () => {
    const harness = scene();
    await openWithPointer(harness);

    hover(item(harness, "banana"));
    await frames(1);
    expect(harness.api().highlightedValue).toBe("banana");

    item(harness, "banana").dispatchEvent(
      new PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }),
    );
    await frames(1);
    expect(harness.api().highlightedValue).toBeNull();
  });

  it("keeps the highlight when the pointer leaves an option that is not highlighted", async () => {
    const harness = scene();
    await openWithKeyboard(harness);
    expect(harness.api().highlightedValue).toBe("apple");

    item(harness, "cherry").dispatchEvent(
      new PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }),
    );
    await frames(1);
    expect(harness.api().highlightedValue).toBe("apple");

    press("ArrowDown");
    expect(focusedValue()).toBe("banana");
  });
});

describe("select — the typeahead", () => {
  it("opens from a character on the closed trigger and highlights the first match", async () => {
    const harness = scene();
    const trigger = slot(harness, "trigger");
    trigger.focus();

    press("b", trigger);
    await frames();

    // APG select-only: taper ouvre et surligne. It never selects while closed —
    // the deliberate divergence from the Windows native control.
    expect(harness.api().open).toBe(true);
    expect(focusedValue()).toBe("banana");
    expect(harness.api().value).toBeNull();
  });

  it("cycles the matches on a repeated key, and extends the query otherwise", async () => {
    const harness = scene();
    await openWithKeyboard(harness);

    press("b");
    expect(focusedValue()).toBe("banana");
    press("b");
    expect(focusedValue()).toBe("blueberry");

    await sleep(400);
    press("b");
    press("l");
    expect(focusedValue()).toBe("blueberry");
  });

  it("reads a Space inside a live search as a character, and as a commit otherwise", async () => {
    const harness = scene();
    await openWithKeyboard(harness);

    press("b");
    press(" ");
    releaseKey(" ");
    await frames();
    // Mid-search the Space extended the query — nothing was committed.
    expect(harness.api().open).toBe(true);
    expect(harness.api().value).toBeNull();

    await sleep(400);
    press(" ");
    releaseKey(" ");
    await frames();
    // The buffer had expired, so this Space is the APG commit.
    expect(harness.api().value).toBe("banana");
  });
});

describe("select — committing", () => {
  it("commits the highlight on Enter, captures its label, and restores the focus", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange, selectionFlash: false } });
    await openWithKeyboard(harness);

    press("ArrowDown");
    press("Enter");
    await frames();

    expect(onValueChange).toHaveBeenCalledWith({ value: "banana" });
    expect(harness.api().open).toBe(false);
    expect(harness.api().valueLabel).toBe("Banana");
    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });

  it("refuses a disabled item from every road", async () => {
    const harness = scene({ props: { selectionFlash: false } });
    await openWithPointer(harness);

    item(harness, "cherry").click();
    await frames();

    expect(harness.api().open).toBe(true);
    expect(harness.api().value).toBeNull();
  });

  it("blinks first in the popup: the commit is immediate, the close waits for the flash", async () => {
    // Pinned rather than inherited: the guard resolves the environment, and a
    // runner configured for reduced motion would skip the very thing measured.
    document.documentElement.setAttribute("data-motion", "full");
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await openWithPointer(harness);

    item(harness, "apple").click();
    await frames(1);

    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(item(harness, "apple").getAttribute("data-highlighted-flash")).toBe("");
    expect(harness.api().open).toBe(true);

    await vi.waitFor(() => {
      expect(harness.api().open).toBe(false);
    });
  });

  it("does not blink under reduced motion, and does not delay the close either", async () => {
    document.documentElement.setAttribute("data-motion", "reduced");
    const harness = scene();
    await openWithPointer(harness);

    item(harness, "apple").click();
    await frames(1);

    // The guard reads the environment in the machine, never in `connect`.
    expect(item(harness, "apple").hasAttribute("data-highlighted-flash")).toBe(false);
    expect(harness.api().open).toBe(false);
  });

  it("takes a select dismissed mid-blink out of the flash with it", async () => {
    document.documentElement.setAttribute("data-motion", "full");
    const harness = scene();
    await openWithPointer(harness);

    item(harness, "apple").click();
    await frames(1);
    expect(harness.service.context.get("flashingValue")).toBe("apple");

    harness.api().setOpen(false);
    await frames();

    // Otherwise the timer fires into a surface that has already left.
    expect(harness.service.context.get("flashingValue")).toBeNull();
    expect(harness.service.refs.get("flashTimer")).toBeNull();
  });

  it("freezes the surface for the length of the blink, so it cannot re-fit mid-close", async () => {
    document.documentElement.setAttribute("data-motion", "full");
    const harness = scene({ contentWidth: "80px" });
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    expect(positioner.style.width).toBe("140px");

    item(harness, "apple").click();
    // What the commit really does to the trigger: the caption becomes the
    // selected label and the trigger resizes under a surface that is still open
    // and fully opaque. Filmed as an 82px jump one frame before the fade.
    slot(harness, "trigger").style.width = "60px";
    await frames(3);

    expect(harness.api().open).toBe(true);
    expect(positioner.style.width).toBe("140px");
  });

  it("goes on tracking the trigger when the commit leaves the surface open", async () => {
    const harness = scene({ contentWidth: "80px", props: { closeOnSelect: false } });
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    expect(positioner.style.width).toBe("140px");

    // No close, so no blink, so nothing to freeze: a surface that stays is owed
    // the new trigger's geometry.
    item(harness, "apple").click();
    slot(harness, "trigger").style.width = "60px";
    await frames(6);

    expect(harness.api().open).toBe(true);
    expect(positioner.style.width).toBe("");
  });

  it("shows the checkmark on the selected row and reflects the label on the trigger", async () => {
    const harness = scene({ props: { defaultValue: "banana" } });
    await frames();

    expect(slot(harness, "indicator:banana").getAttribute("data-state")).toBe("checked");
    expect(slot(harness, "indicator:apple").getAttribute("data-state")).toBe("unchecked");
    expect(harness.api().valueLabel).toBe("Banana");
    expect(slot(harness, "trigger").hasAttribute("data-placeholder")).toBe(false);
  });
});

describe("select — how it is dismissed", () => {
  it("closes on Escape without a commit", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await openWithKeyboard(harness);
    press("ArrowDown");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();

    expect(harness.api().open).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });

  it("swallows the click that closed it, so nothing underneath is activated (parity M5)", async () => {
    const harness = scene();
    await openWithPointer(harness);

    const outside = slot(harness, "outside");
    const activated = vi.fn();
    outside.addEventListener("click", activated);
    extra.push(() => outside.removeEventListener("click", activated));

    pointerOn(outside);
    outside.click();
    await frames();

    expect(harness.api().open).toBe(false);
    expect(activated).not.toHaveBeenCalled();
  });

  it("commits the highlight on Tab, and the proxy carries the focus past the trigger", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await openWithKeyboard(harness);
    press("ArrowDown");
    expect(focusedValue()).toBe("banana");

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(event);
    await frames();

    expect(harness.api().open).toBe(false);
    // APG select-only: Tab sets the value to the focused option. Moving the
    // highlight does not commit in this component, so a Tab that dropped it
    // would discard the only thing the keyboard user did.
    expect(onValueChange).toHaveBeenCalledWith({ value: "banana" });
    expect(harness.api().value).toBe("banana");
    // The proxy prevented the key and placed the focus after the trigger itself.
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(slot(harness, "outside"));
  });

  it("closes on Tab with nothing highlighted, and commits nothing", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await openWithPointer(harness);
    harness.service.send({ type: "HIGHLIGHT.SET", value: null });
    await frames();

    press("Tab", slot(harness, "content"));
    await frames();

    expect(harness.api().open).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("commits and closes on Alt+ArrowUp, the mirror of the Alt+ArrowDown that opens", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await openWithKeyboard(harness, "ArrowDown");
    press("ArrowDown");
    expect(focusedValue()).toBe("banana");

    press("ArrowUp", document.activeElement as HTMLElement, { altKey: true });
    await frames();

    expect(harness.api().open).toBe(false);
    expect(onValueChange).toHaveBeenCalledWith({ value: "banana" });
    // No blink: the gesture hands the focus back in the same breath, so the
    // 150ms the flash holds the surface open would blink a row nobody sees.
    expect(document.activeElement).toBe(slot(harness, "trigger"));
  });
});

describe("select — the width contract", () => {
  it("floors a narrow list at the trigger's width by default (the ROADMAP divergence)", async () => {
    const harness = scene({ contentWidth: "80px" });
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    const trigger = slot(harness, "trigger");
    expect(positioner.style.width).toBe(`${trigger.getBoundingClientRect().width}px`);
  });

  it("lets a list wider than the trigger keep the room its rows need", async () => {
    // The defect this contract was rewritten over: as an identity, `matchWidth`
    // clamped a 190px list onto a 140px trigger and ellipsised all five labels
    // and both headings. Native pop-up menus are wider than their buttons.
    const harness = scene();
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    const triggerWidth = slot(harness, "trigger").getBoundingClientRect().width;
    expect(positioner.style.width).toBe("");
    expect(positioner.getBoundingClientRect().width).toBeGreaterThan(triggerWidth);
  });

  it("gives the width back before it measures, so the surface can shrink again", async () => {
    const harness = scene({ contentWidth: "80px" });
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    const trigger = slot(harness, "trigger");
    expect(positioner.style.width).toBe("140px");

    // The trigger narrows past the list's own 80px. A tracker that measured the
    // 140 it wrote last frame would decide the surface is already wide enough and
    // leave it at 140 for ever.
    trigger.style.width = "60px";
    await frames(6);
    expect(positioner.style.width).toBe("");
  });

  it("still publishes the anchor width when matchWidth is off, for the CSS minimum", async () => {
    const harness = scene({ props: { matchWidth: false } });
    await openWithPointer(harness);
    await frames();

    const positioner = slot(harness, "positioner");
    expect(positioner.style.width).toBe("");
    // What `min-inline-size: var(--sui-anchor-width)` reads in the sheet.
    expect(positioner.style.getPropertyValue("--sui-anchor-width")).toBe("140px");
  });
});

describe("select — the scroll affordance", () => {
  it("publishes data-scroll on the capped surface and clears it at the end", async () => {
    const harness = scene({ contentHeight: "90px" });
    await openWithPointer(harness);
    await frames();

    const content = slot(harness, "content");
    expect(content.getAttribute("data-scroll")).toBe("down");

    content.scrollTop = content.scrollHeight;
    await frames();
    expect(content.getAttribute("data-scroll")).toBe("up");
  });
});

describe("select — the form", () => {
  it("submits the selection under its name, through the native mirror", async () => {
    const harness = scene({ props: { name: "fruit", defaultValue: "banana" } });
    await frames();

    const form = slot<HTMLFormElement>(harness, "form");
    expect(new FormData(form).get("fruit")).toBe("banana");
  });

  it("fails native validation while required and empty — and only then", async () => {
    const harness = scene({ props: { name: "fruit", required: true } });
    await frames();

    const form = slot<HTMLFormElement>(harness, "form");
    expect(form.checkValidity()).toBe(false);

    harness.api().setValue("apple");
    await frames();
    expect(form.checkValidity()).toBe(true);
  });

  it("associates with a remote form through the `form` prop, reset included", async () => {
    // Before the scene: `trackFormReset` resolves the owner form at start, and
    // the attribute must already have a target to win over the ancestor <form>.
    const remote = document.createElement("form");
    remote.id = "remote-form";
    document.body.append(remote);
    extra.push(() => remote.remove());

    const harness = scene({
      props: { name: "fruit", defaultValue: "banana", form: "remote-form" },
    });
    await frames();

    expect(new FormData(remote).get("fruit")).toBe("banana");
    // The attribute wins: the ancestor form no longer owns the mirror.
    expect(new FormData(slot<HTMLFormElement>(harness, "form")).get("fruit")).toBeNull();

    harness.api().setValue("apple");
    await frames();
    remote.reset();
    await vi.waitFor(() => {
      expect(harness.api().value).toBe("banana");
    });
  });

  it("follows a form reset back to its initial value, after the native reset ran", async () => {
    const harness = scene({ props: { name: "fruit", defaultValue: "apple" } });
    await frames();

    harness.api().setValue("banana");
    await frames();
    expect(harness.api().value).toBe("banana");

    slot<HTMLFormElement>(harness, "form").reset();
    await vi.waitFor(() => {
      expect(harness.api().value).toBe("apple");
    });
  });
});

describe("select — the label the trigger wears", () => {
  it("back-fills valueLabel from the mounted collection on the first paint", async () => {
    const harness = scene({ props: { defaultValue: "banana" } });
    await frames();

    expect(harness.api().valueLabel).toBe("Banana");
  });

  it("keeps the last capture when the item disappears (libellé rescapé)", async () => {
    const harness = scene({ props: { defaultValue: "banana" } });
    await frames();
    expect(harness.api().valueLabel).toBe("Banana");

    item(harness, "banana").remove();
    await frames();

    // The value belongs to the app; the machine will not blank its caption
    // because a filter took the row away.
    expect(harness.api().value).toBe("banana");
    expect(harness.api().valueLabel).toBe("Banana");
  });

  it("publishes the symbol gutter on the surface once any row draws a glyph", async () => {
    const bare = scene();
    await frames();
    expect(slot(bare, "content").hasAttribute("data-has-symbols")).toBe(false);
    // The selection gutter, by contrast, is constant — any row can be checked.
    expect(slot(bare, "content").getAttribute("data-has-selection")).toBe("");
    unmountAll();

    const withSymbols = scene({
      items: ITEMS.map((entry) => ({ ...entry, symbol: true })),
    });
    await frames();
    expect(slot(withSymbols, "content").getAttribute("data-has-symbols")).toBe("");
  });
});

describe("select — the sheet", () => {
  it("locks the page scroll, skips the blink, and closes from the cancel card", async () => {
    const onValueChange = vi.fn();
    const onDismiss = vi.fn();
    const harness = scene({
      cancel: true,
      props: { presentation: "sheet", onValueChange, onDismiss },
    });
    await openWithPointer(harness);

    expect(slot(harness, "content").getAttribute("data-presentation")).toBe("sheet");
    expect(isScrollLocked(document)).toBe(true);

    // No blink in the sheet: the commit closes immediately.
    item(harness, "apple").click();
    await frames();
    expect(harness.api().open).toBe(false);
    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(isScrollLocked(document)).toBe(false);

    await sleep(320);
    await openWithPointer(harness);
    slot(harness, "cancel").click();
    await frames();

    expect(harness.api().open).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    // The cancel is an affordance for the pointer; the keyboard's way out is
    // Escape, so the card never joins the tab order.
    expect(slot(harness, "cancel").tabIndex).toBe(-1);
  });
});

describe("select — the gamepad grammar", () => {
  it("consumes exactly « d-pad, A, B », and hands everything back on close", async () => {
    const bus = createIntentBus();
    const onValueChange = vi.fn();
    const harness = scene({ props: { intents: bus, onValueChange, selectionFlash: false } });
    const depthBefore = bus.depth();

    await openWithKeyboard(harness);
    expect(bus.depth()).toBe(depthBefore + 1);

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("banana");
    expect(bus.dispatch({ intent: "moveUp", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("apple");

    // The stick, the bumpers and the page intents pass through: the real focus
    // is inside the scroller and the platform already answers them.
    for (const intent of ["moveLeft", "moveRight", "pageDown", "secondary"] as const) {
      expect(bus.dispatch({ intent, source: "gamepad" }).consumed).toBe(false);
    }

    expect(bus.dispatch({ intent: "select", source: "gamepad" }).consumed).toBe(true);
    await frames();
    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(harness.api().open).toBe(false);
    expect(bus.depth()).toBe(depthBefore);

    await sleep(320);
    await openWithKeyboard(harness);
    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    await frames();
    expect(harness.api().open).toBe(false);
    // Cancelled, never committed a second time.
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});

describe("select — the always-mounted surface", () => {
  it("resolves aria-controls while closed, because the content really is there", async () => {
    const harness = scene();
    await frames();

    const trigger = slot(harness, "trigger");
    const id = trigger.getAttribute("aria-controls");
    expect(id).not.toBeNull();
    expect(document.getElementById(id as string)).toBe(slot(harness, "content"));
    expect(slot(harness, "content").getAttribute("data-state")).toBe("closed");
    // The stylesheet (not loaded here) turns this state into `visibility:
    // hidden`; what the machine owes the contract is the attribute.
  });

  it("serves the closed typeahead from that mounted collection", async () => {
    // The whole point of keeping the items in the tree: a keystroke on the
    // closed trigger has real labels to match against, before any open.
    const harness = scene();
    const trigger = slot(harness, "trigger");
    trigger.focus();
    press("e", trigger);
    await frames();

    expect(harness.api().open).toBe(true);
    expect(focusedValue()).toBe("elderberry");
  });
});

/**
 * The name a combobox cannot get from its contents, and the one thing this
 * machine says out loud. It needs a page: the three ways a name arrives are all
 * DOM facts — an attribute, a `<label for>` that resolves, an enclosing `<label>`
 * — and `select.test.ts` has no document to hold any of them.
 */
describe("select — the name the library cannot invent", () => {
  it("warns for a combobox with no name at all, the shape a select composed alone has", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    scene({ named: false });
    await frames();

    // The whole message, and once: the effect that carries it is machine-level and
    // installs at `start()`, so a repaint must not turn the warning into a stream.
    expect(warned.mock.calls.flat().join(" ")).toContain(
      "[standarui] a select has no accessible name",
    );
    expect(warned).toHaveBeenCalledTimes(1);
    warned.mockRestore();
  });

  it("says nothing when `label` names it", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = scene({ named: false, props: { label: "Fruit" } });
    await frames();

    expect(slot(harness, "trigger").getAttribute("aria-label")).toBe("Fruit");
    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });

  it("says nothing when a `label[for]` names it, the way a field does", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = scene();
    await frames();

    // No IDREF on the trigger to read: `SelectRoot` hands it the field's control
    // id and lets the association be native (`select.tsx`, `ids: { trigger: … }`),
    // so the machine has to read the document, not an attribute.
    const trigger = slot(harness, "trigger");
    expect(trigger.hasAttribute("aria-label")).toBe(false);
    expect(slot(harness, "trigger-label").getAttribute("for")).toBe(trigger.id);
    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});
