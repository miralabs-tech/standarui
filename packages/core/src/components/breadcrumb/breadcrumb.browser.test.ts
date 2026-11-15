/**
 * `breadcrumb` against a real engine, with no framework in the room.
 *
 * Two things here cannot be faked and are the reason this machine exists at all:
 * a `hidden` level is out of the tab order because the engine says so, and the
 * ellipsis button disappears under the very focus that activated it — so where
 * the focus lands afterwards is only observable against a real `activeElement`.
 *
 * The harness paints from a **tracker rather than from a listener**, which is not
 * a detail. The reference reactivity runs its trackers first and notifies its
 * listeners after (see the head of `reactivity.ts`), while a real adapter updates
 * the DOM *before* it runs the machine's watchers — that is what React's layout
 * effect buys and what the vanilla store reproduces deliberately. Painting from a
 * listener here would have the machine reach for a revealed link while it is
 * still `hidden`, and the test would be reporting on the harness's ordering
 * instead of on the component's.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createPropsWriter, type DomPropTypes, domNormalizer } from "../../dom/apply";
import { createService } from "../../machine/service";
import type { Service } from "../../machine/types";
import { getTabbables, setInputModality } from "../../nav";
import { createReactivityRoot } from "../../reactivity";
import { connect } from "./breadcrumb.connect";
import { machine } from "./breadcrumb.machine";
import type { BreadcrumbApi, BreadcrumbMachineProps, BreadcrumbSchema } from "./breadcrumb.types";

type Api = BreadcrumbApi<DomPropTypes>;

interface Crumb {
  readonly label: string;
  readonly collapsed?: boolean;
  readonly current?: boolean;
}

/** Home / … / Library / Photos / 2026 / Iceland / Fjords — three folded levels. */
const TRAIL: readonly Crumb[] = [
  { label: "Home" },
  { label: "Library", collapsed: true },
  { label: "Photos", collapsed: true },
  { label: "2026", collapsed: true },
  { label: "Iceland" },
  { label: "Fjords", current: true },
];

interface Scene {
  readonly root: HTMLElement;
  readonly list: HTMLElement;
  readonly ellipsis: HTMLElement;
  readonly trigger: HTMLButtonElement;
  /** A focusable of the page's own, outside the trail. */
  readonly outside: HTMLButtonElement;
  readonly service: Service<BreadcrumbSchema>;
  api(): Api;
  item(index: number): HTMLElement;
  link(index: number): HTMLAnchorElement;
  setProps(next: BreadcrumbMachineProps): void;
  destroy(): void;
}

const scenes: Scene[] = [];

function at<T>(nodes: readonly T[], index: number): T {
  const node = nodes[index];
  if (node === undefined) throw new Error(`no node at index ${index}`);
  return node;
}

function render(initial: BreadcrumbMachineProps = {}): Scene {
  let props: BreadcrumbMachineProps = { ...initial };

  const host = document.createElement("div");
  const root = document.createElement("nav");
  const list = document.createElement("ol");
  const ellipsis = document.createElement("li");
  const trigger = document.createElement("button");
  const outside = document.createElement("button");

  ellipsis.append(trigger);
  outside.type = "button";
  outside.textContent = "Elsewhere";
  root.append(list);
  host.append(root, outside);

  const items: HTMLElement[] = [];
  const links: HTMLAnchorElement[] = [];

  for (const [index, crumb] of TRAIL.entries()) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${crumb.label.toLowerCase()}`;
    link.textContent = crumb.label;
    item.append(link);
    items.push(item);
    links.push(link);
    list.append(item);
    // The ellipsis stands where the folded run begins — after the first level.
    if (index === 0) list.append(ellipsis);
  }

  document.body.append(host);

  const writer = createPropsWriter();
  const reactivity = createReactivityRoot();

  const paint = (): void => {
    const api = connect(service, domNormalizer);
    writer.write(root, api.getRootProps());
    writer.write(list, api.getListProps());
    for (const [index, crumb] of TRAIL.entries()) {
      writer.write(at(items, index), api.getItemProps({ collapsed: crumb.collapsed }));
      writer.write(at(links, index), api.getLinkProps({ current: crumb.current }));
    }
    writer.write(ellipsis, api.getEllipsisProps());
    writer.write(trigger, api.getEllipsisTriggerProps());
  };

  // Registered before the service, so it lands ahead of the machine's own watcher
  // in the tracker list — see the head of this file. `live` exists because a
  // tracker's dependencies are read the moment it is registered, and the service
  // does not exist yet at that point.
  let live = false;
  reactivity.adapter.track(() => (live ? [service.context.get("expanded")] : []), paint);

  const service = createService(machine, reactivity.adapter, {
    id: "b1",
    getRootNode: () => document,
    props: () => props,
  });
  live = true;

  paint();
  service.start();
  paint();

  const scene: Scene = {
    root,
    list,
    ellipsis,
    trigger,
    outside,
    service,
    api: (): Api => connect(service, domNormalizer),
    item: (index: number): HTMLElement => at(items, index),
    link: (index: number): HTMLAnchorElement => at(links, index),
    setProps(next: BreadcrumbMachineProps): void {
      props = { ...props, ...next };
      // The step a real adapter owes its machine: a prop arrives through a getter
      // the graph never observed.
      reactivity.flush();
      paint();
    },
    destroy(): void {
      // Detach first: removing a focused element fires blur, and a machine that
      // has already stopped would warn about an event it can no longer handle.
      host.remove();
      service.stop();
      reactivity.dispose();
      writer.destroy();
    },
  };
  scenes.push(scene);
  return scene;
}

afterEach(() => {
  for (const scene of scenes.splice(0, scenes.length)) scene.destroy();
});

describe("breadcrumb — service to DOM", () => {
  it("paints the landmark, the folded levels and the disclosure pair", () => {
    const scene = render();

    expect(scene.root.getAttribute("data-scope")).toBe("breadcrumb");
    expect(scene.root.getAttribute("data-part")).toBe("breadcrumb:root");
    expect(scene.root.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(scene.root.getAttribute("data-state")).toBe("collapsed");

    expect(scene.list.getAttribute("data-part")).toBe("breadcrumb:list");
    expect(scene.list.id).toBe("breadcrumb:b1:list");
    expect(scene.list.tabIndex).toBe(-1);

    expect(scene.item(0).hasAttribute("hidden")).toBe(false);
    expect(scene.item(0).hasAttribute("data-collapsed")).toBe(false);
    expect(scene.item(0).hasAttribute("data-state")).toBe(false);
    expect(scene.item(1).getAttribute("data-collapsed")).toBe("");
    expect(scene.item(1).hasAttribute("hidden")).toBe(true);

    expect(scene.link(5).getAttribute("aria-current")).toBe("page");
    expect(scene.link(5).getAttribute("data-current")).toBe("");
    expect(scene.link(0).hasAttribute("aria-current")).toBe(false);

    expect(scene.ellipsis.hasAttribute("hidden")).toBe(false);
    expect(scene.trigger.getAttribute("type")).toBe("button");
    expect(scene.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(scene.trigger.getAttribute("aria-label")).toBe("Show hidden items");
    // `aria-controls` names something that is really there — the failure mode a
    // disclosure has when the two ids are derived in two places.
    const controls = scene.trigger.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(controls)).toBe(scene.list);
  });

  it("keeps the folded levels out of the tab order, and the list out of it always", () => {
    const scene = render();

    // Identity, not deep equality: two DOM nodes compare structurally under
    // `toEqual`, which is both slow and capable of calling two different
    // elements equal.
    const folded = getTabbables(scene.root);
    expect(folded).toHaveLength(4);
    expect(folded[0]).toBe(scene.link(0));
    expect(folded[1]).toBe(scene.trigger);
    expect(folded[2]).toBe(scene.link(4));
    expect(folded[3]).toBe(scene.link(5));
    expect(folded).not.toContain(scene.list);

    scene.api().setExpanded(true);

    // Revealed levels join the order in document order; the list never does, and
    // the ellipsis button leaves with the reveal.
    const revealed = getTabbables(scene.root);
    expect(revealed).toHaveLength(6);
    expect(revealed[1]).toBe(scene.link(1));
    expect(revealed).not.toContain(scene.trigger);
    expect(revealed).not.toContain(scene.list);
  });

  it("reveals the run and lands the focus on its first level, under a keyboard", () => {
    const onExpandedChange = vi.fn();
    const scene = render({ onExpandedChange });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    scene.trigger.focus();
    scene.trigger.click();

    expect(onExpandedChange).toHaveBeenCalledTimes(1);
    expect(onExpandedChange).toHaveBeenCalledWith({ expanded: true });
    expect(scene.item(1).hasAttribute("hidden")).toBe(false);
    // Kept once revealed: the fade and the rescue both key on it.
    expect(scene.item(1).getAttribute("data-collapsed")).toBe("");
    expect(scene.item(1).getAttribute("data-state")).toBe("expanded");
    expect(scene.ellipsis.hasAttribute("hidden")).toBe(true);
    // The button it was on has just left the tree; the focus went somewhere on
    // purpose rather than falling to `body`.
    expect(document.activeElement).toBe(scene.link(1));
  });

  it("hands the focus to the list under a pointer, so no ring appears", () => {
    const scene = render();

    setInputModality(document, "pointer");
    scene.trigger.focus();
    scene.trigger.click();

    expect(document.activeElement).toBe(scene.list);
    // A programmatic `focus()` matches `:focus-visible` on all three engines, so
    // the parade is *which* element is focused: the list is styled with no ring.
    expect(
      scene.root.querySelectorAll('[data-part~="breadcrumb:link"]:focus-visible'),
    ).toHaveLength(0);
  });

  it("declines a second activation while the run is already open", () => {
    const onExpandedChange = vi.fn();
    const scene = render({ onExpandedChange });

    scene.trigger.click();
    scene.trigger.click();

    expect(onExpandedChange).toHaveBeenCalledTimes(1);
    expect(scene.api().expanded).toBe(true);
  });

  it("adds no key handling of its own — the native button is the whole keyboard", () => {
    const onExpandedChange = vi.fn();
    const scene = render({ onExpandedChange });

    scene.trigger.focus();
    scene.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    scene.trigger.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));

    // A real Enter reaches this machine as the button's own `click`, which is
    // also what an assistive technology sends — one path, never two.
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(scene.api().expanded).toBe(false);
  });

  it("rescues a focus that is about to be folded away", () => {
    const scene = render({ defaultExpanded: true });

    scene.link(2).focus();
    expect(document.activeElement).toBe(scene.link(2));

    scene.api().setExpanded(false);

    expect(scene.item(2).hasAttribute("hidden")).toBe(true);
    expect(scene.ellipsis.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(scene.trigger);
  });

  it("steals no focus that was never inside the folded run", () => {
    const scene = render({ defaultExpanded: true });

    scene.outside.focus();

    scene.api().setExpanded(false);
    expect(document.activeElement).toBe(scene.outside);

    // A programmatic expansion is nobody's activation: it owes no focus move.
    scene.api().setExpanded(true);
    expect(document.activeElement).toBe(scene.outside);
  });

  it("reports without writing while controlled, and follows the prop back down", () => {
    const onExpandedChange = vi.fn();
    const scene = render({ expanded: false, onExpandedChange });

    scene.trigger.click();

    expect(onExpandedChange).toHaveBeenCalledWith({ expanded: true });
    expect(scene.item(1).hasAttribute("hidden")).toBe(true);
    expect(scene.trigger.getAttribute("aria-expanded")).toBe("false");

    scene.setProps({ expanded: true });

    expect(scene.item(1).hasAttribute("hidden")).toBe(false);
    expect(scene.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(scene.ellipsis.hasAttribute("hidden")).toBe(true);
  });

  it("carries dir onto the landmark and the list", () => {
    const scene = render({ dir: "rtl" });

    expect(scene.root.getAttribute("dir")).toBe("rtl");
    expect(scene.list.getAttribute("dir")).toBe("rtl");
  });
});
