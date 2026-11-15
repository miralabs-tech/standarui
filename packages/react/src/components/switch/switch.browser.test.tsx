import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import { Switch } from "./composed";
import { SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot, SwitchThumb } from "./switch";

function Toggle(props: {
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange?: (details: { checked: boolean }) => void;
  readonly label?: string;
  readonly size?: "sm" | "md";
}): React.ReactNode {
  const { label = "Wi-Fi", ...rest } = props;
  return (
    <SwitchRoot {...rest}>
      <SwitchHiddenInput />
      <SwitchLabel>{label}</SwitchLabel>
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}

function input(container: HTMLElement): HTMLInputElement {
  const node = container.querySelector<HTMLInputElement>('[data-part~="switch:hidden-input"]');
  if (node === null) throw new Error("the switch did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("SwitchRoot", () => {
  it("announces itself as a switch", () => {
    const { container } = mount(<Toggle />);

    expect(input(container).getAttribute("role")).toBe("switch");
    expect(input(container).checked).toBe(false);
  });

  it("toggles on a click and reports once", () => {
    const onCheckedChange = vi.fn();
    const { container } = mount(<Toggle onCheckedChange={onCheckedChange} />);

    fire(() => input(container).click());

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  it("follows a controlled value back down", () => {
    const handle = mount(<Toggle checked={false} />);

    handle.render(<Toggle checked />);

    expect(input(handle.container).checked).toBe(true);
    expect(
      handle.container.querySelector('[data-part~="switch:root"]')?.getAttribute("data-state"),
    ).toBe("checked");
  });

  it("turns size into data-size on the root and never into an attribute", () => {
    const small = mount(<Toggle size="sm" />);
    const root = small.container.querySelector('[data-part~="switch:root"]');

    expect(root?.getAttribute("data-size")).toBe("sm");
    expect(root?.hasAttribute("size")).toBe(false);

    const composed = mount(<Switch size="sm" label="Wi-Fi" />);
    const composedRoot = composed.container.querySelector('[data-part~="switch:root"]');

    expect(composedRoot?.getAttribute("data-size")).toBe("sm");
    expect(composedRoot?.hasAttribute("size")).toBe(false);
  });

  it("defaults to the md size", () => {
    const { container } = mount(<Toggle />);

    expect(container.querySelector('[data-part~="switch:root"]')?.getAttribute("data-size")).toBe(
      "md",
    );
  });

  it("passes axe on and off, enabled and disabled", async () => {
    const handle = mount(
      <main>
        <Toggle label="Off" />
        <Toggle label="On" defaultChecked />
        <Toggle label="Unavailable" disabled />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
