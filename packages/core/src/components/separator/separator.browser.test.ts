/**
 * The vanilla-shaped proof for the one component with no machine: the prop
 * getter's output lands on a live element and the published selector finds it.
 * The contract itself is pinned in the node test — this file exists so all
 * eleven components carry their second proof outside React (`harness.ts` for
 * the ten with a machine, a bare element here, because giving the separator a
 * harness would mean giving it the service it deliberately does not have).
 */

import { afterEach, describe, expect, it } from "vitest";
import { domNormalizer } from "../harness";
import type { SeparatorMachineProps } from "./separator";
import { connect, parts } from "./separator";

function mountSeparator(props: SeparatorMachineProps = {}): HTMLElement {
  const node = document.createElement("div");
  const rootProps = connect(props, domNormalizer).getRootProps();
  for (const [key, value] of Object.entries(rootProps)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  document.body.append(node);
  return node;
}

afterEach(() => {
  for (const node of document.querySelectorAll('[data-scope="separator"]')) node.remove();
});

describe("separator", () => {
  it("reaches real DOM as a semantic separator, findable by its published selector", () => {
    const node = mountSeparator();

    expect(document.querySelector(parts.root.selector)).toBe(node);
    expect(node.getAttribute("role")).toBe("separator");
    expect(node.getAttribute("data-orientation")).toBe("horizontal");
    expect(node.hasAttribute("aria-orientation")).toBe(false);
  });

  it("spells out the vertical orientation on the element", () => {
    const node = mountSeparator({ orientation: "vertical" });

    expect(node.getAttribute("aria-orientation")).toBe("vertical");
    expect(node.getAttribute("data-orientation")).toBe("vertical");
  });

  it("leaves the accessibility tree when decorative, but not the stylable contract", () => {
    const node = mountSeparator({ decorative: true, orientation: "vertical" });

    expect(node.getAttribute("role")).toBe("none");
    expect(node.getAttribute("aria-hidden")).toBe("true");
    // Still styled: the sheet reads the data attributes, not the role.
    expect(document.querySelector(parts.root.selector)).toBe(node);
    expect(node.getAttribute("data-orientation")).toBe("vertical");
  });
});
