/**
 * The half of the Phase 4 exit criterion the component tests never touched: a
 * form driven by a gamepad. Every other test here drives the keyboard, where the
 * browser turns Enter into a click and hides whether the intent layer works at
 * all.
 *
 * The pad's A arrives as a `select` intent with no native click behind it. If
 * nothing claims it, the input system activates the focused element — so these
 * components are exercised exactly as a pad would exercise them, without any of
 * them knowing a pad exists (CDC D9).
 */

import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import type { InputSystem } from "../nav";
import { NavProvider, spatialPlugin, useInputSystem } from "../nav";
import { fire, mount, queryPart, queryParts, settle, unmountAll } from "../render-harness";
import { ButtonRoot } from "./button/button";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxLabel,
  CheckboxRoot,
} from "./checkbox/checkbox";
import { CheckboxGroupLabel, CheckboxGroupRoot } from "./checkbox-group/checkbox-group";
import {
  RadioGroupItem,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupLabel,
  RadioGroupRoot,
} from "./radio-group/radio-group";
import { SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot } from "./switch/switch";
import { ToggleGroup } from "./toggle-group/composed";
import { ToggleGroupItem, ToggleGroupLabel, ToggleGroupRoot } from "./toggle-group/toggle-group";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

let input: InputSystem | null = null;

function Capture(): React.ReactNode {
  const system = useInputSystem();
  useEffect(() => {
    input = system;
  }, [system]);
  return null;
}

function withPad(children: React.ReactNode): React.ReactNode {
  return (
    <NavProvider>
      <Capture />
      {children}
    </NavProvider>
  );
}

/** What the gamepad engine publishes when A goes down. */
function pressA(): void {
  fire(() => {
    input?.emit({ intent: "select", source: "gamepad" });
  });
}

function focus(container: HTMLElement, part: string): HTMLElement {
  const node = queryPart(container, part);
  if (node === null) throw new Error(`no part "${part}"`);
  fire(() => node.focus());
  return node;
}

afterEach(() => {
  unmountAll();
  input = null;
});

describe("the gamepad's A, on the T1a controls", () => {
  it("presses a button", async () => {
    const onPress = vi.fn();
    const { container } = mount(withPad(<ButtonRoot onPress={onPress}>Save</ButtonRoot>));
    await settle();

    focus(container, "root");
    pressA();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("toggles a checkbox", async () => {
    const onCheckedChange = vi.fn();
    const { container } = mount(
      withPad(
        <CheckboxRoot onCheckedChange={onCheckedChange}>
          <CheckboxHiddenInput />
          <CheckboxControl />
          <CheckboxLabel>Terms</CheckboxLabel>
        </CheckboxRoot>,
      ),
    );
    await settle();

    focus(container, "hidden-input");
    pressA();

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  it("checks a box in a group, and clears the group from its summary", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      withPad(
        <CheckboxGroupRoot defaultValue={["mail"]} onValueChange={onValueChange}>
          <CheckboxGroupLabel>Alerts</CheckboxGroupLabel>
          <CheckboxRoot>
            <CheckboxHiddenInput />
            <CheckboxLabel>All</CheckboxLabel>
          </CheckboxRoot>
          <CheckboxRoot value="mail">
            <CheckboxHiddenInput />
            <CheckboxLabel>Mail</CheckboxLabel>
          </CheckboxRoot>
          <CheckboxRoot value="sms">
            <CheckboxHiddenInput />
            <CheckboxLabel>SMS</CheckboxLabel>
          </CheckboxRoot>
        </CheckboxGroupRoot>,
      ),
    );
    await settle();
    const inputs = queryParts(container, "hidden-input");

    fire(() => inputs[2]?.focus());
    pressA();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: ["mail", "sms"] });

    // The summary is a checkbox like the others, so A reaches it the same way.
    fire(() => inputs[0]?.focus());
    pressA();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: [] });
  });

  it("flips a switch", async () => {
    const onCheckedChange = vi.fn();
    const { container } = mount(
      withPad(
        <SwitchRoot onCheckedChange={onCheckedChange}>
          <SwitchHiddenInput />
          <SwitchLabel>Wi-Fi</SwitchLabel>
          <SwitchControl />
        </SwitchRoot>,
      ),
    );
    await settle();

    focus(container, "hidden-input");
    pressA();

    expect(onCheckedChange).toHaveBeenCalledWith({ checked: true });
  });

  it("chooses a radio", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      withPad(
        <RadioGroupRoot onValueChange={onValueChange}>
          <RadioGroupLabel>Size</RadioGroupLabel>
          <RadioGroupItem value="small">
            <RadioGroupItemHiddenInput />
            <RadioGroupItemText>Small</RadioGroupItemText>
          </RadioGroupItem>
        </RadioGroupRoot>,
      ),
    );
    await settle();

    focus(container, "item-hidden-input");
    pressA();

    expect(onValueChange).toHaveBeenCalledWith({ value: "small" });
  });

  it("picks a segment", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      withPad(
        <ToggleGroupRoot onValueChange={onValueChange}>
          <ToggleGroupLabel>Range</ToggleGroupLabel>
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
        </ToggleGroupRoot>,
      ),
    );
    await settle();

    focus(container, "item");
    pressA();

    expect(onValueChange).toHaveBeenCalledWith({ value: ["day"] });
  });

  it("picks a segment of the composed group, whose root sits inside a frame", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      withPad(
        <ToggleGroup
          aria-label="Range"
          onValueChange={onValueChange}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
        />,
      ),
    );
    await settle();
    expect(queryPart(container, "frame")).not.toBeNull();

    focus(container, "item");
    pressA();

    expect(onValueChange).toHaveBeenCalledWith({ value: ["day"] });
  });

  it("fires once, not twice, when the keyboard produces the same intent", async () => {
    const onPress = vi.fn();
    const { container } = mount(withPad(<ButtonRoot onPress={onPress}>Save</ButtonRoot>));
    await settle();
    const button = focus(container, "root");

    // Enter on a real button: the browser clicks it, and the keydown also
    // reaches the input system as a `select`. Exactly one activation must come
    // out of that.
    fire(() => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      button.click();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not activate a control that lost the focus", async () => {
    const onPress = vi.fn();
    function Two(): React.ReactNode {
      const [, force] = useState(0);
      return (
        <>
          <ButtonRoot onPress={onPress}>Save</ButtonRoot>
          <ButtonRoot onPress={() => force((count) => count + 1)}>Other</ButtonRoot>
        </>
      );
    }
    const { container } = mount(withPad(<Two />));
    await settle();

    const buttons = queryParts(container, "root");
    fire(() => buttons[1]?.focus());
    pressA();

    expect(onPress).not.toHaveBeenCalled();
  });
});

const spatial = [spatialPlugin({ mode: "app" })];

describe("the gamepad's d-pad, through a visually hidden input", () => {
  function pad(intent: "moveDown" | "moveUp"): void {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  }

  function lands(container: HTMLElement, part: string): boolean {
    const node = queryPart(container, part);
    return node !== null && document.activeElement === node;
  }

  function frames(count: number): Promise<void> {
    return new Promise((resolve) => {
      const step = (left: number): void => {
        if (left === 0) resolve();
        else requestAnimationFrame(() => step(left - 1));
      };
      step(count);
    });
  }

  function scene(control: React.ReactNode): React.ReactNode {
    return (
      <NavProvider plugins={spatial}>
        <Capture />
        <div>
          <ButtonRoot data-testid="before">Before</ButtonRoot>
        </div>
        <div>{control}</div>
        <div>
          <ButtonRoot data-testid="after">After</ButtonRoot>
        </div>
      </NavProvider>
    );
  }

  async function crossing(control: React.ReactNode, part: string): Promise<void> {
    const { container } = mount(scene(control));
    await settle();
    const before = container.querySelector<HTMLElement>('[data-testid="before"]');
    const after = container.querySelector<HTMLElement>('[data-testid="after"]');
    if (before === null || after === null) throw new Error("no bookend");

    if (!document.hasFocus()) window.focus();
    fire(() => before.focus());
    await settle();
    expect(document.activeElement).toBe(before);
    pad("moveDown");
    await frames(2);
    expect(lands(container, part)).toBe(true);

    fire(() => after.focus());
    await settle();
    expect(document.activeElement).toBe(after);
    pad("moveUp");
    await frames(2);
    expect(lands(container, part)).toBe(true);
  }

  it("keeps the crossing when the mouse rests where the scene will mount", async () => {
    const control = (
      <RadioGroupRoot>
        <RadioGroupItem value="small">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemText>Small</RadioGroupItemText>
        </RadioGroupItem>
      </RadioGroupRoot>
    );
    const ghost = mount(scene(control));
    await settle();
    const box = ghost.container.querySelector('[data-testid="before"]')?.getBoundingClientRect();
    if (box === undefined) throw new Error("no ghost bookend");
    unmountAll();
    await commands.mouse([{ type: "move", x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
    await frames(1);

    await crossing(control, "item-hidden-input");
  });

  it("enters a radio group from both sides", async () => {
    await crossing(
      <RadioGroupRoot>
        <RadioGroupItem value="small">
          <RadioGroupItemHiddenInput />
          <RadioGroupItemText>Small</RadioGroupItemText>
        </RadioGroupItem>
      </RadioGroupRoot>,
      "item-hidden-input",
    );
  });

  it("enters a toggle group, with its frame or without, from both sides", async () => {
    await crossing(
      <ToggleGroupRoot aria-label="Range">
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroupRoot>,
      "item",
    );
    unmountAll();
    await crossing(
      <ToggleGroup
        aria-label="Range"
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
        ]}
      />,
      "item",
    );
  });

  it("moves along the segments of a toggle group, with its frame or without, as it does between controls", async () => {
    const options = [
      { value: "day", label: "Day" },
      { value: "week", label: "Week" },
      { value: "month", label: "Month" },
    ];
    const trees = [
      <ToggleGroupRoot key="parts" aria-label="Range">
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroupRoot>,
      <ToggleGroup key="framed" aria-label="Range" options={options} />,
    ];
    const reached: string[][] = [];
    for (const tree of trees) {
      const { container } = mount(scene(tree));
      await settle();
      const items = queryParts(container, "item");
      if (!document.hasFocus()) window.focus();
      fire(() => items[0]?.focus());
      await settle();
      const path: string[] = [];
      for (const intent of ["moveRight", "moveRight", "moveLeft"] as const) {
        fire(() => {
          input?.emit({ intent, source: "gamepad" });
        });
        await frames(2);
        path.push(document.activeElement?.getAttribute("data-value") ?? "none");
      }
      reached.push(path);
      unmountAll();
    }

    expect(reached[1]).toEqual(reached[0]);
    expect(reached[1]).toEqual(["week", "month", "week"]);
  });

  it("enters a checkbox from both sides", async () => {
    await crossing(
      <CheckboxRoot>
        <CheckboxHiddenInput />
        <CheckboxControl />
        <CheckboxLabel>Terms</CheckboxLabel>
      </CheckboxRoot>,
      "hidden-input",
    );
  });

  it("enters a switch from both sides", async () => {
    await crossing(
      <SwitchRoot>
        <SwitchHiddenInput />
        <SwitchControl />
        <SwitchLabel>Wi-Fi</SwitchLabel>
      </SwitchRoot>,
      "hidden-input",
    );
  });
});
