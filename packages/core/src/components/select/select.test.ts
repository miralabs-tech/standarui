/**
 * The node half of `select`: no document anywhere, the open state included.
 *
 * The overlay half repeats the menu's proof — the open state is entered, its
 * effects install and tear down, and none of them reaches for a document that
 * does not exist. The collection half lives next door in
 * `select.browser.test.ts`, deliberately: the item list is read from the live
 * DOM, so *which* item a rule picks is an interaction with real elements. What
 * stays here is what a machine can answer alone — the ids, the projection of
 * `open`, the three controlled paths, the value/label discipline, the form
 * reset, the dismissal locks and the trigger's key table.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DismissReason } from "../../interaction/layer-stack";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./select.connect";
import { machine } from "./select.machine";
import type { SelectApi, SelectMachineProps, SelectSchema } from "./select.types";

type Api = SelectApi<PlainPropTypes>;

const build = (props: SelectMachineProps = {}, id = "s1") =>
  connectWithoutDom<SelectSchema, Api>({ machine, connect, id, props });

function run(props: SelectMachineProps = {}, id = "s1") {
  const harness = build(props, id);
  harness.service.start();
  return harness;
}

/** What a prop getter's key handler is handed, minus everything it never reads. */
function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    preventDefault() {},
    ...init,
  } as unknown as KeyboardEvent;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("select without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server, with the combobox the APG select-only pattern asks for", () => {
    const harness = build();
    const trigger = harness.api().getTriggerProps();

    expect(harness.service.status()).toBe("not-started");
    expect(trigger.id).toBe("select:s1:trigger");
    expect(trigger.role).toBe("combobox");
    expect(trigger.type).toBe("button");
    expect(trigger["aria-haspopup"]).toBe("listbox");
    expect(trigger["aria-expanded"]).toBe("false");
    // Unconditional, unlike the menu's: the content is always mounted, so the
    // IDREF always resolves — even while closed.
    expect(trigger["aria-controls"]).toBe("select:s1:content");
    expect(trigger["data-placeholder"]).toBe("");
    expect(trigger["data-state"]).toBe("closed");
  });

  it("renders the listbox with a constant selection gutter and the trigger as its name", () => {
    const content = build({ defaultOpen: true }).api().getContentProps();

    expect(content.role).toBe("listbox");
    expect(content.id).toBe("select:s1:content");
    expect(content["aria-labelledby"]).toBe("select:s1:trigger");
    expect(content["aria-label"]).toBeUndefined();
    expect(content["aria-orientation"]).toBe("vertical");
    expect(content.tabIndex).toBe(-1);
    // Constant, never detected: a select always reserves the checkmark column,
    // because any row can become the checked one.
    expect(content["data-has-selection"]).toBe("");
    expect(content["data-state"]).toBe("open");
    expect(content["data-presentation"]).toBe("popup");
    expect(content["data-sui-on-glass"]).toBe("");
    expect(content["data-snav"]).toBe("container");
    expect(content["data-snav-wrap"]).toBe("y");
    expect(content["data-snav-trap"]).toBeUndefined();
  });

  it("lets an explicit label win over the trigger, never both (the menu's arbitrage)", () => {
    const api = build({ label: "Sort order" }).api();
    const content = api.getContentProps();

    expect(content["aria-label"]).toBe("Sort order");
    expect(content["aria-labelledby"]).toBeUndefined();

    // And the combobox itself: `role="combobox"` takes no name from its
    // contents (they are the value), so the label names the trigger too —
    // unless a `labelledBy` already does, which outranks it.
    expect(api.getTriggerProps()["aria-label"]).toBe("Sort order");
    const labelled = build({ label: "Sort order", labelledBy: "ext" }, "s2").api();
    expect(labelled.getTriggerProps()["aria-labelledby"]).toBe("ext");
    expect(labelled.getTriggerProps()["aria-label"]).toBeUndefined();
  });

  it("mirrors the form contract onto the hidden select and keeps it out of everything else", () => {
    const api = build({
      name: "fruit",
      form: "checkout",
      required: true,
      defaultValue: "apple",
    }).api();
    const mirror = api.getHiddenSelectProps();

    expect(mirror.name).toBe("fruit");
    expect(mirror.form).toBe("checkout");
    expect(mirror.required).toBe(true);
    expect(mirror.value).toBe("apple");
    // Never focusable, never announced: the trigger is the control people use.
    expect(mirror["aria-hidden"]).toBe("true");
    expect(mirror.tabIndex).toBe(-1);
  });

  it("carries required and invalid on the trigger, not on the surface", () => {
    const trigger = build({ required: true, invalid: true }).api().getTriggerProps();

    expect(trigger["aria-required"]).toBe("true");
    expect(trigger["aria-invalid"]).toBe("true");
    expect(trigger["data-invalid"]).toBe("");
  });

  it("gives an item one identity, the selection on aria-selected and the highlight elsewhere", () => {
    const api = build({
      defaultOpen: true,
      defaultValue: "b",
      defaultHighlightedValue: "a",
    }).api();
    const highlighted = api.getItemProps({ value: "a", label: "Apple" });
    const selected = api.getItemProps({ value: "b" });
    const disabled = api.getItemProps({ value: "c", disabled: true });

    expect(highlighted.id).toBe("select:s1:item:a");
    expect(highlighted.role).toBe("option");
    // Roving: exactly one stop in the tab order, and it is the highlighted item.
    expect(highlighted.tabIndex).toBe(0);
    expect(highlighted["data-highlighted"]).toBe("");
    expect(highlighted["aria-selected"]).toBe("false");
    expect(highlighted["data-label"]).toBe("Apple");

    // The selection, not the highlight: aria-selected follows the value.
    expect(selected["aria-selected"]).toBe("true");
    expect(selected["data-state"]).toBe("checked");
    expect(selected.tabIndex).toBe(-1);

    expect(disabled["aria-disabled"]).toBe("true");
    expect(disabled["data-disabled"]).toBe("");
  });

  it("ties a group to its label through one key, and hides every decoration", () => {
    const api = build({ defaultOpen: true }).api();
    const group = api.getItemGroupProps({ id: "fruits", label: true });
    const label = api.getItemGroupLabelProps({ htmlFor: "fruits" });

    expect(group.role).toBe("group");
    expect(group["aria-labelledby"]).toBe(label.id);
    expect(api.getItemGroupProps({ id: "fruits" })["aria-labelledby"]).toBeUndefined();
    expect(label.role).toBeUndefined();

    for (const props of [
      api.getItemSymbolProps(),
      api.getItemIndicatorProps({ value: "a" }),
      api.getIndicatorProps(),
      api.getBackdropProps(),
    ]) {
      expect(props["aria-hidden"]).toBe("true");
      expect(props.tabIndex).toBeUndefined();
    }
  });

  it("keeps the separator out of the listbox's owned children (role=none, unlike the menu)", () => {
    const separator = build().api().getSeparatorProps();

    expect(separator.role).toBe("none");
    expect(separator["aria-hidden"]).toBe("true");
  });

  it("keeps the cancel trigger reachable by touch but out of the tab order", () => {
    const cancel = build().api().getCancelTriggerProps();

    expect(cancel.tabIndex).toBe(-1);
    expect(cancel["aria-hidden"]).toBeUndefined();
    expect(cancel.type).toBe("button");
  });
});

describe("select — controlled and uncontrolled", () => {
  it("commits a click, reports it, and closes", () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    const harness = run({ defaultOpen: true, onValueChange, onOpenChange });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(harness.service.context.get("value")).toBe("apple");
    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
  });

  it("never writes the value when it is controlled", () => {
    const onValueChange = vi.fn();
    const harness = run({ defaultOpen: true, value: "banana", onValueChange });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(harness.service.context.get("value")).toBe("banana");
  });

  it("never writes `open` when it is controlled either", () => {
    const onOpenChange = vi.fn();
    const harness = run({ open: true, onOpenChange });

    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });

    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
    expect(harness.service.state.get()).toBe("open");
  });

  it("moves the highlight, reports it, and respects a controlled one", () => {
    const onHighlightChange = vi.fn();
    const harness = run({ defaultOpen: true, onHighlightChange });

    harness.service.send({ type: "HIGHLIGHT.SET", value: "apple" });
    expect(harness.service.context.get("highlightedValue")).toBe("apple");
    harness.service.send({ type: "HIGHLIGHT.SET", value: null });
    expect(harness.service.context.get("highlightedValue")).toBeNull();
    expect(onHighlightChange.mock.calls).toEqual([[{ value: "apple" }], [{ value: null }]]);

    const controlled = run({ defaultOpen: true, highlightedValue: "a", onHighlightChange }, "s2");
    controlled.service.send({ type: "HIGHLIGHT.SET", value: "b" });
    expect(controlled.service.context.get("highlightedValue")).toBe("a");
  });

  it("keeps `closeOnSelect: false` open across a commit", () => {
    const onValueChange = vi.fn();
    const harness = run({ defaultOpen: true, closeOnSelect: false, onValueChange });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(harness.service.state.get()).toBe("open");
  });

  it("changes the value through the api without ever touching `open`", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.api().setValue("apple");
    expect(harness.service.context.get("value")).toBe("apple");
    expect(harness.service.state.get()).toBe("closed");

    harness.api().clearValue();
    expect(harness.service.context.get("value")).toBeNull();
    // With no DOM there is no item to caption; the label stays honest.
    expect(harness.service.context.get("valueLabel")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does nothing at all when it is disabled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ disabled: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "next" });
    harness.service.send({ type: "TYPEAHEAD.KEY", key: "a" });

    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.api().getTriggerProps()["data-disabled"]).toBe("");
  });

  it("holds the select open for the release of the press that opened it", () => {
    vi.useFakeTimers();
    const harness = run();

    // Press-drag-release: the pointer goes down, the select opens, and the
    // click the release synthesises must not read as a second press.
    harness.service.send({ type: "TRIGGER.POINTERDOWN" });
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("open");

    // Past the grace it is a real second click, and the button toggles.
    vi.advanceTimersByTime(400);
    harness.service.send({ type: "TRIGGER.CLICK" });
    expect(harness.service.state.get()).toBe("closed");
  });

  it("remembers where the keyboard asked the highlight to land before there was one", () => {
    const harness = run();
    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "last" });

    expect(harness.service.state.get()).toBe("open");
    // Consumed by `highlightInitial` on entry — the request never outlives it.
    expect(harness.service.refs.get("pendingHighlight")).toBeNull();
  });
});

describe("select — the form contract", () => {
  it("restores the photo `FORM.RESET` was armed with", () => {
    const onValueChange = vi.fn();
    const harness = run({ defaultValue: "apple", onValueChange });

    harness.api().setValue("banana");
    expect(harness.service.context.get("value")).toBe("banana");

    harness.service.send({ type: "FORM.RESET" });

    expect(harness.service.context.get("value")).toBe("apple");
    expect(onValueChange).toHaveBeenLastCalledWith({ value: "apple" });
  });

  it("photographs a controlled `null` rather than folding it onto the default", () => {
    const harness = run({ value: null, defaultValue: "apple" });

    expect(harness.service.refs.get("initialValue")).toBeNull();
  });

  it("emits without writing on reset when the value is controlled", () => {
    const onValueChange = vi.fn();
    const harness = run({ value: "banana", onValueChange });
    harness.setProps({ value: "apple" });

    harness.service.send({ type: "FORM.RESET" });

    // The photo is the controlled value at creation; the consumer was asked to
    // go back to it and declined to answer, so the value stands.
    expect(onValueChange).toHaveBeenCalledWith({ value: "banana" });
    expect(harness.service.context.get("value")).toBe("apple");
  });
});

describe("select — the dismissal locks", () => {
  const LOCKS = {
    escape: "closeOnEscape",
    back: "closeOnEscape",
    // No drawer decorates this surface today, and the row is here anyway: the lock
    // belongs to the family, not to whoever happens to be draggable this week.
    drag: "closeOnEscape",
    "focus-outside": "closeOnInteractOutside",
    "outside-pointer": "closeOnInteractOutside",
  } as const satisfies Record<DismissReason, keyof SelectMachineProps>;

  for (const reason of Object.keys(LOCKS) as DismissReason[]) {
    it(`dismisses on ${reason} when ${LOCKS[reason]} is on — and never commits`, () => {
      const onDismiss = vi.fn();
      const onValueChange = vi.fn();
      const harness = run({ defaultOpen: true, [LOCKS[reason]]: true, onDismiss, onValueChange });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).toHaveBeenCalledWith({ reason });
      expect(onValueChange).not.toHaveBeenCalled();
      expect(harness.service.state.get()).toBe("closed");
    });

    it(`holds on ${reason} when ${LOCKS[reason]} is off`, () => {
      const onDismiss = vi.fn();
      const harness = run({ defaultOpen: true, [LOCKS[reason]]: false, onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).not.toHaveBeenCalled();
      expect(harness.service.state.get()).toBe("open");
    });
  }

  it("reads the lock live, never the copy it was installed with", () => {
    const harness = run({ defaultOpen: true });
    harness.setProps({ closeOnEscape: false });

    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });

    expect(harness.service.state.get()).toBe("open");
  });

  it("closes from the cancel button without a commit, reporting the back reason", () => {
    const onDismiss = vi.fn();
    const onValueChange = vi.fn();
    const harness = run({ defaultOpen: true, onDismiss, onValueChange });

    // The cancel is the touch twin of the B button, and the layer-stack
    // vocabulary has no "cancel" — so it reports the same reason B would.
    harness.service.send({ type: "CANCEL.CLICK" });

    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("select — the flash", () => {
  it("commits, then defers the close to FLASH.END — immediately with no window to wait on", () => {
    const onValueChange = vi.fn();
    const harness = run({ defaultOpen: true, onValueChange });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    // `flashSelection` cannot arm a timer without a window; it falls through to
    // an immediate FLASH.END, so the commit and the close both happened.
    expect(onValueChange).toHaveBeenCalledWith({ value: "apple" });
    expect(harness.service.context.get("flashingValue")).toBeNull();
    expect(harness.service.state.get()).toBe("closed");
  });

  it("skips the blink entirely when `selectionFlash` is off", () => {
    const harness = run({ defaultOpen: true, selectionFlash: false });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    expect(harness.service.context.get("flashingValue")).toBeNull();
    expect(harness.service.state.get()).toBe("closed");
  });

  it("never blinks in the sheet, whatever the prop says", () => {
    const harness = run({ defaultOpen: true, selectionFlash: true });
    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });

    harness.service.send({ type: "ITEM.CLICK", value: "apple" });

    expect(harness.service.context.get("flashingValue")).toBeNull();
    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("select — presentation is an attribute, never a state", () => {
  it("resolves `auto` from the density, and an explicit value wins over it", () => {
    const harness = run({ defaultOpen: true });
    expect(harness.api().presentation).toBe("popup");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(harness.api().presentation).toBe("sheet");

    const declared = run({ defaultOpen: true, presentation: "popup" }, "s2");
    declared.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(declared.api().presentation).toBe("popup");
  });

  it("changes one attribute and stays open across the flip", () => {
    const harness = run({ defaultOpen: true, intents: null });
    const before = harness.api().getContentProps();

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    const after = harness.api().getContentProps();

    expect(before["data-presentation"]).toBe("popup");
    expect(after["data-presentation"]).toBe("sheet");
    expect(harness.service.state.get()).toBe("open");
    expect(after.id).toBe(before.id);
    // The semantics never follow the presentation (doctrine ARIA).
    expect(after.role).toBe("listbox");
  });
});

describe("select — the closed typeahead", () => {
  it("opens on a printable character and defers it for the entry to honour", () => {
    const harness = run();

    harness.service.send({ type: "TYPEAHEAD.KEY", key: "b" });

    // APG select-only: taper ouvre et surligne — jamais de sélection fermée.
    expect(harness.service.state.get()).toBe("open");
    expect(harness.service.context.get("value")).toBeNull();
    // Consumed by `highlightInitial` — with no DOM there was nothing to match.
    expect(harness.service.refs.get("pendingTypeaheadKey")).toBeNull();
  });

  it("refuses the keystroke when typeahead is off", () => {
    const harness = run({ typeahead: false });

    harness.service.send({ type: "TYPEAHEAD.KEY", key: "b" });

    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("select — the trigger's key table", () => {
  function pressOnTrigger(harness: ReturnType<typeof run>, init: Parameters<typeof key>[0]): void {
    const handler = harness.api().getTriggerProps().onKeyDown as (event: KeyboardEvent) => void;
    handler(key(init));
  }

  it("opens on Enter, the arrows and their Alt variants, Home and End", () => {
    for (const init of [
      { key: "Enter" },
      { key: "ArrowDown" },
      { key: "ArrowUp" },
      { key: "ArrowDown", altKey: true },
      { key: "ArrowUp", altKey: true },
      { key: "Home" },
      { key: "End" },
    ]) {
      const harness = run();
      pressOnTrigger(harness, init);
      expect(harness.service.state.get(), init.key).toBe("open");
    }
  });

  it("opens on Space at keyup, not keydown — the APG split", () => {
    const harness = run();
    pressOnTrigger(harness, { key: " " });
    expect(harness.service.state.get()).toBe("closed");

    const up = harness.api().getTriggerProps().onKeyUp as (event: KeyboardEvent) => void;
    up(key({ key: " " }));
    expect(harness.service.state.get()).toBe("open");
  });

  it("opens on a printable character, and refuses one behind a modifier", () => {
    const harness = run();
    pressOnTrigger(harness, { key: "b", ctrlKey: true });
    expect(harness.service.state.get()).toBe("closed");

    pressOnTrigger(harness, { key: "b" });
    expect(harness.service.state.get()).toBe("open");
  });

  it("leaves Tab and unrelated keys to the browser", () => {
    const harness = run();
    pressOnTrigger(harness, { key: "Tab" });
    pressOnTrigger(harness, { key: "Escape" });
    expect(harness.service.state.get()).toBe("closed");
  });
});

describe("select — a whole life cycle with no document in the room", () => {
  it("opens, installs its effects, dismisses and stops without reaching for one", () => {
    const onDismiss = vi.fn();
    const harness = run({ onDismiss, intents: null });

    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "next" });
    expect(harness.service.state.get()).toBe("open");

    // The prop getters are what an adapter calls on every render, so they run
    // here too rather than being assumed harmless.
    const api = harness.api();
    api.getTriggerProps();
    api.getValueTextProps();
    api.getIndicatorProps();
    api.getHiddenSelectProps();
    api.getBackdropProps();
    api.getPositionerProps();
    api.getContentProps();
    api.getItemGroupProps({ id: "fruits" });
    api.getItemGroupLabelProps({ htmlFor: "fruits" });
    api.getItemProps({ value: "apple" });
    api.getItemTextProps();
    api.getItemSymbolProps();
    api.getItemIndicatorProps({ value: "apple" });
    api.getSeparatorProps();
    api.getCancelTriggerProps();

    // Every collection read answers "no items" — the honest answer for a
    // machine whose collection is the live DOM and which has no DOM.
    harness.service.send({ type: "HIGHLIGHT.MOVE", action: "next" });
    harness.service.send({ type: "TYPEAHEAD.KEY", key: "a" });
    expect(harness.service.context.get("highlightedValue")).toBeNull();

    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(harness.service.state.get()).toBe("closed");
    expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });

    expect(() => harness.service.stop()).not.toThrow();
  });

  it("survives the density flip that re-enters its own open state", () => {
    const harness = run({ defaultOpen: true, intents: null });

    expect(() => {
      harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
      harness.service.send({ type: "ENVIRONMENT.SYNC", density: "desktop" });
    }).not.toThrow();

    expect(harness.service.state.get()).toBe("open");
    expect(() => harness.service.stop()).not.toThrow();
  });
});
