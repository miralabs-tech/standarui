/**
 * `field` and `input` together, because apart they are half a component: the
 * field owns the ids and the states, the control wears them.
 */

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { CheckboxControl, CheckboxHiddenInput, CheckboxRoot } from "../checkbox/checkbox";
import {
  FieldErrorText,
  FieldHelperText,
  FieldLabel,
  FieldLegend,
  FieldRequiredIndicator,
  FieldRoot,
} from "../field/field";
import { ToggleGroupItem, ToggleGroupLabel, ToggleGroupRoot } from "../toggle-group/toggle-group";
import { InputControl, InputRoot, InputTextarea, InputVisibilityTrigger } from "./input";

function part(container: HTMLElement, name: string): HTMLElement {
  const node = queryPart(container, name);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

function Email(props: {
  readonly invalid?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly withError?: boolean;
}): React.ReactNode {
  const { withError = true, ...field } = props;
  return (
    <FieldRoot {...field}>
      <FieldLabel>
        Email
        <FieldRequiredIndicator>*</FieldRequiredIndicator>
      </FieldLabel>
      <InputRoot type="email" name="email">
        <InputControl />
      </InputRoot>
      <FieldHelperText>We only use it to sign you in.</FieldHelperText>
      {withError ? <FieldErrorText>That address does not look right.</FieldErrorText> : null}
    </FieldRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("field + input", () => {
  it("labels the control and points the label at it", () => {
    const { container } = mount(<Email />);
    const control = part(container, "control");
    const label = container.querySelector<HTMLLabelElement>('[data-part~="field:label"]');

    expect(label?.htmlFor).toBe(control.id);
    expect(control.getAttribute("type")).toBe("email");
  });

  it("describes the control with the helper text, and only with what exists", () => {
    const { container } = mount(<Email withError={false} />);
    const described = part(container, "control").getAttribute("aria-describedby");

    expect(described).toBe(container.querySelector('[data-part~="field:helper-text"]')?.id);
    // Pointing at an error message that was never rendered is a dangling
    // reference, and axe is right to call it one.
    expect(described).not.toContain("error");
  });

  it("adds the error to the description only once the field is invalid", () => {
    const handle = mount(<Email />);
    expect(part(handle.container, "control").getAttribute("aria-describedby")).not.toContain(
      "error-text",
    );

    handle.render(<Email invalid />);

    const described = part(handle.container, "control").getAttribute("aria-describedby");
    expect(described?.startsWith(part(handle.container, "error-text").id)).toBe(true);
    expect(part(handle.container, "control").getAttribute("aria-invalid")).toBe("true");
  });

  it("hands the field's states down to the control", () => {
    const { container } = mount(<Email required disabled />);
    const control = part(container, "control") as HTMLInputElement;

    expect(control.required).toBe(true);
    expect(control.disabled).toBe(true);
    expect(part(container, "required-indicator").hidden).toBe(false);
  });

  it("hides the required marker from assistive technology — the control already says it", () => {
    const { container } = mount(<Email required />);

    expect(part(container, "required-indicator").getAttribute("aria-hidden")).toBe("true");
  });

  it("announces the error through a region that was already live", async () => {
    const handle = mount(<Email />);

    handle.render(<Email invalid />);

    // Not by making the error element a live region: one that is `hidden` until
    // it has something to say is not registered while hidden, so it appears
    // already populated — and a region that appears with its content is
    // announced by nobody.
    const error = part(handle.container, "error-text");
    expect(error.hasAttribute("aria-live")).toBe(false);
    expect(error.hasAttribute("role")).toBe(false);

    const region = document.querySelector('[data-sui-live-region="polite"]');
    await waitFor(() => {
      expect(region?.textContent).toBe("That address does not look right.");
    });
  });

  it("passes axe, valid and invalid", async () => {
    const handle = mount(
      <main>
        <Email />
        <Email invalid required />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});

describe("input", () => {
  it("reports what the user typed", () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <InputRoot onValueChange={onValueChange}>
        <InputControl aria-label="Name" />
      </InputRoot>,
    );
    const control = part(container, "control") as HTMLInputElement;

    fire(() => {
      control.value = "Ada";
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith({ value: "Ada" });
  });

  it("stays controlled when the consumer owns the value", () => {
    function Controlled(): React.ReactNode {
      const [value, setValue] = useState("a");
      return (
        <InputRoot value={value} onValueChange={(details) => setValue(details.value.toUpperCase())}>
          <InputControl aria-label="Loud" />
        </InputRoot>
      );
    }
    const { container } = mount(<Controlled />);
    const control = part(container, "control") as HTMLInputElement;

    fire(() => {
      control.value = "ab";
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(control.value).toBe("AB");
  });

  it("clears on Escape only when asked, and only when there is something to clear", () => {
    const { container } = mount(
      <InputRoot defaultValue="query" clearOnEscape>
        <InputControl aria-label="Search" />
      </InputRoot>,
    );
    const control = part(container, "control") as HTMLInputElement;

    fire(() => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(control.value).toBe("");

    // Empty already: Escape belongs to whatever is above, a popover or a dialog.
    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fire(() => control.dispatchEvent(second));
    expect(second.defaultPrevented).toBe(false);
  });

  it("forwards the autofill and keyboard hints it declares", () => {
    const { container } = mount(
      <InputRoot type="email" name="e" autoComplete="email" inputMode="email">
        <InputControl aria-label="Email" />
      </InputRoot>,
    );
    const control = part(container, "control");

    // Declaring a prop and then dropping it is worse than not having it: WCAG
    // 2.2 SC 1.3.5 rests on the first, and a phone keyboard on the second.
    expect(control.getAttribute("autocomplete")).toBe("email");
    expect(control.getAttribute("inputmode")).toBe("email");
  });

  it("keeps off the attribute the spatial engine owns", () => {
    const { container } = mount(
      <InputRoot>
        <InputControl aria-label="Name" />
      </InputRoot>,
    );
    const control = part(container, "control") as HTMLInputElement;

    fire(() => control.focus());

    // `data-snav-focused` is `@standarx/nav`'s spatial engine's, and the styles
    // lift it under a gamepad; nested elements claiming it would compound the
    // scale and break the engine's own "exactly one" assertion.
    expect(part(container, "root").getAttribute("data-focus")).toBe("");
    expect(control.getAttribute("data-focus")).toBe("");
    expect(part(container, "root").hasAttribute("data-snav-focused")).toBe(false);
    expect(control.hasAttribute("data-snav-focused")).toBe(false);
  });

  it("marks a search field as the one capsule among the fields, off its type alone", () => {
    const { container } = mount(
      <InputRoot type="search">
        <InputControl aria-label="Search" />
      </InputRoot>,
    );

    // Read off `type`, never off a second `variant` prop: `type="search"` is
    // already what makes it a search field for the browser, and a prop beside
    // it could only ever disagree with it (CDC §4.2).
    expect(part(container, "root").getAttribute("data-variant")).toBe("search");
    expect(part(container, "control").getAttribute("type")).toBe("search");
  });

  it("leaves every other field without the variant", () => {
    const { container } = mount(
      <InputRoot type="email">
        <InputControl aria-label="Email" />
      </InputRoot>,
    );

    expect(part(container, "root").hasAttribute("data-variant")).toBe(false);
  });

  it("renders a textarea from the same machine", () => {
    const { container } = mount(
      <InputRoot defaultValue="notes">
        <InputTextarea aria-label="Notes" />
      </InputRoot>,
    );

    expect(part(container, "control").tagName).toBe("TEXTAREA");
    expect((part(container, "control") as HTMLTextAreaElement).value).toBe("notes");
  });

  it("reveals a password without losing the caret, and says which state it is in", () => {
    const { container } = mount(
      <InputRoot type="password" name="password">
        <InputControl aria-label="Password" />
        <InputVisibilityTrigger>Show</InputVisibilityTrigger>
      </InputRoot>,
    );
    const control = part(container, "control") as HTMLInputElement;
    const trigger = part(container, "visibility-trigger") as HTMLButtonElement;

    expect(control.type).toBe("password");
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(control.id);
    // Reachable by keyboard: a reveal a keyboard user cannot operate is not one.
    expect(trigger.tabIndex).toBe(0);

    fire(() => trigger.click());

    expect(control.type).toBe("text");
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the caret in the field when the eye is clicked with a mouse", () => {
    const { container } = mount(
      <InputRoot type="password">
        <InputControl aria-label="Password" />
        <InputVisibilityTrigger>Show</InputVisibilityTrigger>
      </InputRoot>,
    );
    const trigger = part(container, "visibility-trigger");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fire(() => trigger.dispatchEvent(mouseDown));

    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("hides the reveal on anything that is not a password", () => {
    const { container } = mount(
      <InputRoot type="text">
        <InputControl aria-label="Name" />
        <InputVisibilityTrigger>Show</InputVisibilityTrigger>
      </InputRoot>,
    );

    expect(part(container, "visibility-trigger").hidden).toBe(true);
  });
});

describe("field, with the controls that are not an input", () => {
  it("wires a checkbox the same way it wires an input", () => {
    const { container } = mount(
      <FieldRoot required invalid>
        <FieldLabel>Terms</FieldLabel>
        <CheckboxRoot name="terms">
          <CheckboxHiddenInput />
          <CheckboxControl />
        </CheckboxRoot>
        <FieldErrorText>You have to accept them.</FieldErrorText>
      </FieldRoot>,
    );
    const input = part(container, "hidden-input") as HTMLInputElement;
    const label = container.querySelector<HTMLLabelElement>('[data-part~="field:label"]');

    // The field's label used to point at nothing, and none of its states
    // reached the control: `field` was the a11y hub of exactly one component.
    expect(label?.htmlFor).toBe(input.id);
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(part(container, "error-text").id);
  });

  it("lets a control that disabled itself stay disabled inside an enabled field", () => {
    const { container } = mount(
      <FieldRoot>
        <FieldLabel>Terms</FieldLabel>
        <CheckboxRoot disabled>
          <CheckboxHiddenInput />
          <CheckboxControl />
        </CheckboxRoot>
      </FieldRoot>,
    );

    // The reason the field's states are machine props and not merged output.
    expect((part(container, "hidden-input") as HTMLInputElement).disabled).toBe(true);
  });

  it("describes a radio group and a segmented control too", () => {
    const { container } = mount(
      <FieldRoot group invalid>
        <FieldLegend>Plan</FieldLegend>
        <ToggleGroupRoot>
          <ToggleGroupLabel>Billing</ToggleGroupLabel>
          <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
        </ToggleGroupRoot>
        <FieldErrorText>Pick one.</FieldErrorText>
      </FieldRoot>,
    );
    const error = part(container, "error-text").id;

    expect(
      container.querySelector('[data-part~="toggle-group:root"]')?.getAttribute("aria-describedby"),
    ).toBe(error);
  });
});

describe("fieldset", () => {
  it("becomes a real fieldset with a legend when it groups controls", async () => {
    const handle = mount(
      <main>
        <FieldRoot group>
          <FieldLegend>Contact</FieldLegend>
          <InputRoot name="first">
            <InputControl aria-label="First name" />
          </InputRoot>
          <InputRoot name="last">
            <InputControl aria-label="Last name" />
          </InputRoot>
        </FieldRoot>
      </main>,
    );

    expect(part(handle.container, "root").tagName).toBe("FIELDSET");
    expect(part(handle.container, "label").tagName).toBe("LEGEND");
    await expectNoAxeViolations(handle.container);
  });
});
