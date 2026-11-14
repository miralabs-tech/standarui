/**
 * The picker without a document, which is most of what it is: an openness, a
 * value, a presentation, and the two prop bundles it hands its children. What is
 * deliberately not here is the focus and the surface — `focusInitialCell` looks an
 * element up in a document, and a harness with none would only prove that a null
 * lookup does nothing. Those live in `date-picker.browser.test.ts`.
 *
 * `service.start()` is called on purpose: the only machine-level effect declines
 * without a root node, and without a start the events below would merely queue.
 */

import { describe, expect, it, vi } from "vitest";
import type { EventHandler } from "../../machine/prop-types";
import type { DateValue } from "../../utils/plain-date";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./date-picker.connect";
import { machine } from "./date-picker.machine";
import type { DatePickerApi, DatePickerMachineProps, DatePickerSchema } from "./date-picker.types";

type Api = DatePickerApi<PlainPropTypes>;

const date = (year: number, month: number, day: number): DateValue => ({ year, month, day });

const APRIL_9 = date(2026, 4, 9);

function build(props: DatePickerMachineProps = {}) {
  const harness = connectWithoutDom<DatePickerSchema, Api>({
    machine,
    connect,
    id: "p1",
    props: { locale: "en-US", ...props },
  });
  harness.service.start();
  return harness;
}

/** A click with only the field `connect` reads, since node has no `MouseEvent`. */
function click(props: Record<string, unknown>): void {
  const handler = props.onClick as EventHandler<MouseEvent> | undefined;
  handler?.({ defaultPrevented: false } as MouseEvent);
}

describe("the picker on a server", () => {
  it("connects with no document at all", () => {
    const props = build().api().getRootProps();

    expect(props["data-scope"]).toBe("date-picker");
    expect(props["data-part"]).toBe("date-picker:root");
    expect(props["data-state"]).toBe("closed");
    expect(props["data-presentation"]).toBe("popup");
    expect(props["data-placeholder"]).toBe("");
  });

  it("names no surface it has not rendered", () => {
    const trigger = build().api().getTriggerProps();

    // A dangling IDREF is an `aria-valid-attr-value` violation, and this content
    // is portalled and gone between opens.
    expect(trigger["aria-controls"]).toBeUndefined();
    expect(trigger["aria-expanded"]).toBe("false");
    expect(trigger["aria-haspopup"]).toBe("dialog");
  });

  it("names the surface from the trigger until a title exists", () => {
    const content = build({ defaultOpen: true }).api().getContentProps();

    // `hasTitle` is read from the DOM by a watcher, and there is none here — so
    // the fallback is what a server emits, and it points at an element that is
    // always in the document.
    expect(content["aria-labelledby"]).toBe("date-picker:p1:trigger");
    expect(content.role).toBe("dialog");
    expect(content["aria-modal"]).toBeUndefined();
  });
});

describe("the openness", () => {
  it("opens on the trigger and closes on the same button", () => {
    const harness = build();

    click(harness.api().getTriggerProps());
    expect(harness.api().open).toBe(true);
    expect(harness.api().getTriggerProps()["aria-controls"]).toBe("date-picker:p1:content");

    click(harness.api().getTriggerProps());
    expect(harness.api().open).toBe(false);
  });

  it("refuses the trigger when disabled and answers it when read-only", () => {
    const off = build({ disabled: true });
    click(off.api().getTriggerProps());
    expect(off.api().open).toBe(false);
    expect(off.api().getTriggerProps().disabled).toBe(true);

    // A date nobody may change is still a date somebody may want to look at.
    const frozen = build({ readOnly: true });
    click(frozen.api().getTriggerProps());
    expect(frozen.api().open).toBe(true);
  });

  it("reports the openness without writing it when controlled", () => {
    const onOpenChange = vi.fn();
    const harness = build({ open: false, onOpenChange });

    click(harness.api().getTriggerProps());

    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
    expect(harness.api().open).toBe(false);
  });

  it("closes on a dismissal, and declines one the props refused", () => {
    const onDismiss = vi.fn();
    const open = build({ defaultOpen: true, onDismiss });
    open.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(open.api().open).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "escape" });

    const pinned = build({ defaultOpen: true, closeOnEscape: false });
    pinned.service.send({ type: "CONTENT.DISMISS", reason: "escape" });
    expect(pinned.api().open).toBe(true);
  });

  it("reports the cancel as a back, the vocabulary the layer stack already has", () => {
    const onDismiss = vi.fn();
    const harness = build({ defaultOpen: true, onDismiss });

    click(harness.api().getCancelTriggerProps());

    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    expect(harness.api().open).toBe(false);
  });

  it("closes on the close trigger without calling it a dismissal", () => {
    const onDismiss = vi.fn();
    const harness = build({ defaultOpen: true, onDismiss });

    click(harness.api().getCloseTriggerProps());

    expect(harness.api().open).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("the presentation", () => {
  it("follows the density unless the consumer pins it", () => {
    const auto = build({ defaultOpen: true });
    expect(auto.api().presentation).toBe("popup");

    auto.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(auto.api().presentation).toBe("sheet");

    const pinned = build({ presentation: "popup" });
    pinned.service.send({ type: "ENVIRONMENT.SYNC", density: "touch" });
    expect(pinned.api().presentation).toBe("popup");
  });

  it("claims a modal surface only where one exists", () => {
    const sheet = build({ defaultOpen: true, presentation: "sheet", modal: true });
    expect(sheet.api().getContentProps()["aria-modal"]).toBe("true");

    // An anchored popup leaves the page live behind it; saying otherwise would
    // tell every reader the app had stopped.
    const popup = build({ defaultOpen: true, presentation: "popup", modal: true });
    expect(popup.api().getContentProps()["aria-modal"]).toBeUndefined();
  });

  /**
   * Modality had four consequences answering three different questions, so a
   * `modal` popup declined `aria-modal` — correctly — while still arming the
   * spatial trap, hiding the rest of the page from assistive technology and
   * asking the layer for a modal dismiss. One `computed("isModal")` answers all
   * four now.
   *
   * The trap is asserted rather than the two effects because effects need a
   * document; the attribute is the half a node harness can hold, and it moved for
   * the same reason the other three did.
   */
  it("arms nothing modal on an anchored popup, whatever `modal` says", () => {
    const popup = build({ defaultOpen: true, presentation: "popup", modal: true });
    const content = popup.api().getContentProps();
    expect(content["aria-modal"]).toBeUndefined();
    expect(content["data-snav-trap"]).toBeUndefined();

    const sheet = build({ defaultOpen: true, presentation: "sheet", modal: true });
    const sheetContent = sheet.api().getContentProps();
    expect(sheetContent["aria-modal"]).toBe("true");
    expect(sheetContent["data-snav-trap"]).toBe("");

    // A sheet that was never asked to be modal is not one either.
    const plain = build({ defaultOpen: true, presentation: "sheet" });
    expect(plain.api().getContentProps()["data-snav-trap"]).toBeUndefined();
  });
});

describe("the value, and which child moved it", () => {
  it("takes a day from the grid and closes on it", () => {
    const onValueChange = vi.fn();
    const harness = build({ defaultOpen: true, onValueChange });

    harness.api().getCalendarProps().onValueChange({ value: APRIL_9 });

    expect(harness.api().value).toEqual(APRIL_9);
    expect(harness.api().open).toBe(false);
    expect(onValueChange).toHaveBeenCalledWith({ value: APRIL_9 });
  });

  it("keeps the surface out when the consumer asks for a second choice", () => {
    const harness = build({ defaultOpen: true, closeOnSelect: false });

    harness.api().getCalendarProps().onValueChange({ value: APRIL_9 });

    expect(harness.api().value).toEqual(APRIL_9);
    expect(harness.api().open).toBe(true);
  });

  /**
   * The typed path is the one that must *not* close: the year is nearly always
   * the last unit filled, and a picker that shut halfway through a date would be
   * unusable.
   */
  it("takes a date from the field and leaves the surface alone", () => {
    const harness = build({ defaultOpen: true });

    harness.api().getFieldProps().onValueChange({ value: APRIL_9 });

    expect(harness.api().value).toEqual(APRIL_9);
    expect(harness.api().open).toBe(true);
  });

  /**
   * A `date-field` at a finer granularity hands back an object carrying `hour`,
   * and `shallowEqual` compares key sets — so without this normalisation the same
   * day chosen in the grid would never compare equal to the one the field
   * reported, and every commit would notify.
   */
  it("holds one shape for the value, whichever child reported it", () => {
    const onValueChange = vi.fn();
    const harness = build({ defaultOpen: true, closeOnSelect: false, onValueChange });

    harness
      .api()
      .getFieldProps()
      .onValueChange({ value: { ...APRIL_9, hour: 9, minute: 30 } as DateValue });

    expect(harness.api().value).toEqual(APRIL_9);
    expect(Object.keys(harness.api().value as DateValue)).toEqual(["year", "month", "day"]);

    // The same day again, from the grid this time — the surface is still open, so
    // the event really reaches the machine: one notification, not two.
    harness.api().getCalendarProps().onValueChange({ value: APRIL_9 });
    expect(harness.api().open).toBe(true);
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("clears only when the consumer asked for a clear trigger", () => {
    const off = build({ defaultValue: APRIL_9 });
    expect(off.api().getClearTriggerProps().disabled).toBe(true);
    click(off.api().getClearTriggerProps());
    expect(off.api().value).toEqual(APRIL_9);

    const on = build({ defaultValue: APRIL_9, clearable: true });
    expect(on.api().getClearTriggerProps().disabled).toBe(false);
    click(on.api().getClearTriggerProps());
    expect(on.api().value).toBeNull();

    // Nothing to clear is a disabled button, never an absent one: a control that
    // vanishes as it is pressed moves everything beside it.
    expect(on.api().getClearTriggerProps().disabled).toBe(true);
  });

  it("writes the caption a chip trigger needs, and an empty one for no date", () => {
    expect(build({ defaultValue: APRIL_9 }).api().valueText).toBe("Apr 9, 2026");
    expect(build().api().valueText).toBe("");
    expect(build({ defaultValue: APRIL_9 }).api().hasValue).toBe(true);
    expect(
      build({ defaultValue: APRIL_9 }).api().getRootProps()["data-placeholder"],
    ).toBeUndefined();
  });

  it("reports the value without writing it when controlled", () => {
    const onValueChange = vi.fn();
    const harness = build({ defaultOpen: true, value: null, onValueChange });

    harness.api().getCalendarProps().onValueChange({ value: APRIL_9 });

    expect(onValueChange).toHaveBeenCalledWith({ value: APRIL_9 });
    expect(harness.api().value).toBeNull();
  });
});

describe("the props the picker hands its children", () => {
  it("relays the whole date domain to the calendar", () => {
    const isDateUnavailable = (value: DateValue): boolean => value.day === 13;
    const calendar = build({
      defaultValue: APRIL_9,
      today: date(2026, 4, 1),
      min: date(2026, 1, 1),
      max: date(2026, 12, 31),
      isDateUnavailable,
      locale: "fr-FR",
      dir: "rtl",
      readOnly: true,
      invalid: true,
    })
      .api()
      .getCalendarProps();

    expect(calendar.value).toEqual(APRIL_9);
    expect(calendar.today).toEqual(date(2026, 4, 1));
    expect(calendar.min).toEqual(date(2026, 1, 1));
    expect(calendar.max).toEqual(date(2026, 12, 31));
    expect(calendar.isDateUnavailable).toBe(isDateUnavailable);
    expect(calendar.locale).toBe("fr-FR");
    expect(calendar.dir).toBe("rtl");
    expect(calendar.readOnly).toBe(true);
    expect(calendar.disabled).toBe(false);
    expect(calendar.invalid).toBe(true);
  });

  /**
   * The children disagree about what a missing `locale` means, and neither is
   * wrong on its own: the field pins `en-US` so the segment *order* cannot move
   * between server and client (date-field.machine.ts:165-169), while the calendar
   * falls through to the document over `ENVIRONMENT.SYNC` (calendar.machine.ts:219).
   * A picker relaying the raw prop therefore put a French grid above American
   * segments on a `lang="fr"` page. It resolves once now, and both children are
   * handed the same answer.
   *
   * Asserted as a concrete value rather than as `calendar.locale === field.locale`:
   * before the fix both sides read `undefined`, so the equality was green on
   * nothing at all.
   */
  it("resolves the locale once, so the grid and the segments cannot disagree", () => {
    const bare = connectWithoutDom<DatePickerSchema, Api>({
      machine,
      connect,
      id: "p-bare",
      props: {},
    });
    bare.service.start();

    expect(bare.api().getCalendarProps().locale).toBe("en-US");
    expect(bare.api().getFieldProps().locale).toBe("en-US");

    const pinned = build({ locale: "fr-FR" }).api();
    expect(pinned.getCalendarProps().locale).toBe("fr-FR");
    expect(pinned.getFieldProps().locale).toBe("fr-FR");
  });

  /**
   * The form is the field's: this anatomy has no hidden input of its own,
   * so `name`, `form` and `required` descend.
   */
  it("hands the form to the field, and turns a cleared bound into no bound", () => {
    const field = build({
      defaultValue: APRIL_9,
      name: "due",
      form: "task",
      required: true,
      labelledBy: "lbl",
      describedBy: "help",
      min: null,
      max: date(2026, 12, 31),
    })
      .api()
      .getFieldProps();

    expect(field.value).toEqual(APRIL_9);
    expect(field.name).toBe("due");
    expect(field.form).toBe("task");
    expect(field.required).toBe(true);
    expect(field.labelledBy).toBe("lbl");
    expect(field.describedBy).toBe("help");
    // The field bounds with `DateValue | undefined`; `null` is how a consumer
    // clears a bound they were passing.
    expect(field.min).toBeUndefined();
    expect(field.max).toEqual(date(2026, 12, 31));
  });

  /**
   * The seam the picker exists to hold: the calendar's anchor **is** its page, so
   * a date arriving from the field has to move it, and a grid that paged itself
   * has to be where the next open starts.
   */
  it("moves the page with the value, and keeps a page the grid moved itself", () => {
    const harness = build({ today: date(2026, 4, 1) });
    expect(harness.api().getCalendarProps().focusedValue).toEqual(date(2026, 4, 1));

    harness
      .api()
      .getFieldProps()
      .onValueChange({ value: date(2026, 7, 20) });
    expect(harness.api().getCalendarProps().focusedValue).toEqual(date(2026, 7, 20));

    harness
      .api()
      .getCalendarProps()
      .onFocusChange({ value: date(2026, 8, 20) });
    expect(harness.api().getCalendarProps().focusedValue).toEqual(date(2026, 8, 20));

    // A clear is not a request to look somewhere else.
    harness.api().setValue(null);
    expect(harness.api().getCalendarProps().focusedValue).toEqual(date(2026, 8, 20));
  });

  it("starts the page on the value it was given, clamped into range", () => {
    const inside = build({ defaultValue: APRIL_9, today: date(2026, 1, 1) });
    expect(inside.api().getCalendarProps().focusedValue).toEqual(APRIL_9);

    const outside = build({ today: date(2026, 1, 1), min: date(2026, 6, 1) });
    expect(outside.api().getCalendarProps().focusedValue).toEqual(date(2026, 6, 1));
  });

  it("hands both children the same intent host it was given", () => {
    const host = { pushScope: (): VoidFunction => (): void => undefined };
    const api = build({ intents: host }).api();

    expect(api.getCalendarProps().intents).toBe(host);
    expect(api.getFieldProps().intents).toBe(host);
  });
});

describe("the naming", () => {
  it("keeps one voice on the trigger", () => {
    const named = build({ label: "Due date" }).api().getTriggerProps();
    expect(named["aria-label"]).toBe("Due date");
    expect(named["aria-labelledby"]).toBeUndefined();

    // `labelledBy` outranks it, and the label is withheld under it rather than
    // written beside it.
    const wired = build({ label: "Due date", labelledBy: "lbl" }).api().getTriggerProps();
    expect(wired["aria-label"]).toBeUndefined();
    expect(wired["aria-labelledby"]).toBe("lbl date-picker:p1:trigger");
  });

  it("puts the chosen date in the trigger's name, under either source", () => {
    const named = build({ label: "Due date", defaultValue: APRIL_9 }).api().getTriggerProps();
    expect(named["aria-label"]).toBe("Due date, Apr 9, 2026");

    const wired = build({ labelledBy: "lbl", defaultValue: APRIL_9 }).api().getTriggerProps();
    expect(String(wired["aria-labelledby"]).split(" ")).toEqual(["lbl", wired.id]);

    expect(build().api().getTriggerProps()["aria-label"]).toBeUndefined();
  });

  /**
   * The calendar's own arrangement: the part carries an id and nothing points at
   * it automatically, because a blind `aria-labelledby` is a dangling IDREF the
   * day a consumer renders no label.
   */
  it("gives the label an id and wires nothing to it by itself", () => {
    const api = build().api();

    expect(api.getLabelProps().id).toBe("date-picker:p1:label");
    expect(api.getTriggerProps()["aria-labelledby"]).toBeUndefined();
    expect(api.getFieldProps().labelledBy).toBeUndefined();
  });

  /**
   * The two name warnings carry the guard every sibling carries with them, and it
   * is the half only this harness can prove: **absent is not nameless**. Nothing is
   * rendered here, so the trigger and the close trigger are both `null` — a warning
   * fired then would name every tree in the application before its first paint.
   * The warnings themselves are watched firing in `date-picker.browser.test.ts`.
   */
  it("says nothing about a name it cannot see", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Open, so the surface's own effects install too and not just the machine's.
    build({ defaultOpen: true });

    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});
