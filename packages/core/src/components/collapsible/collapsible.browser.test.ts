/**
 * `collapsible` against a real engine, with no framework in the room.
 *
 * The half that only a real layout can answer is the measurement: `syncSize`
 * reads a box and posts two custom properties the sheet's keyframes travel
 * between, and no stub could tell a fresh reading from a stale one. What is
 * proved here is that the machine writes them, that it rewrites them at the
 * *other* boundary — a closing panel is measured again, not remembered — and
 * that it declines to measure a `hidden` node, whose rect is zero.
 *
 * Two things are deliberately not here. **Enter and Space** are the native
 * behaviour of the `<button>`, and a synthetic `KeyboardEvent` does not carry a
 * default action: what is assertable is that `connect` installs no key handler
 * of its own, which is the whole claim. **The presence exit and the unmount**
 * belong to an adapter — this harness paints every part always and never adds
 * one, which is also what keeps it out of the ordering trap in the head of
 * `reactivity.ts` (the reference root runs its trackers *before* its listeners,
 * so a part revealed during a paint would be measured a pass too early). Those
 * live in `@standarui/react`.
 */

import { setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartIdOverrides } from "../../machine/scope";
import { type DomPropTypes, type MachineHarness, mountMachine, unmountAll } from "../harness";
import { connect } from "./collapsible.connect";
import { machine } from "./collapsible.machine";
import type {
  CollapsibleApi,
  CollapsibleMachineProps,
  CollapsibleSchema,
} from "./collapsible.types";

type Api = CollapsibleApi<DomPropTypes>;
type Harness = MachineHarness<CollapsibleSchema, Api>;

/** A block of known height, so a growth is arithmetic rather than a font. */
const BODY = `<p data-slot="body" style="margin:0;block-size:40px"></p>`;

const HTML = `
  <div data-slot="root">
    <button data-slot="trigger"><span data-slot="indicator"></span></button>
    <div data-slot="content">${BODY}</div>
  </div>
`;

function scene(props: CollapsibleMachineProps = {}, ids?: PartIdOverrides, id = "c1"): Harness {
  return mountMachine<CollapsibleSchema, Api>({
    machine,
    connect,
    id,
    ids,
    props,
    html: HTML,
    // Structural lookup rather than `data-part`: the first paint runs before any
    // attribute exists, which is exactly the pass a server render produces.
    paint(host, api, apply) {
      const at = (slot: string): HTMLElement => {
        const node = host.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
        if (node === null) throw new Error(`no slot "${slot}" in the harness markup`);
        return node;
      };
      apply(at("root"), api.getRootProps());
      apply(at("trigger"), api.getTriggerProps());
      apply(at("indicator"), api.getIndicatorProps());
      apply(at("content"), api.getContentProps());
    },
  });
}

const slot = (harness: Harness, name: string): HTMLElement => {
  const node = harness.host.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}"`);
  return node;
};

const measured = (node: HTMLElement, axis: "height" | "width"): string =>
  node.style.getPropertyValue(`--sui-collapsible-${axis}`);

const pixels = (value: string): number => Number.parseFloat(value);

afterEach(() => {
  unmountAll();
});

describe("collapsible — service to DOM", () => {
  it("paints the four parts, the ARIA state and the stylable state", () => {
    const harness = scene();
    const root = slot(harness, "root");
    const trigger = slot(harness, "trigger");
    const indicator = slot(harness, "indicator");
    const content = slot(harness, "content");

    expect(root.getAttribute("data-scope")).toBe("collapsible");
    expect(root.getAttribute("data-part")).toBe("collapsible:root");
    expect(root.getAttribute("id")).toBe("collapsible:c1:root");
    expect(root.getAttribute("data-state")).toBe("closed");

    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("data-state")).toBe("closed");

    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(indicator.getAttribute("data-state")).toBe("closed");
    expect(indicator.hasAttribute("tabindex")).toBe(false);

    expect(content.getAttribute("id")).toBe("collapsible:c1:content");
    expect(content.getAttribute("data-state")).toBe("closed");
  });

  it("moves all four parts on a real click, and reports the change once", () => {
    const onOpenChange = vi.fn();
    const harness = scene({ onOpenChange });
    const trigger = slot(harness, "trigger");

    trigger.click();

    expect(onOpenChange.mock.calls).toEqual([[{ open: true }]]);
    for (const name of ["root", "trigger", "indicator", "content"]) {
      expect(slot(harness, name).getAttribute("data-state")).toBe("open");
    }
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    trigger.click();
    expect(slot(harness, "root").getAttribute("data-state")).toBe("closed");
    expect(onOpenChange).toHaveBeenLastCalledWith({ open: false });
  });

  it("names the content from aria-controls only while it is open, and the IDREF resolves", () => {
    const harness = scene();
    const trigger = slot(harness, "trigger");

    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    trigger.click();

    const id = trigger.getAttribute("aria-controls");
    expect(id).toBe("collapsible:c1:content");
    expect(document.getElementById(id ?? "")).toBe(slot(harness, "content"));
  });

  it("leaves Enter and Space to the platform — it installs no key handler at all", () => {
    const harness = scene();

    expect(harness.api().getTriggerProps().onKeyDown).toBeUndefined();
    expect(harness.api().getTriggerProps().onKeyUp).toBeUndefined();
    // The claim only holds because the element really is a button.
    expect(slot(harness, "trigger").localName).toBe("button");
  });

  it("posts the measured height and width onto the content, in pixels", () => {
    const harness = scene();
    const content = slot(harness, "content");

    slot(harness, "trigger").click();

    expect(measured(content, "height")).toMatch(/^[\d.]+px$/);
    expect(measured(content, "width")).toMatch(/^[\d.]+px$/);
    expect(pixels(measured(content, "height"))).toBeGreaterThanOrEqual(40);
    expect(pixels(measured(content, "width"))).toBeGreaterThan(0);
  });

  it("measures again at the closing boundary rather than remembering the opening one", () => {
    const harness = scene({ defaultOpen: true });
    const content = slot(harness, "content");
    const opened = pixels(measured(content, "height"));

    // What a streamed answer does while its disclosure is open.
    const grown = document.createElement("p");
    grown.style.cssText = "margin:0;block-size:60px";
    content.append(grown);

    slot(harness, "trigger").click();

    expect(slot(harness, "content").getAttribute("data-state")).toBe("closed");
    expect(pixels(measured(content, "height"))).toBeCloseTo(opened + 60, 0);
  });

  it("takes the measurement at rest — an animation on the box cannot freeze it", () => {
    const style = document.createElement("style");
    // The hazard the suspension exists for, made unambiguous: an animation that
    // pins the box to zero for five seconds. Unsuspended, `syncSize` would post a
    // 0px height and the sheet would travel from nothing to nothing.
    style.textContent = `
      [data-part~="collapsible:content"] { animation: sui-collapsible-probe 5s linear both; }
      @keyframes sui-collapsible-probe { from { block-size: 0; } to { block-size: 0; } }
    `;
    document.head.append(style);

    try {
      const harness = scene({ defaultOpen: true });
      const content = slot(harness, "content");

      expect(content.getBoundingClientRect().height).toBe(0);
      expect(pixels(measured(content, "height"))).toBeGreaterThanOrEqual(40);
      // Restored, not left pinned: the sheet owns the animation again.
      expect(content.style.animationName).toBe("");
      expect(content.style.transitionDuration).toBe("");
    } finally {
      style.remove();
    }
  });

  it("declines to measure a hidden node — keepMounted closed has a zero rect", () => {
    const harness = scene({ keepMounted: true });
    const content = slot(harness, "content");

    expect(content.hasAttribute("hidden")).toBe(true);
    expect(measured(content, "height")).toBe("");
    expect(measured(content, "width")).toBe("");
  });

  it("takes `hidden` off an open keepMounted content, and never poses it without keepMounted", () => {
    const kept = scene({ keepMounted: true, defaultOpen: true });
    expect(slot(kept, "content").hasAttribute("hidden")).toBe(false);

    const unmounting = scene({}, undefined, "c2");
    expect(slot(unmounting, "content").hasAttribute("hidden")).toBe(false);
  });

  it("holds `data-immediate` on a defaultOpen first paint and drops it on the first toggle", () => {
    const harness = scene({ defaultOpen: true });
    const content = slot(harness, "content");

    expect(content.getAttribute("data-immediate")).toBe("");

    slot(harness, "trigger").click();

    expect(content.hasAttribute("data-immediate")).toBe(false);

    slot(harness, "trigger").click();
    expect(content.hasAttribute("data-immediate")).toBe(false);
  });

  it("uses the native disabled attribute, and the trigger goes nowhere", () => {
    const onOpenChange = vi.fn();
    const harness = scene({ disabled: true, onOpenChange });
    const trigger = slot(harness, "trigger");

    expect(trigger.hasAttribute("disabled")).toBe(true);
    expect(trigger.hasAttribute("aria-disabled")).toBe(false);
    expect(trigger.getAttribute("data-disabled")).toBe("");

    trigger.click();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("still answers the imperative api while disabled — the trigger is disabled, not the API", () => {
    const harness = scene({ disabled: true });

    harness.api().setOpen(true);

    expect(slot(harness, "root").getAttribute("data-state")).toBe("open");
    expect(harness.api().open).toBe(true);
  });

  it("shows the ring for a keyboard modality and not for a pointer one", () => {
    const harness = scene();
    const trigger = slot(harness, "trigger");

    setInputModality(document, "pointer");
    trigger.focus();
    expect(trigger.hasAttribute("data-focus-visible")).toBe(false);
    expect(trigger.getAttribute("data-focus-source")).toBe("pointer");

    trigger.blur();
    expect(trigger.hasAttribute("data-focus-source")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    trigger.focus();
    expect(trigger.getAttribute("data-focus-visible")).toBe("");
    expect(trigger.getAttribute("data-focus-source")).toBe("keyboard");

    trigger.blur();
    expect(trigger.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("carries dir onto the root and the content, which is what the sheet mirrors on", () => {
    const harness = scene({ dir: "rtl" });

    expect(slot(harness, "root").getAttribute("dir")).toBe("rtl");
    expect(slot(harness, "content").getAttribute("dir")).toBe("rtl");
  });

  it("lets a consumer override a part id, and aria-controls follows it", () => {
    const harness = scene({ defaultOpen: true }, { content: "custom-content" });

    expect(slot(harness, "content").getAttribute("id")).toBe("custom-content");
    expect(slot(harness, "trigger").getAttribute("aria-controls")).toBe("custom-content");
  });
});
