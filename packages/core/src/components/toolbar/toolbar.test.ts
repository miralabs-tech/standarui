/**
 * The node half of `toolbar`: no document, no framework, the shape a server
 * render has.
 *
 * Two things are pinned here that only exist without a DOM. The tab stop is
 * *absent* before the first item sync — not `-1` — so a server-rendered bar keeps
 * the browser's natural tab order until hydration settles the stop. And the
 * cohabitation rule is a property of `connect` alone: whether the toolbar claims a
 * key is decided by the event, never by the collection, so it is decidable here.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./toolbar.connect";
import { machine } from "./toolbar.machine";
import type { ToolbarApi, ToolbarMachineProps, ToolbarSchema } from "./toolbar.types";

type Api = ToolbarApi<PlainPropTypes>;

const build = (props: ToolbarMachineProps = {}) =>
  connectWithoutDom<ToolbarSchema, Api>({ machine, connect, id: "t1", props });

interface FakeKey {
  readonly key: string;
  readonly defaultPrevented?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly target?: unknown;
}

/** Whether the toolbar claimed the key — `preventDefault` is the whole contract. */
function claims(api: Api, key: FakeKey): boolean {
  const preventDefault = vi.fn();
  const handler = api.getItemProps({ value: "a" }).onKeyDown as unknown as (
    event: KeyboardEvent,
  ) => void;

  handler({
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    preventDefault,
    ...key,
  } as unknown as KeyboardEvent);

  return preventDefault.mock.calls.length > 0;
}

/** A text field, duck-typed the way `isHTMLElement` reads one. */
const TEXT_FIELD = {
  nodeType: 1,
  nodeName: "INPUT",
  localName: "input",
  type: "text",
  isContentEditable: false,
  getAttribute: () => null,
};

describe("toolbar without a DOM", () => {
  it("connects on a server, where it can find none of its own items", () => {
    const harness = build({ label: "Formatting" });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.role).toBe("toolbar");
    expect(root["aria-label"]).toBe("Formatting");
    expect(root.id).toBe("toolbar:t1:root");
    expect(harness.api().focusedValue).toBeNull();
  });

  it("leaves the tab order alone until the items have been read", () => {
    // Not `-1` on everything: every native focusable in a server-rendered bar
    // would drop out of the tab order until hydration, and the progressive
    // answer is to say nothing at all.
    const api = build().api();

    expect(api.getItemProps({ value: "a" }).tabIndex).toBeUndefined();
    expect(api.getItemProps({ value: "b" }).tabIndex).toBeUndefined();
  });

  it("spells the orientation only when it is not the implicit one", () => {
    const horizontal = build().api().getRootProps();
    const vertical = build({ orientation: "vertical" }).api().getRootProps();

    expect(horizontal["aria-orientation"]).toBeUndefined();
    expect(horizontal["data-orientation"]).toBe("horizontal");
    expect(vertical["aria-orientation"]).toBe("vertical");
    expect(vertical["data-orientation"]).toBe("vertical");
  });

  it("declares one spatial zone and no wrap", () => {
    const root = build().api().getRootProps();

    expect(root["data-snav"]).toBe("container");
    // A spatial wrap at the edge would make the bar impossible to leave with a
    // d-pad; `loopFocus` is a keyboard politeness and stops at the keyboard.
    expect(root["data-snav-wrap"]).toBeUndefined();
  });

  it("rules across the bar, not along it", () => {
    const horizontal = build().api().getSeparatorProps();
    const vertical = build({ orientation: "vertical" }).api().getSeparatorProps();
    const forced = build().api().getSeparatorProps({ orientation: "horizontal" });

    expect(horizontal.role).toBe("separator");
    expect(horizontal["data-orientation"]).toBe("vertical");
    expect(horizontal["aria-orientation"]).toBe("vertical");
    // Horizontal is the implicit value on a separator: spelling it is noise.
    expect(vertical["data-orientation"]).toBe("horizontal");
    expect(vertical["aria-orientation"]).toBeUndefined();
    expect(forced["data-orientation"]).toBe("horizontal");
  });

  it("hides the spacer from the accessibility tree", () => {
    const spacer = build().api().getSpacerProps();

    expect(spacer["aria-hidden"]).toBe("true");
    expect(spacer.role).toBeUndefined();
  });

  it("leaves the item's semantics to the element it is rendered as", () => {
    const item = build().api().getItemProps({ value: "bold" });

    expect(item.id).toBe("toolbar:t1:item:bold");
    expect(item["data-value"]).toBe("bold");
    // No `role`, no `aria-disabled`, no `type`: a toolbar item is whatever the
    // consumer composed into it — a button, a link, a `toggle`.
    expect(item.role).toBeUndefined();
    expect(item["aria-disabled"]).toBeUndefined();
    expect(item.type).toBeUndefined();
  });

  it("marks no focus until one arrives", () => {
    const item = build().api().getItemProps({ value: "a" });

    expect(item["data-focus-visible"]).toBeUndefined();
    expect(item["data-focus-source"]).toBeUndefined();
  });

  it("groups are groups", () => {
    const group = build().api().getGroupProps();

    expect(group.role).toBe("group");
    expect(group["data-orientation"]).toBe("horizontal");
  });

  it("names the title part and carries no state", () => {
    const title = build().api().getTitleProps();

    expect(title["data-part"]).toBe("toolbar:title");
    expect(title["data-scope"]).toBe("toolbar");
    expect(title.role).toBeUndefined();
    expect(title.id).toBeUndefined();
    expect(title.tabIndex).toBeUndefined();
    expect(title["data-size"]).toBe("inline");
    expect(Object.keys(title).sort()).toEqual(["data-part", "data-scope", "data-size"]);
    expect(Object.keys(build().api().getTitleProps({ size: "large" })).sort()).toEqual([
      "data-part",
      "data-scope",
      "data-size",
    ]);
    expect(build().api().getTitleProps({ size: "large" })["data-size"]).toBe("large");
  });
});

describe("toolbar — the cohabitation rule", () => {
  it("claims its own axis and nothing else", () => {
    const horizontal = build().api();
    const vertical = build({ orientation: "vertical" }).api();

    expect(claims(horizontal, { key: "ArrowRight" })).toBe(true);
    expect(claims(horizontal, { key: "ArrowLeft" })).toBe(true);
    // The perpendicular axis stays free — for the page to scroll, or for a
    // spinbutton sitting in the bar. This is the deliberate difference with the
    // radio mode of `toggle-group`, which answers both axes.
    expect(claims(horizontal, { key: "ArrowDown" })).toBe(false);
    expect(claims(horizontal, { key: "ArrowUp" })).toBe(false);

    expect(claims(vertical, { key: "ArrowDown" })).toBe(true);
    expect(claims(vertical, { key: "ArrowRight" })).toBe(false);
  });

  it("goes to the ends on Home and End, in both orientations", () => {
    expect(claims(build().api(), { key: "Home" })).toBe(true);
    expect(claims(build({ orientation: "vertical" }).api(), { key: "End" })).toBe(true);
  });

  it("never activates — Enter and Space belong to the control", () => {
    const api = build().api();

    expect(claims(api, { key: "Enter" })).toBe(false);
    expect(claims(api, { key: " " })).toBe(false);
    // Escape unwinds the layer stack; a bar is not a layer.
    expect(claims(api, { key: "Escape" })).toBe(false);
  });

  it("yields to a composed control that already claimed the key", () => {
    // A menu trigger opening on ArrowDown, a combobox on ArrowUp: whoever called
    // `preventDefault` first has won, whatever order the handlers merged in.
    expect(claims(build().api(), { key: "ArrowRight", defaultPrevented: true })).toBe(false);
  });

  it("yields to every modifier, Shift included", () => {
    const api = build().api();

    expect(claims(api, { key: "ArrowRight", altKey: true })).toBe(false);
    expect(claims(api, { key: "ArrowRight", ctrlKey: true })).toBe(false);
    expect(claims(api, { key: "ArrowRight", metaKey: true })).toBe(false);
    // Shift+arrow is the range-extend gesture; consuming it would move the focus
    // while a selection was being made somewhere else.
    expect(claims(api, { key: "ArrowRight", shiftKey: true })).toBe(false);
  });

  it("yields to a caret", () => {
    const api = build().api();

    expect(claims(api, { key: "ArrowRight", target: TEXT_FIELD })).toBe(false);
    expect(claims(api, { key: "Home", target: TEXT_FIELD })).toBe(false);
    expect(claims(api, { key: "End", target: TEXT_FIELD })).toBe(false);
  });
});
