/**
 * The date field through React: the six parts, the field it inherits from, the
 * form it submits into, the pad that takes hold of a segment — and axe over the
 * matrix the DoD asks for.
 *
 * The machine is proved in `packages/core/src/components/date-field`; what is here
 * is what only an adapter can get wrong. The gamepad section is the one that could
 * not live anywhere else: it puts a real field inside a real dialog, on the real
 * input system, and presses B.
 */

import { getTabbables } from "@standarui/core";
import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { FieldErrorText, FieldLabel, FieldRoot } from "../field/field";
import {
  DateFieldControl,
  DateFieldDecrementTrigger,
  DateFieldHiddenInput,
  DateFieldIncrementTrigger,
  DateFieldRoot,
  type DateFieldRootProps,
  DateFieldSegments,
} from "./date-field";

function part(container: ParentNode, name: string): HTMLElement {
  const node = queryPart(container, `date-field:${name}`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

function segment(container: ParentNode, type: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-segment="${type}"]`);
  if (node === null) throw new Error(`no segment "${type}"`);
  return node;
}

interface BornProps extends DateFieldRootProps {
  /** The minimal shape renders neither the steppers nor the submission. */
  readonly bare?: boolean;
}

function Born(props: BornProps): React.ReactNode {
  const { bare, ...root } = props;
  return (
    <DateFieldRoot {...root}>
      <DateFieldControl>
        <DateFieldSegments />
        {bare === true ? null : (
          <>
            <DateFieldIncrementTrigger />
            <DateFieldDecrementTrigger />
          </>
        )}
      </DateFieldControl>
      {bare === true ? null : <DateFieldHiddenInput />}
    </DateFieldRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("date-field — the parts", () => {
  it("names the group, not the segments, and each segment its own unit", () => {
    const { container } = mount(<Born defaultValue={{ year: 2026, month: 4, day: 9 }} />);

    expect(part(container, "control").getAttribute("role")).toBe("group");
    expect(segment(container, "month").getAttribute("role")).toBe("spinbutton");
    expect(segment(container, "month").getAttribute("aria-label")).toBe("month");
    expect(segment(container, "year").getAttribute("aria-valuenow")).toBe("2026");
    expect(part(container, "hidden-input").getAttribute("value")).toBe("2026-04-09");
  });

  it("renders each segment's own text without the consumer restating it", () => {
    const { container } = mount(<Born defaultValue={{ year: 2026, month: 4, day: 9 }} />);

    expect(part(container, "control").textContent).toBe("04/09/2026");
  });

  it("works in its minimal shape: a control and its segments, and nothing else", async () => {
    // The fixture ROADMAP.md:173 asks of every component — no steppers, no hidden
    // input, no field around it.
    const { container } = mount(<Born bare label="Date of birth" />);
    const month = segment(container, "month");

    fire(() => month.focus());
    fire(() =>
      month.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      ),
    );

    expect(segment(container, "month").hasAttribute("aria-valuenow")).toBe(true);
    // Named by its own prop, because there is nothing here to name it: outside a
    // `field` no label hands an id down, and axe does not flag an anonymous
    // `group` — so this very fixture shipped a control a reader met as "group"
    // and nothing else.
    expect(part(container, "control").getAttribute("aria-label")).toBe("Date of birth");
    // On the control, and not leaked onto the root: `label` is a machine prop,
    // and a prop missing from that list lands on the element as an attribute.
    expect(part(container, "root").hasAttribute("label")).toBe(false);
    await expectNoAxeViolations(container);
  });

  it("leaves the tab order alone when the first thing in it cannot be operated", () => {
    // The disabled-in-first-position fixture, in the shape this component has one:
    // the segments are the tab stops, and a disabled field must contribute none —
    // the `toggle-group` defect of 2026-08-27 was a stop landing on something
    // inoperable.
    const { container } = mount(
      <>
        <Born disabled />
        <button type="button">after</button>
      </>,
    );

    const stops = getTabbables(container);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.textContent).toBe("after");
  });

  it("takes no edit while read-only, and keeps its segments reachable", () => {
    const { container } = mount(<Born readOnly defaultValue={{ year: 2026, month: 4, day: 9 }} />);
    const day = segment(container, "day");

    expect(day.getAttribute("tabindex")).toBe("0");
    expect(day.getAttribute("aria-readonly")).toBe("true");

    fire(() => day.focus());
    fire(() =>
      day.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      ),
    );

    expect(part(container, "hidden-input").getAttribute("value")).toBe("2026-04-09");
  });
});

describe("date-field — inside a field", () => {
  it("inherits the field's state and borrows its label, which cannot name a group", () => {
    const { container } = mount(
      <FieldRoot invalid disabled>
        <FieldLabel>Date of birth</FieldLabel>
        <Born />
        <FieldErrorText>Pick a date</FieldErrorText>
      </FieldRoot>,
    );

    const control = part(container, "control");
    const label = queryPart(container, "field:label") as HTMLElement;

    // `<label for>` only names labelable elements, and a `div[role="group"]` is
    // not one — so the field drops `for` and the group points back instead.
    expect(label.hasAttribute("for")).toBe(false);
    expect(control.getAttribute("aria-labelledby")).toBe(label.id);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBe(
      (queryPart(container, "field:error-text") as HTMLElement).id,
    );
  });

  it("lets a control that answers for itself win over the field", () => {
    const { container } = mount(
      <FieldRoot invalid>
        <FieldLabel>Date</FieldLabel>
        <Born invalid={false} />
      </FieldRoot>,
    );

    expect(part(container, "control").hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("date-field — the form", () => {
  it("submits the ISO value and nothing else", () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    const { container } = mount(
      <form onSubmit={onSubmit}>
        <Born name="born" defaultValue={{ year: 2026, month: 4, day: 9 }} />
      </form>,
    );

    const form = container.querySelector("form") as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({ born: "2026-04-09" });
  });

  it("submits nothing while the date is half typed", () => {
    const { container } = mount(
      <form>
        <Born name="born" />
      </form>,
    );
    const month = segment(container, "month");

    fire(() => month.focus());
    fire(() =>
      month.dispatchEvent(
        new KeyboardEvent("keydown", { key: "4", bubbles: true, cancelable: true }),
      ),
    );

    const form = container.querySelector("form") as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({ born: "" });
  });
});

describe("date-field — on a pad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "select" | "back" | "moveUp" | "moveRight"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  /**
   * A field inside an open dialog, which is the arrangement the engage grammar was
   * written for: B has to let go of the segment *without* popping the layer under
   * it. Every other component treats B as "dismiss the top layer", so this is the
   * one place that rule is suspended.
   */
  it("takes hold on A, steps on the d-pad, and gives the value back on B without closing the dialog", async () => {
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Profile</DialogTitle>
                <Born defaultValue={{ year: 2026, month: 4, day: 9 }} />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    const content = document.querySelector('[data-part~="dialog:content"]') as HTMLElement;
    // The dialog places its own initial focus on a frame of its own, and it lands
    // on the first segment. Waiting for that first is not ceremony: focusing the
    // day before it would be undone a frame later, and the pad would then take
    // hold of the month.
    await waitFor(() => expect(document.activeElement).toBe(segment(content, "month")));

    const day = segment(content, "day");
    fire(() => day.focus());
    await waitFor(() => expect(document.activeElement).toBe(day));

    pad("select");
    expect(segment(content, "day").getAttribute("data-engaged")).toBe("");
    // The root carries the hold itself, ungated by focus (architecture.md:50 — on
    // the root *and* on the element being held). Asserted here so the release
    // below has something that can actually contradict it.
    expect(part(content, "root").getAttribute("data-engaged")).toBe("");

    pad("moveUp");
    expect(segment(content, "day").getAttribute("aria-valuenow")).toBe("10");

    pad("moveRight");
    await waitFor(() => expect(document.activeElement).toBe(segment(content, "year")));

    pad("back");

    expect(part(content, "hidden-input").getAttribute("value")).toBe("2026-04-09");
    // On the root, not on `day`. `moveRight` has just taken the focus to `year`,
    // and the segment's own `data-engaged` is gated on `engaged && focused` — so a
    // `day` reporting nothing proved nothing: it lost the attribute with the focus,
    // whether or not `back` released the hold.
    expect(part(content, "root").hasAttribute("data-engaged")).toBe(false);
    // The dialog is still there. Without `back` being consumed by the engage
    // scope, letting go of a segment would dismiss whatever it sat in.
    expect(document.querySelector('[data-part~="dialog:content"]')).not.toBeNull();
  });

  it("answers no pad at all when the consumer says so", async () => {
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Born defaultValue={{ year: 2026, month: 4, day: 9 }} intents={null} />
      </NavProvider>,
    );
    await settle();
    const day = segment(container, "day");
    fire(() => day.focus());

    pad("select");

    expect(segment(container, "day").hasAttribute("data-engaged")).toBe(false);
  });
});

describe("date-field — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  it("passes over the theme × density × locale matrix", async () => {
    const handle = mount(
      <main>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <FieldRoot>
                <FieldLabel>{`${theme} ${density} date`}</FieldLabel>
                <Born defaultValue={{ year: 2026, month: 4, day: 9 }} />
              </FieldRoot>
              <FieldRoot invalid>
                <FieldLabel>{`${theme} ${density} invalid`}</FieldLabel>
                <Born />
                <FieldErrorText>Pick a date</FieldErrorText>
              </FieldRoot>
              <FieldRoot>
                <FieldLabel>{`${theme} ${density} time`}</FieldLabel>
                <Born granularity="minute" />
              </FieldRoot>
              <div dir="rtl">
                <FieldRoot>
                  <FieldLabel>{`${theme} ${density} rtl`}</FieldLabel>
                  <Born dir="rtl" locale="ar-EG" />
                </FieldRoot>
              </div>
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });
});
