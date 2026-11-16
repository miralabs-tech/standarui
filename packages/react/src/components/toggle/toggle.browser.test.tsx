import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import { ToggleIndicator, ToggleRoot } from "./toggle";

function root(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="toggle:root"]');
  if (node === null) throw new Error("the toggle did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("ToggleRoot", () => {
  it("renders the pressed state on both parts", () => {
    const { container } = mount(
      <ToggleRoot id="bold" defaultPressed>
        <ToggleIndicator />B
      </ToggleRoot>,
    );

    expect(root(container).getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[data-part~="toggle:indicator"]')?.getAttribute("data-state"),
    ).toBe("on");
  });

  it("toggles on a click", () => {
    const onPressedChange = vi.fn();
    const { container } = mount(<ToggleRoot onPressedChange={onPressedChange}>B</ToggleRoot>);

    fire(() => root(container).click());

    expect(onPressedChange).toHaveBeenCalledWith({ pressed: true });
    expect(root(container).getAttribute("data-state")).toBe("on");
  });

  it("stays controlled when the consumer owns the value", () => {
    const handle = mount(<ToggleRoot pressed={false}>B</ToggleRoot>);

    fire(() => root(handle.container).click());
    expect(root(handle.container).getAttribute("aria-pressed")).toBe("false");

    handle.render(<ToggleRoot pressed={true}>B</ToggleRoot>);
    expect(root(handle.container).getAttribute("aria-pressed")).toBe("true");
  });

  it("passes axe pressed, unpressed and disabled", async () => {
    const handle = mount(
      <main>
        <ToggleRoot>Bold</ToggleRoot>
        <ToggleRoot defaultPressed>
          <ToggleIndicator />
          Italic
        </ToggleRoot>
        <ToggleRoot disabled>Underline</ToggleRoot>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
