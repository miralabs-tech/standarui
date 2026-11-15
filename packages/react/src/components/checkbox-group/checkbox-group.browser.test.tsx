import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
} from "../checkbox/checkbox";
import { CheckboxGroupLabel, CheckboxGroupRoot } from "./checkbox-group";

interface Item {
  readonly value: string;
  readonly disabled?: boolean;
}

const ITEMS: readonly Item[] = [{ value: "mail" }, { value: "sms" }, { value: "push" }];

function Box(props: {
  readonly value?: string | undefined;
  readonly disabled?: boolean | undefined;
}): React.ReactNode {
  return (
    <CheckboxRoot value={props.value} disabled={props.disabled}>
      <CheckboxHiddenInput />
      <CheckboxControl>
        <CheckboxIndicator />
      </CheckboxControl>
      <CheckboxLabel>{props.value ?? "All"}</CheckboxLabel>
    </CheckboxRoot>
  );
}

function Alerts(props: {
  readonly items?: readonly Item[];
  readonly value?: readonly string[];
  readonly defaultValue?: readonly string[];
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly onValueChange?: (details: { value: readonly string[] }) => void;
  readonly summary?: boolean;
}): React.ReactNode {
  const { items = ITEMS, summary = true, ...rootProps } = props;
  return (
    <CheckboxGroupRoot {...rootProps}>
      <CheckboxGroupLabel>Alerts</CheckboxGroupLabel>
      {summary ? <Box /> : null}
      {items.map((item) => (
        <Box key={item.value} value={item.value} disabled={item.disabled} />
      ))}
    </CheckboxGroupRoot>
  );
}

function boxes(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('[data-part~="checkbox:hidden-input"]')];
}

/** The item boxes: the ones submitting under the group's name. */
function items(container: HTMLElement): HTMLInputElement[] {
  return boxes(container).filter((input) => input.name !== "");
}

function summary(container: HTMLElement): HTMLInputElement {
  const input = boxes(container).find((box) => box.name === "");
  if (input === undefined) throw new Error("no summary box");
  return input;
}

afterEach(() => {
  unmountAll();
});

describe("CheckboxGroupRoot", () => {
  it("submits its items as one field, and the summary as nothing", () => {
    const { container } = mount(<Alerts />);

    expect(new Set(items(container).map((input) => input.name)).size).toBe(1);
    expect(items(container).map((input) => input.value)).toEqual(["mail", "sms", "push"]);
    expect(summary(container).name).toBe("");
    expect(
      container.querySelector('[data-part~="checkbox-group:root"]')?.getAttribute("role"),
    ).toBe("group");
  });

  it("keeps every box its own tab stop — a group is not a composite", () => {
    const { container } = mount(<Alerts />);

    expect(items(container).map((input) => input.tabIndex)).toEqual([0, 0, 0]);
  });

  it("stacks by default and lays out in columns when asked", () => {
    const { container } = mount(<Alerts />);
    expect(
      container
        .querySelector('[data-part~="checkbox-group:root"]')
        ?.getAttribute("data-orientation"),
    ).toBe("vertical");

    const wide = mount(
      <CheckboxGroupRoot orientation="horizontal" aria-label="Alerts">
        <Box value="mail" />
      </CheckboxGroupRoot>,
    );
    expect(
      wide.container
        .querySelector('[data-part~="checkbox-group:root"]')
        ?.getAttribute("data-orientation"),
    ).toBe("horizontal");
  });

  it("reports the values it collected", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Alerts onValueChange={onValueChange} />);

    fire(() => items(container)[0]?.click());
    fire(() => items(container)[2]?.click());

    expect(onValueChange).toHaveBeenLastCalledWith({ value: ["mail", "push"] });
  });

  it("summarises none, some and all", () => {
    const { container } = mount(<Alerts />);
    expect(summary(container).checked).toBe(false);
    expect(summary(container).indeterminate).toBe(false);

    fire(() => items(container)[1]?.click());
    expect(summary(container).indeterminate).toBe(true);

    fire(() => items(container)[0]?.click());
    fire(() => items(container)[2]?.click());
    expect(summary(container).indeterminate).toBe(false);
    expect(summary(container).checked).toBe(true);
  });

  it("checks and clears everything from the summary", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Alerts onValueChange={onValueChange} />);

    fire(() => summary(container).click());
    expect(items(container).map((input) => input.checked)).toEqual([true, true, true]);

    fire(() => summary(container).click());
    expect(items(container).map((input) => input.checked)).toEqual([false, false, false]);
  });

  // The Phase 4 audit's shape: a disabled item, first in the list.
  it("never lets the summary reach a box the user cannot", () => {
    const list = [{ value: "mail", disabled: true }, { value: "sms" }, { value: "push" }] as const;
    const onValueChange = vi.fn();
    const { container } = mount(<Alerts items={list} onValueChange={onValueChange} />);

    fire(() => summary(container).click());

    expect(onValueChange).toHaveBeenLastCalledWith({ value: ["sms", "push"] });
    expect(items(container)[0]?.checked).toBe(false);
    // Everything reachable is checked, so the summary is checked — not stuck on
    // "mixed" over a box nobody can resolve.
    expect(summary(container).indeterminate).toBe(false);
    expect(summary(container).checked).toBe(true);
  });

  it("cannot be summarised when nothing is reachable", () => {
    const { container } = mount(<Alerts items={[{ value: "mail", disabled: true }]} />);

    expect(summary(container).disabled).toBe(true);
  });

  it("follows a controlled value back down", () => {
    const handle = mount(<Alerts value={["mail"]} />);

    handle.render(<Alerts value={["mail", "push"]} />);

    expect(items(handle.container).map((input) => input.checked)).toEqual([true, false, true]);
    expect(summary(handle.container).indeterminate).toBe(true);
  });

  it("does not point at a label it never rendered", () => {
    const { container } = mount(
      <CheckboxGroupRoot aria-label="Alerts">
        <Box value="mail" />
      </CheckboxGroupRoot>,
    );
    const root = container.querySelector('[data-part~="checkbox-group:root"]');

    expect(root?.hasAttribute("aria-labelledby")).toBe(false);
    expect(root?.getAttribute("aria-label")).toBe("Alerts");
  });

  it("leaves a checkbox outside a group entirely alone", () => {
    const { container } = mount(<Box value="mail" />);

    // No group, no name imposed: the checkbox keeps its own defaults.
    expect(boxes(container)[0]?.value).toBe("mail");
    expect(boxes(container)[0]?.name).toBe("");
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<CheckboxGroupLabel />)).toThrow(/inside <CheckboxGroupRoot>/);
  });

  it("passes axe — required, invalid, disabled, and mixed", async () => {
    const handle = mount(
      <main>
        <Alerts required defaultValue={["mail"]} />
        <Alerts invalid />
        <Alerts disabled />
        <Alerts summary={false} items={[{ value: "mail", disabled: true }]} />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
