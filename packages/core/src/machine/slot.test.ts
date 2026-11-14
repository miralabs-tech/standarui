import { describe, expect, it, vi } from "vitest";
import { mergeProps } from "./slot";

describe("mergeProps", () => {
  it("lets later props win for values", () => {
    expect(mergeProps({ id: "a", role: "button" }, { id: "b" })).toEqual({
      id: "b",
      role: "button",
    });
  });

  it("never lets an explicit undefined erase a value", () => {
    expect(mergeProps({ id: "a" }, { id: undefined })).toEqual({ id: "a" });
  });

  it("runs the later handler first, so defaultPrevented is a real veto", () => {
    const order: string[] = [];
    const library = vi.fn(() => order.push("library"));
    const consumer = vi.fn(() => order.push("consumer"));

    const merged = mergeProps({ onClick: library }, { onClick: consumer });
    (merged.onClick as () => void)();

    expect(order).toEqual(["consumer", "library"]);
  });

  it("passes every argument through the chain", () => {
    const first = vi.fn();
    const second = vi.fn();
    const merged = mergeProps({ onKeyDown: first }, { onKeyDown: second });

    (merged.onKeyDown as (event: unknown) => void)({ key: "a" });

    expect(first).toHaveBeenCalledWith({ key: "a" });
    expect(second).toHaveBeenCalledWith({ key: "a" });
  });

  it("only chains what looks like a handler", () => {
    const format = vi.fn();
    const other = vi.fn();

    expect(mergeProps({ onceUpon: format }, { onceUpon: other }).onceUpon).toBe(other);
  });

  it("accumulates class names", () => {
    expect(mergeProps({ class: "a" }, { class: "b" }, { class: "" })).toEqual({ class: "a b" });
    expect(mergeProps({ className: "a" }, { className: "b" })).toEqual({ className: "a b" });
  });

  /**
   * The defect this rule exists for: under "later wins" a `<PopoverTrigger
   * render={<ButtonRoot/>}>` came out carrying the popover's identity alone, so
   * every rule in the button's sheet stopped matching and the element rendered
   * with no fill, no radius and no padding at all.
   */
  it("accumulates the part identity instead of letting the outer part erase the inner", () => {
    const merged = mergeProps(
      { "data-scope": "button", "data-part": "button:root" },
      { "data-scope": "popover", "data-part": "popover:trigger" },
    );

    expect(merged["data-scope"]).toBe("button popover");
    expect(merged["data-part"]).toBe("button:root popover:trigger");
  });

  it("does not repeat an identity that reaches the same element twice", () => {
    const merged = mergeProps(
      { "data-scope": "button", "data-part": "button:root" },
      { "data-scope": "button", "data-part": "button:root" },
    );

    expect(merged["data-scope"]).toBe("button");
    expect(merged["data-part"]).toBe("button:root");
  });

  /** A plain element brings no identity, so it must not add an empty token. */
  it("leaves a lone identity alone when the other side has none", () => {
    expect(mergeProps({ "data-part": "button:root" }, { href: "/save" })).toEqual({
      "data-part": "button:root",
      href: "/save",
    });
  });

  it("merges styles key by key, whichever form they arrive in", () => {
    expect(
      mergeProps({ style: { color: "red", margin: "0" } }, { style: { color: "blue" } }),
    ).toEqual({
      style: { color: "blue", margin: "0" },
    });
    expect(mergeProps({ style: "color: red; margin: 0" }, { style: { color: "blue" } })).toEqual({
      style: { color: "blue", margin: "0" },
    });
  });

  it("keeps custom properties when merging styles", () => {
    expect(mergeProps({ style: "--sui-active-index: 2" }, { style: { opacity: "1" } })).toEqual({
      style: { "--sui-active-index": "2", opacity: "1" },
    });
  });

  it("ignores absent entries", () => {
    expect(mergeProps(null, { id: "a" }, undefined)).toEqual({ id: "a" });
  });
});
