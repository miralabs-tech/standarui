import { afterEach, describe, expect, it, vi } from "vitest";
import { trackInteractOutside } from "./interact-outside";
import { trackLongPress } from "./long-press";
import { type PressEvent, trackPress } from "./press";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function box(): HTMLElement {
  const host = mount(
    `<button style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px"></button>`,
  );
  return host.firstElementChild as HTMLElement;
}

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...init });
}

function press(node: HTMLElement, options: Parameters<typeof trackPress>[1]): VoidFunction {
  const dispose = trackPress(node, options);
  cleanups.push(dispose);
  return dispose;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("trackPress", () => {
  it("reports a full press over the target", () => {
    const node = box();
    const events: string[] = [];
    press(node, {
      onPressStart: () => events.push("start"),
      onPressEnd: () => events.push("end"),
      onPress: () => events.push("press"),
    });

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointerup", { clientX: 140, clientY: 120 }));

    expect(events).toEqual(["start", "end", "press"]);
  });

  it("follows the finger out of and back into the bounds", () => {
    const node = box();
    const events: string[] = [];
    press(node, {
      onPressStart: () => events.push("start"),
      onPressEnd: () => events.push("end"),
      onPress: () => events.push("press"),
    });

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 400 }));
    node.dispatchEvent(pointer("pointermove", { clientX: 141, clientY: 121 }));
    node.dispatchEvent(pointer("pointerup", { clientX: 141, clientY: 121 }));

    expect(events).toEqual(["start", "end", "start", "end", "press"]);
  });

  it("does not activate when the pointer leaves before release", () => {
    const node = box();
    const onPress = vi.fn();
    press(node, { onPress });

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointermove", { clientX: 900, clientY: 900 }));
    node.dispatchEvent(pointer("pointerup", { clientX: 900, clientY: 900 }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("cancels on pointercancel", () => {
    const node = box();
    const events: string[] = [];
    press(node, {
      onPressEnd: () => events.push("end"),
      onPress: () => events.push("press"),
      onPressCancel: () => events.push("cancel"),
    });

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointercancel", { clientX: 140, clientY: 120 }));

    expect(events).toEqual(["end", "cancel"]);
  });

  it("never calls preventDefault on a pointer event", () => {
    const node = box();
    press(node, { onPress: vi.fn() });

    const down = pointer("pointerdown", { clientX: 140, clientY: 120, cancelable: true });
    node.dispatchEvent(down);
    const up = pointer("pointerup", { clientX: 140, clientY: 120, cancelable: true });
    node.dispatchEvent(up);

    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });

  it("ignores a secondary button", () => {
    const node = box();
    const onPressStart = vi.fn();
    press(node, { onPressStart });

    node.dispatchEvent(pointer("pointerdown", { button: 2, clientX: 140, clientY: 120 }));

    expect(onPressStart).not.toHaveBeenCalled();
  });

  it("stays quiet while disabled", () => {
    const node = box();
    const onPress = vi.fn();
    press(node, { onPress, isDisabled: () => true });

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointerup", { clientX: 140, clientY: 120 }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("reports the pointer type, defaulting an unnamed one to virtual", () => {
    const node = box();
    const seen: string[] = [];
    press(node, { onPress: (event: PressEvent) => seen.push(event.pointerType) });

    node.dispatchEvent(
      pointer("pointerdown", { pointerType: "touch", clientX: 140, clientY: 120 }),
    );
    node.dispatchEvent(pointer("pointerup", { pointerType: "touch", clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointerup", { pointerId: 2, clientX: 140, clientY: 120 }));

    expect(seen).toEqual(["touch", "virtual"]);
  });

  it("activates Enter on keydown and Space on keyup", () => {
    const node = box();
    const events: string[] = [];
    press(node, {
      keyboard: true,
      onPressStart: () => events.push("start"),
      onPress: () => events.push("press"),
    });

    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(events).toEqual(["start", "press"]);

    events.length = 0;
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(events).toEqual(["start"]);
    node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(events).toEqual(["start", "press"]);
  });

  it("blocks the page scroll Space would cause, and nothing else", () => {
    const node = box();
    press(node, { keyboard: true, onPress: vi.fn() });

    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    node.dispatchEvent(space);
    node.dispatchEvent(enter);

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(false);
  });

  it("cancels a held key when focus leaves", () => {
    const node = box();
    const events: string[] = [];
    press(node, {
      keyboard: true,
      onPress: () => events.push("press"),
      onPressCancel: () => events.push("cancel"),
    });

    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    node.dispatchEvent(new FocusEvent("blur"));
    node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));

    expect(events).toEqual(["cancel"]);
  });

  it("stops listening once disposed", () => {
    const node = box();
    const onPress = vi.fn();
    press(node, { onPress })();

    node.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 120 }));
    node.dispatchEvent(pointer("pointerup", { clientX: 140, clientY: 120 }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("trackLongPress", () => {
  it("fires after the threshold on touch", async () => {
    const node = box();
    const onLongPress = vi.fn();
    cleanups.push(trackLongPress(node, { onLongPress, threshold: 30 }));

    node.dispatchEvent(
      pointer("pointerdown", { pointerType: "touch", clientX: 140, clientY: 120 }),
    );
    await wait(60);

    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onLongPress.mock.calls[0]?.[0]).toMatchObject({ pointerType: "touch", x: 140, y: 120 });
  });

  it("is cancelled by a release, and by drift past the tolerance", async () => {
    const node = box();
    const onLongPress = vi.fn();
    const onCancel = vi.fn();
    cleanups.push(trackLongPress(node, { onLongPress, onCancel, threshold: 30, tolerance: 5 }));

    node.dispatchEvent(
      pointer("pointerdown", { pointerType: "touch", clientX: 140, clientY: 120 }),
    );
    node.dispatchEvent(pointer("pointerup", { pointerType: "touch", clientX: 140, clientY: 120 }));
    await wait(60);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();

    node.dispatchEvent(
      pointer("pointerdown", { pointerType: "touch", clientX: 140, clientY: 120 }),
    );
    node.dispatchEvent(
      pointer("pointermove", { pointerType: "touch", clientX: 140, clientY: 160 }),
    );
    await wait(60);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores the mouse unless asked, since that is a right click", async () => {
    const node = box();
    const onLongPress = vi.fn();
    cleanups.push(trackLongPress(node, { onLongPress, threshold: 20 }));

    node.dispatchEvent(
      pointer("pointerdown", { pointerType: "mouse", clientX: 140, clientY: 120 }),
    );
    await wait(50);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe("trackInteractOutside", () => {
  function scene(): { inner: HTMLElement; outer: HTMLElement } {
    const host = mount(
      `<div id="layer"><button id="inner"></button></div><button id="outer"></button>`,
    );
    return {
      inner: host.querySelector("#inner") as HTMLElement,
      outer: host.querySelector("#outer") as HTMLElement,
    };
  }

  it("reports a pointer press that starts and ends outside", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onInteractOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onInteractOutside }));

    outer.dispatchEvent(pointer("pointerdown"));
    outer.dispatchEvent(pointer("pointerup"));

    expect(onInteractOutside).toHaveBeenCalledOnce();
  });

  it("ignores a press that started inside — that is a drag, not a dismissal", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onInteractOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onInteractOutside }));

    inner.dispatchEvent(pointer("pointerdown"));
    outer.dispatchEvent(pointer("pointerup"));

    expect(onInteractOutside).not.toHaveBeenCalled();
  });

  it("honours the injected predicate, which is where the layer stack plugs in", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onInteractOutside = vi.fn();
    cleanups.push(
      trackInteractOutside(layer, { onInteractOutside, isOutside: (target) => target !== outer }),
    );

    outer.dispatchEvent(pointer("pointerdown"));
    outer.dispatchEvent(pointer("pointerup"));

    expect(onInteractOutside).not.toHaveBeenCalled();
  });

  it("reports focus moving outside", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onFocusOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onFocusOutside }));

    outer.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    inner.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(onFocusOutside).toHaveBeenCalledOnce();
  });

  /**
   * And reports it *only* there. It used to call both callbacks on one `focusin`,
   * which made the two channels a caller sees indistinguishable: a keyboard exit
   * arrived as an outside interaction, and "dismiss on a click outside but not when
   * focus leaves" could not be expressed at all.
   */
  it("keeps focus off the pointer's channel", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onInteractOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onInteractOutside }));

    outer.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(onInteractOutside).not.toHaveBeenCalled();
  });

  it("sees past a shadow boundary", () => {
    const host = mount(`<div id="layer"></div><div id="host"></div>`);
    const layer = host.querySelector("#layer") as HTMLElement;
    const shadowHost = host.querySelector("#host") as HTMLElement;
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);
    const onInteractOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onInteractOutside }));

    inner.dispatchEvent(pointer("pointerdown", { composed: true }));
    inner.dispatchEvent(pointer("pointerup", { composed: true }));

    expect(onInteractOutside).toHaveBeenCalledOnce();
  });

  it("stays quiet while disabled", () => {
    const { inner, outer } = scene();
    const layer = inner.parentElement as HTMLElement;
    const onInteractOutside = vi.fn();
    cleanups.push(trackInteractOutside(layer, { onInteractOutside, isDisabled: () => true }));

    outer.dispatchEvent(pointer("pointerdown"));
    outer.dispatchEvent(pointer("pointerup"));

    expect(onInteractOutside).not.toHaveBeenCalled();
  });
});
