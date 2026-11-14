import { afterEach, describe, expect, it, vi } from "vitest";
import { trackDismissableLayer } from "./dismissable";
import { getLayerStack, type Layer } from "./layer-stack";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function pointer(type: string): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0 });
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function layerOf(node: HTMLElement, id: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    node,
    type: "popover",
    modal: false,
    dismiss: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  const stack = getLayerStack(document);
  for (const layer of [...stack.layers()]) stack.remove(layer.id);
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("layer stack", () => {
  it("tracks the top-most layer", () => {
    const host = mount(`<div id="a"></div><div id="b"></div>`);
    const stack = getLayerStack(document);
    stack.add(layerOf(host.querySelector("#a") as HTMLElement, "a"));
    stack.add(layerOf(host.querySelector("#b") as HTMLElement, "b"));

    expect(stack.isTopMost("b")).toBe(true);
    expect(stack.isTopMost("a")).toBe(false);

    stack.remove("b");
    expect(stack.isTopMost("a")).toBe(true);
  });

  /**
   * A parent can register after its own child: React runs layout effects child-first,
   * so two dialogs that mount open in the same commit arrive inner-then-outer. Arrival
   * order would then put the parent on top of its own child and hand it Escape first.
   */
  it("puts a layer underneath the descendants that arrived before it", () => {
    const host = mount(`<div id="outer"></div><div id="middle"></div><div id="inner"></div>`);
    const stack = getLayerStack(document);
    const node = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    stack.add(layerOf(node("inner"), "inner", { parentId: "middle" }));
    stack.add(layerOf(node("middle"), "middle", { parentId: "outer" }));
    stack.add(layerOf(node("outer"), "outer", { type: "dialog" }));

    expect(stack.layers().map((layer) => layer.id)).toEqual(["outer", "middle", "inner"]);
    expect(stack.isTopMost("inner")).toBe(true);
  });

  it("treats a portalled child as inside its declared parent", () => {
    const host = mount(
      `<div id="dialog"><button id="in-dialog"></button></div><div id="popover"><button id="in-popover"></button></div>`,
    );
    const dialog = host.querySelector("#dialog") as HTMLElement;
    const popover = host.querySelector("#popover") as HTMLElement;
    const stack = getLayerStack(document);
    stack.add(layerOf(dialog, "dialog", { type: "dialog" }));
    stack.add(layerOf(popover, "popover", { parentId: "dialog" }));

    const inPopover = host.querySelector("#in-popover") as HTMLElement;
    // The DOM says otherwise — this is exactly the case `contains` gets wrong.
    expect(dialog.contains(inPopover)).toBe(false);
    expect(stack.containsTarget("dialog", inPopover)).toBe(true);
    expect(stack.containsTarget("popover", host.querySelector("#in-dialog"))).toBe(false);
  });

  it("keeps unrelated sibling layers separate", () => {
    const host = mount(`<div id="a"></div><div id="b"><button id="in-b"></button></div>`);
    const stack = getLayerStack(document);
    stack.add(layerOf(host.querySelector("#a") as HTMLElement, "a"));
    stack.add(layerOf(host.querySelector("#b") as HTMLElement, "b"));

    expect(stack.containsTarget("a", host.querySelector("#in-b"))).toBe(false);
  });

  it("survives a parent cycle rather than hanging", () => {
    const host = mount(`<div id="a"></div><div id="b"></div>`);
    const stack = getLayerStack(document);
    stack.add(layerOf(host.querySelector("#a") as HTMLElement, "a", { parentId: "b" }));
    stack.add(layerOf(host.querySelector("#b") as HTMLElement, "b", { parentId: "a" }));

    expect(stack.descendantsOf("a")).toHaveLength(1);
  });

  it("dismisses the top layer — the gamepad B button", () => {
    const host = mount(`<div id="a"></div><div id="b"></div>`);
    const stack = getLayerStack(document);
    const top = layerOf(host.querySelector("#b") as HTMLElement, "b");
    stack.add(layerOf(host.querySelector("#a") as HTMLElement, "a"));
    stack.add(top);

    expect(stack.dismissTop("back")).toBe(true);
    expect(top.dismiss).toHaveBeenCalledWith("back");

    stack.remove("b");
    stack.remove("a");
    expect(stack.dismissTop("back")).toBe(false);
  });

  it("knows when a modal covers a layer", () => {
    const host = mount(`<div id="a"></div><div id="b"></div>`);
    const stack = getLayerStack(document);
    stack.add(layerOf(host.querySelector("#a") as HTMLElement, "a"));
    stack.add(
      layerOf(host.querySelector("#b") as HTMLElement, "b", { modal: true, type: "dialog" }),
    );

    expect(stack.hasModalAbove("a")).toBe(true);
    expect(stack.hasModalAbove("b")).toBe(false);
  });
});

describe("trackDismissableLayer", () => {
  function scene(): { content: HTMLElement; trigger: HTMLElement; outside: HTMLElement } {
    const host = mount(`
      <button id="trigger"></button>
      <button id="outside"></button>
      <div id="content"><button id="inside"></button></div>
    `);
    return {
      content: host.querySelector("#content") as HTMLElement,
      trigger: host.querySelector("#trigger") as HTMLElement,
      outside: host.querySelector("#outside") as HTMLElement,
    };
  }

  it("dismisses on Escape and on an outside press", () => {
    const { content, outside } = scene();
    const onDismiss = vi.fn();
    cleanups.push(trackDismissableLayer(content, { id: "p", type: "popover", onDismiss }));

    pressEscape();
    expect(onDismiss).toHaveBeenCalledWith("escape");

    outside.dispatchEvent(pointer("pointerdown"));
    outside.dispatchEvent(pointer("pointerup"));
    expect(onDismiss).toHaveBeenCalledWith("outside-pointer");
  });

  function focusOutside(node: HTMLElement): void {
    node.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  }

  /**
   * Focus leaving used to travel on the pointer's channel as well as its own:
   * `interact-outside`'s `focusin` handler called `onInteractOutside` too, and
   * `dismissable` routes that to `outside-pointer`. So a surface closed with a
   * reason nobody had produced, and the pair a popover anchored to a field needs —
   * dismiss on an outside click, hold when focus leaves — could not be asked for at
   * all. Nobody had seen it because a dialog is modal by default and traps focus.
   */
  it("does not dismiss on focus leaving unless asked to", () => {
    const { content, outside } = scene();
    const onDismiss = vi.fn();
    cleanups.push(trackDismissableLayer(content, { id: "p", type: "popover", onDismiss }));

    focusOutside(outside);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reports focus-outside, and never the pointer, when it is asked to", () => {
    const { content, outside } = scene();
    const onDismiss = vi.fn();
    cleanups.push(
      trackDismissableLayer(content, {
        id: "p",
        type: "popover",
        onDismiss,
        dismissOnFocusOutside: true,
      }),
    );

    focusOutside(outside);

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("focus-outside");
  });

  it("can dismiss on an outside click and hold when focus leaves", () => {
    const { content, outside } = scene();
    const onDismiss = vi.fn();
    cleanups.push(trackDismissableLayer(content, { id: "p", type: "popover", onDismiss }));

    focusOutside(outside);
    expect(onDismiss).not.toHaveBeenCalled();

    outside.dispatchEvent(pointer("pointerdown"));
    outside.dispatchEvent(pointer("pointerup"));

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("outside-pointer");
  });

  /**
   * The guard the pointer path already had, which the focus path needs its own copy
   * of now that it has become a path: the focus that left this layer went *into* the
   * modal above it, and dismissing on that closes the wrong surface.
   */
  it("holds when the focus that left went into a modal above it", () => {
    const { content } = scene();
    const host = mount(`<div id="above"><button id="in-modal"></button></div>`);
    const above = host.querySelector("#above") as HTMLElement;
    const onUnder = vi.fn();

    cleanups.push(
      trackDismissableLayer(content, {
        id: "under",
        type: "popover",
        onDismiss: onUnder,
        dismissOnFocusOutside: true,
      }),
    );
    cleanups.push(
      trackDismissableLayer(above, {
        id: "above",
        type: "dialog",
        modal: true,
        onDismiss: vi.fn(),
      }),
    );

    focusOutside(host.querySelector("#in-modal") as HTMLElement);

    expect(onUnder).not.toHaveBeenCalled();
  });

  it("ignores a press on its own content", () => {
    const { content } = scene();
    const onDismiss = vi.fn();
    cleanups.push(trackDismissableLayer(content, { id: "p", type: "popover", onDismiss }));

    const inside = content.querySelector("#inside") as HTMLElement;
    inside.dispatchEvent(pointer("pointerdown"));
    inside.dispatchEvent(pointer("pointerup"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("excludes the trigger, so closing does not immediately reopen", () => {
    const { content, trigger } = scene();
    const onDismiss = vi.fn();
    cleanups.push(
      trackDismissableLayer(content, {
        id: "p",
        type: "popover",
        onDismiss,
        exclude: () => [trigger],
      }),
    );

    trigger.dispatchEvent(pointer("pointerdown"));
    trigger.dispatchEvent(pointer("pointerup"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("gives Escape to the top layer only", () => {
    const { content } = scene();
    const host = mount(`<div id="nested"></div>`);
    const nested = host.querySelector("#nested") as HTMLElement;
    const onOuter = vi.fn();
    const onInner = vi.fn();

    cleanups.push(
      trackDismissableLayer(content, { id: "outer", type: "dialog", onDismiss: onOuter }),
    );
    cleanups.push(
      trackDismissableLayer(nested, {
        id: "inner",
        type: "popover",
        parentId: "outer",
        onDismiss: onInner,
      }),
    );

    pressEscape();

    expect(onInner).toHaveBeenCalledWith("escape");
    expect(onOuter).not.toHaveBeenCalled();
  });

  it("does not dismiss a parent when its portalled child is clicked", () => {
    const { content } = scene();
    const host = mount(`<div id="nested"><button id="in-nested"></button></div>`);
    const nested = host.querySelector("#nested") as HTMLElement;
    const onOuter = vi.fn();

    cleanups.push(
      trackDismissableLayer(content, { id: "outer", type: "dialog", onDismiss: onOuter }),
    );
    cleanups.push(
      trackDismissableLayer(nested, {
        id: "inner",
        type: "popover",
        parentId: "outer",
        onDismiss: vi.fn(),
      }),
    );

    const target = host.querySelector("#in-nested") as HTMLElement;
    target.dispatchEvent(pointer("pointerdown"));
    target.dispatchEvent(pointer("pointerup"));

    expect(onOuter).not.toHaveBeenCalled();
  });

  it("leaves a layer alone while a modal covers it", () => {
    const { content, outside } = scene();
    const host = mount(`<div id="modal"></div>`);
    const onUnder = vi.fn();

    cleanups.push(
      trackDismissableLayer(content, { id: "under", type: "popover", onDismiss: onUnder }),
    );
    const stack = getLayerStack(document);
    stack.add(
      layerOf(host.querySelector("#modal") as HTMLElement, "modal", {
        modal: true,
        type: "dialog",
      }),
    );

    outside.dispatchEvent(pointer("pointerdown"));
    outside.dispatchEvent(pointer("pointerup"));

    expect(onUnder).not.toHaveBeenCalled();
  });

  it("lets a handler veto Escape by preventing the event", () => {
    const { content } = scene();
    const onDismiss = vi.fn();
    cleanups.push(
      trackDismissableLayer(content, {
        id: "p",
        type: "popover",
        onDismiss,
        onEscapeKeyDown: (event) => event.preventDefault(),
      }),
    );

    pressEscape();

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("honours the dismissOnEscape and dismissOnOutsidePointer switches", () => {
    const { content, outside } = scene();
    const onDismiss = vi.fn();
    cleanups.push(
      trackDismissableLayer(content, {
        id: "p",
        type: "popover",
        onDismiss,
        dismissOnEscape: false,
        dismissOnOutsidePointer: false,
      }),
    );

    pressEscape();
    outside.dispatchEvent(pointer("pointerdown"));
    outside.dispatchEvent(pointer("pointerup"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("leaves the stack when disposed", () => {
    const { content } = scene();
    const dispose = trackDismissableLayer(content, {
      id: "p",
      type: "popover",
      onDismiss: vi.fn(),
    });

    expect(getLayerStack(document).get("p")).toBeDefined();
    dispose();
    expect(getLayerStack(document).get("p")).toBeUndefined();
  });
});
