/**
 * The browser half of `date-field`, and its vanilla-shaped proof: `connect`
 * reaching real DOM with no framework in the room.
 *
 * What only a page can settle is here — where the focus actually lands when an
 * arrow walks the segments, that every segment is a real tab stop, that a mouse on
 * the stepper does not take the focus off the unit it is stepping, and that a form
 * reset reaches a hidden input the machine had to find the form through.
 */

import { afterEach, describe, expect, it } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./date-field.connect";
import { machine } from "./date-field.machine";
import type { DateFieldApi, DateFieldMachineProps, DateFieldSchema } from "./date-field.types";

type Api = DateFieldApi<DomPropTypes>;

/**
 * `id` is a parameter because two fields in one page share a document, and the
 * ids are derived from it: mounting a second harness under the same scope id puts
 * two `#date-field:d1:segment:day` in the document, and `getElementById` answers
 * with the first — which is a real collision a consumer can create too.
 */
function render(props: DateFieldMachineProps = {}, id = "d1") {
  return mountMachine<DateFieldSchema, Api>({
    machine,
    connect,
    // A real form, because the reset path is the only way a hidden input finds one.
    html: `<form><div><div></div><button></button><button></button><input /></div></form>`,
    id,
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.querySelector("form > div") as HTMLElement;
      apply(root, api.getRootProps());
      const control = root.children[0] as HTMLElement;
      apply(control, api.getControlProps());
      // The segment list is the locale's, so the markup follows it rather than the
      // other way round — the same thing an adapter does when it maps `api.segments`.
      while (control.childElementCount > api.segments.length) control.lastElementChild?.remove();
      while (control.childElementCount < api.segments.length) {
        control.append(document.createElement("div"));
      }
      api.segments.forEach((segment, index) => {
        const node = control.children[index] as HTMLElement;
        apply(node, api.getSegmentProps(segment));
        node.textContent = segment.text;
      });
      apply(root.children[1] as Element, api.getIncrementTriggerProps());
      apply(root.children[2] as Element, api.getDecrementTriggerProps());
      apply(root.children[3] as Element, api.getHiddenInputProps());
    },
  });
}

type Harness = ReturnType<typeof render>;

function segment(harness: Harness, type: string): HTMLElement {
  const node = harness.host.querySelector<HTMLElement>(`[data-segment="${type}"]`);
  if (node === null) throw new Error(`no segment "${type}"`);
  return node;
}

function press(node: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  node.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

function typeInto(harness: Harness, type: string, digits: string): void {
  const node = segment(harness, type);
  node.focus();
  for (const digit of digits)
    press(harness.host.querySelector<HTMLElement>(":focus") ?? node, digit);
}

afterEach(() => {
  unmountAll();
});

describe("date-field in a page", () => {
  it("makes every segment its own tab stop, and the literals none", () => {
    const harness = render();
    const stops = [...harness.host.querySelectorAll('[data-part~="date-field:segment"]')].filter(
      (node) => node.getAttribute("tabindex") === "0",
    );

    // Three units, two slashes: the APG puts a spinbutton on each unit, and a
    // roving tabindex would make the field one stop instead of three.
    expect(stops).toHaveLength(3);
    expect(segment(harness, "literal").hasAttribute("tabindex")).toBe(false);
    expect(segment(harness, "literal").getAttribute("aria-hidden")).toBe("true");
  });

  it("walks the segments with the arrows, in reading order", () => {
    const harness = render({ locale: "en-US" });
    const month = segment(harness, "month");
    month.focus();

    press(month, "ArrowRight");
    expect(document.activeElement).toBe(segment(harness, "day"));

    press(segment(harness, "day"), "ArrowRight");
    expect(document.activeElement).toBe(segment(harness, "year"));

    // No wrap: the field ends where it ends, and Tab is what leaves it.
    press(segment(harness, "year"), "ArrowRight");
    expect(document.activeElement).toBe(segment(harness, "year"));

    press(segment(harness, "year"), "Home");
    expect(document.activeElement).toBe(segment(harness, "month"));

    press(segment(harness, "month"), "End");
    expect(document.activeElement).toBe(segment(harness, "year"));
  });

  it("mirrors the arrows in RTL", () => {
    const harness = render({ dir: "rtl" });
    const month = segment(harness, "month");
    month.focus();

    // Physical right, logical previous — resolved once, where every other
    // composite resolves it.
    press(month, "ArrowRight");
    expect(document.activeElement).toBe(segment(harness, "month"));

    press(month, "ArrowLeft");
    expect(document.activeElement).toBe(segment(harness, "day"));

    // Home and End are *not* mirrored, and that is the rule rather than an
    // oversight: `getRovingKeyAction` answers "first"/"last" whatever the
    // direction, the way every APG composite sharing that helper does. Which
    // makes them the pair worth pressing here — the direction-blind half of a
    // handler whose other half is direction-aware, and nothing had ever pressed
    // them anywhere but in LTR.
    press(segment(harness, "day"), "End");
    expect(document.activeElement).toBe(segment(harness, "year"));

    press(segment(harness, "year"), "Home");
    expect(document.activeElement).toBe(segment(harness, "month"));
  });

  it("advances by itself when a segment is full, and carries the overflow digit", () => {
    const harness = render();
    typeInto(harness, "month", "12");
    expect(document.activeElement).toBe(segment(harness, "day"));

    const harnessB = render({}, "d2");
    typeInto(harnessB, "month", "13");
    expect(segment(harnessB, "month").textContent).toBe("01");
    expect(segment(harnessB, "day").textContent).toBe("03");
    expect(document.activeElement).toBe(segment(harnessB, "day"));
  });

  it("empties a segment on Backspace and on Delete, and leaves the value incomplete", () => {
    const harness = render({ defaultValue: { year: 2026, month: 4, day: 9 } });
    const day = segment(harness, "day");
    day.focus();
    press(day, "Backspace");

    expect(segment(harness, "day").textContent).toBe("--");
    expect(segment(harness, "day").hasAttribute("aria-valuenow")).toBe(false);
    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("");

    // Delete is the other half of the same clause and was pressed by nothing: a
    // key wired beside another is not covered by that other one's test. On a
    // different segment, so it has an emptying of its own to prove.
    const month = segment(harness, "month");
    month.focus();
    press(month, "Delete");

    expect(segment(harness, "month").textContent).toBe("--");
    expect(segment(harness, "month").hasAttribute("aria-valuenow")).toBe(false);
  });

  it("steps on the arrows and publishes the number a reader hears", () => {
    const harness = render({ defaultValue: { year: 2026, month: 4, day: 9 } });
    const day = segment(harness, "day");
    day.focus();

    press(day, "ArrowUp");
    expect(segment(harness, "day").getAttribute("aria-valuenow")).toBe("10");

    press(segment(harness, "day"), "PageUp");
    expect(segment(harness, "day").getAttribute("aria-valuenow")).toBe("20");

    press(segment(harness, "day"), "ArrowDown");
    expect(segment(harness, "day").getAttribute("aria-valuenow")).toBe("19");

    // PageDown, which nothing had ever pressed: it is a fourth branch of the same
    // `if`, and three keys landing there proved nothing about the fourth.
    press(segment(harness, "day"), "PageDown");
    expect(segment(harness, "day").getAttribute("aria-valuenow")).toBe("9");
    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("2026-04-09");
  });

  it("steps the focused segment from the stepper without taking the focus off it", () => {
    const harness = render({ defaultValue: { year: 2026, month: 4, day: 9 } });
    const year = segment(harness, "year");
    year.focus();

    const increment = harness.part<HTMLButtonElement>("increment-trigger");
    // The `mousedown` default is what would move the focus; the click is what
    // steps. Both, in that order, is what a real press does.
    increment.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    increment.click();

    expect(document.activeElement).toBe(segment(harness, "year"));
    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("2027-04-09");
  });

  it("keeps the steppers out of the tab order and out of the a11y tree", () => {
    const harness = render();
    const increment = harness.part<HTMLButtonElement>("increment-trigger");

    expect(increment.getAttribute("tabindex")).toBe("-1");
    expect(increment.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts the field back where it started when the form resets", () => {
    const harness = render({ defaultValue: { year: 2026, month: 4, day: 9 }, name: "born" });
    const day = segment(harness, "day");
    day.focus();
    press(day, "ArrowUp");
    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("2026-04-10");

    (harness.host.querySelector("form") as HTMLFormElement).reset();

    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("2026-04-09");
  });

  it("holds the ring only under a keyboard, and only on the segment that has focus", () => {
    const harness = render();
    // The document's modality is whatever the previous test left; a real key
    // press is what sets it, and the tracker is running from `start()`.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    const month = segment(harness, "month");
    month.focus();

    expect(segment(harness, "month").hasAttribute("data-focus-visible")).toBe(true);
    expect(segment(harness, "year").hasAttribute("data-focus-visible")).toBe(false);
  });

  it("takes no keystroke at all while disabled", () => {
    const harness = render({ defaultValue: { year: 2026, month: 4, day: 9 }, disabled: true });

    expect(segment(harness, "day").hasAttribute("tabindex")).toBe(false);
    press(segment(harness, "day"), "ArrowUp");
    expect(harness.part<HTMLInputElement>("hidden-input").value).toBe("2026-04-09");
  });
});
