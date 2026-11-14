import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./checkbox-group.connect";
import { machine } from "./checkbox-group.machine";
import type {
  CheckboxGroupApi,
  CheckboxGroupMachineProps,
  CheckboxGroupSchema,
} from "./checkbox-group.types";

type Api = CheckboxGroupApi<DomPropTypes>;

interface Item {
  readonly value: string;
  readonly disabled?: boolean;
}

const ITEMS: readonly Item[] = [{ value: "mail" }, { value: "sms" }, { value: "push" }];

/**
 * The boxes are written as plain `<input type="checkbox">`, not as parts of this
 * component — which is the point. The group has two parts and finds its items by
 * the name they submit under, so anything that submits under that name is an
 * item, and the summary box, which submits nothing, is not.
 *
 * `checked` and `disabled` are set as properties rather than through `apply`:
 * once a real click has dirtied an input, the attribute no longer moves the
 * property, and a framework adapter writes the property for the same reason.
 */
function render(
  props: CheckboxGroupMachineProps = {},
  items: readonly Item[] = ITEMS,
  withLabel = true,
) {
  const box = '<label><input type="checkbox" /></label>';
  return mountMachine<CheckboxGroupSchema, Api>({
    machine,
    connect,
    html: `<div>${withLabel ? "<span></span>" : ""}${box}${items.map(() => box).join("")}</div>`,
    id: "g1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      const offset = withLabel ? 1 : 0;
      if (withLabel) apply(root.children[0] as Element, api.getLabelProps());

      const summary = (root.children[offset] as HTMLElement).firstElementChild as HTMLInputElement;
      summary.checked = api.parentChecked === true;
      summary.indeterminate = api.parentChecked === "indeterminate";
      summary.disabled = api.parentDisabled;
      apply(summary, { onChange: () => api.toggleAll(!(api.parentChecked === true)) });

      items.forEach((item, index) => {
        const label = root.children[offset + 1 + index];
        // A box the test removed is a box a framework would no longer paint.
        if (label === undefined) return;
        const input = label.firstElementChild as HTMLInputElement;
        input.name = api.name;
        input.value = item.value;
        input.checked = api.isChecked(item.value);
        input.disabled = api.disabled || item.disabled === true;
        apply(input, { onChange: () => api.toggleValue(item.value) });
      });
    },
  });
}

function itemInputs(harness: ReturnType<typeof render>): HTMLInputElement[] {
  return [...harness.host.querySelectorAll<HTMLInputElement>("input[name]")].filter(
    (input) => input.name !== "",
  );
}

function summaryInput(harness: ReturnType<typeof render>): HTMLInputElement {
  const input = harness.host.querySelector<HTMLInputElement>('input:not([name]), input[name=""]');
  if (input === null) throw new Error("no summary box");
  return input;
}

afterEach(() => {
  unmountAll();
});

describe("checkbox-group", () => {
  it("is a group of independent boxes, named by its own label", () => {
    const harness = render();
    const root = harness.part("root");

    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby")).toBe("checkbox-group:g1:label");
    // No roving: every box keeps its own tab stop, which is the APG pattern.
    expect(itemInputs(harness).map((input) => input.tabIndex)).toEqual([0, 0, 0]);
  });

  it("in its minimal form names nothing it did not render", () => {
    const harness = render({}, ITEMS, false);

    expect(harness.part("root").hasAttribute("aria-labelledby")).toBe(false);
  });

  it("gives every item the group's name, and the summary none", () => {
    const harness = render();

    expect(new Set(itemInputs(harness).map((input) => input.name))).toEqual(
      new Set(["checkbox-group:g1:root"]),
    );
    expect(summaryInput(harness).name).toBe("");
    expect(harness.part("root").style.getPropertyValue("--sui-item-count")).toBe("3");
  });

  it("takes the name it is given", () => {
    const harness = render({ name: "alerts" });

    expect(itemInputs(harness)[0]?.name).toBe("alerts");
  });

  it("collects checked values as one field", () => {
    const onValueChange = vi.fn();
    const harness = render({ onValueChange });

    itemInputs(harness)[0]?.click();
    itemInputs(harness)[2]?.click();

    expect(onValueChange).toHaveBeenLastCalledWith({ value: ["mail", "push"] });
    expect(harness.api().value).toEqual(["mail", "push"]);

    itemInputs(harness)[0]?.click();
    expect(harness.api().value).toEqual(["push"]);
  });

  it("summarises none, some and all", () => {
    const harness = render();
    expect(harness.api().parentChecked).toBe(false);

    itemInputs(harness)[1]?.click();
    expect(harness.api().parentChecked).toBe("indeterminate");
    expect(summaryInput(harness).indeterminate).toBe(true);

    itemInputs(harness)[0]?.click();
    itemInputs(harness)[2]?.click();
    expect(harness.api().parentChecked).toBe(true);
    expect(summaryInput(harness).indeterminate).toBe(false);
    expect(summaryInput(harness).checked).toBe(true);
  });

  it("checks and clears everything the user could have reached", () => {
    const harness = render();

    summaryInput(harness).click();
    expect(harness.api().value).toEqual(["mail", "sms", "push"]);

    summaryInput(harness).click();
    expect(harness.api().value).toEqual([]);
  });

  // The rule the whole component turns on, and the shape the Phase 4 audit says
  // to test: a disabled item, first in the list.
  it("leaves a disabled item out of the summary and out of select-all", () => {
    const items = [{ value: "mail", disabled: true }, { value: "sms" }, { value: "push" }] as const;
    const harness = render({}, items);

    expect(harness.api().parentChecked).toBe(false);

    summaryInput(harness).click();
    // Selecting all must not flip a box the user cannot flip.
    expect(harness.api().value).toEqual(["sms", "push"]);
    // And with everything reachable checked, the summary is checked — not stuck
    // on "mixed" over a box nobody can resolve.
    expect(harness.api().parentChecked).toBe(true);
  });

  it("keeps a disabled item's value through select-all and clear-all", () => {
    const items = [{ value: "mail", disabled: true }, { value: "sms" }] as const;
    const harness = render({ defaultValue: ["mail"] }, items);

    // Checked, disabled, and none of the summary's business either way.
    expect(harness.api().parentChecked).toBe(false);

    summaryInput(harness).click();
    expect(harness.api().value).toEqual(["mail", "sms"]);

    summaryInput(harness).click();
    expect(harness.api().value).toEqual(["mail"]);
  });

  it("says it cannot be summarised when nothing is reachable", () => {
    const harness = render({}, [{ value: "mail", disabled: true }]);

    expect(harness.api().parentDisabled).toBe(true);
    expect(summaryInput(harness).disabled).toBe(true);
  });

  it("re-reads its items when one is rendered away", async () => {
    const harness = render({ defaultValue: ["mail", "sms", "push"] });
    expect(harness.api().parentChecked).toBe(true);

    itemInputs(harness)[2]?.closest("label")?.remove();
    // The observer fires on a microtask, and the sync it sends settles with it.
    await vi.waitFor(() => {
      expect(harness.part("root").style.getPropertyValue("--sui-item-count")).toBe("2");
    });
    expect(harness.api().parentChecked).toBe(true);
  });

  it("refuses to change while read-only", () => {
    const onValueChange = vi.fn();
    const harness = render({ readOnly: true, defaultValue: ["sms"], onValueChange });

    harness.api().toggleValue("mail");
    harness.api().toggleAll(true);

    expect(onValueChange).not.toHaveBeenCalled();
    expect(harness.api().value).toEqual(["sms"]);
    expect(harness.part("root").getAttribute("data-readonly")).toBe("");
  });

  it("says required without lying to the accessibility tree", () => {
    const harness = render({ required: true });
    const root = harness.part("root");

    expect(root.getAttribute("data-required")).toBe("");
    // `aria-required` is not allowed on `role="group"`, and `required` on the
    // boxes would demand every one of them instead of at least one.
    expect(root.hasAttribute("aria-required")).toBe(false);
    expect(itemInputs(harness).every((input) => !input.required)).toBe(true);
  });

  it("disables every box with the group", () => {
    const harness = render({ disabled: true });

    expect(harness.part("root").getAttribute("aria-disabled")).toBe("true");
    expect(itemInputs(harness).every((input) => input.disabled)).toBe(true);
    expect(harness.api().parentDisabled).toBe(true);
  });

  it("reports without writing while controlled", () => {
    const onValueChange = vi.fn();
    const harness = render({ value: ["mail"], onValueChange });

    itemInputs(harness)[1]?.click();

    expect(onValueChange).toHaveBeenCalledWith({ value: ["mail", "sms"] });
    expect(harness.api().value).toEqual(["mail"]);

    harness.setProps({ value: ["mail", "sms"] });
    expect(harness.api().value).toEqual(["mail", "sms"]);
  });
});
