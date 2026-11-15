/**
 * The composed tab list in a real engine.
 *
 * `packages/react/src/composed.test.tsx` proves the markup is the parts', to the
 * character, and `composed.test.tsx` beside this file proves the absolute claims a
 * string can carry. What neither can drive is the one thing the two-loop shape
 * exists for: a close button that sits *beside* its tab rather than inside it is a
 * claim about where a click goes, and a click is not a string.
 *
 * The machine is proved in `packages/core/src/components/tabs` and the parts in
 * `tabs.browser.test.tsx`. This file drives the form that writes no tabs of its own,
 * with the three fixtures `ROADMAP.md:173` makes mandatory — the minimal form, a
 * disabled entry **in first position**, and at least one gamepad intent.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputSystem } from "../../nav";
import { NavProvider, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { Tabs } from "./composed";

const ITEMS = [
  { value: "overview", label: "Overview", content: "What this document is." },
  { value: "activity", label: "Activity", content: "Who touched it last." },
  { value: "history", label: "History", content: "Every version of it." },
];

/**
 * The same list with its first entry disabled — the fixture `ROADMAP.md:173` makes
 * mandatory, written out rather than spread from `ITEMS[0]`: an indexed read is
 * `T | undefined` here, and spreading that hands every field back optional.
 */
const DISABLED_FIRST = [
  { value: "overview", label: "Overview", content: "What this document is.", disabled: true },
  ...ITEMS.slice(1),
];

const NAMED = { list: { "aria-label": "Document sections" } };

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

function press(key: string, target?: HTMLElement | null): void {
  const node = target ?? (document.activeElement as HTMLElement | null);
  if (node === null) throw new Error(`nothing to send "${key}" to`);
  fire(() => node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function tabs(root: ParentNode): HTMLElement[] {
  return queryParts(root, "trigger");
}

function tab(root: ParentNode, value: string): HTMLElement {
  const found = tabs(root).find((node) => node.getAttribute("data-value") === value);
  if (found === undefined) throw new Error(`no tab for ${value}`);
  return found;
}

function selected(root: ParentNode): string | null {
  return (
    tabs(root).find((node) => node.getAttribute("aria-selected") === "true")?.textContent ?? null
  );
}

/**
 * The **active** panel, never the panel count. A deactivated panel is held in the
 * tree until its exit animation ends, and these suites load no stylesheet — so the
 * exit lasts a single frame and asserting the old panel is gone is a race rather
 * than a property (`packages/styles/src/exit-motion.browser.test.tsx` is where that
 * one is measured, with the compiled sheet actually loaded).
 */
function activePanel(root: ParentNode): string | null {
  return (
    queryParts(root, "content").find((node) => node.getAttribute("data-state") === "active")
      ?.textContent ?? null
  );
}

afterEach(() => {
  unmountAll();
  input = null;
});

describe("the composed tab list, driven", () => {
  /** The minimal form: `items` and nothing else — no value, no hatch, no parts. */
  it("settles on a selection nobody asked for, and reports it", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Tabs id="doc" items={ITEMS} onValueChange={onValueChange} />);
    await settle();

    // A tablist has exactly one selected tab, and the machine holds that invariant
    // without the consumer passing a `defaultValue` — so the composed layer does
    // not have to invent one either. What is worth knowing, and is asserted rather
    // than worked around: the settle is a real value change and the consumer hears
    // about it, once, at mount.
    expect(tabs(container).length).toBe(3);
    expect(selected(container)).toBe("Overview");
    expect(activePanel(container)).toBe("What this document is.");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith({ value: "overview" });
  });

  it("moves the selection on a click, and the panel follows", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <Tabs id="doc" defaultValue="overview" items={ITEMS} onValueChange={onValueChange} />,
    );
    await settle();

    fire(() => tab(container, "activity").click());
    await settle();

    // `defaultValue` is pinned here, so the settle commits nothing and this is the
    // only call there is.
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith({ value: "activity" });
    expect(selected(container)).toBe("Activity");
    expect(activePanel(container)).toBe("Who touched it last.");
  });

  /**
   * A disabled entry **in first position** — the fixture the lesson at
   * `ROADMAP.md:173` was written for, because it is the one a hand-written story
   * never reaches for.
   */
  it("skips a disabled first entry rather than parking the tab stop on it", async () => {
    const { container } = mount(<Tabs id="doc" items={DISABLED_FIRST} />);
    await settle();

    const first = tab(container, "overview");
    expect(first.hasAttribute("data-disabled")).toBe(true);
    expect(first.getAttribute("aria-selected")).toBe("false");
    // Exactly one stop in the tab order, and it is not the disabled tab.
    const stops = tabs(container).filter((node) => node.getAttribute("tabindex") === "0");
    expect(stops.length).toBe(1);
    expect(stops[0]).toBe(tab(container, "activity"));

    fire(() => tab(container, "activity").focus());
    press("ArrowLeft");
    await settle();

    // Left from the first enabled tab wraps past the disabled one rather than onto it.
    expect(document.activeElement).not.toBe(first);
  });

  it("answers the pad's list intents while the focus is inside the list", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      withPad(<Tabs id="doc" items={ITEMS} onValueChange={onValueChange} />),
    );
    await settle();

    fire(() => tab(container, "overview").focus());
    fire(() => {
      input?.emit({ intent: "tabNext", source: "gamepad" });
    });

    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalledWith({ value: "activity" });
    });
    expect(selected(container)).toBe("Activity");
  });

  /**
   * The claim the two-loop shape is written for, driven rather than read. A close
   * button nested in its tab would hand the click to the tab on the way out —
   * selecting the tab the user just asked to be rid of. Here the tab that is closed
   * is deliberately **not** the selected one, so a stray selection is visible.
   */
  it("closes a tab without selecting it on the way out", async () => {
    const onClose = vi.fn();
    const onValueChange = vi.fn();
    const { container } = mount(
      <Tabs
        id="doc"
        defaultValue="overview"
        closable
        items={ITEMS}
        parts={NAMED}
        onClose={onClose}
        onValueChange={onValueChange}
      />,
    );
    await settle();

    expect(selected(container)).toBe("Overview");
    const closers = queryParts(container, "close-trigger");
    expect(closers.length).toBe(3);

    fire(() => closers[1]?.click());
    await settle();

    expect(onClose).toHaveBeenCalledWith({ value: "activity" });
    // The consumer removes the tab; the machine only says which one. What must not
    // have happened is a selection change, which a nested button would have caused.
    expect(onValueChange).not.toHaveBeenCalled();
    expect(selected(container)).toBe("Overview");
  });
});

describe("the composed tab list — axe", () => {
  it("passes in the minimal form", async () => {
    const { container } = mount(
      <main>
        <Tabs id="doc" items={ITEMS} parts={NAMED} />
      </main>,
    );
    await settle();

    expect(tabs(container).length).toBe(3);
    await expectNoAxeViolations(container);
  });

  /**
   * `closable` puts a button inside a `role="tablist"`, which may own nothing but
   * `role="tab"`. The machine answers that with `aria-hidden` and `tabindex="-1"`
   * on the close trigger — zero violations *and* zero incompletes — and this is the
   * composed layer's own check that it did not undo the arrangement by placing the
   * part somewhere else.
   */
  it("passes with the close buttons standing in the list", async () => {
    const { container } = mount(
      <main>
        <Tabs id="doc" closable items={ITEMS} parts={NAMED} />
      </main>,
    );
    await settle();

    expect(queryParts(container, "close-trigger").length).toBe(3);
    await expectNoAxeViolations(container);
  });

  it("passes with a disabled entry in first position", async () => {
    const { container } = mount(
      <main>
        <Tabs id="doc" items={DISABLED_FIRST} parts={NAMED} />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });
});
