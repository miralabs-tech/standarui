/**
 * The toast through React: only what an adapter can get wrong.
 *
 * The store, the machine, the keyboard, the announcer and the hand-off are proved
 * against real nodes with no framework in
 * `packages/core/src/components/toast/toast.browser.test.ts`, and they are not
 * re-litigated here. What is here is the seam React adds: a region that survives
 * every card leaving it, one presence per card so an exit is actually seen, the
 * render prop the app renders its own card with — and axe over the result.
 *
 * The stylesheet is load-bearing. Without a real transition an exit lasts one
 * frame, and every assertion about a card that is on its way out becomes a race.
 */

import type { Toaster, ToastRecord } from "@standarui/core/toast";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  createToaster,
  ToastActionTrigger,
  ToastCloseTrigger,
  ToastDescription,
  ToastGroup,
  ToastIndicator,
  ToastRoot,
  ToastTitle,
} from "./toast";

const EXIT = 60;

let sheet: HTMLStyleElement;

beforeAll(() => {
  sheet = document.createElement("style");
  sheet.textContent = `
    [data-part~="toast:root"] { display: block; opacity: 1; transition: opacity ${EXIT}ms linear; }
    [data-part~="toast:root"][data-state="closed"] { opacity: 0; }
  `;
  document.head.append(sheet);
});

afterAll(() => {
  sheet.remove();
});

afterEach(() => {
  unmountAll();
  for (const node of document.querySelectorAll("input")) node.remove();
});

/** An inline SVG, never a text glyph: a glyph's ink sits on its baseline. */
function Glyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Scene({ toaster }: { toaster: Toaster }): ReactNode {
  return (
    <ToastGroup toaster={toaster} portalled={false}>
      {(record: ToastRecord) => (
        <ToastRoot toast={record}>
          <ToastIndicator>
            <Glyph />
          </ToastIndicator>
          <ToastTitle>{record.title}</ToastTitle>
          {record.description === undefined ? null : (
            <ToastDescription>{record.description}</ToastDescription>
          )}
          {record.action === undefined ? null : (
            <ToastActionTrigger>{record.action.label}</ToastActionTrigger>
          )}
          {record.closable ? (
            <ToastCloseTrigger>
              <Glyph />
            </ToastCloseTrigger>
          ) : null}
        </ToastRoot>
      )}
    </ToastGroup>
  );
}

function cards(root: ParentNode): HTMLElement[] {
  return queryParts(root, "root");
}

describe("toast in React", () => {
  it("keeps the region mounted with nothing in it, and takes no focus when one arrives", () => {
    const toaster = createToaster({ duration: 60_000 });
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const handle = mount(<Scene toaster={toaster} />);
    const group = queryPart(handle.container, "group");
    expect(group?.getAttribute("role")).toBe("region");
    expect(cards(handle.container)).toHaveLength(0);

    fire(() => {
      toaster.create({ title: "Upload failed", type: "error" });
    });

    expect(cards(handle.container)).toHaveLength(1);
    expect(document.activeElement).toBe(input);
  });

  it("holds a dismissed card in the tree until its exit has finished", async () => {
    const toaster = createToaster({ duration: 60_000 });
    const handle = mount(<Scene toaster={toaster} />);

    let id = "";
    fire(() => {
      id = toaster.create({ title: "Saved", description: "All changes stored" });
    });
    await settle();

    fire(() => toaster.dismiss(id));
    const card = cards(handle.container)[0];
    // Still here, and already saying it is leaving: this is the frame the exit
    // transition starts on, and the presence is what keeps the node for it.
    expect(card?.getAttribute("data-state")).toBe("closed");
    expect(toaster.isVisible(id)).toBe(true);

    await waitFor(() => {
      expect(cards(handle.container)).toHaveLength(0);
    });
    // The record leaves the store only once the adapter reports the exit is over.
    expect(toaster.isVisible(id)).toBe(false);
  });

  it("closes from the card's own trigger, and runs the action before it does", async () => {
    const onClick = vi.fn();
    const toaster = createToaster({ duration: 60_000 });
    const handle = mount(<Scene toaster={toaster} />);

    fire(() => {
      toaster.create({ title: "Deleted", action: { label: "Undo", onClick } });
    });
    await settle();

    const action = queryPart<HTMLButtonElement>(handle.container, "action-trigger");
    fire(() => action?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(cards(handle.container)).toHaveLength(0);
    });

    fire(() => {
      toaster.create({ title: "Saved" });
    });
    await settle();
    const close = queryPart<HTMLButtonElement>(handle.container, "close-trigger");
    expect(close?.getAttribute("aria-label")).toBe("Dismiss notification");
    fire(() => close?.click());
    await waitFor(() => {
      expect(cards(handle.container)).toHaveLength(0);
    });
  });

  it("hands the whole record to the render prop, `meta` included", async () => {
    const toaster = createToaster({ duration: 60_000 });
    const seen: unknown[] = [];
    mount(
      <ToastGroup toaster={toaster} portalled={false}>
        {(record: ToastRecord) => {
          seen.push(record.meta);
          return (
            <ToastRoot toast={record}>
              <ToastTitle>{record.title}</ToastTitle>
            </ToastRoot>
          );
        }}
      </ToastGroup>,
    );

    fire(() => {
      toaster.create({ title: "Saved", meta: { fileId: "f1" } });
    });
    await settle();
    expect(seen.at(-1)).toEqual({ fileId: "f1" });
  });

  it("passes axe with a full card in the region", async () => {
    const toaster = createToaster({ duration: 60_000 });
    const handle = mount(<Scene toaster={toaster} />);

    fire(() => {
      toaster.create({
        title: "Upload failed",
        description: "The file is larger than 25 MB",
        type: "error",
        action: { label: "Retry", onClick: () => {} },
      });
      toaster.create({ title: "Saved" });
    });
    await settle();

    const group = queryPart(handle.container, "group");
    expect(group).not.toBeNull();
    for (const card of cards(handle.container)) {
      expect(card.getAttribute("aria-labelledby")).not.toBeNull();
    }
    await expectNoAxeViolations(group as HTMLElement);
  });
});
