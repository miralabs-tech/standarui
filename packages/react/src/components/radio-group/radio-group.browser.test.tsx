import { act, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputSystem } from "../../nav";
import { NavProvider, spatialPlugin, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  realKey,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import {
  RadioGroupItem,
  RadioGroupItemControl,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupLabel,
  RadioGroupRoot,
  type RadioGroupRootProps,
} from "./radio-group";

const SIZES = ["small", "medium", "large"];

function Sizes(props: {
  readonly defaultValue?: string;
  readonly value?: string | null;
  readonly onValueChange?: (details: { value: string | null }) => void;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly intents?: RadioGroupRootProps["intents"];
}): React.ReactNode {
  return (
    <RadioGroupRoot {...props}>
      <RadioGroupLabel>Size</RadioGroupLabel>
      {SIZES.map((size) => (
        <RadioGroupItem key={size} value={size}>
          <RadioGroupItemHiddenInput />
          <RadioGroupItemControl />
          <RadioGroupItemText>{size}</RadioGroupItemText>
        </RadioGroupItem>
      ))}
    </RadioGroupRoot>
  );
}

function inputs(container: HTMLElement): HTMLInputElement[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>('[data-part~="radio-group:item-hidden-input"]'),
  ];
}

afterEach(() => {
  unmountAll();
});

describe("RadioGroupRoot", () => {
  it("gives every item the same name and its own value", () => {
    const { container } = mount(<Sizes />);
    const list = inputs(container);

    expect(new Set(list.map((input) => input.name)).size).toBe(1);
    expect(list.map((input) => input.value)).toEqual(SIZES);
  });

  it("selects on click and reports", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Sizes onValueChange={onValueChange} />);

    fire(() => inputs(container)[1]?.click());

    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });

  it("follows a controlled value back down", () => {
    const handle = mount(<Sizes value="small" />);

    handle.render(<Sizes value="large" />);

    expect(inputs(handle.container).map((input) => input.checked)).toEqual([false, false, true]);
  });

  it("says where an item part belongs when it is rendered outside its item", () => {
    expect(() => mount(<RadioGroupItemControl />)).toThrow(/inside <RadioGroupRoot>/);
  });

  it("does not point at a label it never rendered", () => {
    const { container } = mount(
      <RadioGroupRoot aria-label="Size" defaultValue="small">
        <RadioGroupItem value="small">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemText>Small</RadioGroupItemText>
        </RadioGroupItem>
      </RadioGroupRoot>,
    );
    const root = container.querySelector('[data-part~="radio-group:root"]');

    // APG asks a radiogroup to be named by `aria-labelledby` *or* `aria-label`;
    // an IDREF to an element that was never rendered is neither.
    expect(root?.hasAttribute("aria-labelledby")).toBe(false);
    expect(root?.getAttribute("aria-label")).toBe("Size");
  });

  it("passes axe, selected and disabled", async () => {
    const handle = mount(
      <main>
        <Sizes defaultValue="medium" />
        <Sizes disabled />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes axe while read-only, where ARIA has no read-only radio", async () => {
    const handle = mount(
      <main>
        <Sizes defaultValue="medium" readOnly />
      </main>,
    );

    // ARIA 1.2 allows `aria-readonly` on `radiogroup` and not on `radio`, so the
    // promise is made once on the group rather than three times on the inputs.
    const root = handle.container.querySelector('[data-part~="radio-group:root"]');

    expect(root?.getAttribute("aria-readonly")).toBe("true");
    expect(inputs(handle.container).some((input) => input.hasAttribute("aria-readonly"))).toBe(
      false,
    );
    await expectNoAxeViolations(handle.container);
  });
});

/**
 * The seam, which is the only thing this file can prove about the pad: the
 * grammar itself is measured in `packages/core/src/components/radio-group`, and
 * what the adapter owns is handing the machine a scope host at all. A `intents`
 * missing from `MACHINE_PROPS` would land on the `<div>` instead, and the group
 * would answer no gamepad while every core test stayed green.
 */
describe("RadioGroupRoot — the pad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  afterEach(() => {
    input = null;
  });

  it("takes the d-pad from a provider, with no prop to pass", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Sizes onValueChange={onValueChange} />
      </NavProvider>,
    );
    await settle();

    const first = inputs(container)[0];
    fire(() => first?.focus());
    await waitFor(() => expect(document.activeElement).toBe(first));

    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(document.activeElement).toBe(inputs(container)[1]);
    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });

  it("answers no pad at all when the consumer opts out", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Sizes intents={null} onValueChange={onValueChange} />
      </NavProvider>,
    );
    await settle();

    fire(() => inputs(container)[0]?.focus());
    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(onValueChange).not.toHaveBeenCalled();
  });

  /**
   * R17. React runs the group's effect before the dialog's, so the group's scope
   * sits under the dialog's trap: without `within` on both, the trap silences it
   * and the pad moves the focus through the spatial engine without checking.
   */
  it("still answers the d-pad inside a modal dialog that traps", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Pick a size</DialogTitle>
                <Sizes onValueChange={onValueChange} />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the radio before the pad is pressed.
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const list = inputs(document.body);
    fire(() => list[0]?.focus());
    await settle();
    expect(document.activeElement).toBe(list[0]);

    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(document.activeElement).toBe(list[1]);
    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });

  // Non-modal and without a focus trap, so a radio outside can hold the focus:
  // the dialog's intent scope traps whatever `modal` says.
  it("stays silenced outside an open non-modal dialog, whose intent scope still traps", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider>
        <Capture />
        <Sizes onValueChange={onValueChange} />
        <DialogRoot defaultOpen modal={false} trapFocus={false} closeOnInteractOutside={false}>
          <DialogPortal>
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Elsewhere</DialogTitle>
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    const list = inputs(document.body);
    fire(() => list[0]?.focus());
    await waitFor(() => expect(document.activeElement).toBe(list[0]));

    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(document.querySelector('[data-part~="dialog:content"]')).not.toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

/**
 * R16. In `app` mode the spatial engine takes the arrow keys, so ArrowDown used
 * to move the focus to the next radio without checking it. The rows are stacked
 * here because the shipped sheet is not loaded: inline labels leave the engine no
 * candidate below, it declines, and the browser's default acts — which hides the
 * defect entirely.
 */
describe("RadioGroupRoot — real keys in the spatial engine's app mode", () => {
  const APP = [spatialPlugin({ mode: "app" })];
  let input: InputSystem | null = null;
  let sheet: HTMLStyleElement | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  beforeEach(() => {
    sheet = document.createElement("style");
    sheet.textContent = `[data-part~="radio-group:root"] { display: grid; gap: 8px; inline-size: 200px; }
      [data-part~="radio-group:item"] { display: block; position: relative; block-size: 24px; }`;
    document.head.append(sheet);
  });

  afterEach(() => {
    input = null;
    sheet?.remove();
    sheet = null;
  });

  function snapshot(list: HTMLInputElement[]): { focused: number; checked: number } {
    return {
      focused: list.indexOf(document.activeElement as HTMLInputElement),
      checked: list.findIndex((radio) => radio.checked),
    };
  }

  async function focusFirst(): Promise<HTMLInputElement[]> {
    await settle();
    const list = inputs(document.body);
    fire(() => list[0]?.focus());
    await waitFor(() => expect(document.activeElement).toBe(list[0]));
    return list;
  }

  it("checks the next radio on ArrowDown, as the browser does", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider plugins={APP}>
        <Sizes onValueChange={onValueChange} />
      </NavProvider>,
    );
    const list = await focusFirst();

    await realKey("{ArrowDown}");

    expect(snapshot(list)).toEqual({ focused: 1, checked: 1 });
    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });

  it("checks the next radio on ArrowDown inside a modal dialog that traps", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider plugins={APP}>
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Pick a size</DialogTitle>
                <Sizes onValueChange={onValueChange} />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const list = await focusFirst();

    await realKey("{ArrowDown}");

    expect(snapshot(list)).toEqual({ focused: 1, checked: 1 });
    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });

  /**
   * A remote has no Tab: a native group that wraps would check the first radio
   * and never let it out, so the end of the axis is the engine's.
   */
  it("leaves the end of the axis to the engine, which carries the focus out", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider plugins={APP}>
        <Sizes defaultValue="large" onValueChange={onValueChange} />
        <button type="button">Below</button>
      </NavProvider>,
    );
    await settle();
    const list = inputs(document.body);
    fire(() => list[2]?.focus());
    await waitFor(() => expect(document.activeElement).toBe(list[2]));

    await realKey("{ArrowDown}");

    expect(document.activeElement?.textContent).toBe("Below");
    expect(list.map((radio) => radio.checked)).toEqual([false, false, true]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("leaves the off-axis arrow to the engine, which carries the focus out", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider plugins={APP}>
        <div style={{ display: "flex", gap: 40 }}>
          <Sizes onValueChange={onValueChange} />
          <button type="button">Beside</button>
        </div>
      </NavProvider>,
    );
    const list = await focusFirst();

    await realKey("{ArrowRight}");

    expect(document.activeElement?.textContent).toBe("Beside");
    expect(list.some((radio) => radio.checked)).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  /**
   * Measured: answering `"native"` here lets firefox check the next radio and fire
   * `change` before React's controlled restore puts the old one back. The engine
   * moves the focus and touches nothing, which is what read-only means.
   */
  it("moves without checking anything while read-only", async () => {
    const onValueChange = vi.fn();
    const changes: string[] = [];
    mount(
      <NavProvider plugins={APP}>
        <Sizes defaultValue="small" readOnly onValueChange={onValueChange} />
      </NavProvider>,
    );
    const list = await focusFirst();
    for (const radio of list) radio.addEventListener("change", () => changes.push(radio.value));

    await realKey("{ArrowDown}");

    expect(snapshot(list)).toEqual({ focused: 1, checked: 0 });
    expect(changes).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("still moves and checks on the d-pad, which has no native default", async () => {
    const onValueChange = vi.fn();
    mount(
      <NavProvider plugins={APP}>
        <Capture />
        <Sizes onValueChange={onValueChange} />
      </NavProvider>,
    );
    const list = await focusFirst();

    const result = await act(async () => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(result?.consumed).toBe(true);
    expect(snapshot(list)).toEqual({ focused: 1, checked: 1 });
    expect(onValueChange).toHaveBeenCalledWith({ value: "medium" });
  });
});

/**
 * A group with no value is one Tab stop, as with a checked one, and it is the
 * first radio from either side (APG). The browser's own grouping cannot carry
 * that: any re-render of the hidden inputs while the focus is inside runs
 * react-dom's `updateInput`, which blanks `name` and puts it back, and chromium
 * then counts every radio as its own stop. The group re-renders on every focus
 * and so may the consumer, which is why the stop is a roving tabindex: on the
 * focused radio, else the checked one, else the first enabled one.
 */
describe("RadioGroupRoot — Tab with no value", () => {
  type InputProps = React.ComponentProps<typeof RadioGroupItemHiddenInput>;

  function Group(props: {
    readonly root?: Omit<RadioGroupRootProps, "children">;
    readonly input?: InputProps;
  }): React.ReactNode {
    return (
      <>
        <button type="button">Before</button>
        <RadioGroupRoot {...props.root}>
          <RadioGroupLabel>Size</RadioGroupLabel>
          {SIZES.map((size) => (
            <RadioGroupItem key={size} value={size}>
              <RadioGroupItemHiddenInput {...props.input} />
              <RadioGroupItemControl />
              <RadioGroupItemText>{size}</RadioGroupItemText>
            </RadioGroupItem>
          ))}
        </RadioGroupRoot>
        <button type="button">After</button>
      </>
    );
  }

  /** A consumer that counts focuses in its own state, re-rendering the whole group. */
  function CountsFocuses(): React.ReactNode {
    const [, setFocuses] = useState(0);
    return <Group input={{ onFocus: () => setFocuses((count) => count + 1) }} />;
  }

  /** A field that flips `invalid` whenever the focus lands in the group. */
  function FlipsInvalid(): React.ReactNode {
    const [invalid, setInvalid] = useState(false);
    return <Group root={{ invalid, onFocus: () => setInvalid((current) => !current) }} />;
  }

  function where(): string {
    const active = document.activeElement as HTMLElement | null;
    return active instanceof HTMLInputElement ? active.value : (active?.textContent ?? "");
  }

  async function walk(
    scene: React.ReactNode,
    start: string,
    keys: string,
    steps: number,
  ): Promise<string[]> {
    const { container } = mount(scene);
    await settle();
    const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === start,
    );
    fire(() => target?.focus());
    await waitFor(() => expect(document.activeElement).toBe(target));
    const stops: string[] = [];
    for (let step = 0; step < steps; step++) {
      await realKey(keys);
      stops.push(where());
    }
    return stops;
  }

  it("leaves the group on the Tab after the one that entered it", async () => {
    expect(await walk(<Group />, "Before", "{Tab}", 2)).toEqual(["small", "After"]);
  });

  it("enters at the first radio on Shift+Tab, and leaves on the next one", async () => {
    // Natively firefox takes the first radio and the others the last; APG says
    // the first, and the roving stop makes every engine agree.
    expect(await walk(<Group />, "After", "{Shift>}{Tab}{/Shift}", 2)).toEqual(["small", "Before"]);
  });

  it("leaves the group after a consumer's onFocus re-renders its parent", async () => {
    expect(await walk(<CountsFocuses />, "Before", "{Tab}", 2)).toEqual(["small", "After"]);
  });

  it("leaves the group after invalid flips while the focus is inside", async () => {
    expect(await walk(<FlipsInvalid />, "Before", "{Tab}", 2)).toEqual(["small", "After"]);
  });

  it("moves the stop off a first radio disabled after mount", async () => {
    function Items(props: { readonly off?: string }): React.ReactNode {
      return (
        <RadioGroupRoot aria-label="Size">
          {SIZES.map((size) => (
            <RadioGroupItem key={size} value={size} disabled={size === props.off}>
              <RadioGroupItemHiddenInput />
              <RadioGroupItemText>{size}</RadioGroupItemText>
            </RadioGroupItem>
          ))}
        </RadioGroupRoot>
      );
    }
    const handle = mount(<Items />);
    await settle();
    const list = inputs(handle.container);
    expect(list.map((radio) => radio.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    handle.render(<Items off="small" />);
    await settle();

    expect(list.map((radio) => radio.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("leaves the group with an inline onChange on every radio", async () => {
    expect(await walk(<Group input={{ onChange: () => {} }} />, "Before", "{Tab}", 2)).toEqual([
      "small",
      "After",
    ]);
  });
});

/**
 * The stop follows the focus, because the focus can land on a radio without
 * checking it: read-only arrows restored by React, the pad through the spatial
 * engine. A stop left on the old radio made Tab and Shift+Tab land there
 * instead of leaving the group.
 */
describe("RadioGroupRoot — Tab from a radio reached without checking it", () => {
  const STACKED = '[data-part~="radio-group:item"] { display: block; }';
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  afterEach(() => {
    input = null;
  });

  function Between(props: { readonly defaultValue?: string }): React.ReactNode {
    return (
      <>
        <style>{STACKED}</style>
        <button type="button">Before</button>
        <Sizes readOnly {...props} />
        <button type="button">After</button>
      </>
    );
  }

  function where(): string {
    const active = document.activeElement as HTMLElement | null;
    return active instanceof HTMLInputElement ? active.value : (active?.textContent ?? "");
  }

  async function enterFromBefore(container: HTMLElement): Promise<void> {
    await settle();
    const before = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Before",
    );
    fire(() => before?.focus());
    await waitFor(() => expect(document.activeElement).toBe(before));
  }

  it("leaves on Shift+Tab after a read-only ArrowDown", async () => {
    const { container } = mount(<Between />);
    await enterFromBefore(container);
    const stops: string[] = [];
    for (const key of ["{Tab}", "{ArrowDown}", "{Shift>}{Tab}{/Shift}"]) {
      await realKey(key);
      stops.push(where());
    }
    expect(stops).toEqual(["small", "medium", "Before"]);
  });

  it("leaves on Tab after a read-only ArrowUp off the checked radio", async () => {
    const { container } = mount(<Between defaultValue="large" />);
    await enterFromBefore(container);
    const stops: string[] = [];
    for (const key of ["{Tab}", "{ArrowUp}", "{Tab}"]) {
      await realKey(key);
      stops.push(where());
    }
    expect(stops).toEqual(["large", "medium", "After"]);
  });

  it("leaves on Shift+Tab after a read-only d-pad move", async () => {
    const { container } = mount(
      <NavProvider plugins={[spatialPlugin()]}>
        <Capture />
        <Between />
      </NavProvider>,
    );
    await enterFromBefore(container);
    await realKey("{Tab}");
    expect(where()).toBe("small");

    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();
    expect(where()).toBe("medium");
    expect(container.querySelectorAll("input[type=radio]:checked")).toHaveLength(0);

    await realKey("{Shift>}{Tab}{/Shift}");
    expect(where()).toBe("Before");
  });
});
