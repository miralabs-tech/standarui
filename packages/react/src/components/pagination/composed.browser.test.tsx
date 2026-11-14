/**
 * The composed pagination in a real engine — and the one composed layer whose
 * collection nobody handed in.
 *
 * `packages/react/src/composed.test.tsx` proves the markup is the parts', to the
 * character. What a string cannot prove is that a bar whose cells are recomputed
 * on every page turn is still one a keyboard and a pad can drive: the window
 * slides, cells unmount, and the control the focus was on may not be there a
 * moment later. That is the shape `calendar` will have, which is why it is driven
 * here rather than assumed.
 *
 * The machine is proved in `packages/core/src/components/pagination` — the
 * truncation model, the guards, the focus moves and LT/RT all live there — and
 * the parts are proved in `pagination.browser.test.tsx`. This file drives the
 * form that writes no cells of its own.
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
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { Pagination } from "./composed";

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

function cells(root: ParentNode): HTMLElement[] {
  return queryParts(root, "item");
}

function cell(root: ParentNode, page: number): HTMLElement {
  const found = cells(root).find((node) => node.getAttribute("data-value") === String(page));
  if (found === undefined) throw new Error(`no cell for page ${page}`);
  return found;
}

function current(root: ParentNode): string | null {
  return cells(root).find((node) => node.hasAttribute("aria-current"))?.textContent ?? null;
}

afterEach(() => {
  unmountAll();
  input = null;
});

describe("the composed pagination, driven", () => {
  /** The minimal form: `count` and nothing else — no labels, no hatch, no parts. */
  it("draws the window the machine computed, and turns the page on a click", async () => {
    const onPageChange = vi.fn();
    const { container } = mount(<Pagination id="p" count={95} onPageChange={onPageChange} />);
    await settle();

    // 95 items at 10 a page, on page 1: 1 2 3 4 5 … 10. Nobody wrote that down.
    expect(cells(container).map((node) => node.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "10",
    ]);
    expect(current(container)).toBe("1");

    fire(() => cell(container, 5).click());
    await settle();

    expect(onPageChange).toHaveBeenCalledWith({ page: 5, pageSize: 10 });
    // The window slid under the composed layer: two gaps now, and the cells the
    // consumer never supplied are different cells.
    expect(cells(container).map((node) => node.textContent)).toEqual(["1", "4", "5", "6", "10"]);
    expect(queryParts(container, "ellipsis").length).toBe(2);
    expect(current(container)).toBe("5");
  });

  it("moves the focus with the arrows, one control at a time", async () => {
    const { container } = mount(<Pagination id="p" count={95} defaultPage={3} />);
    await settle();

    const three = cell(container, 3);
    fire(() => three.focus());
    press("ArrowRight");
    await settle();

    expect(document.activeElement).toBe(cell(container, 4));
    press("ArrowLeft");
    await settle();
    expect(document.activeElement).toBe(three);
    // Every control is tabbable — a pagination is a navigation landmark and not a
    // composite with one tab stop — so the arrows are an enrichment, and moving
    // the focus is all they do.
    expect(current(container)).toBe("3");
  });

  it("turns the page on PageDown without moving the focus", async () => {
    const onPageChange = vi.fn();
    const { container } = mount(
      <Pagination id="p" count={95} defaultPage={3} onPageChange={onPageChange} />,
    );
    await settle();

    const three = cell(container, 3);
    fire(() => three.focus());
    press("PageDown");
    await settle();

    expect(onPageChange).toHaveBeenCalledWith({ page: 4, pageSize: 10 });
    expect(current(container)).toBe("4");
    expect(document.activeElement).toBe(three);
  });

  /**
   * Home and End are given back to the page, and that is a decision rather than a
   * gap: every control here is tabbable, so both ends are a press or two away,
   * and the browser binds those two keys to the top and the bottom of the
   * document. An enrichment may not cost more than it adds.
   */
  it("leaves Home and End to the browser", async () => {
    const { container } = mount(<Pagination id="p" count={95} defaultPage={3} />);
    await settle();

    const three = cell(container, 3);
    fire(() => three.focus());
    press("Home");
    await settle();
    press("End");
    await settle();

    expect(document.activeElement).toBe(three);
    expect(current(container)).toBe("3");
  });

  it("answers the pad's page intents while the focus is inside the bar", async () => {
    const onPageChange = vi.fn();
    const { container } = mount(
      withPad(<Pagination id="p" count={95} defaultPage={3} onPageChange={onPageChange} />),
    );
    await settle();

    fire(() => cell(container, 3).focus());
    fire(() => {
      input?.emit({ intent: "pageDown", source: "gamepad" });
    });

    await waitFor(() => {
      expect(onPageChange).toHaveBeenCalledWith({ page: 4, pageSize: 10 });
    });
    expect(current(container)).toBe("4");
  });

  /** R17: the bar's scope opens at mount, under the trap of the dialog around it. */
  it("still answers the pad's page intents inside a modal dialog that traps", async () => {
    const onPageChange = vi.fn();
    mount(
      withPad(
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Results</DialogTitle>
                <Pagination id="p" count={95} defaultPage={3} onPageChange={onPageChange} />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>,
      ),
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the cell before the pad is pressed.
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const three = cell(document.body, 3);
    fire(() => three.focus());
    await settle();
    expect(document.activeElement).toBe(three);

    fire(() => {
      input?.emit({ intent: "pageDown", source: "gamepad" });
    });
    await settle();

    expect(onPageChange).toHaveBeenCalledWith({ page: 4, pageSize: 10 });
  });

  it("keeps a trigger at its bound focusable and merely aria-disabled", async () => {
    const { container } = mount(<Pagination id="p" count={95} defaultPage={1} />);
    await settle();

    const prev = queryPart<HTMLButtonElement>(container, "prev-trigger");
    expect(prev?.getAttribute("aria-disabled")).toBe("true");
    // Never the native `disabled`: at the last activation before a bound the
    // button would disable itself under the focus and drop it on `body`.
    expect(prev?.disabled).toBe(false);
  });

  /**
   * The escape hatch over a machine-computed collection, which is the half
   * `calendar` needs: the cell keeps its own accessible name whatever goes in it,
   * because the name is `aria-label` on the button and not its text.
   */
  it("decorates a cell through renderItem without touching what names it", async () => {
    const { container } = mount(
      <Pagination
        id="p"
        count={95}
        defaultPage={3}
        renderItem={(page, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge>
              {page}
            </span>
          </>
        )}
      />,
    );
    await settle();

    const three = cell(container, 3);
    expect(three.getAttribute("aria-label")).toBe("page 3");
    expect(three.querySelector("[data-badge]")).not.toBeNull();
  });
});

describe("the composed pagination — axe", () => {
  it("passes in the minimal form", async () => {
    const { container } = mount(
      <main>
        <Pagination id="p" count={95} defaultPage={5} />
      </main>,
    );
    await settle();

    expect(queryParts(container, "ellipsis").length).toBe(2);
    await expectNoAxeViolations(container);
  });

  it("passes parked at a bound, with both label slots filled", async () => {
    const { container } = mount(
      <main>
        <Pagination
          id="p"
          count={95}
          defaultPage={10}
          prevLabel={<span aria-hidden="true">‹</span>}
          nextLabel={<span aria-hidden="true">›</span>}
        />
      </main>,
    );
    await settle();

    // The slots are content, never the name: the machine wrote that before either
    // arrived, and a decorated control must not end up saying its glyph out loud.
    expect(queryPart(container, "next-trigger")?.getAttribute("aria-label")).toBe("next page");
    await expectNoAxeViolations(container);
  });

  it("passes in link mode, where every control is an anchor", async () => {
    const { container } = mount(
      <main>
        <Pagination
          id="p"
          count={95}
          defaultPage={5}
          type="link"
          getPageUrl={({ page }) => `#page-${page}`}
        />
      </main>,
    );
    await settle();

    expect(cells(container).every((node) => node.localName === "a")).toBe(true);
    await expectNoAxeViolations(container);
  });
});
