/**
 * The vanilla-shaped proof for a component with no machine, on `separator`'s
 * precedent: the prop getters' output lands on live elements, the published
 * selectors find them, and nothing of the component itself is focusable. The
 * contract is pinned in the node test — a harness here would mean giving the
 * component the service it deliberately does not have.
 *
 * No assertion touches the entry animation: this harness loads no stylesheet,
 * so there is nothing to animate and nothing honest to measure.
 */

import { afterEach, describe, expect, it } from "vitest";
import { domNormalizer } from "../harness";
import type { EmptyStateMachineProps } from "./empty-state";
import { connect, parts } from "./empty-state";

interface MountOptions {
  readonly indicator?: boolean;
  readonly actions?: readonly string[];
}

function write(tag: string, values: Record<string, unknown>): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  return node;
}

function mountEmptyState(
  props: EmptyStateMachineProps = {},
  options: MountOptions = {},
): HTMLElement {
  const api = connect(props, domNormalizer);

  const root = write("div", api.getRootProps());
  if (options.indicator !== false) root.append(write("div", api.getIndicatorProps()));

  const title = write("h2", api.getTitleProps());
  title.textContent = "No results";
  const description = write("p", api.getDescriptionProps());
  description.textContent = "Try a different search.";
  root.append(title, description);

  if (options.actions !== undefined) {
    const actions = write("div", api.getActionsProps());
    for (const label of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      actions.append(button);
    }
    root.append(actions);
  }

  document.body.append(root);
  return root;
}

afterEach(() => {
  for (const node of document.querySelectorAll('[data-part~="empty-state:root"]')) node.remove();
});

describe("empty-state", () => {
  it("reaches real DOM with all five parts findable by their published selectors", () => {
    const root = mountEmptyState({}, { actions: ["Retry"] });

    expect(document.querySelector(parts.root.selector)).toBe(root);
    for (const name of ["indicator", "title", "description", "actions"] as const) {
      expect(root.querySelector(parts[name].selector)).not.toBeNull();
    }
    expect(root.getAttribute("data-variant")).toBe("symbol");
    expect(root.hasAttribute("role")).toBe(false);
  });

  it("keeps the indicator out of the accessibility tree", () => {
    const root = mountEmptyState();
    const indicator = root.querySelector(parts.indicator.selector);

    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
  });

  it("announces as a status region when asked", () => {
    const root = mountEmptyState({ announce: true });

    expect(root.getAttribute("role")).toBe("status");
  });

  it("carries the circle variant on root and indicator alike", () => {
    const root = mountEmptyState({ variant: "circle" });

    expect(root.getAttribute("data-variant")).toBe("circle");
    expect(root.querySelector(parts.indicator.selector)?.getAttribute("data-variant")).toBe(
      "circle",
    );
  });

  it("exposes exactly the composed buttons to the tab order, nothing of its own", () => {
    const root = mountEmptyState({}, { actions: ["Retry", "Clear filters"] });

    const focusables = root.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]",
    );
    expect([...focusables].map((node) => node.textContent)).toEqual(["Retry", "Clear filters"]);

    const [first] = focusables;
    (first as HTMLElement).focus();
    expect(document.activeElement).toBe(first);
  });

  it("renders the title-and-subtitle configuration with no indicator and no leftovers", () => {
    const root = mountEmptyState({}, { indicator: false });

    expect(root.querySelector(parts.indicator.selector)).toBeNull();
    expect(root.querySelector(parts.title.selector)).not.toBeNull();
    expect(root.querySelector(parts.description.selector)).not.toBeNull();
    // The variant attribute stays: it describes the indicator the consumer may
    // yet render, and an attribute nothing selects on costs nothing.
    expect(root.getAttribute("data-variant")).toBe("symbol");
  });
});
