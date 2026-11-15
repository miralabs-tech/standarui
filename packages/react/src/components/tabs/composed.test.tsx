/**
 * What the markup-parity table cannot say about `<Tabs items={…}/>`.
 *
 * The loop in `packages/react/src/composed.test.tsx` compares the composed form to
 * the parts form character by character, which makes it blind to exactly one class
 * of defect: a claim both fixtures get wrong in the same way. Every assertion here
 * is therefore **absolute** — about the markup the composed layer produces, not
 * about a second markup written beside it — and each one pins a sentence the
 * module's own header makes.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { subtreeOf } from "../../composed.harness";
import { Tabs } from "./composed";

const ITEMS = [
  { value: "overview", label: "Overview", content: "What this document is." },
  { value: "activity", label: "Activity", content: "Who touched it last." },
  { value: "history", label: "History", content: "Every version of it." },
] as const;

function render(props: { readonly closable?: boolean } = {}): string {
  return renderToString(<Tabs id="doc" defaultValue="overview" items={ITEMS} {...props} />);
}

describe("the composed tab list places what the anatomy allows", () => {
  /**
   * `closable` is the machine's own gate — it declines `TRIGGER.CLOSE` without it,
   * so a stray close button is inert rather than wrong (`tabs.tsx:170-173`). Inert
   * is not the same as absent, and this layer places none at all: a button nobody
   * can act through is still a button the pointer can land on.
   */
  it("places no close button until closable is asked for", () => {
    expect(render()).not.toContain("tabs:close-trigger");
    expect(render({ closable: true })).toContain("tabs:close-trigger");
  });

  /**
   * One per tab, and the count is asserted rather than the presence: a layer that
   * placed a single close button — or one per *panel*, which is the other loop —
   * would satisfy the test above.
   */
  it("places exactly one close button per tab", () => {
    const html = render({ closable: true });

    expect(html.match(/tabs:close-trigger/g)?.length).toBe(ITEMS.length);
    for (const item of ITEMS) {
      expect(html).toContain(
        `data-part="tabs:close-trigger" id="tabs:doc:close-trigger:${item.value}"`,
      );
    }
  });

  /**
   * A **sibling** of the tab it closes, never a child of it (`tabs.tsx:164-169`): a
   * `<button>` may hold no interactive content, and a nested one would hand its
   * click to the tab on the way out — selecting the tab the user just asked to be
   * rid of. This is the claim `flatMap` is written for, and a keyed fragment
   * wrapping the pair would pass the parity comparison while making it false.
   */
  it("puts the close button beside its tab and never inside it", () => {
    const trigger = subtreeOf(render({ closable: true }), "tabs:trigger");

    // The slice is real: an empty one would make the assertion below vacuous.
    expect(trigger).toBe("Overview");
    expect(trigger).not.toContain("tabs:close-trigger");
  });

  /**
   * The reason this is the first composed layer with two loops. A panel is
   * `role="tabpanel"` and the list is `role="tablist"`, which may own nothing but
   * `role="tab"` — so the panels are placed after the list, never inside it, and a
   * single loop building one tree could not say that.
   */
  it("keeps the panels outside the list", () => {
    const html = render();
    const list = subtreeOf(html, "tabs:list");

    expect(list).toContain("tabs:trigger");
    expect(list).not.toContain("tabs:content");
    expect(html).toContain("tabs:content");
  });

  /**
   * `label` is spent twice and both spends are load-bearing: `data-label` is what
   * the styles reserve the selected weight's width with, and the text is what the
   * tab shows. Dropping either one is invisible until a tab is selected and the
   * measured indicator chases a width the selection caused (`tabs.types.ts:30-36`).
   */
  it("spends an entry's label on the reservation and on the text", () => {
    const html = render();

    expect(html).toContain('data-label="Overview"');
    expect(subtreeOf(html, "tabs:trigger")).toBe("Overview");
  });
});
