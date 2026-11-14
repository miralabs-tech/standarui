/**
 * The node half of `breadcrumb`: no document, no framework — the shape a server
 * render has. Events, the guard and the focus walk need the machine running,
 * and `start()` resolves a document (`trackModality`), so they live in
 * `breadcrumb.browser.test.ts` — the same split `tabs` documents.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { parts } from "./breadcrumb.anatomy";
import { connect } from "./breadcrumb.connect";
import { machine } from "./breadcrumb.machine";
import type { BreadcrumbApi, BreadcrumbMachineProps, BreadcrumbSchema } from "./breadcrumb.types";

type Api = BreadcrumbApi<PlainPropTypes>;

const build = (props: BreadcrumbMachineProps = {}) =>
  connectWithoutDom<BreadcrumbSchema, Api>({ machine, connect, id: "b1", props });

describe("breadcrumb without a DOM", () => {
  it("connects on a server, collapsed and named", () => {
    const harness = build();
    const api = harness.api();
    const root = api.getRootProps();
    const list = api.getListProps();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.service.state.get()).toBe("idle");
    expect(api.expanded).toBe(false);
    expect(root["data-scope"]).toBe("breadcrumb");
    expect(root["data-part"]).toBe("breadcrumb:root");
    expect(root["aria-label"]).toBe("Breadcrumb");
    expect(root["data-state"]).toBe("collapsed");
    expect(list["data-state"]).toBe("collapsed");
    expect(list.id).toBe("breadcrumb:b1:list");
    // The pointer-reveal focus target: reachable by `focus()`, never by Tab.
    expect(list.tabIndex).toBe(-1);
  });

  it("lets the consumer rename the landmark and the button", () => {
    const api = build({ label: "Fil d'Ariane", ellipsisLabel: "Afficher le chemin" }).api();

    expect(api.getRootProps()["aria-label"]).toBe("Fil d'Ariane");
    expect(api.getEllipsisTriggerProps()["aria-label"]).toBe("Afficher le chemin");
  });

  it("hides a collapsed item while the trail is folded, and only then", () => {
    const folded = build().api();
    const marked = folded.getItemProps({ collapsed: true });

    expect(marked.hidden).toBe(true);
    expect(marked["data-collapsed"]).toBe("");
    expect(marked["data-state"]).toBe("collapsed");

    const revealed = build({ defaultExpanded: true }).api().getItemProps({ collapsed: true });
    expect(revealed.hidden).toBeUndefined();
    // Kept once revealed: the reveal fade and the rescue both key on it.
    expect(revealed["data-collapsed"]).toBe("");
    expect(revealed["data-state"]).toBe("expanded");
  });

  it("gives an unmarked item no disclosure attributes at all", () => {
    const item = build().api().getItemProps();

    expect(item.hidden).toBeUndefined();
    expect(item["data-collapsed"]).toBeUndefined();
    expect(item["data-state"]).toBeUndefined();
  });

  it("marks the current page and nothing else", () => {
    const api = build().api();

    const current = api.getLinkProps({ current: true });
    expect(current["aria-current"]).toBe("page");
    expect(current["data-current"]).toBe("");

    const plain = api.getLinkProps();
    expect(plain["aria-current"]).toBeUndefined();
    expect(plain["data-current"]).toBeUndefined();
  });

  it("wires the disclosure pair: button to list, state on both", () => {
    const folded = build().api();
    const trigger = folded.getEllipsisTriggerProps();

    expect(trigger.type).toBe("button");
    expect(trigger.id).toBe("breadcrumb:b1:ellipsis-trigger");
    expect(trigger["aria-expanded"]).toBe("false");
    expect(trigger["aria-controls"]).toBe(folded.getListProps().id);
    expect(trigger["aria-label"]).toBe("Show hidden items");
    expect(folded.getEllipsisProps().hidden).toBeUndefined();

    const open = build({ defaultExpanded: true }).api();
    expect(open.getEllipsisTriggerProps()["aria-expanded"]).toBe("true");
    // The host `li` leaves layout and the accessibility tree with the reveal.
    expect(open.getEllipsisProps().hidden).toBe(true);
    expect(open.getEllipsisProps()["data-state"]).toBe("expanded");
  });

  it("renders a controlled value from the prop, and re-renders when a new one arrives", () => {
    const seen: boolean[] = [];
    const harness = build({
      expanded: false,
      onExpandedChange: ({ expanded }) => seen.push(expanded),
    });

    expect(harness.api().expanded).toBe(false);
    // Merely rendering a controlled value is not a change.
    expect(seen).toEqual([]);

    harness.setProps({ expanded: true });
    expect(harness.api().expanded).toBe(true);
    expect(harness.api().getRootProps()["data-state"]).toBe("expanded");
    expect(seen).toEqual([]);
  });

  it("queues an activation that lands before it starts, rather than losing it", () => {
    const harness = build();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    harness.api().expand();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.api().expanded).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("carries dir onto the root and the list", () => {
    const api = build({ dir: "rtl" }).api();

    expect(api.getRootProps().dir).toBe("rtl");
    expect(api.getListProps().dir).toBe("rtl");
  });

  it("publishes the selectors the styles read, and no separator part", () => {
    expect(parts.root.selector).toBe('[data-part~="breadcrumb:root"]');
    expect(parts.list.selector).toBe('[data-part~="breadcrumb:list"]');
    expect(parts.item.selector).toBe('[data-part~="breadcrumb:item"]');
    expect(parts.link.selector).toBe('[data-part~="breadcrumb:link"]');
    expect(parts.ellipsis.selector).toBe('[data-part~="breadcrumb:ellipsis"]');
    expect(parts.ellipsisTrigger.selector).toBe('[data-part~="breadcrumb:ellipsis-trigger"]');
    // D-BC-2: the chevron is the sheet's, drawn on adjacency — not a part, not
    // markup, not a text glyph.
    expect("separator" in parts).toBe(false);
  });
});
