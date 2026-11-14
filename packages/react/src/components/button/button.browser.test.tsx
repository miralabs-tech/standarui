/**
 * The React layer of the button. The machine's behaviour is covered in the core's
 * own browser test; what is tested here is what the adapter adds — the element
 * substitution and what it infers, prop merging, and the a11y of what actually
 * lands in the document.
 */

import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import { ButtonLoadingIndicator, ButtonRoot, useButton } from "./button";

function root(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="button:root"]');
  if (node === null) throw new Error("the button did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("ButtonRoot", () => {
  it("renders a native button with the machine's contract on it", () => {
    const { container } = mount(<ButtonRoot id="save">Save</ButtonRoot>);
    const node = root(container);

    expect(node.tagName).toBe("BUTTON");
    expect(node.id).toBe("save");
    expect(node.getAttribute("type")).toBe("button");
    expect(node.textContent).toBe("Save");
  });

  /**
   * The composition regression. A machine root used as another part's `render`
   * target is handed that part's id, and both sides then look the element up by
   * it: the composer, to measure or focus it, and this machine's own
   * `trackPress(getRootEl(scope))`. Before the fix the root swallowed the id as a
   * scope id and published `button:<id>:root` instead, so the composer searched
   * for an id that existed nowhere — which is how an anchored surface ended up
   * never positioned at all.
   *
   * The press assertion is the half that matters most: it fails if the id reaches
   * the DOM but the button can no longer find itself.
   */
  it("wears an id a composing part gave it, and still finds itself under it", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <ButtonRoot id="popover:p1:trigger" onPress={onPress}>
        Share
      </ButtonRoot>,
    );
    const node = root(container);

    expect(node.id).toBe("popover:p1:trigger");
    expect(container.ownerDocument.getElementById("popover:p1:trigger")).toBe(node);

    fire(() => node.click());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("calls onPress once per activation", () => {
    const onPress = vi.fn();
    const { container } = mount(<ButtonRoot onPress={onPress}>Save</ButtonRoot>);

    fire(() => root(container).click());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the consumer's own props and merges them the documented way", () => {
    const onClick = vi.fn();
    const { container } = mount(
      <ButtonRoot className="app-button" aria-label="Save the file" onClick={onClick}>
        Save
      </ButtonRoot>,
    );
    const node = root(container);

    expect(node.className).toBe("app-button");
    expect(node.getAttribute("aria-label")).toBe("Save the file");

    fire(() => node.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets the consumer's handler veto the machine's", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <ButtonRoot onPress={onPress} onClick={(event) => event.preventDefault()}>
        Save
      </ButtonRoot>,
    );

    fire(() => root(container).click());

    expect(onPress).not.toHaveBeenCalled();
  });

  it("forwards a ref, React 19 style", () => {
    let seen: HTMLElement | null = null;
    function Probe(): React.ReactNode {
      const ref = useRef<HTMLButtonElement>(null);
      seen = ref.current;
      return <ButtonRoot ref={ref}>Save</ButtonRoot>;
    }
    const handle = mount(<Probe />);
    handle.render(<Probe />);

    expect(seen).toBe(root(handle.container));
  });

  it("infers a non-native button from what it is asked to render", () => {
    const { container } = mount(<ButtonRoot render={<a href="/save" />}>Save</ButtonRoot>);
    const node = root(container);

    expect(node.tagName).toBe("A");
    expect(node.getAttribute("role")).toBe("button");
    expect(node.getAttribute("tabindex")).toBe("0");
    // A substituted element must not be handed a button's own attributes.
    expect(node.hasAttribute("type")).toBe(false);
  });

  it("keeps the native path when the substituted element is itself a button", () => {
    const { container } = mount(
      <ButtonRoot render={<button type="button" className="mine" />}>Save</ButtonRoot>,
    );
    const node = root(container);

    expect(node.getAttribute("type")).toBe("button");
    expect(node.hasAttribute("role")).toBe(false);
    expect(node.className).toBe("mine");
  });

  it("activates a substituted element from the keyboard", () => {
    const onPress = vi.fn();
    const { container } = mount(
      <ButtonRoot onPress={onPress} render={<div />}>
        Save
      </ButtonRoot>,
    );
    const node = root(container);

    fire(() => {
      node.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      );
      node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the loading indicator only while busy, and says so", () => {
    const handle = mount(
      <ButtonRoot>
        Save
        <ButtonLoadingIndicator />
      </ButtonRoot>,
    );
    const indicator = handle.container.querySelector<HTMLElement>(
      '[data-part~="button:loading-indicator"]',
    );

    expect(indicator?.hidden).toBe(true);

    handle.render(
      <ButtonRoot loading>
        Save
        <ButtonLoadingIndicator />
      </ButtonRoot>,
    );

    expect(indicator?.hidden).toBe(false);
    expect(root(handle.container).getAttribute("aria-busy")).toBe("true");
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<ButtonLoadingIndicator />)).toThrow(/inside <ButtonRoot>/);
  });

  it("passes axe in every state it can be in", async () => {
    const handle = mount(
      <main>
        <ButtonRoot>Save</ButtonRoot>
        <ButtonRoot disabled>Disabled</ButtonRoot>
        <ButtonRoot disabled focusableWhenDisabled>
          Focusable while disabled
        </ButtonRoot>
        <ButtonRoot loading loadingText="Saving">
          Saving
          <ButtonLoadingIndicator />
        </ButtonRoot>
        <ButtonRoot render={<a href="/save" />}>Link that acts as a button</ButtonRoot>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});

describe("useButton", () => {
  it("hands back the prop getters for a consumer who would rather place them", () => {
    function Custom(): React.ReactNode {
      const api = useButton({ id: "custom", variant: "plain" });
      return <button {...api.getRootProps()}>Save</button>;
    }
    const { container } = mount(<Custom />);

    expect(root(container).getAttribute("data-variant")).toBe("plain");
  });
});
