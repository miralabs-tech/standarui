/**
 * The node half of `tabs`: no document, no framework — the shape a server render
 * has, plus the one thing in this component that is genuinely pure.
 *
 * Everything the machine *does* is read off the DOM: the trigger order, the tab
 * stop, the indicator's geometry, where the focus goes when a tab closes. None of
 * that can be faked without lying about it, so it lives in
 * `tabs.browser.test.ts`, against a real engine.
 *
 * What is here instead is the markup `connect` emits before any of that has been
 * read — which is exactly what a server sends and what the first client render
 * has to agree with — and the keyboard wiring, which is a pure function of the
 * key, the orientation and the direction. `getRovingKeyAction`'s own table is
 * covered in `focus/roving-focus.test.ts`; what is proved here is that `tabs`
 * asks it the right question and claims the key only when it answered.
 */

import { describe, expect, it } from "vitest";
import type { EventHandler } from "../../machine/prop-types";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./tabs.connect";
import { machine } from "./tabs.machine";
import type { TabsApi, TabsMachineProps, TabsSchema } from "./tabs.types";

type Api = TabsApi<PlainPropTypes>;

const build = (props: TabsMachineProps = {}) =>
  connectWithoutDom<TabsSchema, Api>({ machine, connect, id: "t1", props });

interface FakeKey {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
}

/**
 * A keyboard event with only the fields `connect` reads. There is no
 * `KeyboardEvent` constructor in node, and building one would prove nothing extra:
 * what is under test is which keys are claimed, and the answer is arithmetic.
 */
function press(props: Record<string, unknown>, init: FakeKey): boolean {
  let prevented = false;
  const event = {
    key: init.key,
    shiftKey: init.shiftKey === true,
    altKey: init.altKey === true,
    ctrlKey: init.ctrlKey === true,
    metaKey: init.metaKey === true,
    repeat: init.repeat === true,
    defaultPrevented: false,
    preventDefault(): void {
      prevented = true;
    },
  };
  (props.onKeyDown as EventHandler<KeyboardEvent>)(event as unknown as KeyboardEvent);
  return prevented;
}

describe("tabs without a DOM", () => {
  it("connects on a server, where it can find none of its own tabs", () => {
    const harness = build({ defaultValue: "b" });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.service.state.get()).toBe("idle");
    expect(api.value).toBe("b");
    expect(api.focusedValue).toBeNull();
    // Nothing has been read, so the index is nowhere and the pill has no place.
    expect(api.getListProps().style).toEqual({
      "--sui-active-index": "-1",
      "--sui-item-count": "0",
    });
    expect(api.getIndicatorProps()["data-empty"]).toBe("");
  });

  it("paints the first frame without a spring", () => {
    // `data-immediate` is the styles' "do not travel". A pill that animated into
    // place on the first paint would slide in from wherever `inset-inline-start: 0`
    // put it, on every page load.
    expect(build({ defaultValue: "a" }).api().getIndicatorProps()["data-immediate"]).toBe("");
  });

  it("is a tab list, and says which way it runs in both dialects", () => {
    const api = build().api();
    const list = api.getListProps();

    expect(list.role).toBe("tablist");
    // Valid on `tablist` in both axes, so it is always emitted: a horizontal tab
    // list that says so is one an assistive technology can describe.
    expect(list["aria-orientation"]).toBe("horizontal");
    expect(list["data-orientation"]).toBe("horizontal");
    expect(list["data-snav"]).toBe("container");
    // Omitted unless asked for: the root inherits its direction.
    expect(api.getRootProps().dir).toBeUndefined();

    const vertical = build({ orientation: "vertical", dir: "rtl" }).api();
    expect(vertical.getListProps()["aria-orientation"]).toBe("vertical");
    expect(vertical.getRootProps().dir).toBe("rtl");
    expect(vertical.getContentProps({ value: "a" })["data-orientation"]).toBe("vertical");
  });

  it("names the trigger, the panel and the pair between them", () => {
    const api = build({ defaultValue: "a" }).api();
    const trigger = api.getTriggerProps({ value: "a", label: "Overview" });
    const content = api.getContentProps({ value: "a" });

    expect(trigger.id).toBe("tabs:t1:trigger:a");
    expect(trigger.role).toBe("tab");
    expect(trigger.type).toBe("button");
    expect(trigger["aria-selected"]).toBe("true");
    expect(trigger["aria-controls"]).toBe("tabs:t1:content:a");
    expect(trigger["data-value"]).toBe("a");
    expect(trigger["data-label"]).toBe("Overview");
    expect(trigger["data-state"]).toBe("active");

    expect(content.id).toBe("tabs:t1:content:a");
    expect(content.role).toBe("tabpanel");
    expect(content["aria-labelledby"]).toBe("tabs:t1:trigger:a");
    expect(content["data-state"]).toBe("active");
  });

  it("keeps the tab stop on the selected tab and nowhere else", () => {
    const api = build({ defaultValue: "b" }).api();

    expect(api.getTriggerProps({ value: "a" }).tabIndex).toBe(-1);
    expect(api.getTriggerProps({ value: "b" }).tabIndex).toBe(0);
    // The list holds exactly one stop; `Delete` is the keyboard route to closing.
    expect(api.getCloseTriggerProps({ value: "b" }).tabIndex).toBe(-1);
  });

  it("leaves the tab order alone when there is no selection to ride on", () => {
    // The stop rides on the selection, and a consumer who named none has none
    // until `syncTriggers` settles APG's "exactly one selected tab" — which needs
    // the document. So a server render of an unselected list has nothing to point
    // at, and `-1` on every trigger took the whole list out of the tab order for
    // that pass rather than saying so.
    const api = build().api();

    expect(api.getTriggerProps({ value: "a" }).tabIndex).toBeUndefined();
    expect(api.getTriggerProps({ value: "b" }).tabIndex).toBeUndefined();
  });

  it("points `aria-controls` at nothing until the panel is really there", () => {
    // A dangling IDREF is what `aria-valid-attr-value` reports, and `lazyMount` is
    // how one gets created: the panel of a tab that has never been activated is
    // not in the document at all. Missing is allowed — `aria-controls` is
    // recommended on `role="tab"`, not required — dangling is not.
    const lazy = build({ defaultValue: "a", lazyMount: true }).api();

    expect(lazy.getTriggerProps({ value: "a" })["aria-controls"]).toBe("tabs:t1:content:a");
    expect(lazy.getTriggerProps({ value: "b" })["aria-controls"]).toBeUndefined();

    // Without `lazyMount` the panel still leaves the tree when it deactivates
    // (the adapter's presence path owns that), so the same rule applies.
    const eager = build({ defaultValue: "a" }).api();
    expect(eager.getTriggerProps({ value: "b" })["aria-controls"]).toBeUndefined();

    // `keepMounted` is the one arrangement where every panel is always there.
    const kept = build({ defaultValue: "a", keepMounted: true }).api();
    expect(kept.getTriggerProps({ value: "b" })["aria-controls"]).toBe("tabs:t1:content:b");
  });

  it("gates the panel on `lazyMount`, and never closes the gate again", () => {
    expect(build({ defaultValue: "a" }).api().isMounted("b")).toBe(true);

    const lazy = build({ defaultValue: "a", lazyMount: true });
    expect(lazy.api().isMounted("a")).toBe(true);
    expect(lazy.api().isMounted("b")).toBe(false);

    lazy.setProps({ value: "b" });
    expect(lazy.api().isMounted("b")).toBe(true);

    // Visited once is visited for good: a panel that unmounted itself every time
    // its tab was left would make `lazyMount` a re-mount on every selection.
    lazy.setProps({ value: "a" });
    expect(lazy.api().isMounted("b")).toBe(true);
  });

  it("hides a kept panel rather than leaving two on the page", () => {
    const kept = build({ defaultValue: "a", keepMounted: true }).api();

    expect(kept.getContentProps({ value: "a" }).hidden).toBeUndefined();
    expect(kept.getContentProps({ value: "b" }).hidden).toBe(true);
    expect(kept.getContentProps({ value: "b" })["data-state"]).toBe("inactive");

    // Without `keepMounted` the panel is unmounted instead, and `hidden` would
    // kill the exit animation on the way out.
    expect(
      build({ defaultValue: "a" }).api().getContentProps({ value: "b" }).hidden,
    ).toBeUndefined();
  });

  it("gives the panel no tab stop until one has been proved to be needed", () => {
    // Measured, not assumed — and nothing has been measured yet. A stop guessed
    // here is one the first client render would have to take back.
    expect(build({ defaultValue: "a" }).api().getContentProps({ value: "a" }).tabIndex).toBe(
      undefined,
    );
  });

  it("lets the controlled value win over the default it was given as well", () => {
    const seen: (string | null)[] = [];
    const harness = build({
      defaultValue: "a",
      value: "c",
      onValueChange: ({ value }) => seen.push(value),
    });

    expect(harness.api().value).toBe("c");
    // A controlled value the consumer already holds is not a change, so nothing
    // is reported for merely rendering it. What happens when the machine *wants*
    // to change it needs the machine running — `tabs.browser.test.ts` owns that.
    expect(seen).toEqual([]);

    harness.setProps({ value: "b" });
    expect(harness.api().value).toBe("b");
    expect(seen).toEqual([]);
  });

  it("disables every tab when the list is disabled, and says so on the root", () => {
    const api = build({ disabled: true }).api();

    expect(api.disabled).toBe(true);
    expect(api.getRootProps()["data-disabled"]).toBe("");
    expect(api.getListProps()["data-disabled"]).toBe("");
    expect(api.getTriggerProps({ value: "a" }).disabled).toBe(true);
    expect(api.getTriggerProps({ value: "a" })["data-disabled"]).toBe("");
    expect(api.getCloseTriggerProps({ value: "a" }).disabled).toBe(true);
  });

  it("wears no focus ring until a focus has actually landed", () => {
    const trigger = build({ defaultValue: "a" }).api().getTriggerProps({ value: "a" });

    expect(trigger["data-focus-visible"]).toBeUndefined();
    // On the focused tab only, and there is none: an attribute on every tab
    // describes nothing and would draw the ring three times.
    expect(trigger["data-focus-source"]).toBeUndefined();
  });

  it("carries the field's description onto the list, where the tabs inherit it", () => {
    expect(build({ describedBy: "hint-1" }).api().getListProps()["aria-describedby"]).toBe(
      "hint-1",
    );
  });

  it("opens the closing affordances only when the consumer asked for them", () => {
    expect(build().api().getTriggerProps({ value: "a" })["data-closable"]).toBeUndefined();
    expect(build({ closable: true }).api().getTriggerProps({ value: "a" })["data-closable"]).toBe(
      "",
    );
    expect(build({ closable: true }).api().getCloseTriggerProps({ value: "a" })["data-value"]).toBe(
      "a",
    );
  });
});

describe("tabs — the keys it claims", () => {
  const trigger = (props: TabsMachineProps = {}): Record<string, unknown> =>
    build(props).api().getTriggerProps({ value: "a" });

  it("claims the arrows on its own axis and leaves the other one to the page", () => {
    expect(press(trigger(), { key: "ArrowRight" })).toBe(true);
    expect(press(trigger(), { key: "ArrowLeft" })).toBe(true);
    // `bothAxes: false`. Off-axis the arrow is still the browser's, and the page
    // has to keep scrolling under a tab list that is not vertical.
    expect(press(trigger(), { key: "ArrowDown" })).toBe(false);
    expect(press(trigger(), { key: "ArrowUp" })).toBe(false);

    const vertical: TabsMachineProps = { orientation: "vertical" };
    expect(press(trigger(vertical), { key: "ArrowDown" })).toBe(true);
    expect(press(trigger(vertical), { key: "ArrowRight" })).toBe(false);
  });

  it("mirrors in RTL, once, where the mirror belongs", () => {
    // The claim is the same in both directions — what changes is which tab it
    // resolves to, and that lives in `getRovingKeyAction`, not in a second keymap.
    expect(press(trigger({ dir: "rtl" }), { key: "ArrowRight" })).toBe(true);
    expect(press(trigger({ dir: "rtl", orientation: "vertical" }), { key: "ArrowRight" })).toBe(
      false,
    );
  });

  it("claims Home and End in both orientations", () => {
    expect(press(trigger(), { key: "Home" })).toBe(true);
    expect(press(trigger(), { key: "End" })).toBe(true);
    expect(press(trigger({ orientation: "vertical" }), { key: "Home" })).toBe(true);
  });

  it("ignores a modified arrow", () => {
    // Shift+arrow belongs to the components that have ranges; consuming it here
    // would move the focus in the middle of somebody's selection. Alt, Ctrl and
    // Meta are the browser's and the platform's.
    expect(press(trigger(), { key: "ArrowRight", shiftKey: true })).toBe(false);
    expect(press(trigger(), { key: "ArrowRight", altKey: true })).toBe(false);
    expect(press(trigger(), { key: "ArrowRight", ctrlKey: true })).toBe(false);
    expect(press(trigger(), { key: "ArrowRight", metaKey: true })).toBe(false);
  });

  it("never prevents Enter or Space, so a real button still produces its click", () => {
    expect(press(trigger(), { key: "Enter" })).toBe(false);
    expect(press(trigger(), { key: " " })).toBe(false);
    expect(press(trigger({ activationMode: "manual" }), { key: "Enter" })).toBe(false);
  });

  it("answers Space on keyup and not on keydown", () => {
    // The APG split `research/input.md` §1 makes a rule across the library. Which
    // of the two moments actually commits is proved against a real engine in
    // `tabs.browser.test.ts`; what is proved here is that both handlers exist and
    // that the keydown one lets Space through to its sibling.
    const props = trigger({ activationMode: "manual" });
    expect(typeof props.onKeyUp).toBe("function");
    expect(press(props, { key: " " })).toBe(false);
  });

  it("claims Delete only when the tabs can be closed", () => {
    expect(press(trigger(), { key: "Delete" })).toBe(false);
    expect(press(trigger({ closable: true }), { key: "Delete" })).toBe(true);
    expect(press(trigger({ closable: true, disabled: true }), { key: "Delete" })).toBe(false);
    // A held key is one press. Without the filter, leaning on Delete asks the
    // consumer to close tabs it has already been told to remove.
    expect(press(trigger({ closable: true }), { key: "Delete", repeat: true })).toBe(false);
  });

  it("leaves Escape alone — a tab list is not a layer", () => {
    // A `tabs` that swallowed Escape inside a dialog would make the dialog
    // unclosable from the one control the user was looking at.
    expect(press(trigger(), { key: "Escape" })).toBe(false);
    expect(press(trigger(), { key: "Tab" })).toBe(false);
  });
});

describe("tabs — the drawn bar", () => {
  it("names the bar and the thumb, and hides the bar from the tree", () => {
    const api = build().api();
    const bar = api.getScrollbarProps();
    const thumb = api.getThumbProps();

    expect(bar["data-part"]).toBe("tabs:scrollbar");
    expect(bar["aria-hidden"]).toBe("true");
    expect(bar["data-orientation"]).toBe("horizontal");
    expect(thumb["data-part"]).toBe("tabs:thumb");
    expect(new Set([api.getListProps()["id"], bar["id"], thumb["id"]]).size).toBe(3);
  });

  it("writes no state a bar owns: the effect does", () => {
    const api = build().api();

    expect(api.getScrollbarProps()["data-state"]).toBeUndefined();
    expect(api.getScrollbarProps()["data-dragging"]).toBeUndefined();
    expect(api.getThumbProps()["style"]).toBeUndefined();
  });
});
