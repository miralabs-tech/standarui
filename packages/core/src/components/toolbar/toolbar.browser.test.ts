/**
 * The toolbar against a real engine: the roving moves the *actual* DOM focus, the
 * collection is read from the document, and the cohabitation rule is proved
 * against the things it exists to protect — a text island, a control that claims
 * a key, and a second toolbar nested inside the first.
 */

import { setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeProps } from "../../machine/slot";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./toolbar.connect";
import { machine } from "./toolbar.machine";
import type { ToolbarApi, ToolbarMachineProps, ToolbarSchema } from "./toolbar.types";

type Api = ToolbarApi<DomPropTypes>;

const ITEMS = ["bold", "italic", "underline"] as const;

interface Options {
  /** Natively disabled: unfocusable, and stepped over. */
  readonly disabled?: string | undefined;
  /** Focusable-disabled: reachable, and it refuses its own activation. */
  readonly ariaDisabled?: string | undefined;
  /** The control composed onto this item claims ArrowRight for itself. */
  readonly claims?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * What a composed control's own handler looks like from here. Merged the way an
 * adapter merges it — `mergeProps` runs the later contributor first, which is
 * what makes a consumer's `preventDefault()` a veto rather than a suggestion —
 * because a listener added with `addEventListener` after the harness has painted
 * would run *second* and prove the opposite of what it looks like.
 */
function claimArrowRight(event: KeyboardEvent): void {
  if (event.key === "ArrowRight") event.preventDefault();
}

const MARKUP = `<div>
  <button></button>
  <button></button>
  <span data-slot="separator"></span>
  <span data-slot="spacer"></span>
  <button></button>
</div>`;

function render(props: ToolbarMachineProps = {}, options: Options = {}) {
  return mountMachine<ToolbarSchema, Api>({
    machine,
    connect,
    html: MARKUP,
    id: options.id ?? "b1",
    // Named by default so the dev warning stays a signal: a bar with no
    // accessible name is a defect the machine reports, and a suite that mounts
    // twenty anonymous bars would drown it. The warning has its own test below.
    props: { label: "Formatting", ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());

      // Read fresh every paint: the mutation test removes one, and the parts are
      // found by their author-written slot rather than by index for the same
      // reason.
      const buttons = [...root.querySelectorAll("button")];
      ITEMS.forEach((value, index) => {
        const button = buttons[index];
        if (button === undefined) return;
        const itemProps = api.getItemProps({ value });
        apply(
          button,
          options.claims === value
            ? mergeProps(itemProps, { onKeyDown: claimArrowRight })
            : itemProps,
        );
        // The control owns its own disabled state — `connect` posts neither.
        button.disabled = options.disabled === value;
        if (options.ariaDisabled === value) button.setAttribute("aria-disabled", "true");
      });

      const separator = root.querySelector('[data-slot="separator"]');
      if (separator !== null) apply(separator, api.getSeparatorProps());
      const spacer = root.querySelector('[data-slot="spacer"]');
      if (spacer !== null) apply(spacer, api.getSpacerProps());
    },
  });
}

const ISLAND_MARKUP = `<div>
  <button></button>
  <input type="search" aria-label="Search" />
  <button></button>
</div>`;

/** A bar with a search field between two controls: the island of the spec. */
function renderWithIsland() {
  const values = ["bold", "underline"] as const;

  return mountMachine<ToolbarSchema, Api>({
    machine,
    connect,
    html: ISLAND_MARKUP,
    id: "island",
    props: { label: "Formatting" },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      const buttons = [...root.querySelectorAll("button")];
      values.forEach((value, index) => {
        const button = buttons[index];
        if (button !== undefined) apply(button, api.getItemProps({ value }));
      });
    },
  });
}

function items(harness: { host: HTMLElement }): HTMLButtonElement[] {
  return [...harness.host.querySelectorAll<HTMLButtonElement>('[data-part~="toolbar:item"]')];
}

function press(node: Element | undefined, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  node?.dispatchEvent(event);
  return event;
}

afterEach(() => {
  unmountAll();
});

describe("toolbar — the single tab stop", () => {
  it("puts one stop on the bar, on the first control", () => {
    const harness = render();

    expect(items(harness).map((item) => item.tabIndex)).toEqual([0, -1, -1]);
  });

  it("comes back to the control the user left", () => {
    const harness = render();
    const list = items(harness);

    list[1]?.focus();
    list[1]?.blur();

    // APG: Tab may restore. The memory outlives the focus — that is what makes
    // it a memory rather than a mirror.
    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("never parks the stop on a control the browser would skip", () => {
    // Parked on a disabled button, the only `tabindex="0"` is skipped and the
    // whole bar falls out of the tab order.
    const harness = render({}, { disabled: "bold" });
    const tabbable = items(harness).filter((item) => item.tabIndex === 0);

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.disabled).toBe(false);
  });

  it("re-settles the stop when the control holding it goes away", async () => {
    const harness = render();
    // The last one, so the values of the survivors keep their own controls.
    items(harness)[2]?.focus();
    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, -1, 0]);

    items(harness)[2]?.remove();

    // `observeChildren` reports on its own microtask; this is the one place the
    // test has to wait.
    await vi.waitFor(() => {
      expect(items(harness).map((item) => item.tabIndex)).toEqual([0, -1]);
    });
    // And it never takes the focus back: the browser dropped it on body when the
    // node left, and a bar that grabbed it would move the user's place in the page.
    expect(document.activeElement).toBe(document.body);
  });
});

describe("toolbar — a control that changes aria-current by itself", () => {
  it("moves the stop to the new page with no render of the root", async () => {
    const harness = render();
    const list = items(harness);
    expect(list.map((item) => item.tabIndex)).toEqual([0, -1, -1]);

    list[2]?.setAttribute("aria-current", "page");

    await vi.waitFor(() => {
      expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
    });
  });

  it("keeps the remembered stop when the attribute is written again with the value it had", async () => {
    const harness = render();
    const list = items(harness);
    list[0]?.setAttribute("aria-current", "page");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    list[0]?.focus();
    press(list[0], "ArrowRight");
    list[1]?.blur();
    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, 0, -1]);

    list[0]?.setAttribute("aria-current", "page");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });
});

describe("toolbar — roving", () => {
  it("moves the real DOM focus and wraps", () => {
    const harness = render();
    const list = items(harness);
    list[0]?.focus();

    const event = press(list[0], "ArrowRight");
    expect(document.activeElement).toBe(list[1]);
    // Claimed, so the page does not scroll under the bar.
    expect(event.defaultPrevented).toBe(true);

    press(list[1], "ArrowRight");
    press(list[2], "ArrowRight");
    expect(document.activeElement).toBe(list[0]);
  });

  it("stops at the ends when the wrap is off", () => {
    const harness = render({ loopFocus: false });
    const list = items(harness);
    list[0]?.focus();

    press(list[0], "ArrowLeft");

    expect(document.activeElement).toBe(list[0]);
  });

  it("goes to the ends on Home and End", () => {
    const harness = render();
    const list = items(harness);
    list[1]?.focus();

    press(list[1], "End");
    expect(document.activeElement).toBe(list[2]);

    press(list[2], "Home");
    expect(document.activeElement).toBe(list[0]);
  });

  it("mirrors the arrows in RTL", () => {
    const harness = render({ dir: "rtl" });
    const list = items(harness);
    list[1]?.focus();

    press(list[1], "ArrowRight");

    expect(document.activeElement).toBe(list[0]);
  });

  it("holds its own axis, so the page keeps the other one", () => {
    const harness = render();
    const list = items(harness);
    list[0]?.focus();

    const event = press(list[0], "ArrowDown");

    expect(document.activeElement).toBe(list[0]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("takes the block axis when it is vertical", () => {
    const harness = render({ orientation: "vertical" });
    const list = items(harness);
    list[0]?.focus();

    press(list[0], "ArrowDown");

    expect(document.activeElement).toBe(list[1]);
  });

  it("steps over a disabled control and visits an aria-disabled one", () => {
    const stepped = render({}, { disabled: "italic" });
    const stepList = items(stepped);
    stepList[0]?.focus();
    press(stepList[0], "ArrowRight");
    expect(document.activeElement).toBe(stepList[2]);

    // Focusable-disabled stays reachable: APG's discoverability clause, and the
    // control itself is what refuses the activation.
    const visited = render({}, { ariaDisabled: "italic", id: "b2" });
    const visitList = items(visited);
    visitList[0]?.focus();
    press(visitList[0], "ArrowRight");
    expect(document.activeElement).toBe(visitList[1]);
  });

  it("never activates on the way past", () => {
    const harness = render();
    const list = items(harness);
    const clicked = vi.fn();
    list[1]?.addEventListener("click", clicked);
    list[0]?.focus();

    press(list[0], "ArrowRight");

    // A toolbar visits, it does not choose — unlike the radio mode of
    // `toggle-group`, where the arrows select.
    expect(document.activeElement).toBe(list[1]);
    expect(clicked).not.toHaveBeenCalled();
  });
});

describe("toolbar — cohabitation", () => {
  it("lets a composed control keep the key it claimed", () => {
    // A menu trigger opening on ArrowDown is the real case; ArrowRight is the one
    // the toolbar would otherwise have taken, so it is the one worth proving.
    const harness = render({}, { claims: "bold" });
    const list = items(harness);
    list[0]?.focus();

    press(list[0], "ArrowRight");

    expect(document.activeElement).toBe(list[0]);
    // And the bar still answers the keys nobody claimed.
    press(list[0], "End");
    expect(document.activeElement).toBe(list[2]);
  });

  it("steps over a text island and leaves its caret alone", () => {
    const harness = renderWithIsland();
    const list = items(harness);
    const field = harness.host.querySelector("input") as HTMLInputElement;

    // The island is not in the collection, so the arrows jump it — and the
    // continuity of the bar is preserved on both sides of it.
    list[0]?.focus();
    press(list[0], "ArrowRight");
    expect(document.activeElement).toBe(list[1]);

    // Inside the field the toolbar hears nothing at all: it has no item there and
    // no document-level listener.
    field.focus();
    const event = press(field, "ArrowRight");
    expect(document.activeElement).toBe(field);
    expect(event.defaultPrevented).toBe(false);

    // And it keeps its own tab stop: a bar with an island has 1+N stops, which is
    // the deviation the spec takes on APG's own "avoid" clause.
    expect(field.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps two nested toolbars out of each other's collection", () => {
    const outer = render({}, { id: "outer" });
    const inner = render({}, { id: "inner" });
    const outerRoot = outer.part("root");
    outerRoot.append(inner.host);

    // Direct children only: the inner bar's controls are inside the outer root
    // now, and the point of the test is that they answer to neither the wrong
    // machine nor the wrong query.
    const outerItems = [...outerRoot.children].filter((node) =>
      (node.getAttribute("data-part") ?? "").split(" ").includes("toolbar:item"),
    ) as HTMLElement[];
    const innerItems = items(inner);

    outerItems[2]?.focus();
    press(outerItems[2], "ArrowRight");

    // The outer bar wraps to its own first control rather than descending into
    // the inner one: `queryItems` answers to the toolbar an item is closest to.
    expect(document.activeElement).toBe(outerItems[0]);

    innerItems[0]?.focus();
    press(innerItems[0], "ArrowRight");
    expect(document.activeElement).toBe(innerItems[1]);
  });
});

describe("toolbar — focus source", () => {
  it("marks how the focus arrived, on the focused control and on no other", () => {
    const harness = render();
    const [first, second] = items(harness);

    setInputModality(document, "pointer");
    first?.focus();

    expect(first?.getAttribute("data-focus-source")).toBe("pointer");
    // A pointer wants no ring.
    expect(first?.hasAttribute("data-focus-visible")).toBe(false);
    expect(second?.hasAttribute("data-focus-source")).toBe(false);

    // An arrow is a real focus move, so the source is taken again — and the ring
    // travels with it.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    press(first, "ArrowRight");

    expect(second?.getAttribute("data-focus-source")).toBe("keyboard");
    expect(second?.getAttribute("data-focus-visible")).toBe("");
    expect(first?.hasAttribute("data-focus-source")).toBe(false);
  });

  it("keeps the ring when the pointer takes over without refocusing", () => {
    const harness = render();
    const [first] = items(harness);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    first?.focus();
    expect(first?.getAttribute("data-focus-visible")).toBe("");

    setInputModality(document, "pointer");

    // Nothing refocused: this control is still the one the keyboard reached.
    expect(first?.getAttribute("data-focus-visible")).toBe("");
  });

  it("moves the memory on a press, and lets the control do the rest", () => {
    const harness = render();
    const list = items(harness);
    const clicked = vi.fn();
    list[2]?.addEventListener("click", clicked);

    list[2]?.click();

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(items(harness).map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
  });
});

describe("toolbar — the parts", () => {
  it("names itself and says which way it runs", () => {
    const harness = render({ label: "Formatting" });
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("toolbar");
    expect(root.getAttribute("aria-label")).toBe("Formatting");
    expect(root.getAttribute("data-orientation")).toBe("horizontal");
    expect(root.hasAttribute("aria-orientation")).toBe(false);
    // One spatial zone, entered on the control the user left (the engine's
    // default `last` strategy), and no wrap so the d-pad can leave the bar.
    expect(root.getAttribute("data-snav")).toBe("container");
    expect(root.hasAttribute("data-snav-wrap")).toBe(false);
  });

  it("says so when the bar has no accessible name, and stays quiet when it has one", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    render({ label: undefined }, { id: "anonymous" });
    // axe has no rule for an unnamed `role="toolbar"`, so the defect would
    // otherwise ship green. Nothing is defaulted: two bars both called "Toolbar"
    // are less navigable than two unnamed ones.
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned.mock.calls[0]?.[0]).toContain("no accessible name");

    warned.mockClear();
    render({ label: "Formatting" }, { id: "named" });
    expect(warned).not.toHaveBeenCalled();

    warned.mockRestore();
  });

  it("rules across the bar and pads with nothing", () => {
    const harness = render();

    expect(harness.part("separator").getAttribute("role")).toBe("separator");
    expect(harness.part("separator").getAttribute("aria-orientation")).toBe("vertical");
    expect(harness.part("separator").hasAttribute("tabindex")).toBe(false);
    expect(harness.part("spacer").getAttribute("aria-hidden")).toBe("true");
  });
});
