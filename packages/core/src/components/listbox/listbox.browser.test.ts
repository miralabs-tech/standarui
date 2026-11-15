/**
 * The listbox against a real engine, driven with no framework at all.
 *
 * Everything here needs a page for the reason `menu.browser.test.ts` states:
 * **the collection is the DOM**. The roving order, the typeahead, the page jump
 * and the focus rescue all resolve against live elements, so a node harness can
 * only watch them answer "no items" — which is what `listbox.test.ts` does,
 * deliberately, while every rule about *which* row wins is proved here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntentBus, type IntentBus, setInputModality } from "../../nav";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./listbox.connect";
import { machine } from "./listbox.machine";
import type { ListboxApi, ListboxMachineProps, ListboxSchema } from "./listbox.types";

type Api = ListboxApi<DomPropTypes>;
type Harness = ReturnType<typeof mountMachine<ListboxSchema, Api>>;

interface ItemSpec {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Overrides what the typeahead matches on — `data-label` outranks the text. */
  readonly typeaheadLabel?: string;
}

/**
 * Two rows starting with the same letter (Ada, Alan) so a repeated keystroke has
 * something to cycle through, and one disabled row in the middle so every
 * traversal has to step over something.
 */
const PEOPLE: readonly ItemSpec[] = [
  { value: "ada", label: "Ada Lovelace" },
  { value: "alan", label: "Alan Turing" },
  { value: "grace", label: "Grace Hopper" },
  { value: "edsger", label: "Edsger Dijkstra", disabled: true },
  { value: "barbara", label: "Barbara Liskov" },
];

const ENABLED = ["ada", "alan", "grace", "barbara"] as const;

/**
 * The rows are given a height and the scroller a smaller one: three of the five
 * rules below are geometric — the page jump measures a screenful, the scroll
 * affordance measures an overflow, and a zero-height row cannot be either.
 */
function markup(items: readonly ItemSpec[]): string {
  const rows = items
    .map(
      (item) =>
        `<div data-slot="item:${item.value}" style="block-size:32px">
           <span data-slot="text:${item.value}">${item.label}</span>
           <span data-slot="indicator:${item.value}"></span>
         </div>`,
    )
    .join("");

  return `
    <div data-slot="root">
      <span data-slot="label">People</span>
      <div data-slot="content" style="block-size:120px;overflow:auto">
        <div data-slot="group">
          <span data-slot="group-label">Pioneers</span>
          ${rows}
        </div>
      </div>
    </div>
    <button type="button" data-slot="outside">Elsewhere</button>`;
}

function paintList(
  host: HTMLElement,
  api: Api,
  apply: ApplyProps,
  items: readonly ItemSpec[],
  withLabel: boolean,
): void {
  const put = (slot: string, values: Record<string, unknown>): void => {
    const node = host.querySelector(`[data-slot="${slot}"]`);
    if (node !== null) apply(node, values);
  };

  put("root", api.getRootProps());
  if (withLabel) put("label", api.getLabelProps());
  put("content", api.getContentProps());
  put("group", api.getItemGroupProps({ id: "pioneers", label: true }));
  put("group-label", api.getItemGroupLabelProps({ htmlFor: "pioneers" }));

  for (const item of items) {
    put(
      `item:${item.value}`,
      api.getItemProps({
        value: item.value,
        disabled: item.disabled,
        label: item.typeaheadLabel,
      }),
    );
    put(`text:${item.value}`, api.getItemTextProps());
    put(`indicator:${item.value}`, api.getItemIndicatorProps({ value: item.value }));
  }
}

interface SceneOptions {
  readonly props?: ListboxMachineProps;
  readonly items?: readonly ItemSpec[];
  /** Off for the shape that has to name itself with `label` instead. */
  readonly withLabel?: boolean;
}

/**
 * Every scene gets an id of its own, and it is not a detail: the harness resolves
 * its parts through `document.getElementById`, so two lists sharing a scope id in
 * one test would both answer with the first one's rows.
 */
let scenes = 0;

function scene(options: SceneOptions = {}): Harness {
  const items = options.items ?? PEOPLE;
  const withLabel = options.withLabel !== false;
  scenes += 1;

  return mountMachine<ListboxSchema, Api>({
    machine,
    connect,
    id: `l${scenes}`,
    html: markup(items),
    props: options.props,
    paint: (host, api, apply) => paintList(host, api, apply, items, withLabel),
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

const row = (harness: Harness, value: string): HTMLElement => slot(harness, `item:${value}`);

const focusedValue = (): string | null =>
  (document.activeElement as HTMLElement | null)?.dataset.value ?? null;

const highlighted = (harness: Harness): string | null =>
  harness.host.querySelector<HTMLElement>("[data-highlighted]")?.dataset.value ?? null;

const tabStops = (harness: Harness): string[] =>
  [...harness.host.querySelectorAll<HTMLElement>('[data-part~="listbox:item"]')]
    .filter((item) => item.tabIndex === 0)
    .map((item) => item.dataset.value ?? "");

/** A keydown that a real key would bubble out of the focused row. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const node = (document.activeElement ?? document.body) as HTMLElement;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event.defaultPrevented;
}

function release(key: string, init: KeyboardEventInit = {}): void {
  const node = (document.activeElement ?? document.body) as HTMLElement;
  node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init }));
}

function click(node: HTMLElement, init: MouseEventInit = {}): void {
  node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

/** Lets a `MutationObserver` — and therefore `ITEMS.SYNC` — land. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Longer than the typeahead's 350ms buffer, so the next key starts a new search. */
function forgetTypeahead(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

/** Enters the list the way a Tab does: the single stop takes the real focus. */
function enter(harness: Harness): void {
  const stop = tabStops(harness)[0];
  if (stop === undefined) throw new Error("the list has no tab stop to enter through");
  row(harness, stop).focus();
}

afterEach(() => unmountAll());

describe("listbox roving and entry", () => {
  it("holds exactly one tab stop, and starts it at the first enabled row", async () => {
    const harness = scene();
    await settle();

    expect(tabStops(harness)).toEqual(["ada"]);
  });

  it("puts the stop on the selected row, which is where APG says focus lands", async () => {
    const harness = scene({ props: { defaultValue: ["grace"] } });
    await settle();

    expect(tabStops(harness)).toEqual(["grace"]);
  });

  it("remembers where it was left when nothing is selected", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();

    enter(harness);
    press("ArrowDown");
    press("ArrowDown");
    expect(highlighted(harness)).toBe("grace");

    slot(harness, "outside").focus();
    await settle();

    // The highlight survives the departure — it is the memory the stop comes back
    // to — while the modality it arrived under does not.
    expect(highlighted(harness)).toBe("grace");
    expect(tabStops(harness)).toEqual(["grace"]);
  });

  it("never traps: Tab is not answered by the list", () => {
    const harness = scene();
    enter(harness);

    expect(press("Tab")).toBe(false);
  });
});

describe("listbox arrows", () => {
  it("moves the real focus, not a virtual one, and steps over disabled rows", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);

    expect(press("ArrowDown")).toBe(true);
    expect(focusedValue()).toBe("alan");
    press("ArrowDown");
    expect(focusedValue()).toBe("grace");
    // Edsger is disabled and is stepped over rather than focused.
    press("ArrowDown");
    expect(focusedValue()).toBe("barbara");
    expect(highlighted(harness)).toBe("barbara");
  });

  it("holds the end of the list under the keyboard, and prevents the page scroll", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);
    press("End");
    expect(focusedValue()).toBe("barbara");

    // Prevented *and* unmoved: the stop is held here, so the page must not scroll
    // instead.
    expect(press("ArrowDown")).toBe(true);
    expect(focusedValue()).toBe("barbara");
  });

  it("wraps when it is asked to, and Home and End reach both ends", async () => {
    const harness = scene({ props: { selectionMode: "multiple", loopFocus: true } });
    await settle();
    enter(harness);

    press("ArrowUp");
    expect(focusedValue()).toBe("barbara");
    press("ArrowDown");
    expect(focusedValue()).toBe("ada");
    press("End");
    expect(focusedValue()).toBe("barbara");
    press("Home");
    expect(focusedValue()).toBe("ada");
  });

  it("mirrors the horizontal axis in RTL, and leaves the off-axis arrows alone", async () => {
    const harness = scene({
      props: { selectionMode: "multiple", orientation: "horizontal", dir: "rtl" },
    });
    await settle();
    enter(harness);

    // Physical keys, mirrored once in `getRovingKeyAction`: in RTL the next row is
    // to the left.
    expect(press("ArrowLeft")).toBe(true);
    expect(focusedValue()).toBe("alan");
    press("ArrowRight");
    expect(focusedValue()).toBe("ada");
    // The vertical arrows are nobody's here, so the page keeps them.
    expect(press("ArrowDown")).toBe(false);
    expect(focusedValue()).toBe("ada");
  });

  it("jumps by a measured screenful, and never wraps doing it", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);

    // 120px of scroller over 32px rows is three rows, and a page keeps one of them
    // in common: two steps, disabled rows stepped over as ever.
    expect(press("PageDown")).toBe(true);
    expect(focusedValue()).toBe("grace");
    press("PageDown");
    expect(focusedValue()).toBe("barbara");
    // Two steps back, disabled row not counted among them.
    press("PageUp");
    expect(focusedValue()).toBe("alan");
  });
});

describe("listbox single selection", () => {
  it("selects as the focus moves, which is the native select model", async () => {
    const onValueChange = vi.fn();
    const harness = scene({ props: { onValueChange } });
    await settle();
    enter(harness);

    // Entering does not choose: only an arrow does.
    expect(harness.api().value).toEqual([]);

    press("ArrowDown");
    expect(harness.api().value).toEqual(["alan"]);
    expect(row(harness, "alan").getAttribute("aria-selected")).toBe("true");
    expect(row(harness, "alan").dataset.state).toBe("selected");
    expect(onValueChange).toHaveBeenLastCalledWith({ value: ["alan"] });
  });

  it("moves without choosing under Ctrl", async () => {
    const harness = scene();
    await settle();
    enter(harness);
    press("ArrowDown");
    expect(harness.api().value).toEqual(["alan"]);

    press("ArrowDown", { ctrlKey: true });
    expect(focusedValue()).toBe("grace");
    expect(harness.api().value).toEqual(["alan"]);
  });

  it("selects on click and says nothing about multiselect", async () => {
    const onSelect = vi.fn();
    const harness = scene({ props: { onSelect } });
    await settle();

    click(row(harness, "grace"));
    expect(harness.api().value).toEqual(["grace"]);
    expect(onSelect).toHaveBeenCalledWith({ value: "grace" });
    // The focus is placed by the machine: WebKit does not focus a `div` under a
    // click, and the roving stop would part company with the real focus.
    expect(focusedValue()).toBe("grace");
    expect(slot(harness, "content").hasAttribute("aria-multiselectable")).toBe(false);
  });

  it("refuses a disabled row, by click and by every other path", async () => {
    const onSelect = vi.fn();
    const harness = scene({ props: { onSelect } });
    await settle();

    click(row(harness, "edsger"));
    expect(harness.api().value).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
    expect(row(harness, "edsger").getAttribute("aria-disabled")).toBe("true");
  });

  it("empties on a second click only when it is allowed to", async () => {
    const plain = scene({ props: {} });
    await settle();
    click(row(plain, "ada"));
    click(row(plain, "ada"));
    expect(plain.api().value).toEqual(["ada"]);

    const deselectable = scene({ props: { deselectable: true } });
    await settle();
    click(row(deselectable, "ada"));
    click(row(deselectable, "ada"));
    expect(deselectable.api().value).toEqual([]);
  });
});

describe("listbox multiple selection", () => {
  const multiple = (props: ListboxMachineProps = {}): Harness =>
    scene({ props: { selectionMode: "multiple", ...props } });

  it("says it is multiselectable and does not select as it moves", async () => {
    const harness = multiple();
    await settle();
    enter(harness);

    expect(slot(harness, "content").getAttribute("aria-multiselectable")).toBe("true");
    press("ArrowDown");
    expect(harness.api().value).toEqual([]);
  });

  it("toggles on the release of Space, never on the press", async () => {
    const harness = multiple();
    await settle();
    enter(harness);

    // The press only stops the page scrolling. Nothing has been chosen yet — a
    // person who slides off the row before letting go has cancelled.
    expect(press(" ")).toBe(true);
    expect(harness.api().value).toEqual([]);

    release(" ");
    expect(harness.api().value).toEqual(["ada"]);
    release(" ");
    expect(harness.api().value).toEqual([]);
  });

  it("extends from the anchor, and replaces the range rather than growing it", async () => {
    const harness = multiple();
    await settle();
    enter(harness);
    release(" ");
    expect(harness.api().value).toEqual(["ada"]);

    press("ArrowDown", { shiftKey: true });
    expect(harness.api().value).toEqual(["ada", "alan"]);
    press("ArrowDown", { shiftKey: true });
    expect(harness.api().value).toEqual(["ada", "alan", "grace"]);

    // Back up from the same anchor: the range shrinks, because the anchor survived
    // and the second extension is not a second selection.
    press("ArrowUp", { shiftKey: true });
    expect(harness.api().value).toEqual(["ada", "alan"]);
  });

  it("never lets a range take a disabled row", async () => {
    const harness = multiple();
    await settle();

    click(row(harness, "ada"));
    click(row(harness, "barbara"), { shiftKey: true });
    // Edsger sits between Grace and Barbara and is not in the range.
    expect(harness.api().value).toEqual(["ada", "alan", "grace", "barbara"]);
  });

  it("toggles under Ctrl and replaces under a plain click", async () => {
    const harness = multiple();
    await settle();

    click(row(harness, "ada"));
    click(row(harness, "grace"), { ctrlKey: true });
    expect(harness.api().value).toEqual(["ada", "grace"]);

    click(row(harness, "grace"), { metaKey: true });
    expect(harness.api().value).toEqual(["ada"]);

    // A plain click is the file list's plain click: it drops everything else.
    click(row(harness, "barbara"));
    expect(harness.api().value).toEqual(["barbara"]);
  });

  it("extends contiguously on Shift+Space", async () => {
    const harness = multiple();
    await settle();
    click(row(harness, "ada"));
    enter(harness);
    press("ArrowDown");
    press("ArrowDown");
    expect(focusedValue()).toBe("grace");

    release(" ", { shiftKey: true });
    expect(harness.api().value).toEqual(["ada", "alan", "grace"]);
  });

  it("selects all but the disabled rows on Ctrl+A, and keeps the browser out of it", async () => {
    const harness = multiple();
    await settle();
    enter(harness);

    expect(press("a", { ctrlKey: true })).toBe(true);
    expect(harness.api().value).toEqual([...ENABLED]);
  });

  it("leaves Ctrl+A to the browser in single mode", async () => {
    const harness = scene();
    await settle();
    enter(harness);

    expect(press("a", { ctrlKey: true })).toBe(false);
    expect(harness.api().value).toEqual([]);
  });

  it("runs a range to the end on Ctrl+Shift+End", async () => {
    const harness = multiple();
    await settle();
    click(row(harness, "alan"));

    press("End", { ctrlKey: true, shiftKey: true });
    expect(harness.api().value).toEqual(["alan", "grace", "barbara"]);
    expect(focusedValue()).toBe("barbara");
  });

  it("clears and rewrites through the api without pretending a user did it", async () => {
    const onSelect = vi.fn();
    const harness = multiple({ onSelect });
    await settle();

    harness.api().setValue(["ada", "grace"]);
    expect(harness.api().value).toEqual(["ada", "grace"]);
    harness.api().clearSelection();
    expect(harness.api().value).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("listbox under a changing collection", () => {
  it("rescues the highlight and the focus when the row under them is removed", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);
    press("ArrowDown");
    press("ArrowDown");
    expect(focusedValue()).toBe("grace");

    row(harness, "grace").remove();
    await settle();

    // APG: the next enabled row, and Edsger is not one.
    expect(highlighted(harness)).toBe("barbara");
    expect(focusedValue()).toBe("barbara");
  });

  it("falls back to the row before when there is no row after", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);
    press("End");
    expect(focusedValue()).toBe("barbara");

    row(harness, "barbara").remove();
    await settle();

    expect(highlighted(harness)).toBe("grace");
    expect(focusedValue()).toBe("grace");
  });

  it("keeps a selection whose row has been filtered away", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    click(row(harness, "ada"));
    click(row(harness, "grace"), { ctrlKey: true });

    row(harness, "grace").remove();
    await settle();

    // The contract of a filtered list: hiding a chosen row has not unchosen it.
    expect(harness.api().value).toEqual(["ada", "grace"]);
  });

  it("becomes reachable as an empty state when the last row goes", async () => {
    const harness = scene();
    await settle();
    for (const item of PEOPLE) row(harness, item.value).remove();
    await settle();

    const content = slot(harness, "content");
    expect(content.hasAttribute("data-empty")).toBe(true);
    // A list with no rows has no roving stop to be reached through, so the
    // container takes one.
    expect(content.tabIndex).toBe(0);
    expect(harness.api().empty).toBe(true);
  });
});

describe("listbox typeahead", () => {
  it("cycles on a repeated letter and narrows on a longer string", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    enter(harness);

    press("a");
    expect(focusedValue()).toBe("ada");
    press("a");
    expect(focusedValue()).toBe("alan");
    press("a");
    expect(focusedValue()).toBe("ada");

    // The buffer times out and the next key starts a search rather than extending
    // "aaa" into something no row is called.
    await forgetTypeahead();
    press("b");
    expect(focusedValue()).toBe("barbara");

    await forgetTypeahead();
    press("g");
    expect(focusedValue()).toBe("grace");
    // Extending the search never jumps away from a row that still matches it.
    press("r");
    expect(focusedValue()).toBe("grace");
  });

  it("matches what `data-label` says rather than what the row reads", async () => {
    const harness = scene({
      props: { selectionMode: "multiple" },
      items: [
        { value: "ada", label: "Ada Lovelace" },
        { value: "grace", label: "Grace Hopper", typeaheadLabel: "Zebra" },
      ],
    });
    await settle();
    enter(harness);

    press("z");
    expect(focusedValue()).toBe("grace");
    expect(row(harness, "grace").dataset.label).toBe("Zebra");
  });

  it("stays out of the way when it is switched off", async () => {
    const harness = scene({ props: { selectionMode: "multiple", typeahead: false } });
    await settle();
    enter(harness);

    expect(press("g")).toBe(false);
    expect(focusedValue()).toBe("ada");
  });
});

describe("listbox on a gamepad", () => {
  function withPad(props: ListboxMachineProps = {}): { harness: Harness; bus: IntentBus } {
    const bus = createIntentBus();
    const harness = scene({ props: { intents: bus, ...props } });
    return { harness, bus };
  }

  it("moves on the d-pad exactly as the arrows do", async () => {
    const { harness, bus } = withPad({ selectionMode: "multiple" });
    await settle();
    enter(harness);

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("alan");
    expect(bus.dispatch({ intent: "end", source: "gamepad" }).consumed).toBe(true);
    expect(focusedValue()).toBe("barbara");

    // The page jump is the one move whose distance is *measured* —
    // `getPageSize - 1` rows, and `getPageSize` divides the scroller's live
    // height by the first row's. Writing the landing row down here would assert
    // the fixture's layout rather than the machine, so it is read back from the
    // keyboard instead: what "exactly as the arrows do" claims is that the two
    // inputs produce the same intent, whatever a row happens to measure.
    expect(bus.dispatch({ intent: "pageUp", source: "gamepad" }).consumed).toBe(true);
    const onPad = focusedValue();

    press("End");
    expect(focusedValue()).toBe("barbara");
    press("PageUp");
    expect(focusedValue()).toBe(onPad);
    // And it moved, upwards, without wrapping round the top — the two properties
    // `pageHighlight` guarantees regardless of the measurement.
    expect(ENABLED.slice(0, ENABLED.indexOf("barbara"))).toContain(onPad);
  });

  it("hands the move back at the end of the list, so the d-pad can walk out", async () => {
    const { harness, bus } = withPad({ selectionMode: "multiple" });
    await settle();
    enter(harness);
    press("End");

    // Declined, not swallowed: the spatial engine at the bottom of the stack is
    // what carries the focus out of the zone. The keyboard holds the stop instead,
    // because its fallback is the page scrolling.
    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
    expect(focusedValue()).toBe("barbara");
    // The orthogonal axis is never claimed either — a sideways press leaves.
    expect(bus.dispatch({ intent: "moveRight", source: "gamepad" }).consumed).toBe(false);
  });

  it("toggles on X without moving, and only where a toggle means something", async () => {
    const { harness, bus } = withPad({ selectionMode: "multiple" });
    await settle();
    enter(harness);
    press("ArrowDown");

    expect(bus.dispatch({ intent: "secondary", source: "gamepad" }).consumed).toBe(true);
    expect(harness.api().value).toEqual(["alan"]);
    expect(focusedValue()).toBe("alan");

    const single = withPad();
    await settle();
    enter(single.harness);
    // In single mode X is left free for whoever else wants it.
    expect(single.bus.dispatch({ intent: "secondary", source: "gamepad" }).consumed).toBe(false);
  });

  it("never claims B, Y, or A", async () => {
    const { harness, bus } = withPad({ selectionMode: "multiple" });
    await settle();
    enter(harness);

    for (const intent of ["back", "contextMenu", "tabNext", "tabPrev", "select"] as const) {
      expect(bus.dispatch({ intent, source: "gamepad" }).consumed).toBe(false);
    }

    // A is not consumed because the input system clicks the focused element for it
    // — one path of activation, never two.
    (document.activeElement as HTMLElement).click();
    expect(harness.api().value).toEqual(["ada"]);
  });

  it("answers nothing at all while the focus is elsewhere", async () => {
    const { harness, bus } = withPad({ selectionMode: "multiple" });
    await settle();
    slot(harness, "outside").focus();

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(false);
  });
});

describe("listbox surfaces its own state", () => {
  it("rings only for the modalities that deserve one, and only on one row", async () => {
    const harness = scene({ props: { selectionMode: "multiple" } });
    await settle();
    setInputModality(document, "keyboard");
    enter(harness);
    press("ArrowDown");

    const focused = row(harness, "alan");
    expect(focused.dataset.focusSource).toBe("keyboard");
    expect(focused.hasAttribute("data-focus-visible")).toBe(true);
    // One focus, one row: an attribute claiming otherwise on every row describes
    // nothing.
    expect(harness.host.querySelectorAll("[data-focus-visible]")).toHaveLength(1);

    setInputModality(document, "pointer");
    click(row(harness, "grace"));
    expect(row(harness, "grace").hasAttribute("data-focus-visible")).toBe(false);
    expect(row(harness, "grace").dataset.focusSource).toBe("pointer");
  });

  it("says which way it can still be scrolled", async () => {
    const harness = scene();
    await settle();
    const content = slot(harness, "content");

    expect(content.getAttribute("data-scroll")).toBe("down");
    content.scrollTop = content.scrollHeight;
    content.dispatchEvent(new Event("scroll"));
    expect(content.getAttribute("data-scroll")).toBe("up");
  });

  it("names itself by its label part, and by the prop when there is none", async () => {
    const named = scene();
    await settle();
    const content = slot(named, "content");
    expect(content.getAttribute("aria-labelledby")).toBe(slot(named, "label").id);
    expect(content.hasAttribute("aria-label")).toBe(false);

    const bare = scene({ withLabel: false, props: { label: "People" } });
    await settle();
    const bareContent = slot(bare, "content");
    // Never a dangling IDREF: a name axe grades `incomplete` is a name nothing
    // catches.
    expect(bareContent.hasAttribute("aria-labelledby")).toBe(false);
    expect(bareContent.getAttribute("aria-label")).toBe("People");
  });

  it("says nothing about an axis it does not have", async () => {
    const vertical = scene();
    await settle();
    expect(slot(vertical, "content").hasAttribute("aria-orientation")).toBe(false);

    const horizontal = scene({ props: { orientation: "horizontal" } });
    await settle();
    expect(slot(horizontal, "content").getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("goes quiet when it is disabled", async () => {
    const harness = scene({ props: { disabled: true, selectionMode: "multiple" } });
    await settle();
    // No tab stop to enter through — every row is disabled, so the list is out of
    // the tab order altogether and the focus has to be placed by hand.
    expect(tabStops(harness)).toEqual([]);
    row(harness, "ada").focus();

    click(row(harness, "grace"));
    press("ArrowDown");
    expect(harness.api().value).toEqual([]);
    expect(slot(harness, "content").getAttribute("aria-disabled")).toBe("true");
  });

  it("passes axe in both modes, groups and disabled rows included", async () => {
    const { run } = await import("axe-core");
    const single = scene({ props: { defaultValue: ["ada"] } });
    const multiple = scene({
      props: { selectionMode: "multiple", defaultValue: ["ada", "grace"] },
    });
    await settle();

    for (const harness of [single, multiple]) {
      const results = await run(harness.host, {
        // `incomplete` too: a dead IDREF and `th-has-data-cells` never reach
        // `violations` at all (see `packages/react/src/render-harness.tsx`).
        resultTypes: ["violations", "incomplete"],
        // Nothing here loads the design system's sheet, so the rule would be
        // measuring unstyled black on white. Contrast is held by
        // `packages/styles/src/contrast.browser.test.ts`.
        rules: { "color-contrast": { enabled: false } },
      });
      expect([...results.violations, ...results.incomplete].map((entry) => entry.id)).toEqual([]);
    }
  });
});
