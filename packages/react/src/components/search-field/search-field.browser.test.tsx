/**
 * The React side of the search field: the landmark it renders, the row and the
 * capsule under it, the clear gesture, the cancel gesture beside the capsule,
 * the Escape it consumes and the one it lets through, and the shortcut a page
 * has to ask for.
 */

import { isSearchHotkey } from "@standarui/core/search-field";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavProvider, spatialPlugin, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { FieldLabel, FieldRoot } from "../field/field";
import {
  SearchFieldCancelTrigger,
  SearchFieldClearTrigger,
  SearchFieldControl,
  SearchFieldField,
  SearchFieldIndicator,
  SearchFieldRoot,
  type SearchFieldRootProps,
} from "./search-field";

function part(container: HTMLElement, name: string): HTMLElement {
  const node = queryPart(container, name);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

function Magnifier(): React.ReactNode {
  // An inline SVG, never a text glyph: a glyph's ink sits on its baseline rather
  // than in the middle of its box, and no amount of centring fixes that.
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M7 1a6 6 0 1 0 3.7 10.7l3.3 3.3 1.4-1.4-3.3-3.3A6 6 0 0 0 7 1Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
    </svg>
  );
}

function Cross(): React.ReactNode {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3 10.6-1.4 1.4L8 9.4 6.4 12 5 10.6 6.6 8 5 5.4 6.4 4 8 6.6 9.6 4 11 5.4 9.4 8 11 10.6Z" />
    </svg>
  );
}

function Field(props: SearchFieldRootProps): React.ReactNode {
  return (
    <SearchFieldRoot label="Search files" clearLabel="Clear search" {...props}>
      <SearchFieldField>
        <SearchFieldIndicator>
          <Magnifier />
        </SearchFieldIndicator>
        <SearchFieldControl placeholder="Search" />
        <SearchFieldClearTrigger>
          <Cross />
        </SearchFieldClearTrigger>
      </SearchFieldField>
    </SearchFieldRoot>
  );
}

/** The same field with the button drawn beside the capsule. */
function Cancellable(props: SearchFieldRootProps): React.ReactNode {
  return (
    <SearchFieldRoot label="Search files" clearLabel="Clear search" {...props}>
      <SearchFieldField>
        <SearchFieldIndicator>
          <Magnifier />
        </SearchFieldIndicator>
        <SearchFieldControl placeholder="Search" />
        <SearchFieldClearTrigger>
          <Cross />
        </SearchFieldClearTrigger>
      </SearchFieldField>
      <SearchFieldCancelTrigger />
    </SearchFieldRoot>
  );
}

function typeInto(control: HTMLInputElement, value: string): void {
  fire(() => {
    control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  unmountAll();
});

describe("search-field", () => {
  it("is a landmark around a native searchbox", () => {
    const { container } = mount(<Field />);

    const landmark = container.querySelector('[role="search"]');
    expect(landmark).toBe(part(container, "root"));
    expect(landmark?.getAttribute("aria-label")).toBe("Search files");

    const control = part(container, "control") as HTMLInputElement;
    expect(control.type).toBe("search");
    // The native role, never a hand-written one.
    expect(control.hasAttribute("role")).toBe(false);
    expect(control.getAttribute("aria-label")).toBe("Search files");
  });

  it("reports what the user typed and says when the field is empty", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Field onValueChange={onValueChange} />);
    const control = part(container, "control") as HTMLInputElement;

    expect(part(container, "root").getAttribute("data-empty")).toBe("");

    typeInto(control, "quartz");

    expect(onValueChange).toHaveBeenCalledWith({ value: "quartz" });
    expect(part(container, "root").hasAttribute("data-empty")).toBe(false);
  });

  it("stays controlled when the consumer owns the value", () => {
    function Controlled(): React.ReactNode {
      const [value, setValue] = useState("");
      return <Field value={value} onValueChange={(details) => setValue(details.value.trim())} />;
    }
    const { container } = mount(<Controlled />);
    const control = part(container, "control") as HTMLInputElement;

    typeInto(control, "  quartz  ");

    expect(control.value).toBe("quartz");
  });

  it("shows the clear button only while there is something to clear", () => {
    const { container } = mount(<Field />);
    const control = part(container, "control") as HTMLInputElement;
    const trigger = part(container, "clear-trigger") as HTMLButtonElement;

    expect(trigger.hidden).toBe(true);

    typeInto(control, "quartz");
    expect(trigger.hidden).toBe(false);

    fire(() => trigger.click());

    expect(control.value).toBe("");
    expect(trigger.hidden).toBe(true);
    // The button it was clicked on is on its way out of the picture; the caret
    // goes back where the user was working.
    expect(document.activeElement).toBe(control);
  });

  it("keeps the clear button out of the tab order and out of a pointer's way", () => {
    const { container } = mount(<Field defaultValue="quartz" />);
    const trigger = part(container, "clear-trigger") as HTMLButtonElement;

    // Not an oversight (see the connect): Escape is the keyboard path, and a tab
    // stop that vanishes the moment it does its job drops the focus on `<body>`.
    expect(trigger.tabIndex).toBe(-1);
    expect(trigger.getAttribute("aria-controls")).toBe(part(container, "control").id);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fire(() => trigger.dispatchEvent(mouseDown));

    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("hides the clear button on a field that is not the user's to change", () => {
    const { container } = mount(<Field defaultValue="quartz" disabled />);

    // Search Field 480:761: a disabled field with text keeps the glyph hidden.
    expect((part(container, "clear-trigger") as HTMLButtonElement).hidden).toBe(true);
  });

  it("empties on Escape, then lets the next one through to whatever is above", () => {
    const outer = vi.fn();
    const { container } = mount(<Field defaultValue="quartz" />);
    // Listened for on the host rather than through a JSX handler on a wrapper
    // div: what is being proved is what reaches an overlay above the field, and
    // an overlay listens to the DOM.
    container.addEventListener("keydown", outer);
    const control = part(container, "control") as HTMLInputElement;

    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fire(() => control.dispatchEvent(first));

    expect(first.defaultPrevented).toBe(true);
    expect(control.value).toBe("");

    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fire(() => control.dispatchEvent(second));

    // The "then closes" of the annexe: an empty field has nothing to consume, and
    // the popover above it gets its key.
    expect(second.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(2);
  });

  it("takes ⌘F only when a page asked for it", () => {
    const { container } = mount(<Field defaultValue="quartz" hotkey={isSearchHotkey} />);
    const control = part(container, "control") as HTMLInputElement;

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fire(() => document.body.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(control);
    expect(control.selectionEnd).toBe("quartz".length);
  });

  it("leaves find-in-page alone by default", () => {
    mount(<Field defaultValue="quartz" />);

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fire(() => document.body.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(false);
  });

  it("wears the shape it is asked for and the search inset either way", () => {
    const { container } = mount(<Field shape="rect" />);
    const field = part(container, "field");

    // The 2026-08-31 amendment, tested literally: shape and variant are two axes.
    // Both live on the capsule since the split — they describe a box, and the
    // row is not one. Left on the root, `soft`, `rect` and `invalid` would go
    // looking for an element that no longer carries them.
    expect(field.getAttribute("data-shape")).toBe("rect");
    expect(field.getAttribute("data-variant")).toBe("search");
    expect(part(container, "root").hasAttribute("data-shape")).toBe(false);
    expect(part(container, "root").hasAttribute("data-variant")).toBe(false);
  });

  it("puts the row around the capsule and the capsule around the control", () => {
    const { container } = mount(<Field />);
    const root = part(container, "root");
    const field = part(container, "field");

    expect(root.getAttribute("role")).toBe("search");
    expect(field.parentElement).toBe(root);
    expect(part(container, "control").parentElement).toBe(field);
    expect(part(container, "clear-trigger").parentElement).toBe(field);
  });

  /**
   * The first of the three fixtures ROADMAP:173 asks of every component, and the
   * one this migration breaks most quietly: a field with nothing in it but the
   * capsule and the control still has to work. Missing the capsule leaves a
   * field with no box at all — no error, no warning, just an unstyled input.
   */
  it("works as a capsule and a control and nothing else", async () => {
    const handle = mount(
      <main>
        <SearchFieldRoot label="Search files" defaultValue="quartz">
          <SearchFieldField>
            <SearchFieldControl />
          </SearchFieldField>
        </SearchFieldRoot>
      </main>,
    );
    const control = part(handle.container, "control") as HTMLInputElement;

    typeInto(control, "ruby");
    expect(control.value).toBe("ruby");

    fire(() =>
      control.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(control.value).toBe("");

    await expectNoAxeViolations(handle.container);
  });

  it("inherits its ids and its states from the field around it", () => {
    const { container } = mount(
      <FieldRoot disabled>
        <FieldLabel>Search files</FieldLabel>
        <SearchFieldRoot clearLabel="Clear search">
          <SearchFieldField>
            <SearchFieldControl />
          </SearchFieldField>
        </SearchFieldRoot>
      </FieldRoot>,
    );
    const control = part(container, "control") as HTMLInputElement;
    const label = container.querySelector<HTMLLabelElement>('[data-part~="field:label"]');

    expect(label?.htmlFor).toBe(control.id);
    expect(control.disabled).toBe(true);
    // No `aria-label` fighting the visible label for the name calculation.
    expect(control.hasAttribute("aria-label")).toBe(false);
  });

  it("passes the direction down to both the box and the control", () => {
    const { container } = mount(<Field dir="rtl" />);

    // The order of the three parts is DOM order in both directions — the sheet
    // uses logical properties, so there is no mirroring to do here.
    expect(part(container, "root").getAttribute("dir")).toBe("rtl");
    expect(part(container, "control").getAttribute("dir")).toBe("rtl");
  });

  it("passes axe, empty and filled", async () => {
    const handle = mount(
      <main>
        <Field label="Search files" />
        <Field label="Search archive" defaultValue="quartz" />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes axe with two search landmarks on one page", async () => {
    const handle = mount(
      <main>
        <Field label="Search files" />
        <Field label="Search people" />
      </main>,
    );

    // Two landmarks with the same role need different names, which is the whole
    // reason `label` is not optional in practice.
    await expectNoAxeViolations(handle.container);
  });
});

/**
 * The cancel button, which is the reason the row and the capsule are two parts.
 * Everything here is about the one thing a tab stop that disappears has to get
 * right: where the focus goes when it does.
 */
describe("search-field — cancel", () => {
  it("appears with the first character, empties, and says so after handing the caret back", () => {
    const order: string[] = [];
    const { container } = mount(
      <Cancellable
        onValueChange={(details) => order.push(`value:${details.value}`)}
        onCancel={() => order.push("cancel")}
      />,
    );
    const control = part(container, "control") as HTMLInputElement;
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

    expect(cancel.hidden).toBe(true);
    typeInto(control, "quartz");
    expect(cancel.hidden).toBe(false);

    fire(() => cancel.click());

    expect(control.value).toBe("");
    expect(cancel.hidden).toBe(true);
    // `onCancel` last, so a consumer who moves the focus inside it wins against
    // the focus the machine hands back above it.
    expect(order).toEqual(["value:quartz", "value:", "cancel"]);
    // Never `<body>`: the button the click landed on is already gone.
    expect(document.activeElement).toBe(control);
  });

  it("gives the caret back from Enter and from Space too", () => {
    for (const key of ["Enter", " "] as const) {
      const { container } = mount(<Cancellable defaultValue="quartz" />);
      const control = part(container, "control") as HTMLInputElement;
      const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

      fire(() => cancel.focus());
      expect(document.activeElement).toBe(cancel);

      // The native activation a button does for both keys, which is the whole of
      // the keyboard path — the library adds no key handling of its own here.
      fire(() => {
        cancel.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
        cancel.click();
      });

      expect(control.value).toBe("");
      expect(document.activeElement).toBe(control);
      unmountAll();
    }
  });

  it("walks the tab order control → cancel and never through the clear button", () => {
    const { container } = mount(<Cancellable defaultValue="quartz" />);
    const control = part(container, "control") as HTMLInputElement;
    const clear = part(container, "clear-trigger") as HTMLButtonElement;
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

    // Read off the elements rather than driven with real Tab presses: what
    // decides the order is DOM order plus `tabindex`, and both are assertable.
    expect(clear.tabIndex).toBe(-1);
    expect(cancel.tabIndex).toBe(0);
    expect(control.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fire(() => control.focus());
    expect(document.activeElement).toBe(control);
    fire(() => cancel.focus());
    expect(document.activeElement).toBe(cancel);
  });

  it("does not take the caret when it is pressed with a pointer", () => {
    const { container } = mount(<Cancellable defaultValue="quartz" />);
    const control = part(container, "control") as HTMLInputElement;
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;
    fire(() => control.focus());

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fire(() => cancel.dispatchEvent(mouseDown));

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(control);
  });

  /**
   * The test the ref exists for. When somebody else empties the field — a
   * controlled `value=""` — no handler of ours runs, and by the time the watch
   * plays the button is already `hidden` and `document.activeElement` is
   * `<body>`. An implementation that asks the DOM "was it mine?" is green on the
   * click above and wrong here.
   */
  it("takes the caret back when the value is emptied under the button's own focus", async () => {
    function Controlled(): React.ReactNode {
      const [value, setValue] = useState("quartz");
      return (
        <>
          <button type="button" onClick={() => setValue("")}>
            empty it
          </button>
          <Cancellable value={value} onValueChange={(details) => setValue(details.value)} />
        </>
      );
    }
    const { container } = mount(<Controlled />);
    const control = part(container, "control") as HTMLInputElement;
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

    fire(() => cancel.focus());
    expect(document.activeElement).toBe(cancel);

    fire(() => (container.querySelector("button") as HTMLButtonElement).click());
    await settle();

    expect(cancel.hidden).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(control));
  });

  it("leaves the caret alone when the field merely loses a character", () => {
    function Controlled(): React.ReactNode {
      const [value, setValue] = useState("quartz");
      return (
        <>
          <button type="button" onClick={() => setValue("quart")}>
            shorten it
          </button>
          <Cancellable value={value} onValueChange={(details) => setValue(details.value)} />
        </>
      );
    }
    const { container } = mount(<Controlled />);
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;
    fire(() => cancel.focus());

    fire(() => (container.querySelector("button") as HTMLButtonElement).click());

    // The button is still there; taking the focus off it would be a theft.
    expect(document.activeElement).toBe(cancel);
  });

  /**
   * The second of ROADMAP:173's fixtures, in the shape this component has one:
   * it is not a composite, so "the first item is inoperable" reads as a field
   * whose value is not the user's to change. The row keeps its shape, and Tab
   * walks it without falling into a hole.
   */
  it("stays rendered and inert on a field nobody can edit", () => {
    for (const props of [{ disabled: true }, { readOnly: true }] as const) {
      const onCancel = vi.fn();
      const { container } = mount(
        <Cancellable defaultValue="quartz" onCancel={onCancel} {...props} />,
      );
      const control = part(container, "control") as HTMLInputElement;
      const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

      // Rendered, so the row does not re-lay itself out under the reader; the
      // clear button inside the capsule does go, which is the reference design's own rule.
      expect(cancel.hidden).toBe(false);
      expect(cancel.disabled).toBe(true);
      expect((part(container, "clear-trigger") as HTMLButtonElement).hidden).toBe(true);

      fire(() => cancel.click());
      expect(control.value).toBe("quartz");
      expect(onCancel).not.toHaveBeenCalled();

      unmountAll();
    }
  });

  it("carries a name of its own, and takes the consumer's", () => {
    const { container } = mount(<Cancellable defaultValue="quartz" />);
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;

    expect(cancel.getAttribute("aria-label")).toBe("Cancel search");
    expect(cancel.getAttribute("aria-controls")).toBe(part(container, "control").id);

    unmountAll();
    const other = mount(<Cancellable defaultValue="quartz" cancelLabel="Annuler" />);
    expect(part(other.container, "cancel-trigger").getAttribute("aria-label")).toBe("Annuler");
  });

  it("leaves Escape saying exactly what it said before", () => {
    const onCancel = vi.fn();
    const outer = vi.fn();
    const { container } = mount(<Cancellable defaultValue="quartz" onCancel={onCancel} />);
    container.addEventListener("keydown", outer);
    const control = part(container, "control") as HTMLInputElement;

    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fire(() => control.dispatchEvent(first));

    expect(first.defaultPrevented).toBe(true);
    expect(control.value).toBe("");
    // Escape empties; it does not cancel. Making a shipped key fire a new
    // callback changes its meaning without anybody having asked.
    expect(onCancel).not.toHaveBeenCalled();

    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fire(() => control.dispatchEvent(second));

    // And the empty field still hands it to whatever is above.
    expect(second.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(2);
  });

  it("passes axe empty, filled, disabled, read-only and invalid", async () => {
    const handle = mount(
      <main>
        <Cancellable label="Search empty" />
        <Cancellable label="Search filled" defaultValue="quartz" />
        <Cancellable label="Search disabled" defaultValue="quartz" disabled />
        <Cancellable label="Search read-only" defaultValue="quartz" readOnly />
        <Cancellable label="Search invalid" defaultValue="quartz" invalid />
      </main>,
    );

    // `button-name` for the two icon-only buttons, `landmark-unique` for five
    // `role="search"` regions on one page — the two rules this shape can fail.
    await expectNoAxeViolations(handle.container);
  });
});

/**
 * The third fixture ROADMAP:173 asks for. Nothing in this component pushes an
 * intent scope, and that is the claim being tested: the button is a real
 * `<button>`, so the spatial engine reaches it on geometry alone and the input
 * system's own synthesised click activates it — no component code at all.
 */
describe("search-field on a gamepad", () => {
  function Capture(props: { readonly onSystem: (system: unknown) => void }): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      props.onSystem(system);
    }, [system, props.onSystem]);
    return null;
  }

  it("reaches the cancel button on the pad and activates it with no code of its own", async () => {
    let system: { emit(event: { intent: string; source: string }): void } | null = null;
    const { container } = mount(
      <NavProvider plugins={[spatialPlugin()]}>
        <Capture
          onSystem={(next) => {
            system = next as typeof system;
          }}
        />
        {/*
          The row's own layout, inline: this harness loads no stylesheet, and the
          engine scores real geometry. Without it the capsule is a block and the
          button sits *under* it, so `moveRight` finds nothing and the assertion
          would be about the missing sheet rather than about the pad.
        */}
        <Cancellable defaultValue="quartz" style={{ display: "flex" }} />
      </NavProvider>,
    );
    await settle();

    const control = part(container, "control") as HTMLInputElement;
    const cancel = part(container, "cancel-trigger") as HTMLButtonElement;
    fire(() => control.focus());
    await waitFor(() => expect(document.activeElement).toBe(control));

    fire(() => system?.emit({ intent: "moveRight", source: "gamepad" }));
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fire(() => system?.emit({ intent: "select", source: "gamepad" }));

    expect(control.value).toBe("");
    // And the focus comes home, which is what keeps a pad from landing on
    // `<body>` with nothing to move off.
    await waitFor(() => expect(document.activeElement).toBe(control));
  });
});
