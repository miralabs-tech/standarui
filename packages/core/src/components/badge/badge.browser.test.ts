/**
 * The vanilla-shaped proof for the second component with no machine, in the
 * separator's mould: the prop getter's output lands on a live element, the
 * published selector finds it, and `[hidden]` really removes it — the UA sheet
 * is the one stylesheet this harness does load.
 *
 * The overlap geometry is asserted here too, against a verbatim clone of the
 * `data-overlap` recipe from `_badge.scss` (this harness loads no design-system
 * CSS). What is under test is the platform fact the recipe rests on: a logical
 * inset resolves against the containing block and flips in RTL, with none of
 * WebKit's rounding of a self-percentage translate on a fractional box. The
 * shipped sheet's own geometry stays with the story matrix.
 */

import { afterEach, describe, expect, it } from "vitest";
import { domNormalizer } from "../harness";
import type { BadgeMachineProps } from "./badge";
import { connect, parts } from "./badge";

function mountBadge(props: BadgeMachineProps = {}, host: HTMLElement = document.body): HTMLElement {
  const api = connect(props, domNormalizer);
  const node = document.createElement("span");
  const rootProps = api.getRootProps();
  for (const [key, value] of Object.entries(rootProps)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  node.textContent = api.displayValue;
  host.append(node);
  return node;
}

afterEach(() => {
  for (const node of document.querySelectorAll("[data-mount]")) node.remove();
  for (const node of document.querySelectorAll('[data-scope="badge"]')) node.remove();
  for (const node of document.querySelectorAll("style[data-badge-recipe]")) node.remove();
});

describe("badge", () => {
  it("reaches real DOM, findable by its published selector", () => {
    const node = mountBadge({ kind: "count", count: 67 });

    expect(document.querySelector(parts.root.selector)).toBe(node);
    expect(node.getAttribute("data-kind")).toBe("count");
    expect(node.getAttribute("data-tone")).toBe("danger");
    expect(node.getAttribute("data-variant")).toBe("solid");
    expect(node.textContent).toBe("67");
  });

  it("disappears through the UA sheet alone when it has nothing to say", () => {
    const node = mountBadge({ kind: "count", count: 0 });

    expect(node.matches("[hidden]")).toBe(true);
    expect(getComputedStyle(node).display).toBe("none");

    const shown = mountBadge({ kind: "count", count: 0, showZero: true });
    expect(shown.matches("[hidden]")).toBe(false);
    expect(getComputedStyle(shown).display).not.toBe("none");
  });

  it("keeps a mute dot out of the accessibility tree on the element itself", () => {
    const node = mountBadge({ kind: "dot" });

    expect(node.getAttribute("aria-hidden")).toBe("true");
    expect(node.hasAttribute("role")).toBe(false);
  });

  it("pins the overlap on the trailing corner, and on the leading one in RTL", () => {
    const style = document.createElement("style");
    style.setAttribute("data-badge-recipe", "");
    style.textContent = `
      :where([data-part~="badge:root"][data-overlap]) {
        position: absolute;
        inset-block-start: calc(var(--sui-badge-height) / -2);
        inset-inline-end: calc(var(--sui-badge-height) / -2);
      }
    `;
    document.head.append(style);

    const mountHost = (dir: "ltr" | "rtl"): { host: HTMLElement; badge: HTMLElement } => {
      const host = document.createElement("div");
      host.setAttribute("data-mount", "");
      host.dir = dir;
      host.style.cssText =
        "position: relative; inline-size: 120px; block-size: 48px; margin: 40px; --sui-badge-height: 24px;";
      document.body.append(host);
      const badge = mountBadge({ kind: "count", count: 99, overlap: true }, host);
      // Fractional width on purpose: the reason this recipe is insets rather
      // than a percentage translate is that WebKit rounds the latter's base.
      badge.style.cssText = "display: inline-flex; inline-size: 30.5px; block-size: 24px;";
      return { host, badge };
    };

    const ltr = mountHost("ltr");
    const ltrHost = ltr.host.getBoundingClientRect();
    const ltrBadge = ltr.badge.getBoundingClientRect();
    expect(ltrBadge.right - ltrHost.right).toBeCloseTo(12, 1);
    expect(ltrHost.top - ltrBadge.top).toBeCloseTo(12, 1);

    const rtl = mountHost("rtl");
    const rtlHost = rtl.host.getBoundingClientRect();
    const rtlBadge = rtl.badge.getBoundingClientRect();
    expect(rtlHost.left - rtlBadge.left).toBeCloseTo(12, 1);
    expect(rtlHost.top - rtlBadge.top).toBeCloseTo(12, 1);
  });
});
