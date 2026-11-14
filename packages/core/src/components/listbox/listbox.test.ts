/**
 * The node half of `listbox`: no document, no framework — the shape a server
 * render has, plus the arithmetic that has no business needing a page.
 *
 * The collection is read from the DOM, so what has to degrade *honestly* here is
 * everything that depends on it: an unmeasured list must not claim to be an empty
 * one, and a machine that cannot see its rows must not report a change nobody made.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./listbox.connect";
import { DEFAULT_PAGE_SIZE, getPageStep } from "./listbox.dom";
import { machine } from "./listbox.machine";
import type { ListboxApi, ListboxMachineProps, ListboxSchema } from "./listbox.types";

type Api = ListboxApi<PlainPropTypes>;

const build = (props: ListboxMachineProps = {}) =>
  connectWithoutDom<ListboxSchema, Api>({ machine, connect, id: "b1", props });

/** The machine with its effects installed, which a DOM-free service can still do. */
function started(props: ListboxMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

describe("page arithmetic", () => {
  it("counts whole rows and never answers zero", () => {
    expect(getPageStep(120, 32)).toBe(3);
    expect(getPageStep(300, 44)).toBe(6);
    // A viewport shorter than one row still moves by one: a PageDown that did
    // nothing would be a key with no effect at all.
    expect(getPageStep(20, 44)).toBe(1);
  });

  it("falls back rather than dividing by a layout that has not happened", () => {
    expect(getPageStep(0, 32)).toBe(DEFAULT_PAGE_SIZE);
    expect(getPageStep(120, 0)).toBe(DEFAULT_PAGE_SIZE);
    expect(getPageStep(Number.NaN, 32)).toBe(DEFAULT_PAGE_SIZE);
    expect(getPageStep(Number.POSITIVE_INFINITY, 32)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("listbox without a DOM", () => {
  it("connects on a server, where it can find none of its own rows", () => {
    const harness = build({ label: "People" });
    const content = harness.api().getContentProps();

    expect(harness.service.status()).toBe("not-started");
    expect(content.role).toBe("listbox");
    // Unmeasured is not empty: answering 0 here would render an empty state and a
    // container tab stop that the first client sync takes straight back.
    expect(content["data-empty"]).toBeUndefined();
    expect(content.tabIndex).toBeUndefined();
    // No label part has been seen, so the prop is what names it — never a dangling
    // IDREF, which names nothing and which axe only reports as `incomplete`.
    expect(content["aria-labelledby"]).toBeUndefined();
    expect(content["aria-label"]).toBe("People");
  });

  it("says nothing about a multiselect or an axis it does not have", () => {
    const single = build().api().getContentProps();
    expect(single["aria-multiselectable"]).toBeUndefined();
    expect(single["aria-orientation"]).toBeUndefined();

    const multiple = build({ selectionMode: "multiple", orientation: "horizontal" })
      .api()
      .getContentProps();
    expect(multiple["aria-multiselectable"]).toBe("true");
    expect(multiple["aria-orientation"]).toBe("horizontal");
  });

  it("gives a row one identity: the selection on aria-selected, the focus elsewhere", () => {
    const api = build({ defaultValue: ["b"] }).api();
    const selected = api.getItemProps({ value: "b" });
    const plain = api.getItemProps({ value: "a", disabled: true });

    expect(selected.role).toBe("option");
    expect(selected["aria-selected"]).toBe("true");
    expect(selected["data-state"]).toBe("selected");
    expect(plain["aria-selected"]).toBe("false");
    // `aria-disabled`, never the native attribute: APG wants a disabled option
    // reachable.
    expect(plain["aria-disabled"]).toBe("true");
    expect(plain.disabled).toBeUndefined();
  });

  it("enters at the selected row even before the collection has been read", () => {
    const api = build({ defaultValue: ["b"] }).api();

    // DOM order is unknowable here, and a selection is the one thing that is not:
    // a server-rendered list with a selection is better entered there than not
    // entered at all.
    expect(api.getItemProps({ value: "b" }).tabIndex).toBe(0);
    expect(api.getItemProps({ value: "a" }).tabIndex).toBe(-1);
  });

  it("withholds a group's name until a label is really rendered", () => {
    const api = build().api();

    expect(api.getItemGroupProps({ id: "team" })["aria-labelledby"]).toBeUndefined();
    expect(api.getItemGroupProps({ id: "team", label: true })["aria-labelledby"]).toBe(
      "listbox:b1:item-group-label:team",
    );
  });
});

describe("listbox value semantics", () => {
  it("treats the selection as a set: the same values in another order are no change", () => {
    const onValueChange = vi.fn();
    const harness = started({ selectionMode: "multiple", onValueChange });

    harness.api().setValue(["a", "b"]);
    expect(onValueChange).toHaveBeenCalledTimes(1);

    // Order is not meaning here, and a report of a change nobody made is how a
    // consumer that normalises its own state ends up in a loop.
    harness.api().setValue(["b", "a"]);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(harness.api().value).toEqual(["a", "b"]);
  });

  it("reports without writing when the value is controlled", () => {
    const onValueChange = vi.fn();
    const harness = started({ value: ["a"], onValueChange });

    harness.api().select("b");
    expect(onValueChange).toHaveBeenCalledWith({ value: ["b"] });
    expect(harness.api().value).toEqual(["a"]);
  });

  it("still toggles a value whose row is not in the document", () => {
    const onSelect = vi.fn();
    const harness = started({ selectionMode: "multiple", defaultValue: ["a"], onSelect });

    // The contract of a filtered list: a selection outlives the row, so unselecting
    // something a search has hidden has to keep working.
    harness.api().toggle("a");
    expect(harness.api().value).toEqual([]);
    expect(onSelect).toHaveBeenCalledWith({ value: "a" });
  });

  it("empties on a re-selection only where that was asked for", () => {
    const plain = started({ defaultValue: ["a"] });
    plain.api().toggle("a");
    expect(plain.api().value).toEqual(["a"]);

    const deselectable = started({ deselectable: true, defaultValue: ["a"] });
    deselectable.api().toggle("a");
    expect(deselectable.api().value).toEqual([]);
  });

  it("refuses to select all where all is not a selection", () => {
    const harness = started({ selectionMode: "single", defaultValue: ["a"] });

    harness.api().selectAll();
    expect(harness.api().value).toEqual(["a"]);
  });

  it("carries the highlight without touching the selection", () => {
    const onHighlightChange = vi.fn();
    const harness = started({ onHighlightChange });

    harness.api().setHighlightedValue("c");
    expect(harness.api().highlightedValue).toBe("c");
    expect(harness.api().value).toEqual([]);
    expect(onHighlightChange).toHaveBeenCalledWith({ value: "c" });
  });
});
