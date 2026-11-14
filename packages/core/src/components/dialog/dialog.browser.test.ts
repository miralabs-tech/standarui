/**
 * The dialog against a real engine, driven with no framework at all.
 *
 * This is the suite the Phase 5 exit criterion means by "parité React/vanilla
 * prouvée par la même suite de tests": the harness applies prop getters to real
 * nodes and repaints on settle, which is the shape `@standarui/vanilla` takes.
 * `packages/react/src/components/dialog/dialog.browser.test.tsx` runs the same
 * behaviours through React's portal, presence and provider; anything that differs
 * between the two files is an adapter concern, not a machine one.
 *
 * Everything here needs an engine and could not be faked: `inert`, the layer
 * stack, `getAnimations`, the two frames the focus trap waits for.
 */

import { createIntentBus, type IntentBus, MODALITY_ATTRIBUTE } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isScrollLocked } from "../../a11y/scroll-lock";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack } from "../../interaction/layer-stack";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./dialog.connect";
import { machine } from "./dialog.machine";
import type { DialogApi, DialogMachineProps, DialogSchema } from "./dialog.types";

type Api = DialogApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

interface SceneOptions {
  /** Left out to prove the name falls back to `aria-label` until one appears. */
  readonly title?: boolean;
  /** Left out to prove focus stays on the surface when nothing inside can take it. */
  readonly tabbables?: boolean;
  /** Left out to build the store-driven dialog `dialog.dom.ts` describes: no trigger at all. */
  readonly trigger?: boolean;
  readonly id?: string;
}

function markup(options: SceneOptions): string {
  const title = options.title === false ? "" : `<h2 data-slot="title">Rename file</h2>`;
  const tabbables =
    options.tabbables === false
      ? ""
      : `<input data-slot="name" /><button data-slot="close">Close</button>`;
  const trigger = options.trigger === false ? "" : `<button data-slot="trigger">Rename</button>`;
  return `
    ${trigger}
    <button data-slot="outside">Elsewhere</button>
    <div data-slot="backdrop"></div>
    <div data-slot="positioner">
      <div data-slot="content">
        ${title}
        <p data-slot="description">Pick a new name.</p>
        ${tabbables}
      </div>
    </div>`;
}

function render(props: DialogMachineProps = {}, options: SceneOptions = {}) {
  return mountMachine<DialogSchema, Api>({
    machine,
    connect,
    html: markup(options),
    id: options.id ?? "d1",
    props,
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
      put("close", api.getCloseTriggerProps());
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

/** Opens the way a user does, from a focused trigger, and lets the trap settle. */
async function open(harness: Harness): Promise<void> {
  const trigger = slot(harness, "trigger");
  trigger.focus();
  trigger.click();
  await frames();
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

function pointer(type: string): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0 });
}

function press(node: EventTarget): void {
  node.dispatchEvent(pointer("pointerdown"));
  node.dispatchEvent(pointer("pointerup"));
}

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const pressEscape = (): KeyboardEvent => key(document, { key: "Escape" });
const tab = (shiftKey = false): KeyboardEvent =>
  key(document.activeElement ?? document, { key: "Tab", shiftKey });

const extra: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of extra.splice(0, extra.length)) dispose();
  unmountAll();
  const stack = getLayerStack(document);
  for (const layer of [...stack.layers()]) stack.remove(layer.id);
});

describe("dialog — opening", () => {
  it("takes the page away from everything that is not the surface", async () => {
    const harness = render();
    await open(harness);

    expect(harness.part("content").dataset.state).toBe("open");
    expect(harness.part("backdrop").dataset.state).toBe("open");
    expect(isScrollLocked(document)).toBe(true);
    expect(slot(harness, "outside").hasAttribute("inert")).toBe(true);
    expect(slot(harness, "outside").getAttribute("aria-hidden")).toBe("true");
  });

  /**
   * The regression test for the kept list. `inert` swallows the pointerdown that
   * dismisses, so a backdrop marked with the rest of the page makes outside-click
   * silently stop working — and the positioner is the surface's own parent, so
   * marking it would take the dialog down with the page.
   */
  it("keeps the backdrop and the positioner out of the inert page", async () => {
    const harness = render();
    await open(harness);

    expect(harness.part("backdrop").hasAttribute("inert")).toBe(false);
    expect(harness.part("positioner").hasAttribute("inert")).toBe(false);
    expect(harness.part("content").hasAttribute("inert")).toBe(false);

    press(harness.part("backdrop"));

    expect(harness.api().open).toBe(false);
  });

  it("leaves the page alone when it is not modal", async () => {
    const harness = render({ modal: false });
    await open(harness);

    expect(isScrollLocked(document)).toBe(false);
    expect(slot(harness, "outside").hasAttribute("inert")).toBe(false);
    expect(harness.part("content").hasAttribute("aria-modal")).toBe(false);
  });
});

describe("dialog — the direction carried across the portal", () => {
  /** The surface is mounted in `body`, so only an explicit `dir` can reach it. */
  function inRtlPage(): void {
    const root = document.documentElement;
    const before = root.getAttribute("dir");
    root.setAttribute("dir", "rtl");
    extra.push(() => {
      if (before === null) root.removeAttribute("dir");
      else root.setAttribute("dir", before);
    });
  }

  /** The page stays LTR, so only the trigger can be the source of the `rtl`. */
  it("reads the trigger before the page", async () => {
    const harness = render({}, { id: "rtl-order" });
    slot(harness, "trigger").setAttribute("dir", "rtl");
    await open(harness);

    expect(harness.part("content").getAttribute("dir")).toBe("rtl");
  });

  /**
   * A dialog driven from a store has no trigger at all — `dialog.dom.ts` says so
   * in as many words, and the composed layer makes the slot optional for exactly
   * that shape. The trigger is the only node `trackSurfaceDir` reads, and
   * resolving against a missing anchor answers `"ltr"` flat (`dom/text-dir.ts`),
   * which stamps onto the surface the one direction the page did not ask for.
   */
  it("falls back to the page when there is no trigger to read", async () => {
    inRtlPage();
    const harness = render({}, { id: "rtl-store", trigger: false });
    // This harness does not portal, so the surface sits inside the RTL page and
    // would inherit `rtl` on its own: a fallback that read the surface, or the
    // positioner, would pass for the wrong reason. Only one that climbs to the
    // document answers `rtl` through an LTR parent.
    slot(harness, "positioner").setAttribute("dir", "ltr");
    harness.api().setOpen(true);
    await frames();

    expect(harness.part("content").getAttribute("dir")).toBe("rtl");
  });
});

describe("dialog — focus", () => {
  it("lands on the first tabbable, and Tab loops in both directions", async () => {
    const harness = render();
    await open(harness);
    const name = slot(harness, "name");
    const close = slot(harness, "close");

    expect(document.activeElement).toBe(name);

    close.focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(name);

    expect(tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("honours initialFocus over the first tabbable", async () => {
    const harness = render({ initialFocus: () => harness.host.querySelector("[data-slot=close]") });
    await open(harness);

    expect(document.activeElement).toBe(slot(harness, "close"));
  });

  it("holds the surface itself when nothing inside it can take focus", async () => {
    const harness = render({}, { tabbables: false });
    await open(harness);

    expect(document.activeElement).toBe(harness.part("content"));
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(harness.part("content"));
  });

  it("gives the focus back to the trigger it came from", async () => {
    const harness = render();
    const trigger = slot(harness, "trigger");
    await open(harness);

    slot(harness, "close").click();

    expect(harness.api().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  /**
   * The confirm/prompt queue of spec §9.4: the dialog outlives the control that
   * opened it. `refs.finalFocusEl` is captured on the way out of `closed`, before
   * a single effect is installed, which is why there is still something to return
   * to once the trigger has gone.
   */
  it("gives it back to whatever had it, even when the trigger was unmounted meanwhile", async () => {
    const harness = render();
    const elsewhere = slot(harness, "outside");
    elsewhere.focus();

    harness.api().setOpen(true);
    await frames();
    slot(harness, "trigger").remove();

    expect(harness.service.refs.get("finalFocusEl")).toBe(elsewhere);

    harness.api().setOpen(false);
    await frames();

    expect(document.activeElement).toBe(elsewhere);
  });

  it("restores nothing, and throws nothing, when what it remembered has left too", async () => {
    const harness = render();
    const elsewhere = slot(harness, "outside");
    elsewhere.focus();

    harness.api().setOpen(true);
    await frames();
    elsewhere.remove();

    expect(() => harness.api().setOpen(false)).not.toThrow();
    expect(document.activeElement).not.toBe(elsewhere);
  });

  it("lets finalFocus overrule what was remembered", async () => {
    const harness = render({ finalFocus: () => harness.host.querySelector("[data-slot=outside]") });
    await open(harness);

    harness.api().setOpen(false);

    expect(document.activeElement).toBe(slot(harness, "outside"));
  });

  /**
   * The reason the effect order in `open` is a contract rather than a detail. The
   * interpreter tears down in reverse, so `hideOutside` has to be installed *after*
   * the trap in order to be removed *before* it — a `focus()` on a node that is
   * still `inert` is silently refused by the browser and the focus is simply lost.
   */
  it("gives the page back before it gives the focus back", async () => {
    const harness = render();
    const trigger = slot(harness, "trigger");
    await open(harness);

    let inertAtFocus: boolean | undefined;
    trigger.addEventListener(
      "focus",
      () => {
        inertAtFocus = trigger.closest("[inert]") !== null;
      },
      { once: true },
    );

    slot(harness, "close").click();

    expect(document.activeElement).toBe(trigger);
    expect(inertAtFocus).toBe(false);
  });

  /**
   * Spec §9.4: the queue swaps one question for the next without closing, and the
   * new question has to be given the focus the way the first one was.
   */
  it("replays the initial focus when the content changes under it", async () => {
    const harness = render();
    await open(harness);
    expect(document.activeElement).toBe(slot(harness, "name"));

    const previous = slot(harness, "name");
    const next = document.createElement("input");
    next.dataset.slot = "name";
    previous.replaceWith(next);

    harness.api().focusInitial();

    expect(document.activeElement).toBe(next);
    expect(harness.api().open).toBe(true);
  });
});

/**
 * The surface's three buttons post no `data-focus-visible` of their own, so their
 * ring reads `html[data-snav-input]` instead — CDC §4.4, and the same channel
 * `components/_focus-ring.scss` uses for the overlay. Nothing else on a page whose
 * only sui component is a dialog posts that attribute, so the sheet's rule could
 * never match and every ring on the surface fell back to a browser heuristic. The
 * machine holds the tracker; it subscribes to nothing, because the attribute being
 * on the page is the whole job.
 */
describe("dialog — the modality its ring reads", () => {
  it("puts the page modality within reach for as long as it is mounted", () => {
    render();

    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(true);
  });

  it("gives it back with the last subscriber, rather than leaving it behind", () => {
    const harness = render();

    harness.service.stop();

    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);
  });
});

describe("dialog — dismissing", () => {
  it("closes on Escape, and reports why", async () => {
    const onDismiss = vi.fn();
    const harness = render({ onDismiss });
    await open(harness);

    pressEscape();

    expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });
    expect(harness.api().open).toBe(false);
  });

  it("holds Escape when the consumer said so", async () => {
    const harness = render({ closeOnEscape: false });
    await open(harness);

    pressEscape();

    expect(harness.api().open).toBe(true);
  });

  /**
   * The pile decides, not the propagation. The reference app's own dialog called
   * `stopPropagation` in capture on `window`, which is correct for exactly one
   * open surface and wrong for every nesting.
   */
  it("gives Escape to the top layer only", async () => {
    const harness = render();
    await open(harness);

    const popover = document.createElement("div");
    document.body.append(popover);
    const onPopoverDismiss = vi.fn();
    extra.push(
      trackDismissableLayer(popover, {
        id: "popover-1",
        type: "popover",
        parentId: "dialog:d1:content",
        onDismiss: onPopoverDismiss,
      }),
      () => popover.remove(),
    );

    pressEscape();

    expect(onPopoverDismiss).toHaveBeenCalledWith("escape");
    expect(harness.api().open).toBe(true);
  });

  /**
   * A non-modal dialog still closes when the focus walks out of it — that has not
   * changed and is not what was wrong. What was wrong is the reason it gave: focus
   * travelled on the pointer's channel, so a keyboard exit was reported as
   * `outside-pointer`, and a consumer branching on `reason` was told a lie about an
   * interaction that never happened. A modal one never meets this, which is why it
   * went unseen: it traps the focus.
   */
  it("closes a non-modal surface when focus leaves, and now says why truthfully", async () => {
    const onDismiss = vi.fn();
    const harness = render({ modal: false, onDismiss });
    await open(harness);

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    extra.push(() => elsewhere.remove());
    elsewhere.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(onDismiss).toHaveBeenCalledWith({ reason: "focus-outside" });
    expect(harness.api().open).toBe(false);
  });

  it("holds that exit too when the consumer closed the outside lock", async () => {
    const harness = render({ modal: false, closeOnInteractOutside: false });
    await open(harness);

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    extra.push(() => elsewhere.remove());
    elsewhere.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(harness.api().open).toBe(true);
  });

  it("does not close and reopen when the trigger is pressed", async () => {
    const harness = render();
    const trigger = slot(harness, "trigger");
    await open(harness);

    press(trigger);
    trigger.click();

    // Without the trigger in the layer's exclusions this dismisses on pointerdown
    // and reopens on the click behind it — a flicker, and a lost close.
    expect(harness.api().open).toBe(true);
  });

  it("treats a portalled widget named as persistent as part of the surface", async () => {
    const widget = document.createElement("div");
    widget.innerHTML = `<button id="widget-button">Suggestion</button>`;
    document.body.append(widget);
    extra.push(() => widget.remove());

    const harness = render({ persistentElements: () => [widget] });
    await open(harness);

    expect(widget.hasAttribute("inert")).toBe(false);

    press(widget.querySelector("#widget-button") as HTMLElement);

    expect(harness.api().open).toBe(true);
  });

  it("keeps a persistent widget live inside its own portal container, and the surface too (R65)", async () => {
    const portal = document.createElement("div");
    portal.innerHTML = `<div><button id="widget-button">Suggestion</button></div>`;
    document.body.append(portal);
    extra.push(() => portal.remove());
    const widget = portal.querySelector("#widget-button") as HTMLElement;

    const harness = render({ persistentElements: () => [widget] });
    await open(harness);

    expect(widget.closest("[inert]")).toBeNull();
    expect(widget.closest("[aria-hidden]")).toBeNull();
    expect(slot(harness, "content").closest("[inert]")).toBeNull();
    expect(document.head.hasAttribute("inert")).toBe(false);
    expect(slot(harness, "outside").hasAttribute("inert")).toBe(true);
  });

  it("leaves Enter in a field alone — that is the consumer's submit", async () => {
    const harness = render();
    await open(harness);
    const name = slot(harness, "name");
    name.focus();

    const event = key(name, { key: "Enter" });

    expect(event.defaultPrevented).toBe(false);
    expect(harness.api().open).toBe(true);
  });
});

describe("dialog — nesting", () => {
  it("counts the locks and restores the page exactly once, at the end", async () => {
    const outer = render({}, { id: "outer" });

    // The inner dialog is nested in the DOM, not merely declared a child layer.
    // `parentId` chains the *layers*, and a layer is the surface — a trigger
    // sitting outside the outer surface is an outside interaction like any other
    // and dismisses it, so a sibling mount would be measuring that dismissal
    // rather than the lock count.
    const inner = render({ parentId: "dialog:outer:content" }, { id: "inner" });
    slot(outer, "content").append(inner.host);

    // Captured before anything opens: this is the value the page must be handed
    // back at the end, and the outer dialog has not overwritten it yet.
    const sibling = slot(outer, "outside");
    const hiddenBeforeAnyDialog = sibling.getAttribute("aria-hidden");

    await open(outer);
    await open(inner);

    expect(isScrollLocked(document)).toBe(true);

    inner.api().setOpen(false);
    await frames();

    // The inner one closing must not hand the page back to the outer one still open.
    expect(isScrollLocked(document)).toBe(true);
    expect(sibling.getAttribute("aria-hidden")).toBe("true");
    expect(sibling.hasAttribute("inert")).toBe(true);

    outer.api().setOpen(false);
    await frames();

    expect(isScrollLocked(document)).toBe(false);
    expect(sibling.getAttribute("aria-hidden")).toBe(hiddenBeforeAnyDialog);
    expect(sibling.hasAttribute("inert")).toBe(false);
  });
});

describe("dialog — the gamepad", () => {
  function withPad(props: DialogMachineProps = {}): {
    harness: Harness;
    bus: IntentBus;
    seen: string[];
  } {
    const bus = createIntentBus();
    const seen: string[] = [];
    // A scope underneath the dialog's, standing in for the page behind it.
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    return { harness: render({ ...props, intents: bus }), bus, seen };
  }

  it("swallows every direction, so nothing under the dialog moves", async () => {
    const { harness, bus, seen } = withPad();
    await open(harness);

    const dispatch = bus.dispatch({ intent: "moveDown", source: "gamepad" });

    expect(dispatch.consumed).toBe(true);
    expect(seen).toEqual([]);
    expect(harness.api().open).toBe(true);
  });

  /**
   * The other half of the same rule, and the one the trap used to get wrong: the
   * spatial engine pushes itself at setup, so it sits *under* every component
   * scope — and a dialog that swallowed the directions before reaching it made
   * its own interior unreachable to a d-pad. It confines itself to the surface
   * through `data-snav-trap`, so asking it is asking about the inside.
   */
  it("still lets the last-resort engine move inside it, while the page stays silenced", async () => {
    const bus = createIntentBus();
    const seen: string[] = [];
    const inside: string[] = [];
    extra.push(
      bus.pushScope(
        (event) => {
          inside.push(event.intent);
          return true;
        },
        { base: true },
      ),
    );
    extra.push(
      bus.pushScope((event) => {
        seen.push(event.intent);
        return false;
      }),
    );
    const harness = render({ intents: bus });
    await open(harness);

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(inside).toEqual(["moveDown"]);
    expect(seen).toEqual([]);
    expect(harness.api().open).toBe(true);
  });

  it("closes the top layer on B", async () => {
    const { harness, bus } = withPad();
    const onDismiss = vi.fn();
    harness.setProps({ onDismiss });
    await open(harness);

    expect(bus.dispatch({ intent: "back", source: "gamepad" }).consumed).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    expect(harness.api().open).toBe(false);
  });

  it("does not answer B when Escape is locked — one lock, two buttons", async () => {
    const { harness, bus, seen } = withPad({ closeOnEscape: false });
    await open(harness);

    bus.dispatch({ intent: "back", source: "gamepad" });

    expect(harness.api().open).toBe(true);
    // `back` escapes a trapped scope by construction, or a modal would be
    // impossible to leave — so the page underneath does see this one.
    expect(seen).toEqual(["back"]);
  });

  it("pops the scope when it closes", async () => {
    const { harness, bus, seen } = withPad();
    await open(harness);

    harness.api().setOpen(false);
    await frames();
    bus.dispatch({ intent: "moveDown", source: "gamepad" });

    expect(seen).toEqual(["moveDown"]);
  });
});

describe("dialog — the accessible name", () => {
  it("waits for a title to exist before pointing at one", async () => {
    const harness = render({ label: "Rename file" }, { title: false });
    await open(harness);
    const content = harness.part("content");

    expect(content.hasAttribute("aria-labelledby")).toBe(false);
    expect(content.getAttribute("aria-label")).toBe("Rename file");

    // What an adapter does when the consumer renders a title into an open dialog:
    // the element arrives already wearing its part attributes.
    const title = document.createElement("h2");
    for (const [name, value] of Object.entries(harness.api().getTitleProps())) {
      title.setAttribute(name, String(value));
    }
    title.textContent = "Rename file";
    content.prepend(title);
    await frames();

    expect(content.getAttribute("aria-labelledby")).toBe("dialog:d1:title");
    // Never both: one name, and it comes from the title now that there is one.
    expect(content.hasAttribute("aria-label")).toBe(false);
  });

  it("points at the description part only once it is mounted", async () => {
    const harness = render({ describedBy: "shortcut-hint" });
    await open(harness);

    expect(harness.part("content").getAttribute("aria-describedby")).toBe(
      "dialog:d1:description shortcut-hint",
    );
  });
});
