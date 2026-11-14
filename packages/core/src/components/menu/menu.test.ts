/**
 * The node half of `menu`: no document anywhere, the open state included.
 *
 * The menu is the first surface that is an overlay **and** a collection, so it is
 * also the first machine whose promises could be broken in two different ways. The
 * overlay half is the popover's proof, repeated because it is not inherited: the
 * open state is entered, its ten effects install and tear down, and not one of them
 * reaches for a document that does not exist (`scope.getDoc()` throws in this
 * project, so an effect that reached would surface here rather than in a page).
 *
 * The collection half is *why* half of the CDC's unit list lives next door instead.
 * The item list is read from the live DOM by design (`menu.dom.ts`), so the roving,
 * the typeahead and everything the select guards gate are interactions with real
 * elements, not arithmetic — they are proved in `menu.browser.test.ts`, and what
 * stays here is what a machine can answer alone: the ids, the projection of `open`,
 * the controlled paths, the tree, the dismissal locks and the pure key table.
 */

import { describe, expect, it, vi } from "vitest";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { DismissReason } from "../../interaction/layer-stack";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./menu.connect";
import {
  getSubmenuIntentAction,
  getSubmenuKeyAction,
  getTriggerOpenAction,
  toRovingIntentKey,
  toRovingKey,
} from "./menu.keys";
import { machine } from "./menu.machine";
import type { MenuApi, MenuMachineProps, MenuSchema } from "./menu.types";

type Api = MenuApi<PlainPropTypes>;

const build = (props: MenuMachineProps = {}, id = "m1") =>
  connectWithoutDom<MenuSchema, Api>({ machine, connect, id, props });

function run(props: MenuMachineProps = {}, id = "m1") {
  const harness = build(props, id);
  harness.service.start();
  return harness;
}

/** A parent and its submenu, wired the way an adapter's effect wires them. */
function tree(parentProps: MenuMachineProps = {}, childProps: MenuMachineProps = {}) {
  const parent = run({ defaultOpen: true, ...parentProps }, "m1");
  const child = run({ parentId: "menu:m1:content", defaultOpen: true, ...childProps }, "m2");
  parent.service.send({ type: "CHILD.SET", child: child.service });
  child.service.send({ type: "PARENT.SET", parent: parent.service });
  return { parent, child };
}

/** What a prop getter's `onClick` is handed, minus everything it never reads. */
const CLICK = { defaultPrevented: false } as unknown as MouseEvent;

describe("menu without a DOM", () => {
  it("resolves its initial state from the props alone, so the server renders the right markup", () => {
    expect(build().service.state.get()).toBe("closed");
    expect(build({ defaultOpen: true }).service.state.get()).toBe("open");
    expect(build({ open: true }).service.state.get()).toBe("open");
    expect(build({ open: false, defaultOpen: true }).service.state.get()).toBe("closed");
  });

  it("connects on a server, with the ids the markup will carry", () => {
    const harness = build({ defaultOpen: true });
    const content = harness.api().getContentProps();

    expect(harness.service.status()).toBe("not-started");
    expect(content.role).toBe("menu");
    expect(content.id).toBe("menu:m1:content");
    // **Withheld on the server, and that is the conservative answer rather than a
    // gap.** The surface names itself after its trigger, and whether a trigger was
    // rendered at all is read from the DOM — a menu composed with
    // `getContextTriggerProps` alone has none. Written blind it would be an IDREF
    // pointing at an id nobody wrote, which names nothing and which axe grades
    // `incomplete` rather than a violation. `data-has-selection` takes the same
    // shape for the same reason: the server writes what it has seen.
    expect(content["aria-labelledby"]).toBeUndefined();
    expect(content["aria-label"]).toBeUndefined();
    expect(content["aria-orientation"]).toBe("vertical");
    // The surface takes the focus itself before handing it to an item; it is never
    // in the tab order.
    expect(content.tabIndex).toBe(-1);
    expect(content["data-state"]).toBe("open");
    expect(content["data-presentation"]).toBe("popup");
    expect(content["data-level"]).toBe("0");
    // The surface applies the material, so the surface owes its contents the
    // on-glass palette (architecture.md).
    expect(content["data-sui-on-glass"]).toBe("");
  });

  it("names itself from its label when nothing is going to label it", () => {
    const content = build({ defaultOpen: true, label: "File actions" }).api().getContentProps();

    // Never both: a menu opened from a trigger is named by it, and one with no
    // trigger at all — a context menu — has only the label.
    expect(content["aria-label"]).toBe("File actions");
    expect(content["aria-labelledby"]).toBeUndefined();
  });

  it("seeds the placement it was given, so the first paint agrees with the server", () => {
    const asked = build({ defaultOpen: true, placement: "top-end" }).api();
    expect(asked.placement).toBe("top-end");
    expect(asked.getContentProps()["data-side"]).toBe("top");
    expect(asked.getContentProps()["data-align"]).toBe("end");

    const root = build({ defaultOpen: true }).api();
    expect(root.placement).toBe("bottom-start");

    // A submenu falls back to the other side, and `parentId` is the only hint that
    // exists before `PARENT.SET` lands — which is one commit too late for SSR.
    const submenu = build({ defaultOpen: true, parentId: "menu:m1:content" }).api();
    expect(submenu.placement).toBe("right-start");
    expect(submenu.getContentProps()["data-side"]).toBe("right");
  });

  it("writes back the placement the positioner landed on, not the one asked for", () => {
    const harness = run({ defaultOpen: true, placement: "right-start" });

    harness.service.send({ type: "POSITION.SYNC", placement: "left-end" });

    expect(harness.api().placement).toBe("left-end");
    expect(harness.api().getContentProps()["data-side"]).toBe("left");
    expect(harness.api().getContentProps()["data-align"]).toBe("end");
  });

  it("declares the spatial zone, and traps it only when it is modal", () => {
    const plain = build({ defaultOpen: true }).api().getContentProps();
    expect(plain["data-snav"]).toBe("container");
    expect(plain["data-snav-enter"]).toBe("first");
    expect(plain["data-snav-wrap"]).toBe("y");
    // Not trapped by default, and never through the intent scope: a trapped scope
    // silences the spatial engine and makes the menu's own interior unreachable.
    expect(plain["data-snav-trap"]).toBeUndefined();

    expect(
      build({ defaultOpen: true, modal: true }).api().getContentProps()["data-snav-trap"],
    ).toBe("");
    expect(
      build({ defaultOpen: true, loopFocus: false }).api().getContentProps()["data-snav-wrap"],
    ).toBeUndefined();
  });

  it("points the trigger at a surface only while there is one", () => {
    const closed = build().api().getTriggerProps();
    const open = build({ defaultOpen: true }).api().getTriggerProps();

    expect(closed["aria-haspopup"]).toBe("menu");
    expect(closed["aria-expanded"]).toBe("false");
    // A dangling IDREF names nothing.
    expect(closed["aria-controls"]).toBeUndefined();
    expect(open["aria-expanded"]).toBe("true");
    expect(open["aria-controls"]).toBe("menu:m1:content");
    expect(open["data-state"]).toBe("open");
  });

  it("gives an item one identity, one tab stop and every state the sheet reads", () => {
    const api = build({ defaultOpen: true, defaultHighlightedValue: "rename" }).api();
    const highlighted = api.getItemProps({ value: "rename", shortcut: "Enter" });
    const plain = api.getItemProps({ value: "open", label: "Open", description: true });
    const disabled = api.getItemProps({ value: "trash", disabled: true, destructive: true });

    expect(highlighted.id).toBe("menu:m1:item:rename");
    expect(highlighted.role).toBe("menuitem");
    // Roving: exactly one stop in the tab order, and it is the highlighted item.
    expect(highlighted.tabIndex).toBe(0);
    expect(highlighted["data-highlighted"]).toBe("");
    // The glyphs are decoration; the shortcut reaches assistive tech as a string.
    expect(highlighted["aria-keyshortcuts"]).toBe("Enter");

    expect(plain.tabIndex).toBe(-1);
    expect(plain["data-highlighted"]).toBeUndefined();
    expect(plain["data-label"]).toBe("Open");
    expect(plain["aria-describedby"]).toBe("menu:m1:item-description:open");

    expect(disabled["aria-disabled"]).toBe("true");
    expect(disabled["data-disabled"]).toBe("");
    expect(disabled["data-destructive"]).toBe("");
  });

  it("never highlights an item it has disabled", () => {
    const api = build({ defaultOpen: true, defaultHighlightedValue: "trash" }).api();
    const item = api.getItemProps({ value: "trash", disabled: true });

    expect(item["data-highlighted"]).toBeUndefined();
    expect(item.tabIndex).toBe(-1);
  });

  it("carries an option item's checked state without ever storing it", () => {
    const onCheckedChange = vi.fn();
    const harness = build({ defaultOpen: true });
    const api = harness.api();
    const checkbox = api.getOptionItemProps({
      type: "checkbox",
      value: "wrap",
      checked: true,
      onCheckedChange,
    });
    const radio = api.getOptionItemProps({ type: "radio", value: "name" });

    expect(checkbox.role).toBe("menuitemcheckbox");
    expect(checkbox["aria-checked"]).toBe("true");
    expect(checkbox["data-checked"]).toBe("");
    expect(radio.role).toBe("menuitemradio");
    expect(radio["aria-checked"]).toBe("false");

    (checkbox.onClick as (event: MouseEvent) => void)(CLICK);

    // The consumer owns the value; the menu reports the flip and keeps nothing, so
    // the next read still says what the *props* say and not what was clicked.
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(
      harness.api().getOptionItemProps({ type: "checkbox", value: "wrap", checked: true })[
        "aria-checked"
      ],
    ).toBe("true");
  });

  it("ties a group to its label through one key, and nothing else", () => {
    const api = build({ defaultOpen: true }).api();
    const group = api.getItemGroupProps({ id: "edit", label: true });
    const label = api.getItemGroupLabelProps({ htmlFor: "edit" });

    expect(group.role).toBe("group");
    expect(group["aria-labelledby"]).toBe(label.id);
    // Declared, never assumed. A group that renders no label carries no reference
    // at all — written blind it was a dead IDREF *and* no accessible name, and axe
    // reports that as `incomplete`, so nothing failed.
    expect(api.getItemGroupProps({ id: "edit" })["aria-labelledby"]).toBeUndefined();
    expect(group["data-orientation"]).toBe("vertical");
    // Reserved for the iOS Control Group, which is out of scope for this version:
    // the attribute exists now so adding it later costs no machine change.
    expect(
      api.getItemGroupProps({ id: "edit", orientation: "horizontal" })["data-orientation"],
    ).toBe("horizontal");
    // Not `role="presentation"`: it is referenced, and a presentational node names
    // nothing.
    expect(label.role).toBeUndefined();
  });

  it("hides every part that is only ever decoration", () => {
    const api = build({ defaultOpen: true }).api();

    for (const props of [
      api.getItemSymbolProps(),
      api.getItemIndicatorProps({ checked: true }),
      api.getItemShortcutProps(),
      api.getIndicatorProps(),
      api.getBackdropProps(),
    ]) {
      expect(props["aria-hidden"]).toBe("true");
      // Hidden *and* unfocusable, which is the only shape `aria-hidden-focus`
      // accepts without reservation.
      expect(props.tabIndex).toBeUndefined();
    }
    expect(api.getSeparatorProps().role).toBe("separator");
    expect(api.getSeparatorProps()["aria-orientation"]).toBe("horizontal");
  });

  it("merges a trigger item out of the parent's item and the child's trigger", () => {
    const { parent, child } = tree();
    const item = parent.api().getTriggerItemProps(child.api(), { value: "share" });

    expect(item["data-part"]).toBe("menu:trigger-item");
    // The child's trigger id, which is what makes the child's `aria-labelledby`
    // resolve and what gives its positioner an anchor with nothing else rendered.
    expect(item.id).toBe("menu:m2:trigger");
    expect(item.role).toBe("menuitem");
    expect(item["aria-haspopup"]).toBe("menu");
    expect(item["aria-expanded"]).toBe("true");
    expect(item["aria-controls"]).toBe("menu:m2:content");
    expect(item["data-state"]).toBe("open");
  });

  it("counts its depth so the sheet can stack a drill-in by it", () => {
    const { parent, child } = tree();

    expect(parent.api().getContentProps()["data-level"]).toBe("0");
    expect(child.api().getContentProps()["data-level"]).toBe("1");
  });
});

describe("menu — controlled and uncontrolled", () => {
  it("opens itself and reports it", () => {
    const onOpenChange = vi.fn();
    const harness = run({ onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });

    expect(harness.service.state.get()).toBe("open");
    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
  });

  it("never writes itself when `open` is controlled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ open: true, onOpenChange });

    harness.service.send({ type: "CONTENT.DISMISS", reason: "escape" });

    // The consumer was asked and declined to answer; the surface stays open, which
    // is exactly what "controlled" is supposed to mean.
    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
    expect(harness.service.state.get()).toBe("open");
  });

  it("moves the highlight and reports it", () => {
    const onHighlightChange = vi.fn();
    const harness = run({ defaultOpen: true, onHighlightChange });

    harness.service.send({ type: "HIGHLIGHT.SET", value: "rename" });
    expect(harness.service.context.get("highlightedValue")).toBe("rename");

    // `null` clears it — there is no second event for that.
    harness.service.send({ type: "HIGHLIGHT.SET", value: null });
    expect(harness.service.context.get("highlightedValue")).toBeNull();
    expect(onHighlightChange.mock.calls).toEqual([[{ value: "rename" }], [{ value: null }]]);
  });

  it("never writes the highlight when it is controlled either", () => {
    const onHighlightChange = vi.fn();
    const harness = run({ defaultOpen: true, highlightedValue: "open", onHighlightChange });

    harness.service.send({ type: "HIGHLIGHT.SET", value: "rename" });

    expect(onHighlightChange).toHaveBeenCalledWith({ value: "rename" });
    expect(harness.service.context.get("highlightedValue")).toBe("open");
  });

  it("does nothing at all when it is disabled", () => {
    const onOpenChange = vi.fn();
    const harness = run({ disabled: true, onOpenChange });

    harness.service.send({ type: "TRIGGER.CLICK" });
    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "first" });
    harness.service.send({ type: "TRIGGER.CONTEXTMENU", x: 10, y: 10 });

    expect(harness.service.state.get()).toBe("closed");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(harness.api().getTriggerProps()["data-disabled"]).toBe("");
  });

  it("holds the menu open for the release of the press that opened it", () => {
    vi.useFakeTimers();
    try {
      const harness = run();

      // Press-drag-release: the pointer goes down, the menu opens, and the click
      // the release synthesises must not read as a second press.
      harness.service.send({ type: "TRIGGER.POINTERDOWN" });
      harness.service.send({ type: "TRIGGER.CLICK" });
      expect(harness.service.state.get()).toBe("open");

      // Past the grace it is a real second click, and a menu button toggles (APG).
      vi.advanceTimersByTime(400);
      harness.service.send({ type: "TRIGGER.CLICK" });
      expect(harness.service.state.get()).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers where the keyboard asked the highlight to land before there was one", () => {
    // The content is not mounted when the key is pressed, so the request has to
    // outlive the event that made it — `highlightInitial` honours it on entry.
    const harness = run();
    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "last" });

    expect(harness.service.state.get()).toBe("open");
    expect(harness.service.refs.get("pendingHighlight")).toBeNull();
  });

  it("anchors a context menu to the point, and a button-opened one back to the button", () => {
    const harness = run();

    harness.service.send({ type: "TRIGGER.CONTEXTMENU", x: 120, y: 64 });
    expect(harness.service.refs.get("anchorPoint")).toEqual({ x: 120, y: 64 });

    harness.service.send({ type: "OPEN.SET", open: false });
    harness.service.send({ type: "TRIGGER.CLICK" });

    // Whatever a previous right click left behind, a menu opened from its button
    // measures itself against the button.
    expect(harness.service.refs.get("anchorPoint")).toBeNull();
  });
});

describe("menu — the dismissal locks", () => {
  const LOCKS = {
    escape: "closeOnEscape",
    back: "closeOnEscape",
    // No drawer decorates this surface today, and the row is here anyway: the lock
    // belongs to the family, not to whoever happens to be draggable this week.
    drag: "closeOnEscape",
    "focus-outside": "closeOnInteractOutside",
    "outside-pointer": "closeOnInteractOutside",
  } as const satisfies Record<DismissReason, keyof MenuMachineProps>;

  for (const reason of Object.keys(LOCKS) as DismissReason[]) {
    it(`dismisses on ${reason} when ${LOCKS[reason]} is on`, () => {
      const onDismiss = vi.fn();
      const harness = run({ defaultOpen: true, [LOCKS[reason]]: true, onDismiss });

      harness.service.send({ type: "CONTENT.DISMISS", reason });

      expect(onDismiss).toHaveBeenCalledWith({ reason });
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

    // The layer is installed once and outlives every prop change; a guard that
    // snapshotted the lock would answer with yesterday's props forever.
    expect(harness.service.state.get()).toBe("open");
  });

  it("dismisses this level only, and takes its children down with it", () => {
    const { parent, child } = tree();

    parent.service.send({ type: "CONTENT.DISMISS", reason: "escape" });

    // Downwards cascades on its own — `closed.entry` closes the child.
    expect(parent.service.state.get()).toBe("closed");
    expect(child.service.state.get()).toBe("closed");
  });

  it("closes a submenu without touching the menu it drills out of", () => {
    const { parent, child } = tree();

    child.service.send({ type: "CONTENT.DISMISS", reason: "escape" });

    expect(child.service.state.get()).toBe("closed");
    expect(parent.service.state.get()).toBe("open");
  });
});

describe("menu — the tree", () => {
  it("learns it is a submenu from its parent, and moves to the side for it", () => {
    const harness = run({ defaultOpen: true }, "m2");
    expect(harness.service.computed("isSubmenu")).toBe(false);
    expect(harness.service.computed("placement")).toBe("bottom-start");

    const parent = run({ defaultOpen: true });
    harness.service.send({ type: "PARENT.SET", parent: parent.service });

    expect(harness.service.context.get("hasParent")).toBe(true);
    expect(harness.service.computed("isSubmenu")).toBe(true);
    expect(harness.service.computed("placement")).toBe("right-start");
  });

  it("walks the whole chain up on `TREE.CLOSE`, one hop at a time", () => {
    const { parent, child } = tree();
    const grandchild = run({ parentId: "menu:m2:content", defaultOpen: true }, "m3");
    child.service.send({ type: "CHILD.SET", child: grandchild.service });
    grandchild.service.send({ type: "PARENT.SET", parent: child.service });

    grandchild.service.send({ type: "TREE.CLOSE" });

    // Three deep, three sends, and nothing had to know its own depth.
    expect(grandchild.service.state.get()).toBe("closed");
    expect(child.service.state.get()).toBe("closed");
    expect(parent.service.state.get()).toBe("closed");
  });

  it("reads `CHILD.CLOSE` as `back`, which is one event with two meanings", () => {
    const { parent, child } = tree();

    // With a child open it closes the child...
    parent.service.send({ type: "CHILD.CLOSE" });
    expect(child.service.state.get()).toBe("closed");
    expect(parent.service.state.get()).toBe("open");

    // ...and with none, a submenu closes itself, while a root menu does nothing.
    child.service.send({ type: "OPEN.SET", open: true });
    child.service.send({ type: "CHILD.CLOSE" });
    expect(child.service.state.get()).toBe("closed");

    parent.service.send({ type: "CHILD.CLOSE" });
    expect(parent.service.state.get()).toBe("open");
  });

  it("refuses a child it cannot tie to an item, and asks for a highlight it cannot place yet", () => {
    const { parent, child } = tree({}, { defaultOpen: false });

    // There is no markup here, so nothing can answer "does the highlight sit on
    // the item that owns this child" — and what the machine takes from that
    // silence is *no*. The opposite default is the defect the guard exists for:
    // unguarded, `CHILD.OPEN` opened whichever submenu happened to hold the single
    // child slot, anchored to a row the highlight was nowhere near. The wired
    // paths are proved in `menu.browser.test.ts`, where there is markup to read.
    parent.service.send({ type: "CHILD.OPEN", focus: true, value: "share" });
    expect(child.service.state.get()).toBe("closed");

    // The request the parent would have made, made directly: the child cannot
    // place a highlight while its items are unmounted, so it carries it to entry.
    child.service.send({ type: "OPEN.SET", open: true, highlight: "first" });
    expect(child.service.state.get()).toBe("open");
    // Honoured on entry, which is the only moment the items exist.
    expect(child.service.refs.get("pendingHighlight")).toBeNull();
  });

  it("closes every level from the cancel button, which is the sheet's way out", () => {
    const { parent, child } = tree();

    child.service.send({ type: "CANCEL.CLICK" });

    expect(child.service.state.get()).toBe("closed");
    expect(parent.service.state.get()).toBe("closed");
  });
});

describe("menu — presentation is an attribute, never a state", () => {
  it("resolves `auto` from the density, and an explicit value wins over it", () => {
    const harness = run({ defaultOpen: true });
    expect(harness.api().presentation).toBe("popup");

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(harness.api().presentation).toBe("sheet");

    const declared = run({ defaultOpen: true, presentation: "popup" }, "m2");
    declared.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(declared.api().presentation).toBe("popup");
  });

  it("changes one attribute and stays open across the flip", () => {
    const harness = run({ defaultOpen: true });
    const before = harness.api().getContentProps();

    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    const after = harness.api().getContentProps();

    expect(before["data-presentation"]).toBe("popup");
    expect(after["data-presentation"]).toBe("sheet");
    // `reenter` tears the open state down and builds it back; what it must not do
    // is change the state itself, the name, or the placement.
    expect(harness.service.state.get()).toBe("open");
    expect(after["data-state"]).toBe("open");
    expect(after.id).toBe(before.id);
    expect(after["data-side"]).toBe(before["data-side"]);
    // The semantics never follow the presentation (doctrine ARIA, components.md).
    expect(after.role).toBe("menu");
  });

  it("keeps the blink for the popup and refuses it everywhere else", () => {
    const harness = run({ defaultOpen: true });
    harness.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });

    // `shouldFlash` is the guard that reads this, and it never fires in a sheet:
    // an action sheet closing has no blink on iOS, whatever the prop says.
    expect(harness.service.prop("selectionFlash")).toBe(true);
    expect(harness.api().presentation).toBe("sheet");
    expect(harness.service.context.get("flashingValue")).toBeNull();
  });

  it("ends a blink by closing the tree, which is what the deferral is for", () => {
    const { parent, child } = tree();

    child.service.send({ type: "FLASH.END" });

    expect(child.service.context.get("flashingValue")).toBeNull();
    expect(child.service.state.get()).toBe("closed");
    expect(parent.service.state.get()).toBe("closed");
  });
});

describe("menu — the key table", () => {
  it("mirrors the submenu keys once, and only the horizontal ones", () => {
    expect(getSubmenuKeyAction("ArrowRight", "ltr")).toBe("open");
    expect(getSubmenuKeyAction("ArrowLeft", "ltr")).toBe("close");
    expect(getSubmenuKeyAction("ArrowRight", "rtl")).toBe("close");
    expect(getSubmenuKeyAction("ArrowLeft", "rtl")).toBe("open");
    expect(getSubmenuKeyAction("ArrowDown", "ltr")).toBeNull();
    expect(getSubmenuKeyAction("Enter", "rtl")).toBeNull();
  });

  it("leaves the vertical axis alone in RTL, because a menu does not mirror down", () => {
    for (const dir of ["ltr", "rtl"] as const) {
      expect(getRovingKeyAction("ArrowDown", { orientation: "vertical", dir })).toBe("next");
      expect(getRovingKeyAction("ArrowUp", { orientation: "vertical", dir })).toBe("prev");
      // The horizontal arrows belong to the submenu table, which is why the roving
      // one has to answer `null` for them rather than moving the highlight.
      expect(getRovingKeyAction("ArrowRight", { orientation: "vertical", dir })).toBeNull();
      expect(getRovingKeyAction("ArrowLeft", { orientation: "vertical", dir })).toBeNull();
    }
  });

  it("gives the d-pad the same mirror as the keyboard, from physical intents", () => {
    // `moveLeft`/`moveRight` are physical by contract — the keymap holds no mirror
    // — so the two sources meet here and nowhere else.
    expect(getSubmenuIntentAction("moveRight", "ltr")).toBe("open");
    expect(getSubmenuIntentAction("moveRight", "rtl")).toBe("close");
    expect(getSubmenuIntentAction("moveLeft", "rtl")).toBe("open");
    expect(getSubmenuIntentAction("moveDown", "ltr")).toBeNull();
    // Y is not the menu's: it is what opens a context menu on the focused element.
    expect(getSubmenuIntentAction("contextMenu", "ltr")).toBeNull();
  });

  it("folds the page keys and their trigger twins onto the roving table", () => {
    expect(toRovingKey("PageUp")).toBe("Home");
    expect(toRovingKey("PageDown")).toBe("End");
    expect(toRovingKey("ArrowDown")).toBe("ArrowDown");

    expect(toRovingIntentKey("moveUp")).toBe("ArrowUp");
    expect(toRovingIntentKey("pageUp")).toBe("Home");
    expect(toRovingIntentKey("end")).toBe("End");
    expect(toRovingIntentKey("select")).toBeNull();
  });

  it("opens onto the end of the menu the trigger key names (APG Menu Button)", () => {
    expect(getTriggerOpenAction("Enter")).toBe("first");
    expect(getTriggerOpenAction(" ")).toBe("first");
    expect(getTriggerOpenAction("ArrowDown")).toBe("first");
    expect(getTriggerOpenAction("ArrowUp")).toBe("last");
    expect(getTriggerOpenAction("Escape")).toBeNull();
  });
});

describe("menu — a whole life cycle with no document in the room", () => {
  it("opens, installs its effects, dismisses and stops without reaching for one", () => {
    const onDismiss = vi.fn();
    const harness = run({ onDismiss, intents: null });

    harness.service.send({ type: "TRIGGER.KEYDOWN", action: "first" });
    expect(harness.service.state.get()).toBe("open");

    // The prop getters are what an adapter calls on every render, so they run here
    // too rather than being assumed harmless.
    const api = harness.api();
    api.getBackdropProps();
    api.getPositionerProps();
    api.getContentProps();
    api.getContextTriggerProps();
    api.getIndicatorProps();
    api.getItemGroupProps({ id: "edit" });
    api.getItemGroupLabelProps({ htmlFor: "edit" });
    api.getItemProps({ value: "open" });
    api.getOptionItemProps({ type: "checkbox", value: "wrap", checked: false });
    api.getItemSymbolProps();
    api.getItemTextProps();
    api.getItemDescriptionProps({ value: "open" });
    api.getItemIndicatorProps({ checked: false });
    api.getItemShortcutProps();
    api.getSeparatorProps();
    api.getCancelTriggerProps();

    // Every item read answers "no items", which is the honest answer for a machine
    // whose collection is the live DOM and which has no DOM.
    harness.service.send({ type: "HIGHLIGHT.MOVE", action: "next" });
    harness.service.send({ type: "TYPEAHEAD.KEY", key: "o" });
    harness.service.send({ type: "ITEM.CLICK", value: "open" });
    expect(harness.service.context.get("highlightedValue")).toBeNull();
    expect(harness.service.state.get()).toBe("open");

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
