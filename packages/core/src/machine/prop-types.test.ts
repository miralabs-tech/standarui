import { describe, expect, it, vi } from "vitest";
import { createAnatomy } from "./anatomy";
import { createNormalizer, type PropTypes } from "./prop-types";

interface TestPropTypes extends PropTypes {
  element: Record<string, unknown>;
  button: Record<string, unknown>;
}

describe("createNormalizer", () => {
  it("routes every element kind through the same transform", () => {
    const transform = vi.fn((props) => ({ ...props, normalized: true }));
    const normalize = createNormalizer<TestPropTypes>(transform);

    expect(normalize.element({ id: "a" })).toEqual({ id: "a", normalized: true });
    expect(normalize.button({ type: "button" })).toEqual({ type: "button", normalized: true });
    expect(normalize.input({ value: "x" })).toEqual({ value: "x", normalized: true });
    expect(transform).toHaveBeenCalledTimes(3);
  });

  it("carries anatomy attributes and state data-attributes through untouched", () => {
    const parts = createAnatomy("toggle").parts("root").build();
    const normalize = createNormalizer<TestPropTypes>((props) => props);

    expect(
      normalize.button({
        ...parts.root.attrs,
        type: "button",
        "aria-pressed": true,
        "data-state": "on",
      }),
    ).toEqual({
      "data-scope": "toggle",
      "data-part": "toggle:root",
      type: "button",
      "aria-pressed": true,
      "data-state": "on",
    });
  });
});
