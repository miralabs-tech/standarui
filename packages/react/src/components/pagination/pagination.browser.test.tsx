/**
 * Pagination through React: what only the adapter decides, and axe.
 *
 * The machine is proved in `packages/core/src/components/pagination` — the
 * truncation model, the guards, the focus moves and the gamepad all live
 * there. What only the adapter can get wrong is the *element*: `type="link"`
 * has to swap every control from `<button>` to `<a>`, the render-prop context
 * has to hand a consumer the live model to map, and the whole assembled
 * landmark has to pass axe in the four shapes the spec names — default, link,
 * disabled, and parked at a bound with its `aria-disabled` trigger.
 */

import type { PaginationPageItem } from "@standarui/core/pagination";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  unmountAll,
} from "../../render-harness";
import {
  PaginationContext,
  PaginationEllipsis,
  PaginationItem,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
  type PaginationRootProps,
} from "./pagination";

/** Inline SVG, never a text glyph: a glyph's ink sits on its baseline. */
function Chevron(props: { readonly flip?: boolean }): React.ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" focusable={false}>
      <path
        d={props.flip === true ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"}
        fill="none"
        stroke="currentcolor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Dots(): React.ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" focusable={false}>
      <circle cx="3" cy="8" r="1.25" fill="currentcolor" />
      <circle cx="8" cy="8" r="1.25" fill="currentcolor" />
      <circle cx="13" cy="8" r="1.25" fill="currentcolor" />
    </svg>
  );
}

/**
 * An ellipsis carries no value of its own, and the pages on either side are the
 * wrong place to borrow one from: they change on every page turn, so a key made
 * of them unmounts and remounts both ellipses each time. There are exactly two
 * gaps and they are *positions* — one before the window, one after — so that is
 * the key (ratified 2026-09-05; `composed.tsx` picks it for every consumer, and
 * this fixture writes what the composed layer writes).
 */
function gapKey(pages: readonly PaginationPageItem[], at: number): string {
  return at < pages.length / 2 ? "gap-start" : "gap-end";
}

type PagerProps = Partial<PaginationRootProps>;

function Pager(props: PagerProps): React.ReactNode {
  return (
    <PaginationRoot count={95} {...props}>
      <PaginationPrevTrigger>
        <Chevron />
      </PaginationPrevTrigger>
      <PaginationContext>
        {(api) =>
          api.pages.map((item, index) =>
            item.type === "page" ? (
              <PaginationItem key={`page-${item.value}`} page={item.value}>
                {item.value}
              </PaginationItem>
            ) : (
              <PaginationEllipsis key={gapKey(api.pages, index)} index={index}>
                <Dots />
              </PaginationEllipsis>
            ),
          )
        }
      </PaginationContext>
      <PaginationNextTrigger>
        <Chevron flip />
      </PaginationNextTrigger>
    </PaginationRoot>
  );
}

function items(container: ParentNode): HTMLElement[] {
  return queryParts(container, "item");
}

function item(container: ParentNode, page: number): HTMLElement {
  const found = items(container).find((node) => node.getAttribute("data-value") === String(page));
  if (found === undefined) throw new Error(`no item for page ${page}`);
  return found;
}

afterEach(() => {
  unmountAll();
});

describe("PaginationRoot — the landmark and its cells", () => {
  it("renders a named nav with buttons, and the model the machine computed", () => {
    const { container } = mount(<Pager />);
    const root = queryPart(container, "root");

    expect(root?.localName).toBe("nav");
    expect(root?.getAttribute("aria-label")).toBe("pagination");
    // 95 items at 10 a page: 1 2 3 4 5 … 10.
    expect(items(container).map((node) => node.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "10",
    ]);
    expect(items(container).every((node) => node.localName === "button")).toBe(true);
    expect(item(container, 1).getAttribute("aria-current")).toBe("page");
    expect(queryParts(container, "ellipsis")).toHaveLength(1);
    expect(queryPart(container, "ellipsis")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("remaps the window through the render-prop context as the page moves", () => {
    const { container } = mount(<Pager />);

    fire(() => item(container, 5).click());

    // The context handed the consumer the *new* model: both ellipses now.
    expect(items(container).map((node) => node.textContent)).toEqual(["1", "4", "5", "6", "10"]);
    expect(queryParts(container, "ellipsis")).toHaveLength(2);
    expect(item(container, 5).getAttribute("aria-current")).toBe("page");
    expect(item(container, 1).getAttribute("aria-current")).toBeNull();
  });

  it("reports the change and holds a controlled page still", () => {
    const onPageChange = vi.fn();
    const { container } = mount(<Pager page={2} onPageChange={onPageChange} />);

    fire(() => item(container, 4).click());

    expect(onPageChange).toHaveBeenCalledWith({ page: 4, pageSize: 10 });
    expect(item(container, 2).getAttribute("aria-current")).toBe("page");
  });

  it("swaps every control to an anchor in link mode", () => {
    const { container } = mount(
      <Pager type="link" getPageUrl={({ page }) => `#page-${page}`} defaultPage={5} />,
    );

    expect(items(container).every((node) => node.localName === "a")).toBe(true);
    expect(item(container, 4).getAttribute("href")).toBe("#page-4");
    expect(item(container, 5).getAttribute("aria-current")).toBe("page");
    expect(queryPart(container, "prev-trigger")?.localName).toBe("a");
    expect(queryPart(container, "prev-trigger")?.getAttribute("href")).toBe("#page-4");
    expect(queryPart(container, "next-trigger")?.getAttribute("href")).toBe("#page-6");
  });

  it("keeps the bound trigger focusable, aria-disabled and not disabled", () => {
    const { container } = mount(<Pager defaultPage={10} />);
    const next = queryPart<HTMLButtonElement>(container, "next-trigger");

    expect(next?.getAttribute("aria-disabled")).toBe("true");
    expect(next?.disabled).toBe(false);
  });
});

describe("PaginationRoot — axe", () => {
  it("passes as rendered by default", async () => {
    const { container } = mount(<Pager defaultPage={5} />);
    await expectNoAxeViolations(container);
  });

  it("passes in link mode", async () => {
    const { container } = mount(
      <Pager type="link" getPageUrl={({ page }) => `#page-${page}`} defaultPage={5} />,
    );
    await expectNoAxeViolations(container);
  });

  it("passes disabled", async () => {
    const { container } = mount(<Pager disabled />);
    await expectNoAxeViolations(container);
  });

  it("passes parked at a bound, aria-disabled trigger included", async () => {
    const { container } = mount(<Pager defaultPage={10} />);
    await expectNoAxeViolations(container);
  });
});
