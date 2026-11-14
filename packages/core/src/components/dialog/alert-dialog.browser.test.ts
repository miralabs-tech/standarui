/**
 * The alert dialog, which is the dialog machine with `role="alertdialog"` and two
 * action buttons — so what is worth testing is only what differs.
 *
 * The markup below writes the confirm button **first**, because that is how the
 * sentence reads ("Delete" then "Cancel") and it is the arrangement that makes
 * the machine's plain fallback — the first tabbable in the surface — arm the
 * dangerous choice. The APG asks an alert dialog to open on its least destructive
 * action, and that is the rule these hold.
 */

import { afterEach, describe, expect, it } from "vitest";
import { getLayerStack } from "../../interaction/layer-stack";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./dialog.connect";
import { machine } from "./dialog.machine";
import type { DialogApi, DialogMachineProps, DialogSchema } from "./dialog.types";

type Api = DialogApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

const MARKUP = `
  <button data-slot="trigger">Delete file</button>
  <div data-slot="backdrop"></div>
  <div data-slot="positioner">
    <div data-slot="content">
      <h2 data-slot="title">Delete this file?</h2>
      <p data-slot="description">This cannot be undone.</p>
      <div data-slot="actions">
        <button data-slot="action">Delete</button>
        <button data-slot="cancel">Cancel</button>
      </div>
    </div>
  </div>`;

function render(props: DialogMachineProps = {}, destructive = true) {
  return mountMachine<DialogSchema, Api>({
    machine,
    connect,
    html: MARKUP,
    id: "a1",
    props: { role: "alertdialog", ...props },
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("trigger", api.getTriggerProps());
      put("backdrop", api.getBackdropProps());
      put("positioner", api.getPositionerProps());
      put("content", api.getContentProps());
      put("title", api.getTitleProps());
      put("description", api.getDescriptionProps());
      put("actions", api.getActionsProps());
      put("cancel", api.getCancelTriggerProps());
      put("action", api.getActionTriggerProps({ destructive }));
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

function frames(count = 3): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      if (--left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function open(harness: Harness): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  trigger.click();
  await frames();
}

afterEach(() => {
  unmountAll();
  const stack = getLayerStack(document);
  for (const layer of [...stack.layers()]) stack.remove(layer.id);
});

describe("the alert dialog is the dialog, told apart by its role", () => {
  it("publishes role=alertdialog on the surface", async () => {
    const harness = render();
    await open(harness);

    expect(slot(harness, "content").getAttribute("role")).toBe("alertdialog");
  });

  it("marks only the action the consumer called destructive", async () => {
    const harness = render();
    await open(harness);

    expect(slot(harness, "action").hasAttribute("data-destructive")).toBe(true);
    expect(slot(harness, "cancel").hasAttribute("data-destructive")).toBe(false);
  });

  it("leaves the action unmarked when it is not destructive", async () => {
    const harness = render({}, false);
    await open(harness);

    expect(slot(harness, "action").hasAttribute("data-destructive")).toBe(false);
  });
});

describe("focus opens on the least destructive action", () => {
  it("lands on cancel even though the confirm button is written first", async () => {
    const harness = render();
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "cancel"));
  });

  it("still lands there when focus is replayed without closing", async () => {
    const harness = render();
    await open(harness);
    slot(harness, "action").focus();

    harness.api().focusInitial();
    await frames();

    expect(document.activeElement).toBe(slot(harness, "cancel"));
  });

  it("yields to an explicit initialFocus, which is the consumer's call to make", async () => {
    const harness = render({ initialFocus: () => document.querySelector('[data-slot="action"]') });
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "action"));
  });

  // The guard on the rule above: a plain dialog has no least-destructive action
  // to prefer, so it must still take the first tabbable it finds.
  it("does not change a plain dialog, which still takes the first tabbable", async () => {
    const harness = render({ role: "dialog" });
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "action"));
  });
});

describe("both actions close, and both can be stopped", () => {
  it("closes on cancel", async () => {
    const harness = render();
    await open(harness);
    slot(harness, "cancel").click();
    await frames();

    expect(harness.api().open).toBe(false);
  });

  it("closes on the action", async () => {
    const harness = render();
    await open(harness);
    slot(harness, "action").click();
    await frames();

    expect(harness.api().open).toBe(false);
  });

  // The `preventDefault()` veto that keeps the surface open through an action
  // that awaits a request is asserted in the React suite instead, and not for
  // convenience: it only means anything when the consumer's handler runs *before*
  // the machine's, which is what `useRender` guarantees and what this harness —
  // where `apply` attaches the machine's listener first — cannot reproduce.
});
