/**
 * The browser half of `search-field`, and its vanilla-shaped proof: connect
 * reaching real DOM with no framework in the room. Everything here needs a
 * running service — the clear gesture, the focus it hands back, and the document
 * listener the shortcut installs are all things a server never does.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./search-field.connect";
import { isSearchHotkey } from "./search-field.hotkey";
import { machine } from "./search-field.machine";
import type {
  SearchFieldApi,
  SearchFieldMachineProps,
  SearchFieldSchema,
} from "./search-field.types";

type Api = SearchFieldApi<DomPropTypes>;

function render(props: SearchFieldMachineProps = {}) {
  return mountMachine<SearchFieldSchema, Api>({
    machine,
    connect,
    // The row, the capsule, and the cancel button beside the capsule — the shape
    // the design shows and the shape a consumer writes.
    html: `<div><div><span></span><input /><button></button></div><button></button></div>`,
    id: "s1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      const field = root.children[0] as HTMLElement;
      apply(root, api.getRootProps());
      apply(field, api.getFieldProps());
      apply(field.children[0] as Element, api.getIndicatorProps());
      apply(field.children[1] as Element, api.getControlProps());
      apply(field.children[2] as Element, api.getClearTriggerProps());
      apply(root.children[1] as Element, api.getCancelTriggerProps());
    },
  });
}

function control(harness: ReturnType<typeof render>): HTMLInputElement {
  return harness.part<HTMLInputElement>("control");
}

function type(harness: ReturnType<typeof render>, text: string): void {
  const field = control(harness);
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressOn(node: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

/** A field of somebody else's, to prove the shortcut keeps its hands off it. */
function elsewhere(): HTMLInputElement {
  const node = document.createElement("input");
  document.body.append(node);
  return node;
}

afterEach(() => {
  unmountAll();
  for (const stray of document.querySelectorAll("body > input")) stray.remove();
});

describe("search-field", () => {
  it("records what the browser reports, and says when it is empty again", () => {
    const onValueChange = vi.fn();
    const harness = render({ onValueChange });
    const root = harness.part("root");

    expect(root.getAttribute("data-empty")).toBe("");

    type(harness, "quartz");

    expect(onValueChange).toHaveBeenCalledWith({ value: "quartz" });
    expect(harness.api().value).toBe("quartz");
    expect(root.hasAttribute("data-empty")).toBe(false);

    harness.api().clear();

    expect(root.getAttribute("data-empty")).toBe("");
  });

  it("shows the clear button with the first character and takes it away with the last", () => {
    const harness = render();
    const trigger = harness.part<HTMLButtonElement>("clear-trigger");

    expect(trigger.hidden).toBe(true);

    type(harness, "q");
    expect(trigger.hidden).toBe(false);

    trigger.click();

    expect(harness.api().value).toBe("");
    expect(trigger.hidden).toBe(true);
  });

  it("hands the focus back to the field when the clear button is used", () => {
    const harness = render({ defaultValue: "quartz" });
    const trigger = harness.part<HTMLButtonElement>("clear-trigger");

    trigger.click();

    // The button is about to disappear; a focus left on it lands on `<body>`,
    // and native desktop and mobile platforms leave you ready to retype.
    expect(document.activeElement).toBe(control(harness));
  });

  it("leaves the focus alone when the value is cleared from script", () => {
    const harness = render({ defaultValue: "quartz" });
    const other = elsewhere();
    other.focus();

    harness.api().clear();

    // `CLEAR.CLICK` and `VALUE.CLEAR` are two events precisely so that this one
    // does not move anybody's caret.
    expect(document.activeElement).toBe(other);
    expect(harness.api().value).toBe("");
  });

  it("keeps the caret in the field when the clear button is pressed with a pointer", () => {
    const harness = render({ defaultValue: "quartz" });
    const trigger = harness.part<HTMLButtonElement>("clear-trigger");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    trigger.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    // Out of the tab order, which is what the refused mousedown is there to make
    // survivable: the pointer never focuses it either.
    expect(trigger.tabIndex).toBe(-1);
  });

  it("refuses to clear a field nobody can edit", () => {
    for (const props of [{ disabled: true }, { readOnly: true }] as const) {
      const harness = render({ defaultValue: "kept", ...props });
      harness.part<HTMLButtonElement>("clear-trigger").click();

      expect(harness.api().value).toBe("kept");
    }
  });

  it("empties on Escape without being asked, and only while there is something to empty", () => {
    // The one default that differs from a text field, and the reason this
    // presentation exists.
    const harness = render({ defaultValue: "quartz" });
    const field = control(harness);

    const first = pressOn(field, { key: "Escape" });

    expect(first.defaultPrevented).toBe(true);
    expect(harness.api().value).toBe("");

    // Empty now: Escape belongs to whatever is above — that is the "then closes"
    // of the annexe, and it is the popover's to do.
    const second = pressOn(field, { key: "Escape" });

    expect(second.defaultPrevented).toBe(false);
  });

  it("gives Escape back entirely when a consumer turns clearing off", () => {
    const harness = render({ defaultValue: "quartz", clearOnEscape: false });

    const event = pressOn(control(harness), { key: "Escape" });

    expect(event.defaultPrevented).toBe(false);
    expect(harness.api().value).toBe("quartz");
  });

  it("takes the shortcut only when one was handed to it", () => {
    const harness = render({ defaultValue: "quartz", hotkey: isSearchHotkey });

    const event = pressOn(document.body, { key: "f", ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(control(harness));
    // Retypes rather than appends, the way ⌘F does in native desktop apps.
    expect(control(harness).selectionStart).toBe(0);
    expect(control(harness).selectionEnd).toBe("quartz".length);
  });

  it("keeps its hands off a keystroke aimed at another field", () => {
    render({ hotkey: isSearchHotkey });
    const other = elsewhere();
    other.focus();

    const event = pressOn(other, { key: "f", ctrlKey: true });

    // Ctrl+F is caret-forward in native desktop text fields and in every Emacs binding: stealing it
    // from a field somebody is typing in is a bug, not a feature.
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(other);
  });

  it("installs nothing at all when no shortcut was asked for", () => {
    render({ defaultValue: "quartz" });

    const event = pressOn(document.body, { key: "f", ctrlKey: true });

    // The browser's own find-in-page is intact, which is the whole reason the
    // shortcut is opt-in.
    expect(event.defaultPrevented).toBe(false);
  });

  it("shows the focus ring only for a keyboard arrival, and holds it", () => {
    const harness = render();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    control(harness).focus();

    const root = harness.part("root");
    expect(root.getAttribute("data-focus")).toBe("");
    expect(root.getAttribute("data-focus-visible")).toBe("");
    expect(root.getAttribute("data-focus-source")).toBe("keyboard");

    control(harness).blur();

    expect(root.hasAttribute("data-focus")).toBe(false);
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("renders a landmark around a native searchbox", () => {
    const harness = render({ label: "Search files" });

    expect(harness.part("root").getAttribute("role")).toBe("search");
    expect(harness.part("root").getAttribute("aria-label")).toBe("Search files");
    expect(control(harness).type).toBe("search");
    expect(control(harness).hasAttribute("role")).toBe(false);
  });
});

/**
 * The button placed *outside* the capsule (48×48, beside a growing field). Cancelling is clearing plus a word about
 * it — never a word instead of one.
 */
describe("search-field — the cancel button", () => {
  function cancel(harness: ReturnType<typeof render>): HTMLButtonElement {
    return harness.part<HTMLButtonElement>("cancel-trigger");
  }

  it("appears with the first character and goes with the last", () => {
    const harness = render();

    expect(cancel(harness).hidden).toBe(true);

    type(harness, "q");
    expect(cancel(harness).hidden).toBe(false);

    cancel(harness).click();
    expect(cancel(harness).hidden).toBe(true);
  });

  it("empties, says so, and hands the caret back — in that order", () => {
    const order: string[] = [];
    const harness = render({
      defaultValue: "quartz",
      onValueChange: (details) => order.push(`value:${details.value}`),
      onCancel: () => order.push("cancel"),
    });

    cancel(harness).click();

    expect(harness.api().value).toBe("");
    // Both fire, and `onCancel` is last. A consumer filtering on the value has
    // to see the empty string or their list stays filtered; a consumer who moves
    // the focus inside `onCancel` has to win against the focus handed back
    // above it.
    expect(order).toEqual(["value:", "cancel"]);
    expect(document.activeElement).toBe(control(harness));
  });

  it("refuses on a field nobody can edit, and stays visible to say so", () => {
    for (const props of [{ disabled: true }, { readOnly: true }] as const) {
      const onCancel = vi.fn();
      const harness = render({ defaultValue: "kept", onCancel, ...props });

      expect(cancel(harness).hidden).toBe(false);
      expect(cancel(harness).disabled).toBe(true);

      cancel(harness).click();

      expect(harness.api().value).toBe("kept");
      expect(onCancel).not.toHaveBeenCalled();
    }
  });

  it("keeps the caret in the field when it is pressed with a pointer", () => {
    const harness = render({ defaultValue: "quartz" });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

    cancel(harness).dispatchEvent(mouseDown);

    // A pointer never takes this button's focus — which is also what keeps the
    // rescue below from firing on every click.
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("is a tab stop, unlike the clear button beside it", () => {
    const harness = render({ defaultValue: "quartz" });

    expect(cancel(harness).hasAttribute("tabindex")).toBe(false);
    expect(harness.part<HTMLButtonElement>("clear-trigger").tabIndex).toBe(-1);

    cancel(harness).focus();
    expect(document.activeElement).toBe(cancel(harness));
  });

  it("says nothing about its own focus on the element", () => {
    const harness = render({ defaultValue: "quartz" });
    cancel(harness).focus();

    // The focus is a ref, not context: nothing in the sheet reads it, so it
    // costs no transition, no notification and no repaint. The ring comes from
    // the page's modality instead.
    expect(cancel(harness).hasAttribute("data-focus")).toBe(false);
    expect(cancel(harness).hasAttribute("data-focus-visible")).toBe(false);
    expect(harness.service.state.get()).toBe("idle");
  });

  it("takes the focus back when somebody else empties the field under it", () => {
    const harness = render({ value: "quartz", onValueChange: () => undefined });
    cancel(harness).focus();
    expect(document.activeElement).toBe(cancel(harness));

    // The controlled path: no gesture of ours, so nothing in the event handlers
    // can hand the focus back. What carries the fact is the ref — by the time
    // this settles the button is `hidden` and the DOM has forgotten that the
    // focus was ever ours.
    harness.setProps({ value: "" });

    expect(document.activeElement).toBe(control(harness));
    expect(cancel(harness).hidden).toBe(true);
  });

  it("leaves the focus alone when the field merely loses a character", () => {
    const harness = render({ value: "quartz", onValueChange: () => undefined });
    cancel(harness).focus();

    harness.setProps({ value: "quart" });

    // The button is still there; a rescue here would be a theft.
    expect(document.activeElement).toBe(cancel(harness));
  });

  it("leaves the focus alone when it was never holding it", () => {
    const harness = render({ value: "quartz", onValueChange: () => undefined });
    const other = elsewhere();
    other.focus();

    harness.setProps({ value: "" });

    expect(document.activeElement).toBe(other);
  });

  it("cancels from script without emptying twice or taking a caret", () => {
    const onValueChange = vi.fn();
    const onCancel = vi.fn();
    const harness = render({ defaultValue: "quartz", onValueChange, onCancel });
    const other = elsewhere();
    other.focus();

    harness.api().cancel();

    expect(harness.api().value).toBe("");
    expect(onValueChange).toHaveBeenCalledWith({ value: "" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    // The same asymmetry `api.clear()` has: a programmatic call moves nobody's
    // caret.
    expect(document.activeElement).toBe(other);
  });

  it("still says it was cancelled on a field that was already empty", () => {
    const onValueChange = vi.fn();
    const onCancel = vi.fn();
    const harness = render({ onValueChange, onCancel });

    harness.api().cancel();

    // The bindable short-circuits an identical value, so there is no change to
    // report — and cancelling is an intention, not a variation of a value.
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape exactly as it was", () => {
    const onCancel = vi.fn();
    const harness = render({ defaultValue: "quartz", onCancel });

    const first = pressOn(control(harness), { key: "Escape" });

    // Escape empties, and it is not a cancel: making a shipped key start firing
    // a new callback changes its meaning without anybody asking.
    expect(first.defaultPrevented).toBe(true);
    expect(harness.api().value).toBe("");
    expect(onCancel).not.toHaveBeenCalled();

    // And the second one still belongs to whatever is above the field.
    expect(pressOn(control(harness), { key: "Escape" }).defaultPrevented).toBe(false);
    // Nor does the button listen for it — the layer above keeps its key.
    expect(pressOn(cancel(harness), { key: "Escape" }).defaultPrevented).toBe(false);
  });
});
