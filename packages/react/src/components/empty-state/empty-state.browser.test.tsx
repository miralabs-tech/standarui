import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, queryPart, unmountAll } from "../../render-harness";
import { ButtonRoot } from "../button";
import {
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIndicator,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./empty-state";

function StarIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3 1.1-6.4L.4 9.3l6.5-.9z" />
    </svg>
  );
}

function Fixture({
  announce,
  withActions,
}: {
  readonly announce?: boolean;
  readonly withActions?: boolean;
}): ReactNode {
  return (
    <EmptyStateRoot announce={announce}>
      <EmptyStateIndicator>
        <StarIcon />
      </EmptyStateIndicator>
      <EmptyStateTitle>No favorites</EmptyStateTitle>
      <EmptyStateDescription>Items you star appear here.</EmptyStateDescription>
      {withActions === true ? (
        <EmptyStateActions>
          <ButtonRoot>Browse</ButtonRoot>
          <ButtonRoot variant="plain">Learn more</ButtonRoot>
        </EmptyStateActions>
      ) : null}
    </EmptyStateRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("EmptyStateRoot", () => {
  it("renders all five parts with their contract on the real DOM", () => {
    const { container } = mount(<Fixture withActions />);

    for (const name of ["root", "indicator", "title", "description", "actions"]) {
      expect(queryPart(container, name), name).not.toBeNull();
    }
    const root = queryPart(container, "root");
    expect(root?.getAttribute("data-variant")).toBe("symbol");
    expect(root?.hasAttribute("role")).toBe(false);
    expect(queryPart(container, "indicator")?.getAttribute("aria-hidden")).toBe("true");
    expect(queryPart(container, "title")?.tagName).toBe("H2");
    expect(queryPart(container, "description")?.tagName).toBe("P");
  });

  it("exposes exactly the composed buttons to the tab order", () => {
    const { container } = mount(<Fixture withActions />);

    const focusables = container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]",
    );
    expect([...focusables].map((node) => node.textContent)).toEqual(["Browse", "Learn more"]);
    for (const name of ["root", "title", "description", "actions"]) {
      expect(queryPart(container, name)?.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("lets the consumer correct the heading level without losing the part", () => {
    // The text rides on the substituted element rather than on the part: a
    // heading is never empty, in the source as in the DOM. `useRender` lets the
    // substituted element's own children win, and the assertion below pins that.
    const { container } = mount(
      <EmptyStateRoot>
        <EmptyStateTitle render={<h3>Nothing here</h3>} />
      </EmptyStateRoot>,
    );

    const title = queryPart(container, "title");
    expect(title?.tagName).toBe("H3");
    expect(title?.textContent).toBe("Nothing here");
    expect(title?.getAttribute("data-scope")).toBe("empty-state");
    expect(title?.getAttribute("data-part")).toBe("empty-state:title");
  });

  it("keeps the contract through a substituted root", () => {
    const { container } = mount(
      <EmptyStateRoot render={<section className="host" />} variant="circle">
        <EmptyStateTitle>Nothing here</EmptyStateTitle>
      </EmptyStateRoot>,
    );

    const root = queryPart(container, "root");
    expect(root?.tagName).toBe("SECTION");
    expect(root?.className).toBe("host");
    expect(root?.getAttribute("data-variant")).toBe("circle");
  });

  it("merges composed part identities as token lists", () => {
    // The token-list contract, proved inside this component's own scope: both
    // identities survive on one element, and the shared scope deduplicates
    // instead of doubling.
    const { container } = mount(
      <EmptyStateRoot>
        <EmptyStateTitle render={<EmptyStateDescription />}>Nothing here</EmptyStateTitle>
      </EmptyStateRoot>,
    );

    const composed = queryPart(container, "title");
    expect(composed?.getAttribute("data-part")?.split(" ").sort()).toEqual([
      "empty-state:description",
      "empty-state:title",
    ]);
    expect(composed?.getAttribute("data-scope")).toBe("empty-state");
  });

  it("renders the title-and-subtitle configuration with nothing left behind", () => {
    const { container } = mount(
      <EmptyStateRoot>
        <EmptyStateTitle>All caught up</EmptyStateTitle>
        <EmptyStateDescription>New activity will show up here.</EmptyStateDescription>
      </EmptyStateRoot>,
    );

    expect(queryPart(container, "indicator")).toBeNull();
    expect(queryPart(container, "actions")).toBeNull();
    expect(queryPart(container, "title")).not.toBeNull();
    expect(queryPart(container, "description")).not.toBeNull();
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<EmptyStateTitle />)).toThrow(/inside <EmptyStateRoot>/);
  });

  it("passes axe in the default configuration", async () => {
    // Mounted alone, so the h2 default meets a clean outline. In a host page
    // whose surrounding outline is deeper, `heading-order` is the consumer's to
    // satisfy through `render={<h3/>}` — that escape hatch is pinned above.
    const handle = mount(
      <main>
        <Fixture withActions />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes axe as an announced status region", async () => {
    const handle = mount(
      <main>
        <Fixture announce withActions />
      </main>,
    );

    expect(queryPart(handle.container, "root")?.getAttribute("role")).toBe("status");
    await expectNoAxeViolations(handle.container);
  });
});
