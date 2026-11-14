import type { CheckedState } from "@standarui/core/checkbox";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
} from "./checkbox";

function Box(props: {
  readonly checked?: CheckedState;
  readonly defaultChecked?: CheckedState;
  readonly disabled?: boolean;
  readonly onCheckedChange?: (details: { checked: CheckedState }) => void;
  readonly label?: string;
}): React.ReactNode {
  const { label = "Accept the terms", ...rest } = props;
  return (
    <CheckboxRoot {...rest}>
      <CheckboxHiddenInput />
      <CheckboxControl>
        <CheckboxIndicator />
      </CheckboxControl>
      <CheckboxLabel>{label}</CheckboxLabel>
    </CheckboxRoot>
  );
}

function input(container: HTMLElement): HTMLInputElement {
  const node = container.querySelector<HTMLInputElement>('[data-part~="checkbox:hidden-input"]');
  if (node === null) throw new Error("the checkbox did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("CheckboxRoot", () => {
  it("labels the input through the label element that wraps it", () => {
    const { container } = mount(<Box />);

    // The root is the <label>, so the accessible name comes for free.
    expect(container.querySelector('[data-part~="checkbox:root"]')?.tagName).toBe("LABEL");
    expect(input(container).labels?.[0]).toBe(
      container.querySelector('[data-part~="checkbox:root"]'),
    );
  });

  it("toggles once on a click anywhere in the row", () => {
    const onCheckedChange = vi.fn();
    const { container } = mount(<Box onCheckedChange={onCheckedChange} />);

    fire(() => container.querySelector<HTMLElement>('[data-part~="checkbox:label"]')?.click());

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  it("keeps React's controlled input honest", () => {
    function Controlled(): React.ReactNode {
      const [checked, setChecked] = useState<CheckedState>(false);
      return <Box checked={checked} onCheckedChange={(details) => setChecked(details.checked)} />;
    }
    const { container } = mount(<Controlled />);

    fire(() => input(container).click());

    expect(input(container).checked).toBe(true);
  });

  it("sets indeterminate as a property, which no attribute can do", () => {
    const { container } = mount(<Box defaultChecked="indeterminate" />);

    expect(input(container).indeterminate).toBe(true);
    expect(input(container).checked).toBe(false);
  });

  it("passes axe unchecked, checked, mixed and disabled", async () => {
    const handle = mount(
      <main>
        <Box label="Unchecked" />
        <Box label="Checked" defaultChecked />
        <Box label="Mixed" defaultChecked="indeterminate" />
        <Box label="Disabled" disabled />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
