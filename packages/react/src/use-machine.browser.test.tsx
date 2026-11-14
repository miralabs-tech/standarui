/**
 * The adapter's exit criterion: the toggle machine the core shipped in Phase 2,
 * driven by React, with nothing component-specific written here. What is being
 * tested is the glue — one render per event, controlled props flowing back down,
 * StrictMode's double mount landing on the same state, and a real teardown.
 */

import * as toggle from "@standarui/core/toggle";
import { StrictMode, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeProps } from "./normalize-props";
import { fire, mount, unmountAll } from "./render-harness";
import { useMachine } from "./use-machine";

interface ToggleProps {
  readonly id?: string | undefined;
  readonly pressed?: boolean | undefined;
  readonly defaultPressed?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onPressedChange?: ((details: { pressed: boolean }) => void) | undefined;
  readonly onRender?: (() => void) | undefined;
}

function Toggle(props: ToggleProps): React.ReactNode {
  const { onRender, ...machineProps } = props;
  const service = useMachine(toggle.machine, { id: "t1", ...machineProps });
  const api = toggle.connect(service, normalizeProps);
  onRender?.();
  return (
    <>
      <button {...api.getRootProps()}>toggle</button>
      <span {...api.getIndicatorProps()} />
    </>
  );
}

function root(container: HTMLElement): HTMLButtonElement {
  const node = container.querySelector<HTMLButtonElement>('[data-part~="toggle:root"]');
  if (node === null) throw new Error("the toggle did not render");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("useMachine", () => {
  it("paints the anatomy and the ARIA state React-side", () => {
    const { container } = mount(<Toggle />);
    const button = root(container);

    expect(button.getAttribute("data-scope")).toBe("toggle");
    // The id given is the root's, verbatim — a composing part hands its own id
    // down and has to find the element wearing it. The derived
    // `{component}:{id}:{part}` spelling still governs every other part, and the
    // next test pins it for the case where nothing was given.
    expect(button.id).toBe("t1");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("data-state")).toBe("off");
    expect(
      container.querySelector('[data-part~="toggle:indicator"]')?.getAttribute("data-state"),
    ).toBe("off");
  });

  it("derives the id from useId when none is given", () => {
    function Anonymous(): React.ReactNode {
      const service = useMachine(toggle.machine, {});
      return <button {...toggle.connect(service, normalizeProps).getRootProps()} />;
    }
    const { container } = mount(<Anonymous />);

    expect(root(container).id).toMatch(/^toggle:.+:root$/);
  });

  it("toggles on a click and repaints both parts", () => {
    const onPressedChange = vi.fn();
    const { container } = mount(<Toggle onPressedChange={onPressedChange} />);

    fire(() => root(container).click());

    expect(onPressedChange).toHaveBeenCalledWith({ pressed: true });
    expect(root(container).getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[data-part~="toggle:indicator"]')?.getAttribute("data-state"),
    ).toBe("on");
  });

  it("renders once per event, not once per context key written", () => {
    const onRender = vi.fn();
    const { container } = mount(<Toggle onRender={onRender} />);
    const before = onRender.mock.calls.length;

    fire(() => root(container).click());

    expect(onRender.mock.calls.length - before).toBe(1);
  });

  it("reports but never writes while controlled, and follows the prop back down", () => {
    const onPressedChange = vi.fn();
    const handle = mount(<Toggle pressed={false} onPressedChange={onPressedChange} />);

    fire(() => root(handle.container).click());

    expect(onPressedChange).toHaveBeenCalledWith({ pressed: true });
    expect(root(handle.container).getAttribute("aria-pressed")).toBe("false");

    handle.render(<Toggle pressed={true} onPressedChange={onPressedChange} />);
    expect(root(handle.container).getAttribute("aria-pressed")).toBe("true");
  });

  it("reads the props of the render it is in, not of the render before", () => {
    const first = vi.fn();
    const second = vi.fn();
    const handle = mount(<Toggle onPressedChange={first} />);

    handle.render(<Toggle onPressedChange={second} />);
    fire(() => root(handle.container).click());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ pressed: true });
  });

  it("survives StrictMode's mount, unmount, mount", () => {
    const onPressedChange = vi.fn();
    const { container } = mount(
      <StrictMode>
        <Toggle defaultPressed onPressedChange={onPressedChange} />
      </StrictMode>,
    );

    expect(root(container).getAttribute("data-state")).toBe("on");

    fire(() => root(container).click());

    expect(onPressedChange).toHaveBeenCalledTimes(1);
    expect(root(container).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps one service across renders", () => {
    const seen = new Set<unknown>();
    function Identity(): React.ReactNode {
      const service = useMachine(toggle.machine, { id: "identity" });
      const first = useRef(service);
      seen.add(service);
      return (
        <button {...toggle.connect(service, normalizeProps).getRootProps()}>
          {String(first.current === service)}
        </button>
      );
    }

    const handle = mount(<Identity />);
    handle.render(<Identity />);

    expect(seen.size).toBe(1);
    expect(root(handle.container).textContent).toBe("true");
  });

  it("stops the machine on unmount — the document listener goes with it", () => {
    const handle = mount(<Toggle />);
    const button = root(handle.container);
    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      button.focus();
    });
    expect(button.getAttribute("data-focus-visible")).toBe("");
    // The modality store is ref-counted per document: the attribute on <html> is
    // the observable proof that a subscriber exists.
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(true);

    fire(() => button.blur());
    handle.unmount();

    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
  });

  it("leaves a disabled toggle alone", () => {
    const onPressedChange = vi.fn();
    const { container } = mount(<Toggle disabled onPressedChange={onPressedChange} />);

    fire(() => root(container).click());

    expect(onPressedChange).not.toHaveBeenCalled();
    expect(root(container).getAttribute("data-disabled")).toBe("");
  });
});
