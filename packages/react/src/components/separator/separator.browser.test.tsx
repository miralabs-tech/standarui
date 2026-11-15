import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import { SeparatorRoot } from "./separator";

function root(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="separator:root"]');
  if (node === null) throw new Error("the separator did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("SeparatorRoot", () => {
  it("renders a semantic separator", () => {
    const { container } = mount(<SeparatorRoot />);

    expect(root(container).getAttribute("role")).toBe("separator");
    expect(root(container).getAttribute("data-orientation")).toBe("horizontal");
  });

  it("substitutes an <hr> without losing the contract", () => {
    const { container } = mount(<SeparatorRoot render={<hr />} className="rule" />);

    expect(root(container).tagName).toBe("HR");
    expect(root(container).className).toBe("rule");
  });

  it("keeps a decorative rule out of the accessibility tree", async () => {
    const handle = mount(
      <main>
        <p>Before</p>
        <SeparatorRoot decorative />
        <p>After</p>
        <SeparatorRoot orientation="vertical" />
      </main>,
    );

    expect(root(handle.container).getAttribute("aria-hidden")).toBe("true");
    await expectNoAxeViolations(handle.container);
  });
});
