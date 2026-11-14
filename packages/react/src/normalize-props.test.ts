import { describe, expect, it } from "vitest";
import { normalizeProps } from "./normalize-props";

describe("normalizeProps", () => {
  it("renames what React spells differently", () => {
    const onFocus = (): void => {};
    const onBlur = (): void => {};
    const props = normalizeProps.element({
      class: "sui-toggle",
      onFocusIn: onFocus,
      onFocusOut: onBlur,
    }) as Record<string, unknown>;

    expect(props.className).toBe("sui-toggle");
    expect(props.class).toBeUndefined();
    expect(props.onFocus).toBe(onFocus);
    expect(props.onBlur).toBe(onBlur);
    expect(props.onFocusIn).toBeUndefined();
  });

  it("maps for to htmlFor on a label", () => {
    const props = normalizeProps.label({ for: "toggle:1:root" }) as Record<string, unknown>;

    expect(props.htmlFor).toBe("toggle:1:root");
    expect(props.for).toBeUndefined();
  });

  it("turns a style string into the object React wants", () => {
    const props = normalizeProps.element({
      style: "background-color: red; --sui-active-index: 2",
    }) as { style: Record<string, unknown> };

    expect(props.style).toEqual({ backgroundColor: "red", "--sui-active-index": "2" });
  });

  it("camel-cases an object's properties but leaves custom ones alone", () => {
    const props = normalizeProps.element({
      style: { "transform-origin": "top left", "--sui-drag-offset": "4px", color: "red" },
    }) as { style: Record<string, unknown> };

    expect(props.style).toEqual({
      transformOrigin: "top left",
      "--sui-drag-offset": "4px",
      color: "red",
    });
  });

  it("drops explicit undefined rather than handing it to React", () => {
    const props = normalizeProps.input({ checked: undefined, value: "a" }) as Record<
      string,
      unknown
    >;

    expect("checked" in props).toBe(false);
    expect(props.value).toBe("a");
  });

  it("passes data, aria and everything already in React's dialect straight through", () => {
    const props = normalizeProps.button({
      "data-part": "toggle:root",
      "aria-pressed": true,
      tabIndex: -1,
      type: "button",
      disabled: true,
    }) as Record<string, unknown>;

    expect(props).toEqual({
      "data-part": "toggle:root",
      "aria-pressed": true,
      tabIndex: -1,
      type: "button",
      disabled: true,
    });
  });
});
