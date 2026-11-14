import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import type { BadgeMachineProps } from "./badge";
import { connect, parts } from "./badge";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

const api = (props: BadgeMachineProps = {}) => connect(props, normalize);
const root = (props: BadgeMachineProps = {}) => api(props).getRootProps();

describe("badge", () => {
  it("is a neutral tinted label by default, with nothing to say to a screen reader", () => {
    const props = root();

    expect(props).toMatchObject({
      "data-scope": "badge",
      "data-part": "badge:root",
      "data-kind": "label",
      "data-tone": "neutral",
      "data-variant": "tint",
    });
    expect(props.role).toBeUndefined();
    expect(props["aria-hidden"]).toBeUndefined();
    expect(props.hidden).toBeUndefined();
  });

  it("defaults count and dot to the count pill recipe: danger, solid", () => {
    const count = root({ kind: "count", count: 5 });
    expect(count["data-tone"]).toBe("danger");
    expect(count["data-variant"]).toBe("solid");

    const dot = root({ kind: "dot" });
    expect(dot["data-tone"]).toBe("danger");
    expect(dot["data-variant"]).toBe("solid");
  });

  it("lets explicit tone and variant win over the kind's defaults", () => {
    const props = root({ kind: "count", count: 5, tone: "accent", variant: "plain" });

    expect(props["data-tone"]).toBe("accent");
    expect(props["data-variant"]).toBe("plain");
  });

  it("formats the count, and caps it at max with an overflow flag", () => {
    expect(api({ kind: "count", count: 5 }).displayValue).toBe("5");

    const capped = api({ kind: "count", count: 120, max: 99 });
    expect(capped.displayValue).toBe("99+");
    expect(capped.overflowed).toBe(true);
    expect(capped.getRootProps()["data-overflow"]).toBe("");

    // At the ceiling is not over it.
    const exact = api({ kind: "count", count: 99, max: 99 });
    expect(exact.displayValue).toBe("99");
    expect(exact.overflowed).toBe(false);
    expect(exact.getRootProps()["data-overflow"]).toBeUndefined();
  });

  it("floors a negative count at 0 and truncates a fractional one", () => {
    expect(api({ kind: "count", count: -3 }).hidden).toBe(true);
    expect(api({ kind: "count", count: 2.7 }).displayValue).toBe("2");
  });

  it("hides a count of 0 unless showZero says otherwise", () => {
    const zero = api({ kind: "count", count: 0 });
    expect(zero.hidden).toBe(true);
    expect(zero.getRootProps().hidden).toBe(true);

    const shown = api({ kind: "count", count: 0, showZero: true });
    expect(shown.displayValue).toBe("0");
    expect(shown.hidden).toBe(false);
    expect(shown.getRootProps().hidden).toBeUndefined();
  });

  it("hides a count with no count at all", () => {
    const empty = api({ kind: "count" });
    expect(empty.hidden).toBe(true);
    expect(empty.displayValue).toBe("");
  });

  it("replaces a lying visible value with role=img and the label", () => {
    const props = root({ kind: "count", count: 120, max: 99, label: "More than 99 notifications" });

    expect(props.role).toBe("img");
    expect(props["aria-label"]).toBe("More than 99 notifications");
  });

  it("keeps a mute dot out of the accessibility tree, unless a label speaks for it", () => {
    const mute = root({ kind: "dot" });
    expect(mute["aria-hidden"]).toBe("true");
    expect(mute.role).toBeUndefined();

    const spoken = root({ kind: "dot", label: "New activity" });
    expect(spoken.role).toBe("img");
    expect(spoken["aria-hidden"]).toBeUndefined();
  });

  it("says overlap as a present-or-absent attribute", () => {
    expect(root({ overlap: true })["data-overlap"]).toBe("");
    expect(root()["data-overlap"]).toBeUndefined();
  });

  it("publishes a selector the styles can use", () => {
    expect(parts.root.selector).toBe('[data-part~="badge:root"]');
  });
});
