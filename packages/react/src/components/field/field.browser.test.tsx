/**
 * The adapter's half of `field`, and the half the core cannot reach.
 *
 * `field.browser.test.ts` in the core already holds the machine's DOM contract —
 * which ids `aria-describedby` may name, when `for` is dropped, what the
 * announcer says. None of that is repeated here. What it cannot see is the one
 * decision this layer makes on its own: `group` picks *elements*, not
 * attributes. `FieldRoot` renders a `<fieldset>` instead of a `<div>` and
 * `<Field>` renders a `<legend>` instead of a `<label>`, and a fieldset named by
 * a `<label>` is invalid HTML that reads as an unnamed group.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import { InputControl, InputRoot } from "../input/input";
import { Field } from "./composed";
import { FieldLabel, FieldRoot } from "./field";

function part(container: HTMLElement, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="field:${name}"]`);
  if (node === null) throw new Error(`the field did not render its ${name}`);
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("FieldRoot", () => {
  it("renders a div for one control and a fieldset for a group", () => {
    const single = mount(
      <FieldRoot>
        <FieldLabel>Display name</FieldLabel>
        <InputRoot>
          <InputControl />
        </InputRoot>
      </FieldRoot>,
    );
    expect(part(single.container, "root").tagName).toBe("DIV");

    const group = mount(
      <FieldRoot group>
        <FieldLabel>Contact</FieldLabel>
        <InputRoot>
          <InputControl />
        </InputRoot>
      </FieldRoot>,
    );
    expect(part(group.container, "root").tagName).toBe("FIELDSET");
  });
});

describe("Field", () => {
  it("names one control with a label the pointer can hit", async () => {
    const { container } = mount(
      <Field label="Display name" helperText="Shown on your profile.">
        <InputRoot>
          <InputControl />
        </InputRoot>
      </Field>,
    );

    const label = part(container, "label");
    const control = container.querySelector("input");
    expect(label.tagName).toBe("LABEL");
    expect(control).not.toBeNull();

    // Awaited, and that is the contract rather than the test being slow: the
    // machine reads the control out of the DOM before it can point `for` at it,
    // so the first paint has a label with no target. Asserting synchronously
    // reads `null` from both sides and passes on a label that never connects.
    await vi.waitFor(() => {
      // `getAttribute` and not `htmlFor`, which answers `""` for an attribute
      // that was never written.
      expect(label.getAttribute("for")).toBe(control?.getAttribute("id"));
      expect(label.getAttribute("for")).not.toBeNull();
    });
    expect(control?.getAttribute("aria-describedby")).toBe(part(container, "helper-text").id);
  });

  it("captions a group with a legend rather than a label", () => {
    const { container } = mount(
      <Field group label="Contact">
        <InputRoot>
          <InputControl />
        </InputRoot>
      </Field>,
    );

    // The pair that has to move together: a `<label>` inside a `<fieldset>` is
    // not its caption, so picking one element without the other leaves the group
    // unnamed while every attribute still looks right.
    expect(part(container, "root").tagName).toBe("FIELDSET");
    expect(part(container, "label").tagName).toBe("LEGEND");
  });

  it("marks a required field beside its label, and defaults the glyph", () => {
    const { container } = mount(
      <Field required label="Display name">
        <InputRoot>
          <InputControl />
        </InputRoot>
      </Field>,
    );

    const indicator = part(container, "required-indicator");
    expect(indicator.textContent).toBe("*");
    expect(indicator.parentElement).toBe(part(container, "label"));
  });

  it("renders no label part at all when it is given none", () => {
    const { container } = mount(
      <Field>
        <InputRoot>
          <InputControl aria-label="Display name" />
        </InputRoot>
      </Field>,
    );

    expect(container.querySelector('[data-part~="field:label"]')).toBeNull();
  });

  it("is clean for axe, named and invalid, as a single control and as a group", async () => {
    const single = mount(
      <Field
        label="Display name"
        helperText="Shown on your profile."
        errorText="This name is taken."
        invalid
        required
      >
        <InputRoot>
          <InputControl />
        </InputRoot>
      </Field>,
    );
    await expectNoAxeViolations(single.container);

    // Audited in both shapes deliberately: the group swaps the root and the
    // caption for two different elements, so a violation can exist in one and
    // not the other.
    //
    // Two named controls and not one bare input, because that is what a group
    // is for. A `<legend>` names the *set*; every control inside still owes a
    // name of its own, and axe says so — which is the library behaving, not
    // failing.
    const group = mount(
      <Field group label="Contact" helperText="We will only use this to reach you.">
        <InputRoot>
          <InputControl aria-label="Email" />
        </InputRoot>
        <InputRoot>
          <InputControl aria-label="Phone" />
        </InputRoot>
      </Field>,
    );
    await expectNoAxeViolations(group.container);
  });
});
