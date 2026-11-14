import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import { BadgeRoot } from "./badge";

function root(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="badge:root"]');
  if (node === null) throw new Error("the badge did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("BadgeRoot", () => {
  it("renders a span carrying the whole data contract", () => {
    const { container } = mount(<BadgeRoot kind="count" count={67} overlap />);
    const node = root(container);

    expect(node.tagName).toBe("SPAN");
    expect(node.getAttribute("data-scope")).toBe("badge");
    expect(node.getAttribute("data-kind")).toBe("count");
    expect(node.getAttribute("data-tone")).toBe("danger");
    expect(node.getAttribute("data-variant")).toBe("solid");
    expect(node.getAttribute("data-overlap")).toBe("");
    expect(node.textContent).toBe("67");
  });

  it("lets explicit children win over the display value", () => {
    const { container } = mount(
      <BadgeRoot kind="count" count={5}>
        cinq
      </BadgeRoot>,
    );

    expect(root(container).textContent).toBe("cinq");
  });

  it("lets DOM props through the split", () => {
    const { container } = mount(<BadgeRoot className="pill" id="inbox-badge" kind="dot" />);
    const node = root(container);

    expect(node.className).toBe("pill");
    expect(node.id).toBe("inbox-badge");
    expect(node.getAttribute("data-kind")).toBe("dot");
  });

  it("hides a count of 0 through the UA sheet, no design CSS required", () => {
    const { container } = mount(<BadgeRoot kind="count" count={0} />);
    const node = root(container);

    expect(node.hasAttribute("hidden")).toBe(true);
    expect(getComputedStyle(node).display).toBe("none");
  });

  it("composes without erasing anyone's part tokens", () => {
    const { container } = mount(
      <BadgeRoot render={<span data-scope="chip" data-part="chip:root" />}>NEW</BadgeRoot>,
    );
    const node = root(container);

    const scopes = (node.getAttribute("data-scope") ?? "").split(" ");
    const partTokens = (node.getAttribute("data-part") ?? "").split(" ");
    expect(scopes).toContain("badge");
    expect(scopes).toContain("chip");
    expect(partTokens).toContain("badge:root");
    expect(partTokens).toContain("chip:root");
  });

  it("a plain text label is clean for axe", async () => {
    const handle = mount(<BadgeRoot>Beta</BadgeRoot>);

    expect(root(handle.container).hasAttribute("role")).toBe(false);
    await expectNoAxeViolations(handle.container);
  });

  it("a labelled count replaces its lying text with the accessible name", async () => {
    const handle = mount(<BadgeRoot kind="count" count={120} max={99} label="3 notifications" />);
    const node = root(handle.container);

    expect(node.getAttribute("role")).toBe("img");
    expect(node.getAttribute("aria-label")).toBe("3 notifications");
    expect(node.textContent).toBe("99+");
    await expectNoAxeViolations(handle.container);
  });

  it("a mute dot is decoration, and axe agrees", async () => {
    const handle = mount(
      <button type="button" aria-label="Inbox, new activity" style={{ position: "relative" }}>
        Inbox
        <BadgeRoot kind="dot" overlap />
      </button>,
    );

    expect(root(handle.container).getAttribute("aria-hidden")).toBe("true");
    await expectNoAxeViolations(handle.container);
  });

  it("an unlabelled solid danger count is clean too", async () => {
    // The harness disables axe's color-contrast globally: no design stylesheet
    // is loaded here, so the rule would measure unstyled black on white. The
    // consigned risk this check would otherwise touch — white on the danger red
    // is 3.52:1 — is a sheet-level fact, owned by the styles' contrast suite.
    const handle = mount(<BadgeRoot kind="count" count={5} />);

    await expectNoAxeViolations(handle.container);
  });
});
