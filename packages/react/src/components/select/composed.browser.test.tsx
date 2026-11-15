/**
 * The composed select in a real engine.
 *
 * `packages/react/src/composed.test.tsx` proves the markup is the parts', to the
 * character. What a string cannot prove is that the tree an `options` array
 * produces is one a keyboard and a pad can actually drive: the parts' own suite
 * drives fixtures a human wrote by hand, and the composed layer is the only thing
 * standing between the array and them. So this file drives the array — it does
 * not re-audit the machine, which is proved in `packages/core/src/components/select`
 * and again through the parts in `select.browser.test.tsx`.
 *
 * The three fixtures are the ones the 2026-08-27 audit made mandatory, for the
 * reason it gave — the suite was green partly because the fixtures avoided the
 * shapes that break: the **minimal form** (no group, no icon, no placeholder), a
 * **disabled option in first position**, and at least one **gamepad intent**.
 */

import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
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
import { Select } from "./composed";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

/** No group, no icon, no placeholder — the shape with every optional part left out. */
const MINIMAL = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
] as const;

/** The audit's second fixture: the row the initial highlight has to step over. */
const DISABLED_FIRST = [
  { value: "apple", label: "Apple", disabled: true },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
] as const;

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

/**
 * Name from content, to the depth an option needs: the text of everything that is
 * not hidden from the accessibility tree. Not the accname algorithm — an option
 * here carries no `aria-label` and no IDREF, so its name *is* its visible text,
 * and the symbol column is `aria-hidden` by the machine's own doing.
 */
function nameFromContent(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (clone.textContent ?? "").replaceAll(/\s+/g, " ").trim();
}

afterEach(() => {
  unmountAll();
  input = null;
});

describe("the composed select, driven", () => {
  it("opens from the trigger with the keyboard, walks the arrows and commits with Enter", async () => {
    const onValueChange = vi.fn();
    await commands.mouse([{ type: "move", x: window.innerWidth - 1, y: window.innerHeight - 1 }]);
    mount(<Select id="fruit" label="Fruit" options={MINIMAL} onValueChange={onValueChange} />);
    await settle();

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
      expect(document.activeElement?.hasAttribute("data-highlighted")).toBe(true);
    });
    expect(queryPart(document.body, "content")?.getAttribute("role")).toBe("listbox");

    press("ArrowDown");
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("banana");
    });

    press("Enter");
    await waitFor(() => {
      expect(button.getAttribute("data-state")).toBe("closed");
    });
    expect(onValueChange).toHaveBeenCalledWith({ value: "banana" });
    expect(button.textContent).toContain("Banana");
  });

  it("closes on Escape and leaves the value alone", async () => {
    const onValueChange = vi.fn();
    mount(
      <Select
        id="fruit"
        label="Fruit"
        defaultValue="apple"
        options={MINIMAL}
        onValueChange={onValueChange}
      />,
    );
    await settle();

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
    });

    press("Escape");
    await waitFor(() => {
      expect(button.getAttribute("data-state")).toBe("closed");
    });
    expect(onValueChange).not.toHaveBeenCalled();
    // The real focus, not `data-state`: `restoreFocus` is `true` by default
    // (`select.machine.ts:255`) and the restore is the `focusContent` disposer
    // (`:869-879`, `getTriggerEl` when nothing else claimed the focus). Proved on
    // the machine already — asserted here because the composed layer is what
    // decides which element ends up carrying `select:trigger`.
    await waitFor(() => {
      expect(document.activeElement).toBe(button);
    });
  });

  it("steps the initial highlight over a disabled first option", async () => {
    mount(<Select id="fruit" label="Fruit" options={DISABLED_FIRST} />);
    await settle();

    const first = queryPart(document.body, "item");
    expect(first?.getAttribute("data-value")).toBe("apple");
    expect(first?.getAttribute("aria-disabled")).toBe("true");

    const button = trigger();
    fire(() => button.focus());
    press("ArrowDown", button);
    await settle();

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("banana");
    });
    expect(first?.hasAttribute("data-highlighted")).toBe(false);
  });

  it("commits the highlighted option on the pad's A, with no click behind it", async () => {
    const onValueChange = vi.fn();
    mount(
      withPad(<Select id="fruit" label="Fruit" options={MINIMAL} onValueChange={onValueChange} />),
    );
    await settle();

    fire(() => trigger().click());
    await settle();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
    });

    pressA();
    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    });
  });

  /**
   * `renderOption` hands back the row the layer would have rendered, so a
   * decoration can only wrap it. The part that carries the option's name has to
   * come out the other side, once — and the decoration, being `aria-hidden`,
   * stays out of the name it would otherwise join.
   */
  it("keeps the part that names an option through renderOption", async () => {
    mount(
      <Select
        id="fruit"
        label="Fruit"
        defaultOpen
        options={MINIMAL}
        renderOption={(option, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge>
              {option.value.length}
            </span>
          </>
        )}
      />,
    );
    await settle();

    const item = queryPart(document.body, "item");
    if (item === null) throw new Error("no item");
    expect(queryParts(item, "item-text").length).toBe(1);
    expect(item.querySelector("[data-badge]")).not.toBeNull();
    expect(nameFromContent(item)).toBe("Apple");
  });
});

/**
 * The landmark arrangement `select.browser.test.tsx` explains at length, kept
 * identical: axe's `region` rule is about the page, the portal is a sibling of
 * the mount container, and the host has to exist before the mount because
 * `Portal` resolves its container during the first render.
 */
function landmarkedPortalHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Composed select surface");
  document.body.append(host);
  return host;
}

describe("the composed select — axe", () => {
  afterEach(() => {
    for (const host of document.querySelectorAll('[aria-label="Composed select surface"]')) {
      host.remove();
    }
  });

  it("closed: a named combobox and nothing else", async () => {
    const { container } = mount(
      <main>
        <Select id="fruit" label="Fruit" defaultValue="apple" options={MINIMAL} />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });

  it("open: the listbox, a disabled first option and a decorated row", async () => {
    mount(
      <main>
        <Select
          id="fruit"
          label="Fruit"
          defaultOpen
          defaultValue="banana"
          container={landmarkedPortalHost()}
          options={DISABLED_FIRST}
          renderOption={(option, defaults) => (
            <>
              {defaults}
              <span aria-hidden="true">{option.value.length}</span>
            </>
          )}
        />
      </main>,
    );
    await settle();

    expect(queryParts(document.body, "item").length).toBe(3);
    await expectNoAxeViolations(document.body);
  });
});
