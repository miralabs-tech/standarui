/**
 * The React layer of the link. The machine's behaviour is covered by the core's
 * own browser test; what is tested here is what the adapter adds — the element it
 * renders, what it infers from a substitution, the merge with the consumer's own
 * props, and the a11y of what actually lands in the document.
 *
 * Every link that gets clicked points at a fragment. A real path would navigate
 * the test page away mid-suite, which is not a failure any assertion could
 * describe afterwards.
 */

import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, queryPart, unmountAll } from "../../render-harness";
import { LinkExternalIcon, LinkExternalLabel, LinkRoot, useLink } from "./link";

function root(container: HTMLElement): HTMLElement {
  const node = queryPart(container, "link:root");
  if (node === null) throw new Error("the link did not render");
  return node;
}

/** Stands in for a router's `Link`: a component, and it renders an anchor. */
function RouterLink({ to, ...rest }: ComponentProps<"a"> & { to: string }): ReactNode {
  return <a href={to} data-router="" {...rest} />;
}

const ExternalGlyph = (): ReactNode => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

afterEach(() => {
  unmountAll();
});

describe("LinkRoot", () => {
  it("renders a native anchor with the machine's contract on it", () => {
    const { container } = mount(
      <LinkRoot id="docs" href="#docs">
        Documentation
      </LinkRoot>,
    );
    const node = root(container);

    expect(node.tagName).toBe("A");
    expect(node.id).toBe("docs");
    expect(node.getAttribute("href")).toBe("#docs");
    expect(node.getAttribute("data-variant")).toBe("tint");
    expect(node.getAttribute("data-underline")).toBe("hover");
    // A real, enabled anchor already is a link: nothing to restate.
    expect(node.hasAttribute("role")).toBe(false);
    expect(node.hasAttribute("tabindex")).toBe(false);
  });

  it("observes a click without taking the navigation away from the browser", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <LinkRoot href="#target" onPress={onPress}>
        Docs
      </LinkRoot>,
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    fire(() => root(container).dispatchEvent(event));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps the consumer's own props and merges them the documented way", () => {
    const onClick = vi.fn();
    const { container } = mount(
      <LinkRoot href="#target" className="app-link" referrerPolicy="no-referrer" onClick={onClick}>
        Docs
      </LinkRoot>,
    );
    const node = root(container);

    expect(node.className).toBe("app-link");
    // Not a core prop on purpose: the machine only claims what it has to control.
    expect(node.getAttribute("referrerpolicy")).toBe("no-referrer");

    fire(() => node.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets the consumer's handler veto the machine's", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <LinkRoot href="#target" onPress={onPress} onClick={(event) => event.preventDefault()}>
        Docs
      </LinkRoot>,
    );

    fire(() => root(container).click());

    expect(onPress).not.toHaveBeenCalled();
  });

  it("composes onto a substituted anchor, both identities in the token lists", () => {
    const { container } = mount(
      <LinkRoot href="#target" render={<a href="#target" data-part="nav:item" data-scope="nav" />}>
        Docs
      </LinkRoot>,
    );
    const node = root(container);

    // Both spellings name the same destination, so the merge order cannot make
    // this anchor point somewhere else — or nowhere.
    expect(node.getAttribute("href")).toBe("#target");
    expect(node.getAttribute("data-part")?.split(" ").sort()).toEqual(["link:root", "nav:item"]);
    expect(node.getAttribute("data-scope")?.split(" ").sort()).toEqual(["link", "nav"]);
    // Still the native path: a substituted `<a>` is an `<a>`.
    expect(node.hasAttribute("role")).toBe(false);
  });

  it("treats a router's component as the anchor it renders", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <LinkRoot current="page" onPress={onPress} render={<RouterLink to="#route" />}>
        Dashboard
      </LinkRoot>,
    );
    const node = root(container);

    // The href is the router's — the machine has none to strip or to impose.
    expect(node.getAttribute("href")).toBe("#route");
    expect(node.hasAttribute("data-router")).toBe(true);
    expect(node.getAttribute("aria-current")).toBe("page");
    expect(node.getAttribute("data-current")).toBe("page");
    // Inferred native: a component renders an anchor far more often than not, and
    // guessing otherwise would double-fire Enter.
    expect(node.hasAttribute("role")).toBe(false);

    fire(() => node.click());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("infers a substituted root from an intrinsic element that is not an anchor", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <LinkRoot onPress={onPress} render={<span />}>
        Docs
      </LinkRoot>,
    );
    const node = root(container);

    expect(node.tagName).toBe("SPAN");
    expect(node.getAttribute("role")).toBe("link");
    expect(node.getAttribute("tabindex")).toBe("0");

    // Enter produces no native click on a span, so the connect stands in — once.
    fire(() => {
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    // And the pointer path stays the other one: no double fire on a tap.
    fire(() => node.click());
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("takes the consumer's word over its own inference", () => {
    const { container } = mount(
      <LinkRoot nativeLink={false} href="#target">
        Docs
      </LinkRoot>,
    );

    expect(root(container).getAttribute("role")).toBe("link");
  });

  it("strips the href while disabled and refuses the click anyway", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <LinkRoot href="#target" disabled onPress={onPress}>
        Docs
      </LinkRoot>,
    );
    const node = root(container);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    expect(node.hasAttribute("href")).toBe(false);
    expect(node.getAttribute("role")).toBe("link");
    expect(node.getAttribute("aria-disabled")).toBe("true");

    fire(() => node.dispatchEvent(event));

    // The belt over the strip, for a composition carrying an href of its own.
    expect(event.defaultPrevented).toBe(true);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("hardens an external link and folds its label into the accessible name", () => {
    const { container } = mount(
      <LinkRoot href="#spec" external>
        The specification
        <LinkExternalIcon>
          <ExternalGlyph />
        </LinkExternalIcon>
        <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>,
    );
    const node = root(container);
    const icon = queryPart(container, "link:external-icon");
    const label = queryPart(container, "link:external-label");

    expect(node.getAttribute("target")).toBe("_blank");
    expect(node.getAttribute("rel")).toBe("noopener noreferrer");
    expect(node.getAttribute("data-external")).toBe("");

    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.hidden).toBe(false);
    expect(icon?.querySelector("svg")).not.toBeNull();

    // Inside the anchor, and not hidden from the tree: it joins the name with no
    // `aria-describedby` to keep in sync.
    expect(label?.hidden).toBe(false);
    expect(label?.hasAttribute("aria-hidden")).toBe(false);
    expect(node.contains(label)).toBe(true);
    expect(node.textContent).toContain("(opens in a new tab)");
  });

  it("keeps both companion parts out of the tree while the link is internal", () => {
    const { container } = mount(
      <LinkRoot href="#docs">
        Docs
        <LinkExternalIcon>
          <ExternalGlyph />
        </LinkExternalIcon>
        <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>,
    );

    expect(queryPart(container, "link:external-icon")?.hidden).toBe(true);
    expect(queryPart(container, "link:external-label")?.hidden).toBe(true);
    expect(root(container).hasAttribute("data-external")).toBe(false);
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>)).toThrow(
      /inside <LinkRoot>/,
    );
  });

  it("passes axe in every state it can be in", async () => {
    const handle = mount(
      <main>
        <nav aria-label="Sections">
          <LinkRoot href="/overview" current="page">
            Overview
          </LinkRoot>
          <LinkRoot href="/settings">Settings</LinkRoot>
        </nav>
        <LinkRoot href="/docs" disabled>
          Documentation, for now unavailable
        </LinkRoot>
        <LinkRoot href="/docs" disabled focusableWhenDisabled>
          Documentation, reachable while unavailable
        </LinkRoot>
        <LinkRoot href="https://example.com/spec" external>
          The specification
          <LinkExternalIcon>
            <ExternalGlyph />
          </LinkExternalIcon>
          <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
        </LinkRoot>
        <LinkRoot render={<span />}>A link that is not an anchor</LinkRoot>
        {/* In prose the tint alone cannot carry 3:1 against the text it sits in,
            so a link in a text block is always underlined. */}
        <p>
          The rules are set out in{" "}
          <LinkRoot href="/charter" underline="always">
            the charter
          </LinkRoot>{" "}
          and nowhere else.
        </p>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});

describe("useLink", () => {
  it("hands back the prop getters for a consumer who would rather place them", () => {
    function Custom(): ReactNode {
      const api = useLink({ id: "custom", variant: "plain", href: "#docs" });
      return <a {...api.getRootProps()}>Docs</a>;
    }
    const { container } = mount(<Custom />);
    const node = root(container);

    expect(node.getAttribute("data-variant")).toBe("plain");
    // `plain` rides the colour of its text, so it has to carry an underline or it
    // is not identifiable as a link at all.
    expect(node.getAttribute("data-underline")).toBe("always");
  });
});
