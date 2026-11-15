/**
 * The composed menu in a real engine.
 *
 * `packages/react/src/composed.test.tsx` proves the markup is the parts', to the
 * character. What a string cannot prove is that the tree an `items` array
 * produces is one a keyboard and a pad can actually drive — and the menu is the
 * only composed layer with a **recursive** branch, so the array is also the only
 * thing standing between a consumer and a submenu that never opens.
 *
 * This file drives the array. It does not re-audit the machine, which is proved
 * in `packages/core/src/components/menu` and again through the parts in
 * `menu.browser.test.tsx` — including the one thing only an adapter can get
 * wrong, which is aiming a parent at the submenu under the highlight.
 *
 * The three fixtures are the ones the 2026-08-27 audit made mandatory, for the
 * reason it gave — the suite was green partly because the fixtures avoided the
 * shapes that break: the **minimal form** (no group, no glyph, no checkable), a
 * **disabled row in first position**, and at least one **gamepad intent**.
 */

import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { Menu, type MenuEntry } from "./composed";

/** No group, no glyph, no checkable — every optional field left out. */
const MINIMAL: readonly MenuEntry[] = [
  { value: "open", label: "Open" },
  { value: "rename", label: "Rename" },
  { value: "duplicate", label: "Duplicate" },
];

/** The audit's second fixture: the row the initial highlight has to step over. */
const DISABLED_FIRST: readonly MenuEntry[] = [
  { value: "open", label: "Open", disabled: true },
  { value: "rename", label: "Rename" },
  { value: "duplicate", label: "Duplicate" },
];

/** Every entry kind, the recursive branch included. */
const TREE: readonly MenuEntry[] = [
  {
    id: "file",
    label: "File",
    options: [
      { value: "open", label: "Open", shortcut: "Meta+O" },
      { value: "rename", label: "Rename", description: "Give the file a new name" },
    ],
  },
  { separator: true },
  { value: "wrap", label: "Wrap lines", type: "checkbox", checked: false },
  {
    id: "share",
    value: "share",
    label: "Share",
    items: [
      { value: "copy-link", label: "Copy link" },
      { value: "mail", label: "Mail" },
    ],
  },
  { value: "trash", label: "Move to Trash", destructive: true },
];

let input: InputSystem | null = null;

function Capture(): React.ReactNode {
  const system = useInputSystem();
  useEffect(() => {
    input = system;
  }, [system]);
  return null;
}

function withPad(children: React.ReactNode): React.ReactNode {
  return (
    <NavProvider>
      <Capture />
      {children}
    </NavProvider>
  );
}

/** What the gamepad engine publishes when A goes down — no click behind it. */
function pressA(): void {
  fire(() => {
    input?.emit({ intent: "select", source: "gamepad" });
  });
}

function press(key: string, target?: HTMLElement | null): void {
  const node = target ?? (document.activeElement as HTMLElement | null);
  if (node === null) throw new Error(`nothing to send "${key}" to`);
  fire(() => node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function trigger(): HTMLElement {
  const node = queryPart(document.body, "trigger");
  if (node === null) throw new Error("no trigger");
  return node;
}

function value(): string | null | undefined {
  return document.activeElement?.getAttribute("data-value");
}

afterEach(() => {
  unmountAll();
  input = null;
});

describe("the composed menu, driven", () => {
  it("opens from the trigger with the keyboard, walks the arrows and selects with Enter", async () => {
    const onSelect = vi.fn();
    mount(
      <Menu
        id="actions"
        trigger={<button type="button">Actions</button>}
        items={MINIMAL}
        onSelect={onSelect}
      />,
    );
    await settle();

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();

    // APG menu button: ArrowDown opens onto the first row, and the focus is real.
    await waitFor(() => {
      expect(value()).toBe("open");
    });
    expect(queryPart(document.body, "content")?.getAttribute("role")).toBe("menu");

    press("ArrowDown");
    await settle();
    expect(value()).toBe("rename");

    press("Enter");
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({ value: "rename" });
    });
  });

  it("closes on Escape and hands the focus back to the trigger", async () => {
    const onSelect = vi.fn();
    mount(
      <Menu
        id="actions"
        trigger={<button type="button">Actions</button>}
        items={MINIMAL}
        onSelect={onSelect}
      />,
    );
    await settle();

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();
    await waitFor(() => {
      expect(value()).toBe("open");
    });

    press("Escape");
    await waitFor(() => {
      expect(button.getAttribute("data-state")).toBe("closed");
    });
    expect(onSelect).not.toHaveBeenCalled();
    // The real focus, not `data-state`: `restoreFocus` is on by default, and the
    // composed layer is what decides which element ends up carrying `menu:trigger`.
    await waitFor(() => {
      expect(document.activeElement).toBe(button);
    });
  });

  it("steps the initial highlight over a disabled first row", async () => {
    mount(
      <Menu id="actions" trigger={<button type="button">Actions</button>} items={DISABLED_FIRST} />,
    );
    await settle();

    // Queried after the open, and not before: a closed menu renders no surface at
    // all — the collection *is* the live DOM, so there is nothing to read yet.
    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();

    await waitFor(() => {
      expect(value()).toBe("rename");
    });

    const first = queryPart(document.body, "item");
    expect(first?.getAttribute("data-value")).toBe("open");
    expect(first?.getAttribute("aria-disabled")).toBe("true");
    expect(first?.hasAttribute("data-highlighted")).toBe(false);
  });

  it("selects the highlighted row on the pad's A, with no click behind it", async () => {
    const onSelect = vi.fn();
    mount(
      withPad(
        <Menu
          id="actions"
          trigger={<button type="button">Actions</button>}
          items={MINIMAL}
          onSelect={onSelect}
        />,
      ),
    );
    await settle();

    // Opened from the keyboard rather than by a click: a pointer open lands the
    // focus on the surface with no row highlighted, and `select` activates the
    // highlight — there would be nothing for the pad to press.
    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();
    await waitFor(() => {
      expect(value()).toBe("open");
    });

    pressA();
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({ value: "open" });
    });
  });

  /**
   * The branch no other composed layer has. The submenu below is produced by the
   * recursion — a nested `MenuRoot` whose first child is the `MenuTriggerItem` —
   * so if the layer wrote that shape wrong, ArrowRight would move nothing.
   */
  it("opens a submenu from a row the recursion produced, and walks into it", async () => {
    const onSelect = vi.fn();
    mount(
      <Menu
        id="actions"
        trigger={<button type="button">Actions</button>}
        items={TREE}
        onSelect={onSelect}
      />,
    );
    await settle();

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();
    await waitFor(() => {
      expect(value()).toBe("open");
    });

    // Down to the submenu row, past the group's second row and the checkable.
    for (const expected of ["rename", "wrap", "share"]) {
      press("ArrowDown");
      await settle();
      expect(value()).toBe(expected);
    }
    expect(queryPart(document.body, "trigger-item")?.getAttribute("data-value")).toBe("share");

    press("ArrowRight");
    await waitFor(() => {
      expect(value()).toBe("copy-link");
    });
    // Two surfaces now, and the child's rows are its own: the machine reads its
    // item list up to the nearest content, which is what the nesting buys.
    expect(queryParts(document.body, "content").length).toBe(2);

    // And the row is *chosen*, which is where this test used to stop — one key
    // short of the defect. Each surface is its own machine and `invokeOnSelect`
    // reads the `onSelect` of the machine that got the event, so a nested root
    // handed only its `id` closed the tree and reported nothing (2026-09-05).
    press("Enter");
    await settle();
    expect(onSelect).toHaveBeenCalledWith({ value: "copy-link" });
  });

  it("reports a checkable row's flip and holds no state of its own", async () => {
    const onCheckedChange = vi.fn();
    const items: readonly MenuEntry[] = [
      { value: "wrap", label: "Wrap lines", type: "checkbox", checked: false, onCheckedChange },
    ];
    mount(
      <Menu id="view" trigger={<button type="button">View</button>} items={items} defaultOpen />,
    );
    await settle();

    const row = queryPart(document.body, "item");
    expect(row?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(row?.getAttribute("aria-checked")).toBe("false");

    fire(() => row?.click());
    await settle();

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    // Still `false`: the consumer owns the value, and the menu only reported it.
    expect(row?.getAttribute("aria-checked")).toBe("false");
  });
});

/**
 * The escape hatch over the tree the recursion produces — the one no other
 * composed layer needs, because it is the only collection that can itself hold
 * a group, a separator and a nested surface. `pagination`'s `renderItem` sits
 * over one flat array of cells; this one sits over the tree `composed.test.tsx`
 * already walks for `menu:item-indicator`, so what has to be proved is not "does
 * it decorate" but "does it decorate ONLY a row" — the contract at
 * `composed.tsx:270` names three shapes it must never reach, and a group's own
 * row plus a row nested one level inside a submenu are the two it must.
 */
describe("the composed menu's renderItem", () => {
  it("decorates a row's children while leaving the row and every default part untouched", async () => {
    const items: readonly MenuEntry[] = [
      {
        value: "wrap",
        label: "Wrap lines",
        type: "checkbox",
        checked: true,
        icon: <span data-icon />,
        shortcut: "Meta+W",
        description: "Soft-wraps long lines",
      },
    ];
    mount(
      <Menu
        id="view"
        defaultOpen
        trigger={<button type="button">View</button>}
        items={items}
        renderItem={(row, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge={row.value} />
          </>
        )}
      />,
    );
    await settle();

    const row = queryPart(document.body, "item");
    if (row === null) throw new Error("no row");

    // Clause 1: the row itself is what `renderRow` already built — its identity
    // and its state, neither replaced nor duplicated.
    expect(row.getAttribute("data-value")).toBe("wrap");
    expect(row.getAttribute("role")).toBe("menuitemcheckbox");
    expect(row.getAttribute("aria-checked")).toBe("true");

    // Clause 2: every part `defaults` would have drawn on its own is still
    // there — the checkmark cell, the symbol, the text, the subtitle, the
    // shortcut — decorating cost none of them.
    expect(queryPart(row, "item-indicator")).not.toBeNull();
    expect(queryPart(row, "item-symbol")).not.toBeNull();
    expect(queryPart(row, "item-text")?.textContent).toBe("Wrap lines");
    expect(queryPart(row, "item-description")?.textContent).toBe("Soft-wraps long lines");
    expect(queryPart(row, "item-shortcut")?.textContent).toBe("Meta+W");

    // And the decoration is there too — added, not substituted for any of the above.
    expect(row.querySelector("[data-badge]")).not.toBeNull();
  });

  /**
   * Clause 3, the one the JSDoc calls out by name: a row's children are its grid
   * cells (`_menu.scss:335`, `grid-template-columns` on `menu:item`), each placed
   * by its own `grid-column`. `grid-column` only ever addresses a grid ITEM —
   * a direct child of the grid container — so what has to be proved is not that
   * the badge appears, but that it and every default part still share the row as
   * their immediate parent.
   */
  it("decorates as a sibling of defaults — both cells stay the row's direct children", async () => {
    const items: readonly MenuEntry[] = [{ value: "rename", label: "Rename" }];
    mount(
      <Menu
        id="actions"
        defaultOpen
        trigger={<button type="button">Actions</button>}
        items={items}
        renderItem={(_row, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge />
          </>
        )}
      />,
    );
    await settle();

    const row = queryPart(document.body, "item");
    if (row === null) throw new Error("no row");
    const text = queryPart(row, "item-text");
    const badge = row.querySelector("[data-badge]");

    expect(text?.parentElement).toBe(row);
    expect(badge?.parentElement).toBe(row);
  });

  /**
   * The cost of the alternative, named directly by the JSDoc: wrapping `defaults`
   * "takes all of them out of the grid at once". `menu:item-text` gets
   * `grid-column: 2` (`_menu.scss:574`), a declaration a browser only honours on
   * a grid item — so once a wrapper sits between the row and the text, the text
   * is no longer one, and the declaration has nothing left to address. This is
   * the consumer's call to make (same shape as `select`'s `renderOption`,
   * `composed.test.tsx:319`), and what it costs is pinned here rather than left
   * to be rediscovered.
   */
  it("loses the row's direct-child placement when a consumer wraps defaults instead", async () => {
    const items: readonly MenuEntry[] = [{ value: "rename", label: "Rename" }];
    mount(
      <Menu
        id="actions"
        defaultOpen
        trigger={<button type="button">Actions</button>}
        items={items}
        renderItem={(_row, defaults) => (
          <div data-wrapper>
            {defaults}
            <span aria-hidden="true" data-badge />
          </div>
        )}
      />,
    );
    await settle();

    const row = queryPart(document.body, "item");
    if (row === null) throw new Error("no row");
    const text = queryPart(row, "item-text");

    expect(text?.parentElement).not.toBe(row);
    expect(text?.parentElement?.hasAttribute("data-wrapper")).toBe(true);
  });

  /**
   * Clause 4. A tree that stands the two shapes `renderItem` must reach — a
   * group's own row, and a row the recursion nests one level inside a submenu —
   * right next to the three it must not: the group container, the separator, and
   * the submenu's own row, which is a trigger item rather than a choice.
   * `keepMounted` is what puts the submenu's surface in the tree at all without
   * driving it open.
   */
  it("reaches every row the recursion produces, and none of a group, a separator or a trigger item", async () => {
    const items: readonly MenuEntry[] = [
      {
        id: "group-edit",
        label: "Edit",
        options: [
          { value: "wrap", label: "Wrap lines", type: "checkbox", checked: false },
          { value: "rename", label: "Rename" },
        ],
      },
      { separator: true },
      {
        id: "share",
        value: "share",
        label: "Share",
        items: [{ value: "copy-link", label: "Copy link" }],
      },
    ];
    mount(
      <Menu
        id="edit"
        defaultOpen
        keepMounted
        trigger={<button type="button">Edit</button>}
        items={items}
        renderItem={(row, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge={row.value} />
          </>
        )}
      />,
    );
    await settle();

    // The two rows the contract must reach, the nested one included.
    for (const value of ["wrap", "rename", "copy-link"]) {
      expect(document.querySelector(`[data-value="${value}"] > [data-badge]`)).not.toBeNull();
    }

    // Exactly three badges landed, each a direct child of an actual `menu:item`
    // row — a proof by count and by parentage together, rather than a claim
    // about the other three shapes taken one at a time.
    const badges = [...document.querySelectorAll("[data-badge]")];
    expect(badges.length).toBe(3);
    for (const badge of badges) {
      expect(badge.parentElement?.getAttribute("data-part")).toBe("menu:item");
    }

    // The three shapes named directly: a group carries no badge of its own —
    // only its child rows do, one level deeper — the separator renders no
    // children at all, and the submenu's own row is exactly what
    // `renderSubmenu` wrote, never handed to `renderItem`.
    const group = queryPart(document.body, "item-group");
    expect(group?.querySelector(":scope > [data-badge]")).toBeNull();
    const separator = queryPart(document.body, "separator");
    expect(separator?.children.length).toBe(0);
    const triggerItem = queryPart(document.body, "trigger-item");
    expect(triggerItem?.querySelector("[data-badge]")).toBeNull();
  });
});

describe("the composed menu — axe", () => {
  it("closed: a menu button and nothing else", async () => {
    const { container } = mount(
      <main>
        <Menu id="actions" trigger={<button type="button">Actions</button>} items={MINIMAL} />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });

  /**
   * Scoped the way the parts' own suite scopes it — the trigger where the author
   * wrote it, and the portalled surface on its own. A page-wide run would only add
   * `region`, which is a fact about the harness rather than about the menu.
   */
  it("open: every entry kind the grammar can produce", async () => {
    const { container } = mount(
      <main>
        <Menu
          id="actions"
          defaultOpen
          trigger={<button type="button">Actions</button>}
          items={TREE}
        />
      </main>,
    );
    await settle();

    const positioner = queryPart(document.body, "positioner");
    if (positioner === null) throw new Error("no positioner");
    // The fixture really did draw all of it: a `role="menu"` owns menu items,
    // groups and separators and nothing else, so an empty surface would pass here
    // for the wrong reason.
    expect(queryParts(document.body, "item").length).toBe(4);
    expect(queryParts(document.body, "trigger-item").length).toBe(1);
    expect(queryParts(document.body, "item-group").length).toBe(1);

    await expectNoAxeViolations(container);
    await expectNoAxeViolations(positioner);
  });

  it("open: a disabled row in first position, in the minimal shape", async () => {
    mount(
      <main>
        <Menu
          id="actions"
          defaultOpen
          trigger={<button type="button">Actions</button>}
          items={DISABLED_FIRST}
        />
      </main>,
    );
    await settle();

    const positioner = queryPart(document.body, "positioner");
    if (positioner === null) throw new Error("no positioner");

    await expectNoAxeViolations(positioner);
  });
});
