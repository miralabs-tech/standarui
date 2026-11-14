/**
 * What the composed clipboard owes beyond the markup its rows already pin: the
 * dev warning that stands in for what a bare `string` cannot say. `copyLabel` is
 * required in the type, so the compiler catches the caller who forgets it — but
 * `""` satisfies `string` while naming nothing, and a plain-JS caller never met
 * the signature at all. `composed.parity.tsx` proves the markup; this proves the
 * guard rail behind it.
 *
 * The stake is larger here than it is for `input`'s `revealLabel`, which names a
 * secondary control: this trigger IS the component, and the composed form fills
 * it with two `aria-hidden` glyphs, so a missing name leaves a button announced
 * as "button" with no way for a consumer to notice by looking at it.
 */

import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Clipboard } from "./composed";

describe("the composed clipboard's copy label", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on an explicit empty string, which the type accepts and the screen reader does not", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderToString(<Clipboard id="c" copyLabel="" defaultValue="sui-4f3a" />);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("copyLabel");
  });

  it("warns when the prop is missing outright — the plain-JS caller with no type checker", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The cast is the point: this is the call a JavaScript consumer can make and
    // the compiler never sees, and it is the only way to reach the branch. Called
    // rather than rendered — a composed layer is a pure function of its props, so
    // the guard runs in the call itself and needs no tree around it.
    const untyped = Clipboard as (props: { readonly id: string }) => unknown;

    untyped({ id: "c" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("copyLabel");
  });

  it("stays silent once the word is given", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderToString(<Clipboard id="c" copyLabel="Copy the token" defaultValue="sui-4f3a" />);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  /**
   * The name travels through the machine rather than being posted by this layer,
   * so the composed trigger must not be caught adding an `aria-label` beside the
   * one `getTriggerProps` already writes. The parity rows compare the two forms
   * against each other; this reads the attribute itself, which is what says the
   * required prop actually reaches the button.
   */
  it("names the trigger exactly once, through the machine", () => {
    const html = renderToString(<Clipboard id="c" copyLabel="Copy the token" />);
    const labels = html.match(/aria-label="Copy the token"/g) ?? [];

    expect(labels).toHaveLength(1);
  });

  /**
   * Both glyphs are rendered bare so `_clipboard.scss` can paint them under
   * `:empty` — the whole reason this layer could be written at all. An indicator
   * that shipped any child, even a comment node, would stop matching and the pair
   * would go blank.
   */
  it("renders both indicators empty, which is what lets the sheet draw them", () => {
    const html = renderToString(<Clipboard id="c" copyLabel="Copy" />);
    const indicators = html.match(/data-part="clipboard:indicator"[^>]*>/g) ?? [];

    expect(indicators).toHaveLength(2);
    // Each opening tag closed immediately by its own `</span>`, read per tag
    // rather than on the whole string: the two indicators are siblings, so
    // `</span><span` sits between them in a perfectly correct render.
    for (const tag of indicators) {
      expect(html.slice(html.indexOf(tag) + tag.length, html.indexOf(tag) + tag.length + 7)).toBe(
        "</span>",
      );
    }
  });
});
