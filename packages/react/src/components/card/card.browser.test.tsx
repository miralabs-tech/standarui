/**
 * The card through React: only what an adapter can get wrong. The connect's
 * output — variants, the on-glass declaration, the absence of any role — is
 * settled in `packages/core/src/components/card/card.test.ts` and is not
 * re-litigated here. What is here is composition (`render` keeping both
 * identities), the tab order the card must not touch, and axe over the shapes
 * the DoD asks for. No presence and no motion tests: nothing animates.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import { ButtonRoot } from "../button/button";
import {
  CardAction,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./card";

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="card:${name}"]`);
  if (node === null) throw new Error(`no card part "${name}"`);
  return node;
}

const PART_NAMES = ["root", "header", "title", "description", "action", "body", "footer"] as const;

function Scene(): ReactNode {
  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>Weekly report</CardTitle>
        <CardDescription>Every project, one page.</CardDescription>
        <CardAction>
          <button type="button">Share</button>
        </CardAction>
      </CardHeader>
      <CardBody>Twelve projects moved this week.</CardBody>
      <CardFooter>
        <button type="button">Open</button>
      </CardFooter>
    </CardRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("Card — what the adapter adds", () => {
  it("renders all seven parts, with a native heading and a native paragraph", () => {
    const { container } = mount(<Scene />);

    for (const name of PART_NAMES) {
      expect(part(container, name)).toBeTruthy();
    }
    expect(part(container, "title").tagName).toBe("H3");
    expect(part(container, "description").tagName).toBe("P");
    expect(part(container, "root").getAttribute("data-variant")).toBe("raised");
  });

  it("substitutes a list item on the root without losing the contract", () => {
    const { container } = mount(
      <ul>
        <CardRoot render={<li className="cell" />} variant="filled">
          <CardBody>A project</CardBody>
        </CardRoot>
      </ul>,
    );

    const root = part(container, "root");
    expect(root.tagName).toBe("LI");
    expect(root.className).toBe("cell");
    expect(root.getAttribute("data-variant")).toBe("filled");
  });

  it("substitutes the heading level while staying stylable", () => {
    // The text rides on the substituted element rather than on the part: a
    // heading is never empty, in the source as in the DOM. `useRender` lets the
    // substituted element's own children win, and the assertion below pins that.
    const { container } = mount(
      <CardRoot>
        <CardHeader>
          <CardTitle render={<h2>Top-level card</h2>} />
        </CardHeader>
      </CardRoot>,
    );

    const title = part(container, "title");
    expect(title.tagName).toBe("H2");
    expect(title.textContent).toBe("Top-level card");
    expect(title.getAttribute("data-part")).toContain("card:title");
  });

  it("neither reorders its focusables nor introduces any tabindex", () => {
    const { container } = mount(<Scene />);

    expect(container.querySelectorAll("[tabindex]").length).toBe(0);

    // `querySelectorAll` walks in document order, so this list *is* the tab
    // order native focus will follow — untouched authoring order.
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((node) => node.textContent)).toEqual(["Share", "Open"]);
  });

  it("passes axe as a grid of the four variants", async () => {
    const handle = mount(
      <main style={{ background: "linear-gradient(135deg, #1c355e, #7a4a21)" }}>
        <h2>Projects</h2>
        <div style={{ display: "grid", gap: 16 }}>
          {(["raised", "filled", "inset", "glass"] as const).map((variant) => (
            <CardRoot key={variant} variant={variant}>
              <CardHeader>
                <CardTitle>{variant}</CardTitle>
                <CardDescription>One variant of the same anatomy.</CardDescription>
              </CardHeader>
              <CardBody>The surface changes, the structure does not.</CardBody>
            </CardRoot>
          ))}
        </div>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes axe with heterogeneous composed content", async () => {
    const handle = mount(
      <main>
        <h2>Gates</h2>
        <CardRoot>
          <CardHeader>
            <CardTitle>Release gate</CardTitle>
            <CardAction>
              <ButtonRoot variant="gray">Review</ButtonRoot>
            </CardAction>
          </CardHeader>
          <CardBody>
            <div role="alert">Two checks are failing.</div>
            <a href="https://example.com">See the run</a>
          </CardBody>
          <CardFooter>
            <ButtonRoot>Resume</ButtonRoot>
          </CardFooter>
        </CardRoot>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("keeps the heading order clean under a page-level h2", async () => {
    const handle = mount(
      <main>
        <h2>Home</h2>
        {["First", "Second"].map((name) => (
          <CardRoot key={name}>
            <CardHeader>
              <CardTitle>{name}</CardTitle>
            </CardHeader>
            <CardBody>A card is a repeated unit, so its default heading is an h3.</CardBody>
          </CardRoot>
        ))}
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
