/**
 * The menu against a real engine, driven with no framework at all.
 *
 * Everything here needs a page, and most of it needs one for a reason no other
 * component in the library has: **the collection is the DOM**. The roving, the
 * typeahead, the select guards and the safe triangle all resolve against live
 * elements, so a node harness can only watch them answer "no items" — which is what
 * `menu.test.ts` does, deliberately, while every rule about *which* item wins is
 * proved here.
 *
 * The submenu is two services wired the way an adapter wires them (`setChild` /
 * `setParent`), each with its own markup, because that is the only arrangement in
 * which a parent can be seen aiming at a child, keeping it open across a diagonal,
 * and refusing to dismiss when it is clicked in.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getLayerStack } from "../../interaction/layer-stack";
import { createIntentBus, type IntentBus, setInputModality } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./menu.connect";
import { machine } from "./menu.machine";
import type { MenuApi, MenuMachineProps, MenuSchema } from "./menu.types";

type Api = MenuApi<DomPropTypes>;
type Harness = ReturnType<typeof mountMachine<MenuSchema, Api>>;

interface ItemSpec {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly submenu?: boolean;
}

/**
 * Two items starting with the same letter (Rename, Revert) so a repeated keystroke
 * has something to cycle through, and one disabled item in the middle so every
 * traversal has to step over something.
 */
const PARENT_ITEMS: readonly ItemSpec[] = [
  { value: "open", label: "Open", shortcut: "Meta+O" },
  { value: "rename", label: "Rename" },
  { value: "share", label: "Share", submenu: true },
  { value: "trash", label: "Trash", disabled: true },
  { value: "revert", label: "Revert" },
];

const CHILD_ITEMS: readonly ItemSpec[] = [
  { value: "copy-link", label: "Copy link" },
  { value: "mail", label: "Mail" },
];

const ENABLED = ["open", "rename", "share", "revert"] as const;

function itemMarkup(item: ItemSpec, gutter: boolean): string {
  const indicator = gutter ? `<span data-slot="indicator:${item.value}"></span>` : "";
  return `<div data-slot="item:${item.value}" style="height:28px">${indicator}<span data-slot="text:${item.value}">${item.label}</span></div>`;
}

/**
 * The surface is given a box because three rules here are geometric: the safe
 * triangle extrapolates towards the child's rect, the position tracker measures the
 * anchor, and a zero-height item cannot be pointed at.
 */
function markup(
  items: readonly ItemSpec[],
  options: { gutter: boolean; root: boolean; cancel: boolean },
): string {
  const opener = options.root
    ? `<button data-slot="trigger" style="position:absolute;left:40px;top:200px;width:90px;height:24px">Actions</button>
       <button data-slot="outside">Elsewhere</button>
       <div data-slot="context-trigger" style="position:absolute;left:40px;top:320px;width:220px;height:90px">Canvas
         <button data-slot="canvas-cell">Cell</button>
       </div>
       <div data-slot="backdrop"></div>`
    : "";
  const left = options.root ? "0px" : "320px";
  return `
    ${opener}
    <div data-slot="positioner" style="position:absolute;left:${left};top:0;width:190px">
      <div data-slot="content" style="width:190px;height:220px">
        <div data-slot="group">
          <div data-slot="group-label">Edit</div>
          ${items.map((item) => itemMarkup(item, options.gutter)).join("")}
        </div>
        <div data-slot="separator"></div>
        ${options.root && options.cancel ? `<button data-slot="cancel">Cancel</button>` : ""}
      </div>
    </div>`;
}

function paintSurface(
  host: HTMLElement,
  api: Api,
  apply: ApplyProps,
  items: readonly ItemSpec[],
  child: (() => Api) | null,
  gutter: boolean,
): void {
  const put = (slot: string, values: Record<string, unknown>): void => {
    const node = host.querySelector(`[data-slot="${slot}"]`);
    if (node !== null) apply(node, values);
  };
  put("trigger", api.getTriggerProps());
  put("context-trigger", api.getContextTriggerProps());
  put("backdrop", api.getBackdropProps());
  put("positioner", api.getPositionerProps());
  put("content", api.getContentProps());
  put("group", api.getItemGroupProps({ id: "edit", label: true }));
  put("group-label", api.getItemGroupLabelProps({ htmlFor: "edit" }));
  put("separator", api.getSeparatorProps());
  put("cancel", api.getCancelTriggerProps());

  for (const item of items) {
    const props: Record<string, unknown> =
      item.submenu === true && child !== null
        ? api.getTriggerItemProps(child(), { value: item.value, label: item.label })
        : api.getItemProps({
            value: item.value,
            label: item.label,
            disabled: item.disabled,
            shortcut: item.shortcut,
          });
    put(`item:${item.value}`, props);
    put(`text:${item.value}`, api.getItemTextProps());
    if (gutter) put(`indicator:${item.value}`, api.getItemIndicatorProps({ checked: false }));
  }
}

interface SceneOptions {
  readonly props?: MenuMachineProps;
  readonly childProps?: MenuMachineProps;
  /** Renders the checkmark column, which is what `data-has-selection` is read from. */
  readonly gutter?: boolean;
  /**
   * Renders the sheet's Cancel row. Opt-in, because it is a real item in the roving
   * collection since 2026-09-02 — rendered by default it would add a last row to
   * every scene that measures Home, End, the wrap and the tab order, and none of
   * those are about it. The adapter only draws one in the `sheet` presentation.
   */
  readonly cancel?: boolean;
}

interface Scene {
  readonly parent: Harness;
  readonly child: Harness;
}

function scene(options: SceneOptions = {}): Scene {
  const gutter = options.gutter === true;
  const cancel = options.cancel === true;

  const child = mountMachine<MenuSchema, Api>({
    machine,
    connect,
    id: "m2",
    html: markup(CHILD_ITEMS, { gutter: false, root: false, cancel: false }),
    props: { parentId: "menu:m1:content", ...options.childProps },
    paint: (host, api, apply) => paintSurface(host, api, apply, CHILD_ITEMS, null, false),
  });

  const parent = mountMachine<MenuSchema, Api>({
    machine,
    connect,
    id: "m1",
    html: markup(PARENT_ITEMS, { gutter, root: true, cancel }),
    props: { submenuOpenDelay: 20, submenuCloseDelay: 20, ...options.props },
    paint: (host, api, apply) =>
      paintSurface(host, api, apply, PARENT_ITEMS, () => child.api(), gutter),
  });

  // Sent from an effect in an adapter, never during render — here, straight after
  // both services are running.
  parent.api().setChild(child.service);
  child.api().setParent(parent.service);
  return { parent, child };
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

const item = (harness: Harness, value: string): HTMLElement => slot(harness, `item:${value}`);

/**
 * The repaint an adapter would do for free. The harness holds one machine, so a
 * change in the child — its open state, which the parent renders on the trigger
 * item — reaches the parent's markup only when the parent is asked to paint again.
 */
function sync(harness: Harness): void {
  harness.setProps({});
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function press(key: string, node: HTMLElement = document.activeElement as HTMLElement): void {
  node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function releaseKey(key: string, node: HTMLElement = document.activeElement as HTMLElement): void {
  node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
}

function pointerMove(node: HTMLElement, x: number, y: number): void {
  node.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      composed: true,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
    }),
  );
}

/** The middle of an element, which is where a pointer that meant to be on it lands. */
function centreOf(node: HTMLElement): { x: number; y: number } {
  const rect = node.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function hover(node: HTMLElement): void {
  const { x, y } = centreOf(node);
  pointerMove(node, x, y);
}

/**
 * Down *and* up, because that is what an outside interaction is: the decision is
 * taken on pointerdown and confirmed on pointerup.
 */
function pointerOn(node: HTMLElement, type: string = "mouse"): void {
  for (const name of ["pointerdown", "pointerup"]) {
    node.dispatchEvent(
      new PointerEvent(name, { bubbles: true, composed: true, pointerType: type, isPrimary: true }),
    );
  }
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

const highlighted = (harness: Harness): string | null => harness.api().highlightedValue;

const focusedValue = (): string | null =>
  (document.activeElement as HTMLElement | null)?.getAttribute("data-value") ?? null;

const extra: VoidFunction[] = [];

afterEach(() => {
  unmountAll();
  for (const dispose of extra.splice(0, extra.length)) dispose();
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-sui-density");
});

describe("menu — opening, and a focus that is always real", () => {
  it("takes the focus into the surface and highlights nothing a mouse did not ask for", async () => {
    const { parent } = scene();
    await openWithPointer(parent);

    const content = slot(parent, "content");
    expect(parent.api().open).toBe(true);
    expect(document.activeElement).toBe(content);
    // Never a virtual focus (règle dure): there is no `aria-activedescendant` to
    // find, on the surface or anywhere under it.
    expect(content.hasAttribute("aria-activedescendant")).toBe(false);
    expect(slot(parent, "trigger").getAttribute("aria-expanded")).toBe("true");
    // A native desktop menu opened with a click highlights nothing until the pointer moves.
    expect(highlighted(parent)).toBeNull();
  });

  it("opens onto the first item from Enter and onto the last from ArrowUp (APG Menu Button)", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent, "Enter");

    expect(focusedValue()).toBe("open");
    expect(item(parent, "open").getAttribute("data-highlighted")).toBe("");
    // Roving: one stop in the tab order, and it is the highlighted item.
    expect(item(parent, "open").tabIndex).toBe(0);
    expect(item(parent, "rename").tabIndex).toBe(-1);

    const other = scene();
    await openWithKeyboard(other.parent, "ArrowUp");
    // The last *enabled* item: `trash` sits after `revert`'s neighbour and is
    // stepped over on the way in, not merely on the way past.
    expect(focusedValue()).toBe("revert");
  });

  it("opens on the space bar's release, so the key never leaks into what it opened", async () => {
    const { parent } = scene();
    const trigger = slot(parent, "trigger");
    trigger.focus();

    press(" ", trigger);
    expect(parent.api().open).toBe(false);

    releaseKey(" ", trigger);
    await frames();

    // Opened on keyup, with the first item focused — had it opened on keydown, the
    // keyup would have landed on that item and activated it on sight.
    expect(parent.api().open).toBe(true);
    expect(focusedValue()).toBe("open");
  });

  it("closes again when its trigger is clicked a second time", async () => {
    const { parent } = scene();
    const trigger = slot(parent, "trigger");

    // The full gesture: a press that opens, and the release that follows it, which
    // press-drag-release deliberately does not read as a toggle.
    pointerOn(trigger);
    trigger.click();
    await frames();
    expect(parent.api().open).toBe(true);

    // Past that grace, a whole second gesture — and the press half of it must not
    // renew the grace, or a menu button could never close its own menu (APG).
    await sleep(320);
    pointerOn(trigger);
    trigger.click();
    await frames();

    expect(parent.api().open).toBe(false);
  });

  it("hands the focus back to the trigger when it closes", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    parent.api().setOpen(false);
    await frames();

    expect(document.activeElement).toBe(slot(parent, "trigger"));
  });

  it("reads the checkmark column off its own children, and publishes it on the surface", async () => {
    const bare = scene();
    await openWithPointer(bare.parent);
    expect(slot(bare.parent, "content").hasAttribute("data-has-selection")).toBe(false);
    unmountAll();

    const gutter = scene({ gutter: true });
    await openWithPointer(gutter.parent);

    // The axis is named for the *menu*, not the item: it is read once for the
    // surface and published there.
    expect(slot(gutter.parent, "content").getAttribute("data-has-selection")).toBe("");
  });
});

describe("menu — the roving", () => {
  it("moves the real focus with the arrows, and says the keyboard did it", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("ArrowDown");
    expect(focusedValue()).toBe("rename");
    expect(item(parent, "rename").getAttribute("data-focus-source")).toBe("keyboard");
    // One focus, one source: an attribute on every item would describe nothing and
    // the ring would be drawn five times.
    expect(item(parent, "open").hasAttribute("data-focus-source")).toBe(false);

    press("ArrowUp");
    expect(focusedValue()).toBe("open");
  });

  it("steps over a disabled item rather than landing on it", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("End");
    expect(focusedValue()).toBe("revert");

    press("ArrowUp");
    // `trash` sits between the two and is never the answer, in either direction.
    expect(focusedValue()).toBe("share");
    press("ArrowDown");
    expect(focusedValue()).toBe("revert");
  });

  it("answers Home and End, and the page keys they are twins of", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("End");
    expect(focusedValue()).toBe("revert");
    press("Home");
    expect(focusedValue()).toBe("open");
    press("PageDown");
    expect(focusedValue()).toBe("revert");
    press("PageUp");
    expect(focusedValue()).toBe("open");
  });

  it("wraps by default, because native desktop menus do", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("ArrowUp");
    expect(focusedValue()).toBe("revert");
    press("ArrowDown");
    expect(focusedValue()).toBe("open");
    expect(slot(parent, "content").getAttribute("data-snav-wrap")).toBe("y");
  });

  it("stops at both ends when the wrap is turned off", async () => {
    const { parent } = scene({ props: { loopFocus: false } });
    await openWithKeyboard(parent);

    press("ArrowUp");
    expect(focusedValue()).toBe("open");
    press("End");
    press("ArrowDown");
    expect(focusedValue()).toBe("revert");
    expect(slot(parent, "content").hasAttribute("data-snav-wrap")).toBe(false);
  });

  it("never scrolls the page with the keys it answers", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      (document.activeElement as HTMLElement).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});

describe("menu — the typeahead", () => {
  it("jumps to an item by its label", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("s");
    expect(focusedValue()).toBe("share");
  });

  it("cycles through the items sharing a first letter, and never onto a disabled one", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("r");
    expect(focusedValue()).toBe("rename");
    // "rr" means "the next r", not "an item called rr".
    press("r");
    expect(focusedValue()).toBe("revert");
    press("r");
    expect(focusedValue()).toBe("rename");

    // The only item starting with a T is disabled, so the highlight stays put.
    press("t");
    expect(focusedValue()).toBe("rename");
  });

  it("extends the search while the buffer lives and starts over once it has expired", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    press("r");
    press("e");
    press("v");
    expect(focusedValue()).toBe("revert");

    // Still inside the 350ms buffer, so this is "revo" — which names nothing, and
    // a search that matches nothing moves nothing.
    press("o");
    expect(focusedValue()).toBe("revert");

    // Past it, the same key is a fresh search and finds the item it names.
    await sleep(420);
    press("o");
    expect(focusedValue()).toBe("open");
  });

  it("leaves the highlight alone when the typeahead is off", async () => {
    const { parent } = scene({ props: { typeahead: false } });
    await openWithKeyboard(parent);

    press("s");

    expect(focusedValue()).toBe("open");
  });

  it("keeps the space bar for activation, never for the buffer", async () => {
    const onSelect = vi.fn();
    const { parent } = scene({ props: { onSelect, selectionFlash: false } });
    await openWithKeyboard(parent);

    press(" ");
    releaseKey(" ");
    await frames();

    // APG's split: Enter on the way down, Space on the way up — and a menu that
    // typed the space would never activate anything with it.
    expect(onSelect).toHaveBeenCalledWith({ value: "open" });
  });
});

describe("menu — the pointer", () => {
  it("highlights and focuses under the pointer, without lighting the ring", async () => {
    const { parent } = scene();
    await openWithPointer(parent);
    setInputModality(document, "pointer");

    hover(item(parent, "rename"));
    await frames(1);

    // The survival of the focus ring depends on this pair: the focus is real, so it
    // matches `:focus-visible` on all three engines, and only the source keeps the
    // ring off (mémoire du dépôt).
    expect(focusedValue()).toBe("rename");
    expect(item(parent, "rename").getAttribute("data-highlighted")).toBe("");
    expect(item(parent, "rename").getAttribute("data-focus-source")).toBe("pointer");
  });

  it("ignores a disabled item under the pointer", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    hover(item(parent, "trash"));
    await frames(1);

    expect(highlighted(parent)).toBe("open");
    expect(item(parent, "trash").hasAttribute("data-highlighted")).toBe(false);
  });

  it("never takes a touch pointermove for a hover", async () => {
    const { parent } = scene();
    await openWithPointer(parent);

    const target = item(parent, "rename");
    const { x, y } = centreOf(target);
    target.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        composed: true,
        pointerType: "touch",
        clientX: x,
        clientY: y,
      }),
    );
    await frames(1);

    // A touch `pointermove` is a scroll or the beginning of a long press; taking it
    // would highlight whatever the finger passed over.
    expect(highlighted(parent)).toBeNull();
  });
});

describe("menu — how it is dismissed", () => {
  it("closes on Escape", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();

    expect(parent.api().open).toBe(false);
  });

  it("swallows the click that closed it, so nothing underneath is activated (parity M5)", async () => {
    const { parent } = scene();
    await openWithPointer(parent);

    const outside = slot(parent, "outside");
    const activated = vi.fn();
    outside.addEventListener("click", activated);
    extra.push(() => outside.removeEventListener("click", activated));

    pointerOn(outside);
    outside.click();
    await frames();

    expect(parent.api().open).toBe(false);
    // The native behaviour, and the one the reference app's own context menu had: the click that
    // dismisses a menu stops there. `preventDefault` on the pointerdown does not do
    // it — the browser synthesises the click anyway.
    expect(activated).not.toHaveBeenCalled();
  });

  it("lets the click through when the consumer asked for that instead", async () => {
    const { parent } = scene({ props: { preventOutsideActivation: false } });
    await openWithPointer(parent);

    const outside = slot(parent, "outside");
    const activated = vi.fn();
    outside.addEventListener("click", activated);
    extra.push(() => outside.removeEventListener("click", activated));

    pointerOn(outside);
    outside.click();
    await frames();

    expect(parent.api().open).toBe(false);
    expect(activated).toHaveBeenCalledTimes(1);
  });

  it("holds when the lock says so, and reads that lock live", async () => {
    const { parent } = scene({ props: { closeOnEscape: false } });
    await openWithKeyboard(parent);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();
    expect(parent.api().open).toBe(true);

    parent.setProps({ closeOnEscape: true });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();

    // The layer was installed once and outlives every prop change.
    expect(parent.api().open).toBe(false);
  });

  it("leaves on Tab and hands the tab sequence back to the trigger (APG Menu Button)", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(event);
    await frames();

    expect(parent.api().open).toBe(false);
    // **The menu's own handler does not prevent it** — `onContentKeyDown` answers
    // Tab ahead of the `defaultPrevented` gate precisely so the key is not
    // swallowed. What prevents it is `proxyTabFocus`, which listens on the document
    // in capture and takes over whenever the focus sits on the surface's last
    // tabbable: under a roving tabindex that is the highlighted item, so always.
    // It then places the focus itself, which is why the trigger ends up with it.
    //
    // This read `false` until 2026-09-02, and only because the scene drew a Cancel
    // button after the items. That stray tab stop meant the highlighted item was
    // *not* the last tabbable, so the proxy stood down — the assertion was green
    // for a reason the connect comment says cannot happen. The Cancel row is a
    // roving item now and the scene renders it on request, so the surface has
    // exactly one tab stop, which is what a roving composite is supposed to have.
    expect(event.defaultPrevented).toBe(true);
    // And the focus lands on the element *after* the trigger, which is the half of
    // the APG rule the old assertion called impossible for a synthetic key event.
    // It is impossible for the key — the proxy performs it instead.
    expect(document.activeElement).toBe(slot(parent, "outside"));
  });

  it("takes the whole tree with it when Tab is pressed inside a submenu", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);
    parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    await frames();
    expect(child.api().open).toBe(true);

    press("Tab");
    await frames();

    expect(child.api().open).toBe(false);
    expect(parent.api().open).toBe(false);
    // Out of both surfaces, and back where the tab sequence continues from — the
    // submenu's own "trigger" is an item inside a menu that no longer exists.
    expect(slot(child, "content").contains(document.activeElement)).toBe(false);
    expect(slot(parent, "content").contains(document.activeElement)).toBe(false);
  });

  it("gives back everything it took", async () => {
    const bus = createIntentBus();
    const { parent } = scene({ props: { intents: bus } });
    const depthBefore = bus.depth();
    await openWithKeyboard(parent);

    const stack = getLayerStack(document);
    expect(stack.layers().length).toBe(1);
    expect(bus.depth()).toBe(depthBefore + 1);

    parent.api().setOpen(false);
    await frames();

    // Every effect hands back a disposer: the layer, the intent scope, and the two
    // timers a menu can leave armed.
    expect(stack.layers().length).toBe(0);
    expect(bus.depth()).toBe(depthBefore);
    expect(parent.service.refs.get("intentTimer")).toBeNull();
    expect(parent.service.refs.get("flashTimer")).toBeNull();
  });
});

describe("menu — selecting", () => {
  it("reports the value, then closes the tree", async () => {
    const onSelect = vi.fn();
    const { parent } = scene({ props: { onSelect, selectionFlash: false } });
    await openWithKeyboard(parent);

    item(parent, "rename").click();
    await frames();

    expect(onSelect).toHaveBeenCalledWith({ value: "rename" });
    expect(parent.api().open).toBe(false);
  });

  it("stays open for an item that says it should", async () => {
    const onSelect = vi.fn();
    const { parent } = scene({ props: { onSelect, selectionFlash: false } });
    await openWithKeyboard(parent);

    // The item's own answer outranks the machine's — a checkable row in a menu that
    // otherwise closes on every click.
    parent.service.send({ type: "ITEM.SELECT", value: "rename", closeOnSelect: false });
    await frames();

    expect(onSelect).toHaveBeenCalledWith({ value: "rename" });
    expect(parent.api().open).toBe(true);
  });

  it("never selects a disabled item, by pointer or by key", async () => {
    const onSelect = vi.fn();
    const { parent } = scene({ props: { onSelect, selectionFlash: false } });
    await openWithKeyboard(parent);

    item(parent, "trash").click();
    parent.service.send({ type: "ITEM.SELECT", value: "trash" });
    await frames();

    expect(onSelect).not.toHaveBeenCalled();
    expect(parent.api().open).toBe(true);
  });

  it("blinks before it closes, and the close waits for the blink", async () => {
    document.documentElement.setAttribute("data-motion", "full");
    const { parent } = scene();
    await openWithKeyboard(parent);

    item(parent, "rename").click();
    await frames(1);

    // The selection blink. The surface is still there, and the item says why.
    expect(item(parent, "rename").getAttribute("data-highlighted-flash")).toBe("");
    expect(parent.api().open).toBe(true);

    await sleep(260);
    expect(parent.api().open).toBe(false);
  });

  it("does not blink under reduced motion, and does not delay the close either", async () => {
    document.documentElement.setAttribute("data-motion", "reduced");
    const { parent } = scene();
    await openWithKeyboard(parent);

    item(parent, "rename").click();
    await frames(1);

    // The guard reads the environment in the effect, never in `connect`.
    expect(item(parent, "rename").hasAttribute("data-highlighted-flash")).toBe(false);
    expect(parent.api().open).toBe(false);
  });

  it("takes a menu closed mid-blink out of the flash with it", async () => {
    document.documentElement.setAttribute("data-motion", "full");
    const { parent } = scene();
    await openWithKeyboard(parent);

    item(parent, "rename").click();
    await frames(1);
    expect(parent.service.context.get("flashingValue")).toBe("rename");

    parent.api().setOpen(false);
    await frames();

    // Otherwise the timer fires into a service that has already stopped.
    expect(parent.service.context.get("flashingValue")).toBeNull();
    expect(parent.service.refs.get("flashTimer")).toBeNull();
  });
});

describe("menu — the submenu", () => {
  it("opens under the pointer after its delay, and aims the focus at it on demand", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);

    hover(item(parent, "share"));
    expect(child.api().open).toBe(false);

    await sleep(60);
    expect(child.api().open).toBe(true);
    sync(parent);
    expect(item(parent, "share").getAttribute("data-state")).toBe("open");
    expect(item(parent, "share").getAttribute("aria-expanded")).toBe("true");
    // The parent's highlight stays on the item that opened it — the pointer is
    // still there — while the surface that just appeared takes the keys, because
    // an open surface with no focus in it answers nothing.
    expect(highlighted(parent)).toBe("share");
    expect(slot(child, "content").contains(document.activeElement)).toBe(true);
  });

  it("walks in with ArrowRight and back out with ArrowLeft, one level at a time", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);

    press("ArrowDown");
    press("ArrowDown");
    expect(focusedValue()).toBe("share");

    press("ArrowRight");
    await frames();
    expect(child.api().open).toBe(true);
    expect(focusedValue()).toBe("copy-link");

    press("ArrowLeft");
    await frames();

    expect(child.api().open).toBe(false);
    expect(parent.api().open).toBe(true);
    // Back on the item that opened it, still highlighted.
    expect(document.activeElement).toBe(item(parent, "share"));
  });

  it("mirrors the two keys in RTL, and only those two", async () => {
    const { parent, child } = scene({ props: { dir: "rtl" }, childProps: { dir: "rtl" } });
    await openWithKeyboard(parent);

    press("ArrowDown");
    press("ArrowDown");
    expect(focusedValue()).toBe("share");

    // `fwd` is ArrowLeft here — the physical key, mirrored once.
    press("ArrowRight");
    await frames();
    expect(child.api().open).toBe(false);

    press("ArrowLeft");
    await frames();
    expect(child.api().open).toBe(true);
    expect(focusedValue()).toBe("copy-link");

    press("ArrowRight");
    await frames();
    expect(child.api().open).toBe(false);
  });

  it("closes only its own level on Escape, and hands the focus back to the trigger item", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowRight");
    await frames();
    expect(focusedValue()).toBe("copy-link");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await frames();

    // Only the top-most layer answers Escape, so one press closes one level.
    expect(child.api().open).toBe(false);
    expect(parent.api().open).toBe(true);
    expect(document.activeElement).toBe(item(parent, "share"));
  });

  it("stays open across a pointer cutting diagonally towards it", async () => {
    // **The boundary is stated, and it has to be.** This test is about the safe
    // triangle, which only exists when the submenu is *beside* its parent — and the
    // runner's viewport is 414px wide, in which it genuinely is not: the parent
    // surface ends at 230, the child wants 190 more, and the fallback placements
    // correctly open it under the trigger row instead. Left to the viewport, this
    // test measured the runner rather than the rule.
    const { parent, child } = scene({
      props: { submenuOpenDelay: 10, submenuCloseDelay: 10 },
      childProps: {
        boundary: () => ({ x: 0, y: 0, width: 1200, height: window.innerHeight }),
      },
    });
    await openWithKeyboard(parent);

    const share = item(parent, "share");
    hover(share);
    await sleep(50);
    expect(child.api().open).toBe(true);

    // A point on the straight line from the trigger item to the middle of the open
    // submenu — which necessarily passes over another item, and that crossing is
    // the single most complained-about bug in menus that do not do this.
    const from = centreOf(share);
    const target = slot(child, "content").getBoundingClientRect();
    // The premise, asserted rather than assumed: the child really is to the side.
    expect(slot(child, "positioner").dataset["side"]).toBe("right");
    const to = { x: target.x + 4, y: target.y + target.height / 2 };
    const step = (t: number): { x: number; y: number } => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
    const crossed = item(parent, "revert");
    for (const t of [0.15, 0.3]) {
      const point = step(t);
      pointerMove(crossed, point.x, point.y);
    }
    await sleep(50);

    expect(child.api().open).toBe(true);
    // And the highlight never re-aimed at what the pointer merely crossed.
    expect(highlighted(parent)).toBe("share");
  });

  it("opens under the trigger row when neither side has room", async () => {
    // The runner's own 414px viewport *is* the case, which is why no boundary is
    // stated here: the parent surface ends at 230, the child wants 190 more, and
    // `left-start` is worse still. Until the fallback list there was no third
    // candidate — the surface stayed where it did not fit and was cropped by its
    // own `max-inline-size` down to a ribbon, a position error served as a width one.
    const { parent, child } = scene({ props: { submenuOpenDelay: 10, submenuCloseDelay: 10 } });
    await openWithKeyboard(parent);

    hover(item(parent, "share"));
    await sleep(50);
    expect(child.api().open).toBe(true);

    const row = item(parent, "share").getBoundingClientRect();
    const surface = slot(child, "content").getBoundingClientRect();

    expect(slot(child, "positioner").dataset["side"]).toBe("bottom");
    // Two boxes compared against each other, which nothing in this suite did before:
    // directly under the row that opened it, on the same leading edge, on screen.
    expect(Math.round(surface.top - row.bottom)).toBe(4);
    expect(Math.round(surface.left)).toBe(Math.round(row.left));
    expect(surface.right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("closes the child once the pointer settles on another item", async () => {
    const { parent, child } = scene({ props: { submenuOpenDelay: 10, submenuCloseDelay: 10 } });
    await openWithKeyboard(parent);

    hover(item(parent, "share"));
    await sleep(50);
    expect(child.api().open).toBe(true);

    // Straight up, away from the submenu: nothing about this is a shortcut across.
    hover(item(parent, "open"));
    hover(item(parent, "open"));
    await sleep(60);

    expect(child.api().open).toBe(false);
    expect(highlighted(parent)).toBe("open");
  });

  it("never dismisses its parent when the submenu itself is clicked", async () => {
    const onSelect = vi.fn();
    const { parent, child } = scene({
      childProps: { onSelect, selectionFlash: false, closeOnSelect: false },
    });
    await openWithKeyboard(parent);
    parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    await frames();

    pointerOn(item(child, "copy-link"));
    await frames();

    // Declared parenthood, because once both are portalled the DOM cannot tell.
    expect(parent.api().open).toBe(true);
    expect(child.api().open).toBe(true);
  });

  it("takes the whole tree down when a leaf is chosen", async () => {
    const onSelect = vi.fn();
    const { parent, child } = scene({ childProps: { onSelect, selectionFlash: false } });
    await openWithKeyboard(parent);
    parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    await frames();

    item(child, "copy-link").click();
    await frames();

    expect(onSelect).toHaveBeenCalledWith({ value: "copy-link" });
    expect(child.api().open).toBe(false);
    expect(parent.api().open).toBe(false);
  });

  it("keeps the two item lists apart, however they are nested", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);
    parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    await frames();

    press("ArrowDown");
    // The child's roving sees two items, not seven: a machine reads its own items
    // up to the nearest `content`, so the wrap comes after two.
    expect(focusedValue()).toBe("mail");
    press("ArrowDown");
    expect(focusedValue()).toBe("copy-link");
    // And nothing the child did reached the parent's own highlight.
    expect(highlighted(parent)).toBe("open");
    expect(highlighted(child)).toBe("copy-link");
  });

  it("refuses to open a submenu from a row that does not own one", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);

    // The machine holds **one** child slot, and it belongs to the trigger item.
    // Walk the highlight onto a plain row and ask to open: until 2026-09-02 this
    // opened the neighbour's submenu, anchored to a line the highlight was
    // nowhere near, because `CHILD.OPEN` carried no guard at all.
    parent.api().setHighlightedValue("rename");
    press("ArrowRight");
    await frames();
    expect(child.api().open).toBe(false);

    // And the row that does own one still opens it, so the guard did not simply
    // turn the feature off.
    parent.api().setHighlightedValue("share");
    press("ArrowRight");
    await frames();
    expect(child.api().open).toBe(true);
  });

  it("closes an open submenu when the highlight walks off its trigger item", async () => {
    const { parent, child } = scene();
    await openWithKeyboard(parent);

    hover(item(parent, "share"));
    await sleep(60);
    expect(child.api().open).toBe(true);

    // The pointer path had this covered — `ITEM.POINTERLEAVE` schedules the close.
    // The keyboard and the d-pad did not, so a submenu opened by a hover survived
    // an arrow key and stayed open, anchored to a row that was no longer
    // highlighted. Aimed at the parent's own content on purpose: the focus is in
    // the child by now, which is the whole shape of the bug.
    press("ArrowUp", slot(parent, "content"));
    await frames();

    expect(highlighted(parent)).toBe("rename");
    expect(child.api().open).toBe(false);
  });
});

describe("menu — opened from a region", () => {
  it("anchors a right click to the point rather than to the region", async () => {
    const { parent } = scene();
    const region = slot(parent, "context-trigger");

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 260,
      clientY: 180,
    });
    region.dispatchEvent(event);
    await frames();

    expect(event.defaultPrevented).toBe(true);
    expect(parent.api().open).toBe(true);
    expect(parent.service.refs.get("anchorPoint")).toEqual({ x: 260, y: 180 });
    // A right click opens onto the first item, the way a keyboard opening does.
    expect(focusedValue()).toBe("open");

    // Measured against a zero-sized rect where the pointer landed, and not against
    // the 220px-wide region: the anchor the positioner published has no size at
    // all, which no element anchor ever produces. Its *position* is deliberately
    // not asserted — a shift clamp against the harness viewport is the positioner's
    // arithmetic, and it has its own suite.
    const positioner = slot(parent, "positioner");
    expect(positioner.style.getPropertyValue("--sui-anchor-width")).toBe("0px");
    expect(positioner.style.getPropertyValue("--sui-anchor-height")).toBe("0px");
    expect(positioner.style.transform).toMatch(/^translate3d\(/);
  });

  it("opens on a long press, and never on a mouse held still", async () => {
    const { parent } = scene();
    const region = slot(parent, "context-trigger");

    region.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "mouse",
        isPrimary: true,
        clientX: 100,
        clientY: 340,
      }),
    );
    await sleep(560);
    expect(parent.api().open).toBe(false);

    region.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        isPrimary: true,
        clientX: 100,
        clientY: 340,
      }),
    );
    await sleep(560);

    // 500ms is the iOS delay, and on a pointer device the gesture is a right click
    // instead — hence `allowMouse: false`.
    expect(parent.api().open).toBe(true);
    expect(parent.service.refs.get("anchorPoint")).toEqual({ x: 100, y: 340 });
  });
});

describe("menu — the gamepad", () => {
  function withPad(options: SceneOptions = {}): {
    scene: Scene;
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
    return {
      scene: scene({
        ...options,
        props: { intents: bus, ...options.props },
        childProps: { intents: bus, ...options.childProps },
      }),
      bus,
      seen,
    };
  }

  it("moves the highlight with the d-pad, exactly as the arrows do", async () => {
    const { scene: tree, bus } = withPad();
    await openWithKeyboard(tree.parent);

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("rename");
    expect(bus.dispatch({ intent: "moveUp", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("open");
    expect(bus.dispatch({ intent: "end", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("revert");
    // LT/RT are first/last in a menu — the same table, folded once.
    expect(bus.dispatch({ intent: "pageUp", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("open");
  });

  it("activates on A and closes on B, one level at a time", async () => {
    const onSelect = vi.fn();
    const { scene: tree, bus } = withPad({ props: { onSelect, selectionFlash: false } });
    await openWithKeyboard(tree.parent);

    bus.dispatch({ intent: "moveDown", source: "gamepad" });
    expect(bus.dispatch({ intent: "select", source: "gamepad" }).consumed).toBe(true);
    await frames();

    // A clicks the element rather than shortcutting past it, so a pad activation
    // runs exactly the handlers a click would.
    expect(onSelect).toHaveBeenCalledWith({ value: "rename" });
    expect(tree.parent.api().open).toBe(false);
  });

  it("closes the submenu on B and leaves the menu it drills out of alone", async () => {
    const { scene: tree, bus } = withPad();
    await openWithKeyboard(tree.parent);
    tree.parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    await frames();

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    await frames();

    expect(tree.child.api().open).toBe(false);
    expect(tree.parent.api().open).toBe(true);
  });

  it("opens a context menu from Y on the focused element, which nothing else could do", async () => {
    const { scene: tree, bus } = withPad();
    // The region is a plain container with no handler of its own: its only openers
    // were a right click and a long press, so a keyboard and a pad had none at all
    // — WCAG 2.1.1 on the single gesture the part exists for. Shift+F10 arrives as
    // the same intent and takes the same path.
    slot(tree.parent, "canvas-cell").focus();
    expect(tree.parent.api().open).toBe(false);

    expect(bus.dispatch({ intent: "contextMenu", source: "gamepad" }).consumed).toBe(true);
    await frames();

    expect(tree.parent.api().open).toBe(true);
  });

  it("refuses Y, which is what opens a context menu on whatever holds the focus", async () => {
    const { scene: tree, bus, seen } = withPad();
    await openWithKeyboard(tree.parent);

    for (const intent of ["contextMenu", "secondary", "tabNext", "tabPrev"] as const) {
      expect(bus.dispatch({ intent, source: "gamepad" }).consumed).toBe(false);
    }

    // A menu that swallowed Y would make the one gesture it exists for impossible
    // from inside itself; the rest are simply not a menu's.
    expect(seen).toEqual(["contextMenu", "secondary", "tabNext", "tabPrev"]);
    expect(tree.parent.api().open).toBe(true);
  });

  it("holds on B when Escape is locked — the two share one lock", async () => {
    const { scene: tree, bus } = withPad({ props: { closeOnEscape: false } });
    await openWithKeyboard(tree.parent);

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(false);
    expect(tree.parent.api().open).toBe(true);
  });
});

describe("menu — where the surface lands", () => {
  it("moves with a translate and publishes the room it has", async () => {
    const { parent } = scene();
    await openWithPointer(parent);
    const positioner = slot(parent, "positioner");

    expect(positioner.style.transform).toMatch(/^translate3d\(/);
    expect(positioner.style.position).toBe("fixed");
    expect(positioner.dataset.side).toBe("bottom");
    expect(positioner.dataset.align).toBe("start");
    // What lets a long menu cap itself in CSS without the sheet knowing where the
    // anchor is. There is no `--sui-arrow-*`: a menu has no tang.
    expect(positioner.style.getPropertyValue("--sui-available-height")).toMatch(/px$/);
    expect(positioner.style.getPropertyValue("--sui-transform-origin")).not.toBe("");
    expect(slot(parent, "content").dataset.side).toBe("bottom");
  });

  it("wipes the anchored styles when the density turns it into a sheet", async () => {
    const { parent } = scene();
    await openWithPointer(parent);
    expect(slot(parent, "positioner").style.transform).not.toBe("");

    parent.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    await frames();

    const positioner = slot(parent, "positioner");
    // Cleared on the way *in* to the sheet, never on the way out of the popup pass:
    // a disposer runs while `open` is going false with the node still mounted, and
    // the surface would snap to 0,0 mid-exit.
    expect(positioner.style.transform).toBe("");
    expect(positioner.style.position).toBe("");
    expect(slot(parent, "content").dataset.presentation).toBe("sheet");
    // The semantics never follow the presentation.
    expect(slot(parent, "content").getAttribute("role")).toBe("menu");
    expect(parent.api().open).toBe(true);
  });

  it("locks the page behind a sheet, and gives the scroll back when it closes", async () => {
    const { parent } = scene({ props: { presentation: "sheet" } });
    await openWithPointer(parent);

    expect(document.body.style.overflow).toBe("hidden");

    parent.api().setOpen(false);
    await frames();

    expect(document.body.style.overflow).toBe("");
  });

  it("never blinks in a sheet, whatever the prop says", async () => {
    document.documentElement.setAttribute("data-motion", "full");
    const { parent } = scene({ props: { presentation: "sheet" } });
    await openWithKeyboard(parent);

    item(parent, "rename").click();
    await frames(1);

    expect(item(parent, "rename").hasAttribute("data-highlighted-flash")).toBe(false);
    expect(parent.api().open).toBe(false);
  });
});

describe("menu — the items it publishes", () => {
  it("gives every enabled item a role, a value and one tab stop between them", async () => {
    const { parent } = scene();
    await openWithKeyboard(parent);

    const items = [
      ...slot(parent, "content").querySelectorAll<HTMLElement>(
        '[data-part~="menu:item"], [data-part~="menu:trigger-item"]',
      ),
    ];
    expect(items.map((node) => node.getAttribute("data-value"))).toEqual([
      "open",
      "rename",
      "share",
      "trash",
      "revert",
    ]);
    expect(items.every((node) => node.getAttribute("role") === "menuitem")).toBe(true);
    expect(items.filter((node) => node.tabIndex === 0).length).toBe(1);
    expect(item(parent, "trash").getAttribute("aria-disabled")).toBe("true");
    expect(item(parent, "open").getAttribute("aria-keyshortcuts")).toBe("Meta+O");
    for (const value of ENABLED) {
      expect(item(parent, value).hasAttribute("aria-disabled")).toBe(false);
    }
  });

  it("puts the sheet's Cancel row in the roving list, where End can reach it", async () => {
    const { parent } = scene({ cancel: true });
    await openWithKeyboard(parent);
    const cancel = slot(parent, "cancel");

    // It is drawn inside a `role="menu"`, which owns nothing but menu items, so it
    // is one — and a `menuitem` the roving list does not know about is a control
    // that no keyboard and no d-pad can reach. It sat outside that list until
    // 2026-09-02, which left `End` in the sheet one row short of the only button
    // the sheet has.
    expect(cancel.getAttribute("role")).toBe("menuitem");

    press("End");
    expect(document.activeElement).toBe(cancel);
    expect(cancel.tabIndex).toBe(0);
    expect(highlighted(parent)).toBe("sui:menu:cancel");
    // Namespaced on purpose: it shares a `data-value` space with the consumer's
    // own items, so a menu with a row called `cancel` must not collide with it.
    expect(item(parent, "revert").tabIndex).toBe(-1);

    // Activating it from the keyboard closes the tree, because `ITEM.ACTIVATE`
    // clicks the element rather than shortcutting past its own handler.
    press("Enter");
    await frames();
    expect(parent.api().open).toBe(false);
  });
});

/**
 * **A menu that overflows, which nothing in this file had ever mounted.** Every
 * scene above gives the surface more box than it has rows, so the one case the
 * scroll affordance exists for was unreachable — the audit of 2026-09-02 named it
 * as one of three *natures* of assertion missing here, not as a missing fixture.
 *
 * The box is inline because no test in this file loads a stylesheet: `overflow-y`
 * comes from `_menu.scss` in a real app and from the `style` attribute here, and
 * the machine cannot tell the difference — `scrollHeight` is `scrollHeight`.
 */
const LONG_ITEMS: readonly ItemSpec[] = Array.from({ length: 12 }, (_, index) => ({
  value: `row-${index}`,
  label: `Row ${index + 1}`,
}));

const ROW_HEIGHT = 28;

function longScene(height: number): Harness {
  return mountMachine<MenuSchema, Api>({
    machine,
    connect,
    id: "m3",
    html: `
      <button data-slot="trigger" style="position:absolute;left:40px;top:200px;width:90px;height:24px">Actions</button>
      <div data-slot="positioner" style="position:absolute;left:0;top:0;width:190px">
        <div data-slot="content" style="width:190px;height:${height}px;overflow-y:auto">
          ${LONG_ITEMS.map((spec) => itemMarkup(spec, false)).join("")}
        </div>
      </div>`,
    paint: (host, api, apply) => paintSurface(host, api, apply, LONG_ITEMS, null, false),
  });
}

describe("menu — when there is more menu than there is room", () => {
  it("publishes which way the surface can still go, and keeps it current as it moves", async () => {
    const harness = longScene(3 * ROW_HEIGHT);
    await openWithKeyboard(harness);
    const content = slot(harness, "content");

    // Enter opens onto the first row, so the surface starts at its top: there is
    // more below and nothing above.
    expect(content.scrollTop).toBe(0);
    expect(content.getAttribute("data-scroll")).toBe("down");

    content.scrollTop = 4 * ROW_HEIGHT;
    await frames();
    expect(content.getAttribute("data-scroll")).toBe("up down");

    content.scrollTop = content.scrollHeight;
    await frames();
    // Not "up down" at the end, and this is what the pixel of slack in
    // `readScrollEdges` buys: a fractional row height leaves `scrollTop +
    // clientHeight` a hair short of `scrollHeight` on a scroller that is visibly
    // finished, and an affordance saying "more below" there would never go away.
    expect(content.getAttribute("data-scroll")).toBe("up");

    // Nothing left to reach in either direction drops the attribute rather than
    // publishing an empty one: the sheet keys off `[data-scroll~="up"]`, and an
    // empty token list matches nothing anyway — but a value of "" on the node reads
    // like a state the machine is in, and it is the absence of one.
    content.style.height = `${(LONG_ITEMS.length + 2) * ROW_HEIGHT}px`;
    await frames();
    expect(content.hasAttribute("data-scroll")).toBe(false);
  });

  it("notices rows arriving under it, with the scroll position never moving", async () => {
    // Twice the room the rows need, so this one starts fitting.
    const harness = longScene(2 * LONG_ITEMS.length * ROW_HEIGHT);
    await openWithKeyboard(harness);
    const content = slot(harness, "content");
    expect(content.hasAttribute("data-scroll")).toBe(false);

    // A filter clearing, a section expanding: the reachable set changes with no
    // scroll and no resize, which is why neither listener alone is enough.
    for (let index = 0; index < 24; index += 1) {
      content.insertAdjacentHTML(
        "beforeend",
        itemMarkup({ value: `late-${index}`, label: `Late ${index}` }, false),
      );
    }
    await frames();
    expect(content.scrollTop).toBe(0);
    expect(content.getAttribute("data-scroll")).toBe("down");
  });
});

describe("menu — the direction carried across the portal", () => {
  /**
   * `root: false` renders neither trigger nor context-trigger, which is the
   * store-driven shape `composed.tsx` calls legal: `open` on one side, `label`
   * for the name the trigger would have given it.
   */
  function anchorless(props: MenuMachineProps = {}): Harness {
    return mountMachine<MenuSchema, Api>({
      machine,
      connect,
      id: "m-dir",
      html: markup(CHILD_ITEMS, { gutter: false, root: false, cancel: false }),
      props: { label: "Actions", ...props },
      paint: (host, api, apply) => paintSurface(host, api, apply, CHILD_ITEMS, null, false),
    });
  }

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
    const { parent } = scene();
    slot(parent, "trigger").setAttribute("dir", "rtl");
    slot(parent, "trigger").click();
    await frames();

    expect(slot(parent, "content").getAttribute("dir")).toBe("rtl");
  });

  it("falls back to the page when nothing anchors it", async () => {
    inRtlPage();
    const harness = anchorless();
    // This harness does not portal: without an LTR parent in the way, the
    // surface would inherit `rtl` and a fallback reading it would pass too.
    slot(harness, "positioner").setAttribute("dir", "ltr");
    harness.api().setOpen(true);
    await frames();

    expect(slot(harness, "content").getAttribute("dir")).toBe("rtl");
  });
});
