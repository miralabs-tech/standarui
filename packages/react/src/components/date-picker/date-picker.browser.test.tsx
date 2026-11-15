/**
 * The date picker through React, and what only an adapter can get wrong: the
 * portal, the two presences, the surface that leaves nothing behind, and — the
 * reason this file is longer than the machine's — **the composition**. A picker is
 * three machines, and the seam between them is not testable anywhere else: the day
 * chosen in a real `calendar` has to reach a real `date-field`'s segments and the
 * form mirror underneath them, and the picker has to close over it.
 *
 * The machine's own half is proved without a document in
 * `packages/core/src/components/date-picker/date-picker.test.ts`, and the surface
 * against a real engine in the browser test beside it.
 *
 * The three fixtures ROADMAP.md:173 requires are all here: the minimal form (a
 * trigger and a grid, no field, no label, no title, no cancel), a declined date in
 * the first position, and a gamepad intent arriving through a real provider.
 */

import { type DateValue, toISO } from "@standarui/core/calendar";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import type { InputSystem } from "../../nav";
import { NavProvider, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  realKey,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  CalendarCaption,
  CalendarCell,
  CalendarGrid,
  CalendarHeader,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarWeekday,
  CalendarWeekdayRow,
  CalendarWeekRow,
  useCalendarContext,
} from "../calendar/calendar";
import {
  DateFieldControl,
  DateFieldHiddenInput,
  DateFieldSegments,
} from "../date-field/date-field";
import {
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { FieldLabel, FieldRoot } from "../field/field";
import {
  DatePickerBackdrop,
  DatePickerCalendar,
  DatePickerCancelTrigger,
  DatePickerClearTrigger,
  DatePickerCloseTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerLabel,
  DatePickerPortal,
  DatePickerPositioner,
  DatePickerRoot,
  type DatePickerRootProps,
  DatePickerTitle,
  DatePickerTrigger,
  useDatePickerContext,
} from "./date-picker";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

const APRIL_9: DateValue = { year: 2026, month: 4, day: 9 };
const APRIL_1: DateValue = { year: 2026, month: 4, day: 1 };

function part(root: ParentNode, name: string): HTMLElement {
  const node = queryPart(root, `date-picker:${name}`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

/** The field is a component of its own inside this one — its parts wear its scope. */
function fieldPart(root: ParentNode, name: string): HTMLElement {
  const node = queryPart(root, `date-field:${name}`);
  if (node === null) throw new Error(`no date-field part "${name}"`);
  return node;
}

/**
 * The surface never leaves on the frame it was closed on: `presence` holds it for
 * the exit. `settle` first so the close, the blur it causes inside the grid and the
 * focus restore all land inside `act`; only the presence's own removal, which the
 * browser schedules, is waited for outside it.
 */
async function expectSurfaceGone(): Promise<void> {
  await settle();
  await waitFor(() => expect(queryPart(document.body, "date-picker:content")).toBeNull());
}

/** A trusted pointer sequence; the update it causes is scheduled by the browser. */
async function realClick(node: HTMLElement, position?: { x: number; y: number }): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    const box = node.getBoundingClientRect();
    const x = box.left + (position?.x ?? box.width / 2);
    const y = box.top + (position?.y ?? box.height / 2);
    // The queued mouse command, not userEvent.click: under Firefox a bare click
    // races the gestures other files send at the same moment (see vitest.config.ts).
    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "up", x, y },
    ]);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
}

function cell(root: ParentNode, iso: string): HTMLElement {
  const node = root.querySelector<HTMLElement>(`[data-value="${iso}"]`);
  if (node === null) throw new Error(`no cell "${iso}"`);
  return node;
}

function segment(root: ParentNode, type: string): HTMLElement {
  const node = root.querySelector<HTMLElement>(`[data-segment="${type}"]`);
  if (node === null) throw new Error(`no segment "${type}"`);
  return node;
}

/** The month, written the way a consumer writes it. */
function Month(): React.ReactNode {
  const api = useCalendarContext();
  return (
    <>
      <CalendarHeader>
        <CalendarPrevTrigger aria-label="Previous month" />
        <CalendarCaption />
        <CalendarNextTrigger aria-label="Next month" />
      </CalendarHeader>
      <CalendarGrid>
        <CalendarWeekdayRow>
          {api.weekdays.map((weekday, index) => (
            <CalendarWeekday key={weekday.long} index={index} />
          ))}
        </CalendarWeekdayRow>
        {api.weeks.map((week, row) => (
          <CalendarWeekRow key={toISO(week[0] as DateValue)} index={row}>
            {week.map((day) => (
              <CalendarCell key={toISO(day)} value={day} />
            ))}
          </CalendarWeekRow>
        ))}
      </CalendarGrid>
    </>
  );
}

interface DueProps extends Omit<DatePickerRootProps, "title"> {
  /** The surface's heading — a flag, since a `div` has a `title` of its own. */
  readonly heading?: boolean;
  readonly cancel?: boolean;
  readonly clear?: boolean;
  readonly isDateUnavailable?: DatePickerRootProps["isDateUnavailable"];
  /** Only the axe scenes pass one — see `landmarkedPortalHost`. */
  readonly portalContainer?: Element | null;
}

/** The whole shape: a label, a segmented field, a disclosure and a month. */
function Due(props: DueProps): React.ReactNode {
  const { heading, cancel, clear, portalContainer, children, ...root } = props;
  return (
    <DatePickerRoot label="Due date" locale="en-US" {...root}>
      <DatePickerLabel>Due date</DatePickerLabel>
      <DatePickerField>
        <DateFieldControl>
          <DateFieldSegments />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DatePickerField>
      {clear === true ? <DatePickerClearTrigger aria-label="Clear" /> : null}
      <DatePickerTrigger />
      <DatePickerPortal container={portalContainer}>
        <DatePickerBackdrop />
        <DatePickerPositioner>
          <DatePickerContent>
            {heading === true ? <DatePickerTitle>Choose a date</DatePickerTitle> : null}
            <DatePickerCalendar firstDayOfWeek={1}>
              <Month />
            </DatePickerCalendar>
          </DatePickerContent>
          {cancel === true ? <DatePickerCancelTrigger>Cancel</DatePickerCancelTrigger> : null}
        </DatePickerPositioner>
      </DatePickerPortal>
    </DatePickerRoot>
  );
}

/** The minimal form: a trigger and a month. No field, no label, no chrome. */
function Bare(props: DatePickerRootProps): React.ReactNode {
  return (
    <DatePickerRoot label="Due date" locale="en-US" {...props}>
      <DatePickerTrigger />
      <DatePickerPortal>
        <DatePickerPositioner>
          <DatePickerContent>
            <DatePickerCalendar firstDayOfWeek={1}>
              <BareMonth />
            </DatePickerCalendar>
          </DatePickerContent>
        </DatePickerPositioner>
      </DatePickerPortal>
    </DatePickerRoot>
  );
}

function BareMonth(): React.ReactNode {
  const api = useCalendarContext();
  return (
    <CalendarGrid>
      {api.weeks.map((week, row) => (
        <CalendarWeekRow key={toISO(week[0] as DateValue)} index={row}>
          {week.map((day) => (
            <CalendarCell key={toISO(day)} value={day} />
          ))}
        </CalendarWeekRow>
      ))}
    </CalendarGrid>
  );
}

afterEach(() => unmountAll());

describe("date-picker in React — the surface", () => {
  it("leaves nothing behind while closed, and names what it opened", async () => {
    const { container } = mount(<Due defaultValue={APRIL_9} />);
    await settle();

    const trigger = part(container, "trigger");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    expect(queryPart(document.body, "date-picker:content")).toBeNull();

    fire(() => trigger.click());
    await settle();

    const content = part(document.body, "content");
    expect(content.getAttribute("role")).toBe("dialog");
    expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    // No title rendered here, so the trigger is the surface's name — never an
    // IDREF at an element nobody wrote.
    expect(content.getAttribute("aria-labelledby")).toBe(trigger.id);

    fire(() => trigger.click());
    await expectSurfaceGone();
  });

  it("takes its name from a title the moment one is rendered", async () => {
    const { container } = mount(<Due defaultOpen heading />);
    await settle();

    const content = part(document.body, "content");
    await waitFor(() =>
      expect(content.getAttribute("aria-labelledby")).toBe(part(document.body, "title").id),
    );
    expect(part(container, "trigger").getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * The APG's Date Picker Dialog opens onto the day. The picker asks ARIA for it —
   * the grid's single roving tab stop — so the entry works without the picker
   * knowing which component drew the grid.
   */
  it("opens onto the day and hands the trigger back", async () => {
    const { container } = mount(<Due defaultValue={APRIL_9} />);
    await settle();
    const trigger = part(container, "trigger");

    fire(() => trigger.click());
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, toISO(APRIL_9))));

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps the cancel card out of the document unless it is a sheet", async () => {
    mount(<Due defaultOpen cancel />);
    await settle();
    expect(queryPart(document.body, "date-picker:cancel-trigger")).toBeNull();

    unmountAll();

    mount(<Due defaultOpen cancel presentation="sheet" />);
    await settle();
    // Hidden in CSS it would still be a tab stop and still be announced — the
    // menu's lesson, which is why the adapter withholds the element itself.
    expect(queryPart(document.body, "date-picker:cancel-trigger")).not.toBeNull();
    expect(queryPart(document.body, "date-picker:backdrop")).not.toBeNull();
    expect(part(document.body, "content").getAttribute("data-presentation")).toBe("sheet");
  });

  /**
   * R59: the cancel card is a sibling of the content, so a real press on it used
   * to land outside the dismissable layer — `outside-pointer` instead of `back`,
   * and under `closeOnInteractOutside={false}` the swallowed click left the
   * button dead. A trusted pointer sequence, because `element.click()` sends no
   * pointerdown and the layer never sees it. The press focuses the cancel, which
   * sits beside the content: the restore must still hand the focus to the trigger.
   */
  for (const closeOnInteractOutside of [true, false]) {
    it(`a real press on the sheet's cancel closes with "back" and refocuses the trigger (closeOnInteractOutside=${closeOnInteractOutside})`, async () => {
      const reasons: string[] = [];
      mount(
        <Due
          defaultOpen
          cancel
          presentation="sheet"
          closeOnInteractOutside={closeOnInteractOutside}
          onDismiss={(details) => reasons.push(details.reason)}
        />,
      );
      await settle();

      await realClick(part(document.body, "cancel-trigger"));

      await expectSurfaceGone();
      expect(reasons).toEqual(["back"]);
      await waitFor(() => expect(document.activeElement).toBe(part(document.body, "trigger")));
    });
  }

  /**
   * R59 without the shipped stylesheet (decision 01): a consumer's own sheet whose
   * positioner covers the viewport and takes the pointer. A press beside the
   * content lands on the positioner, outside the surface, and must still close
   * with `outside-pointer` — so only the cancel may leave the outside set.
   */
  it("a press on a full-viewport positioner beside the content closes with outside-pointer, without the stylesheet", async () => {
    const style = document.createElement("style");
    style.textContent =
      '[data-part~="date-picker:positioner"]{position:fixed;inset:0;display:flex;align-items:flex-end}';
    document.head.append(style);
    try {
      const reasons: string[] = [];
      mount(
        <Due
          defaultOpen
          cancel
          presentation="sheet"
          onDismiss={(details) => reasons.push(details.reason)}
        />,
      );
      await settle();

      const positioner = part(document.body, "positioner");
      expect(document.elementFromPoint(8, 8)).toBe(positioner);
      await realClick(positioner, { x: 8, y: 8 });

      await expectSurfaceGone();
      expect(reasons).toEqual(["outside-pointer"]);
    } finally {
      style.remove();
    }
  });

  /**
   * R63: WebKit never focuses a button it is pressed on, so a real press on the
   * trigger blurs the day onto `body` before the click closes the surface. The
   * restore has to read `body` as "the focus went nowhere", not as "the person
   * chose to be elsewhere".
   */
  it("a real press on the trigger closes and refocuses it (R63)", async () => {
    const { container } = mount(<Due defaultValue={APRIL_9} />);
    await settle();
    const trigger = part(container, "trigger");

    await realClick(trigger);
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, toISO(APRIL_9))));

    await realClick(trigger);

    await expectSurfaceGone();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  /**
   * The other side of R63: `body` lets the restore through, a field the press
   * really focused does not. With `preventOutsideActivation` on (the default) the
   * press is swallowed and the field never takes the focus, so it is off here.
   */
  it("a real press on a field outside closes and leaves the focus on that field (R63)", async () => {
    const { container } = mount(
      // Pinned to the far corner, clear of the surface whichever side it flips to.
      <>
        <Due defaultValue={APRIL_9} preventOutsideActivation={false} />
        <input
          aria-label="Elsewhere"
          data-testid="elsewhere"
          style={{ position: "fixed", right: 0, bottom: 0, width: "4rem" }}
        />
      </>,
    );
    await settle();
    const trigger = part(container, "trigger");
    const elsewhere = container.querySelector<HTMLElement>('[data-testid="elsewhere"]');
    if (elsewhere === null) throw new Error("no outside field");

    await realClick(trigger);
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, toISO(APRIL_9))));
    const box = elsewhere.getBoundingClientRect();
    expect(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)).toBe(
      elsewhere,
    );

    await realClick(elsewhere);

    await expectSurfaceGone();
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });
});

/**
 * R63 inside a shadow root: `ShadowRoot.activeElement` is `null` as soon as the
 * focus leaves the root, so "the focus went nowhere" has to be read on the
 * document, where a field of the light DOM is not `body`.
 */
describe("date-picker in React — inside a shadow root (R63)", () => {
  function mountInShadow(): { shadow: ShadowRoot; trigger: HTMLElement; elsewhere: HTMLElement } {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const app = document.createElement("div");
    const layer = document.createElement("div");
    shadow.append(app, layer);
    const elsewhere = document.createElement("input");
    elsewhere.setAttribute("aria-label", "Elsewhere");
    elsewhere.style.cssText = "position:fixed;right:0;bottom:0;width:4rem";
    const { container } = mount(
      createPortal(
        <Due
          defaultValue={APRIL_9}
          getRootNode={() => shadow}
          portalContainer={layer}
          preventOutsideActivation={false}
        />,
        app,
      ),
    );
    container.append(host, elsewhere);
    return { shadow, trigger: part(shadow, "trigger"), elsewhere };
  }

  async function open(shadow: ShadowRoot, trigger: HTMLElement): Promise<void> {
    await settle();
    await realClick(trigger);
    await waitFor(() => expect(shadow.activeElement).toBe(cell(shadow, toISO(APRIL_9))));
  }

  it("a real press on a light-DOM field closes and leaves the focus on that field", async () => {
    const { shadow, trigger, elsewhere } = mountInShadow();
    await open(shadow, trigger);

    await realClick(elsewhere);

    await waitFor(() => expect(queryPart(shadow, "date-picker:content")).toBeNull());
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a Tab out of the surface, then Escape, leaves the focus where the Tab put it", async () => {
    const { shadow, trigger, elsewhere } = mountInShadow();
    await open(shadow, trigger);

    await realKey("{Tab}");
    expect(document.activeElement).toBe(elsewhere);
    expect(queryPart(shadow, "date-picker:content")).not.toBeNull();

    await realKey("{Escape}");

    await waitFor(() => expect(queryPart(shadow, "date-picker:content")).toBeNull());
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });
});

/**
 * R58: a picker opened, then disabled (decision 61), then closed. The trigger the
 * focus would go back to is now `disabled` and takes nothing, and the unmounted
 * content takes the focus with it: without a fallback it lands on `body`. The
 * core fixture keeps the content mounted and cannot see it; only the adapter's
 * presence removes the node.
 */
describe("date-picker in React — closed after it was disabled while open", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  afterEach(() => {
    input = null;
  });

  function Scene(props: {
    readonly disabled: boolean;
    readonly cancel?: boolean;
  }): React.ReactNode {
    return (
      <NavProvider>
        <Capture />
        <button type="button">Before</button>
        <DatePickerRoot
          label="Due date"
          locale="en-US"
          defaultValue={APRIL_9}
          disabled={props.disabled}
          presentation={props.cancel === true ? "sheet" : undefined}
        >
          <DatePickerTrigger />
          <DatePickerPortal>
            <DatePickerPositioner>
              <DatePickerContent>
                <DatePickerCalendar firstDayOfWeek={1}>
                  <BareMonth />
                </DatePickerCalendar>
                <DatePickerCloseTrigger aria-label="Close" />
              </DatePickerContent>
              {props.cancel === true ? (
                <DatePickerCancelTrigger>Cancel</DatePickerCancelTrigger>
              ) : null}
            </DatePickerPositioner>
          </DatePickerPortal>
        </DatePickerRoot>
        <button type="button">After</button>
      </NavProvider>
    );
  }

  async function openThen(disable: boolean, cancel = false): Promise<HTMLElement> {
    const handle = mount(<Scene disabled={false} cancel={cancel} />);
    await settle();
    const trigger = part(handle.container, "trigger");
    fire(() => trigger.focus());
    fire(() => trigger.click());
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-09")));
    if (disable) {
      handle.render(<Scene disabled cancel={cancel} />);
      await settle();
      expect((trigger as HTMLButtonElement).disabled).toBe(true);
    }
    return trigger;
  }

  const closes: Record<string, () => Promise<void>> = {
    "the close trigger, on a real Enter": async () => {
      await realKey("{Tab}");
      expect(document.activeElement).toBe(part(document.body, "close-trigger"));
      await realKey("{Enter}");
    },
    "a real Escape": async () => {
      await realKey("{Escape}");
    },
    "the pad's B": async () => {
      fire(() => {
        input?.emit({ intent: "back", source: "gamepad" });
      });
    },
  };

  for (const [route, close] of Object.entries(closes)) {
    it(`hands the focus to the next tab stop when closed by ${route}`, async () => {
      await openThen(true);
      await close();
      await expectSurfaceGone();
      await waitFor(() => expect(document.activeElement?.textContent).toBe("After"));
      expect(document.activeElement).not.toBe(document.body);
    });

    it(`still hands the focus to an enabled trigger when closed by ${route}`, async () => {
      const trigger = await openThen(false);
      await close();
      await expectSurfaceGone();
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
  }

  /**
   * The sheet's cancel sits beside the content and takes the focus on a real
   * press: the fallback must still treat it as part of the layer that closes.
   */
  it("hands the focus to the next tab stop when closed by a real press on the sheet's cancel", async () => {
    await openThen(true, true);
    await realClick(part(document.body, "cancel-trigger"));
    await expectSurfaceGone();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("After"));
  });
});

describe("date-picker in React — the three machines", () => {
  it("carries a day from the grid to the segments and to the form", async () => {
    const { container } = mount(<Due defaultOpen name="due" today={APRIL_1} />);
    await settle();

    fire(() => cell(document.body, "2026-04-09").click());
    await settle();

    // The grid closed the surface...
    await expectSurfaceGone();
    // ...the field rebuilt its segments from the picker's value...
    expect(segment(container, "day").getAttribute("aria-valuenow")).toBe("9");
    expect(segment(container, "month").getAttribute("aria-valuenow")).toBe("4");
    expect(segment(container, "year").getAttribute("aria-valuenow")).toBe("2026");
    // ...and the form mirror is the field's, because this anatomy has none.
    const hidden = fieldPart(container, "hidden-input") as HTMLInputElement;
    expect(hidden.getAttribute("name")).toBe("due");
    expect(hidden.getAttribute("value")).toBe("2026-04-09");
  });

  /**
   * The typed path must not close: the year is nearly always the last unit filled,
   * and a picker that shut halfway through a date would be unusable.
   */
  it("takes a date from the segments without closing, and pages the grid to it", async () => {
    const { container } = mount(<Due defaultOpen defaultValue={APRIL_9} />);
    await settle();

    const month = segment(container, "month");
    fire(() => month.focus());
    fire(() => {
      month.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    await settle();

    expect(queryPart(document.body, "date-picker:content")).not.toBeNull();
    expect(month.getAttribute("aria-valuenow")).toBe("5");
    // The calendar is controlled from the picker's value, so the grid followed the
    // typing without anybody wiring a page.
    expect(part(document.body, "content").textContent).toContain("May");
    expect(cell(document.body, "2026-05-09").getAttribute("aria-selected")).toBe("true");
  });

  it("clears from the picker and both children forget", async () => {
    const { container } = mount(<Due defaultValue={APRIL_9} clearable clear />);
    await settle();

    const clear = part(container, "clear-trigger") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    fire(() => clear.click());
    await settle();

    expect(clear.disabled).toBe(true);
    expect(segment(container, "day").hasAttribute("aria-valuenow")).toBe(false);
    expect((fieldPart(container, "hidden-input") as HTMLInputElement).getAttribute("value")).toBe(
      "",
    );
  });

  /**
   * The first component whose `root` holds controls beside the trigger, and the
   * shape came from `select`, where it does not. With the surface open, the clear
   * button was an *outside* press: the layer prevented the pointerdown, cancelled
   * the click in capture, closed the surface and put the focus back on the trigger —
   * so the button did nothing at all on the first press (audit of 2026-09-05).
   */
  it("clears with the surface open, on the first press", async () => {
    const { container } = mount(<Due defaultValue={APRIL_9} clearable clear defaultOpen />);
    await settle();

    expect(queryPart(document.body, "date-picker:content")).not.toBeNull();
    const clear = part(container, "clear-trigger") as HTMLButtonElement;

    // A pointerdown and then the click, which is the order a finger produces and
    // the only order the dismissable layer can act on.
    fire(() => {
      clear.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      clear.click();
    });
    await settle();

    expect(segment(container, "day").hasAttribute("aria-valuenow")).toBe(false);
    expect(clear.disabled).toBe(true);
  });

  it("inherits the field it sits in, and hands the name down to the group", async () => {
    const { container } = mount(
      <FieldRoot invalid>
        <FieldLabel>Due date</FieldLabel>
        <Due />
      </FieldRoot>,
    );
    await settle();

    const label = container.querySelector("label");
    // A `div[role=group]` is not labelable, so the field's label id descends to
    // the segmented control rather than being pointed at by a `for`.
    expect(fieldPart(container, "control").getAttribute("aria-labelledby")).toBe(label?.id);
    expect(fieldPart(container, "control").getAttribute("aria-invalid")).toBe("true");
    expect(part(container, "root").getAttribute("data-invalid")).toBe("");
  });

  /**
   * Standing on its own, the picker's own `label` part is what names the group.
   * It carried an id nothing referenced until 2026-09-06, so every story that
   * rendered one still handed a reader an anonymous group of spinbuttons — the
   * shape above only worked because a `field` was supplying `labelledBy`.
   *
   * An explicit `labelledBy` still wins, which is why the fixture above keeps
   * pointing at the field's label and not at this one.
   */
  it("names the group from its own label part when no field supplies one", async () => {
    const { container } = mount(<Due />);
    await settle();

    const label = part(container, "label");
    expect(label.id).not.toBe("");
    expect(fieldPart(container, "control").getAttribute("aria-labelledby")).toBe(label.id);
  });

  /**
   * R64: a chip trigger's whole content is the date, and both naming attributes
   * replace that content. The name is resolved the way the algorithm does it —
   * every IDREF must land, then their texts in order — because a markup table
   * cannot tell two equally silent trees apart.
   */
  it("announces the chosen date on a chip trigger, under either naming source", async () => {
    function ChipTrigger(): React.ReactNode {
      return <DatePickerTrigger>{useDatePickerContext().valueText}</DatePickerTrigger>;
    }
    function Chip(props: DatePickerRootProps): React.ReactNode {
      return (
        <DatePickerRoot locale="en-US" defaultValue={APRIL_9} {...props}>
          <ChipTrigger />
        </DatePickerRoot>
      );
    }
    const { container } = mount(
      <>
        <span id="chip-label">Due date</span>
        <Chip labelledBy="chip-label" />
        <Chip label="Due date" />
      </>,
    );
    await settle();

    const [wired, named] = queryParts(container, "date-picker:trigger");
    const ids = wired?.getAttribute("aria-labelledby")?.split(" ") ?? [];
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(["Due date", "Apr 9, 2026"]);
    expect(named?.getAttribute("aria-label")).toBe("Due date, Apr 9, 2026");
  });
});

describe("date-picker in React — the imposed fixtures", () => {
  /** A trigger and a month, nothing else: no field, no label, no title, no cancel. */
  it("is operable in its minimal form", async () => {
    const { container } = mount(<Bare defaultValue={APRIL_9} />);
    await settle();

    const trigger = part(container, "trigger");
    fire(() => trigger.click());
    await settle();

    const chosen = cell(document.body, "2026-04-10");
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-09")));
    fire(() => chosen.click());
    await expectSurfaceGone();

    fire(() => trigger.click());
    await settle();
    expect(cell(document.body, "2026-04-10").getAttribute("aria-selected")).toBe("true");
    await expectNoAxeViolations(document.body);
  });

  /**
   * The library's "disabled item in first position", translated to a grid: the
   * surface must not open onto a date nobody can choose, and the tab stop the
   * calendar scanned for is the one the picker's entry lands on. The two agree by
   * construction — both read the single `tabindex="0"` of the grid.
   */
  it("opens onto a reachable day when the first ones are declined", async () => {
    const { container } = mount(
      <Bare
        defaultValue={null}
        defaultOpen={false}
        today={{ year: 2026, month: 4, day: 1 }}
        isDateUnavailable={(value) => value.month === 4 && value.day < 10}
      />,
    );
    await settle();

    fire(() => part(container, "trigger").click());
    await settle();

    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-10")));
    expect(cell(document.body, "2026-04-01").getAttribute("aria-disabled")).toBe("true");
    expect(cell(document.body, "2026-04-01").tabIndex).toBe(-1);
  });
});

describe("date-picker in React — the pad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "select" | "back" | "moveRight" | "pageUp"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  /**
   * The whole of §7 in one scene. The calendar pushed its scope while it mounted —
   * an adapter starts a child's machine before the parent's watchers run — so the
   * picker's scope sits on top of it and claims exactly one intent. Everything else
   * has to fall through to the grid, or the picker would take the month keys away
   * from the component that answers them.
   */
  it("walks the month on the d-pad, chooses on A and closes on B", async () => {
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Bare defaultValue={APRIL_9} />
      </NavProvider>,
    );
    await settle();

    fire(() => part(container, "trigger").click());
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-09")));

    pad("moveRight");
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-10")));

    // LT/RT is the month, and it reaches the calendar through the picker's scope.
    pad("pageUp");
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-03-10")));

    pad("select");
    await expectSurfaceGone();

    fire(() => part(container, "trigger").click());
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-03-10")));

    pad("back");
    await expectSurfaceGone();
  });

  /**
   * `intents={null}` is how a consumer declines the pad while a provider is mounted
   * above them, and it has to reach the grid too — the picker relays it to the
   * calendar, so neither machine pushes a scope and the whole subtree is deaf. The
   * mirror of the scene above, intent for intent: B does not close, and the month
   * does not walk.
   */
  it("answers no pad at all when the consumer says so", async () => {
    mount(
      <NavProvider>
        <Capture />
        <Bare defaultValue={APRIL_9} defaultOpen intents={null} />
      </NavProvider>,
    );
    await settle();

    const day = cell(document.body, "2026-04-09");
    await waitFor(() => expect(document.activeElement).toBe(day));

    pad("back");
    await settle();

    expect(queryPart(document.body, "date-picker:content")).not.toBeNull();

    pad("moveRight");
    await settle();

    expect(document.activeElement).toBe(day);
  });
});

describe("date-picker in React — Tab at the edges of the surface", () => {
  function Scene(props: { readonly modal: boolean; readonly dialog: boolean }): React.ReactNode {
    const body = (
      <>
        <button type="button">Before</button>
        <Due
          defaultValue={APRIL_9}
          cancel
          modal={props.modal}
          presentation={props.modal ? "sheet" : "popup"}
        />
        <button type="button">After</button>
      </>
    );
    if (!props.dialog) return body;
    return (
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              {body}
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    );
  }

  async function open(modal: boolean, dialog: boolean): Promise<HTMLElement> {
    mount(<Scene modal={modal} dialog={dialog} />);
    await settle();
    if (dialog) {
      await waitFor(() => {
        expect(
          document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
        ).toBe(true);
      });
    }
    const trigger = part(document.body, "trigger");
    fire(() => trigger.focus());
    fire(() => trigger.click());
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(cell(document.body, "2026-04-09")));
    return trigger;
  }

  const name = (node: Element | null): string =>
    node?.getAttribute("data-value") ??
    node?.getAttribute("aria-label") ??
    node?.textContent?.trim() ??
    node?.tagName ??
    "null";

  async function walk(keys: readonly string[]): Promise<string[]> {
    const seen: string[] = [];
    for (const key of keys) {
      await realKey(key);
      seen.push(name(document.activeElement));
    }
    return seen;
  }

  const TAB = "{Tab}";
  const BACK = "{Shift>}{Tab}{/Shift}";

  for (const dialog of [false, true]) {
    const where = dialog ? "inside a dialog" : "on the page";

    // The cancel card is a sibling of the content and no tab stop (`tabIndex: -1`).
    it(`a modal sheet cycles Tab inside the surface, the grid one stop (${where})`, async () => {
      const trigger = await open(true, dialog);
      expect(await walk([TAB, TAB, TAB, TAB])).toEqual([
        "Previous month",
        "Next month",
        "2026-04-09",
        "Previous month",
      ]);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");

      await realKey("{Escape}");
      await expectSurfaceGone();
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it(`a modal sheet cycles Shift+Tab inside the surface (${where})`, async () => {
      const trigger = await open(true, dialog);
      expect(await walk([BACK, BACK, BACK, BACK])).toEqual([
        "Next month",
        "Previous month",
        "2026-04-09",
        "Next month",
      ]);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");

      await realKey("{Escape}");
      await expectSurfaceGone();
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    // An inert region the consumer made, not a modal layer: nothing to loop inside.
    it(`a non-modal popup whose trigger turned inert still tabs out (${where})`, async () => {
      const trigger = await open(false, dialog);
      const region = trigger.closest('[data-part~="date-picker:root"]') as HTMLElement;
      fire(() => region.setAttribute("inert", ""));
      await realKey(TAB);
      expect(name(document.activeElement)).toBe("After");
    });

    it(`a non-modal popup still tabs past its trigger (${where})`, async () => {
      const trigger = await open(false, dialog);
      expect(await walk([BACK, BACK])).toEqual(["Next month", "Previous month"]);
      await realKey(BACK);
      expect(document.activeElement).toBe(trigger);

      unmountAll();
      await open(false, dialog);
      await realKey(TAB);
      expect(name(document.activeElement)).toBe("After");
    });
  }
});

/**
 * A landmark host for the portalled surface, created outside React: `Portal`
 * resolves its container during the first render and falls back to a second commit
 * when the node is not there yet, and a surface that arrives one commit late starts
 * its machine against an empty document.
 */
function landmarkedPortalHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Date picker surface");
  document.body.append(host);
  return host;
}

describe("date-picker in React — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  afterEach(() => {
    // React first, the host after: detaching a container that still holds the
    // focused cell blurs it, and that blur reaches the calendar's machine as a real
    // update — outside `act`, since nothing here is a React event.
    unmountAll();
    for (const host of document.querySelectorAll('[aria-label="Date picker surface"]')) {
      host.remove();
    }
  });

  it("closed: the matrix of theme × density, field and trigger together", async () => {
    const { container } = mount(
      <main>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <FieldRoot>
                <FieldLabel>{`${theme} ${density} due`}</FieldLabel>
                <Due defaultValue={APRIL_9} clearable clear />
              </FieldRoot>
              <FieldRoot invalid>
                <FieldLabel>{`${theme} ${density} invalid`}</FieldLabel>
                <Due />
              </FieldRoot>
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });

  it("open popup: a named dialog over a grid", async () => {
    mount(
      <main>
        <Due defaultOpen heading defaultValue={APRIL_9} portalContainer={landmarkedPortalHost()} />
      </main>,
    );
    await settle();

    expect(part(document.body, "content").getAttribute("data-presentation")).toBe("popup");
    await expectNoAxeViolations(document.body);
  });

  it("open sheet: the cancel card is a sibling of the month, never inside it", async () => {
    mount(
      <main>
        <Due
          defaultOpen
          heading
          cancel
          presentation="sheet"
          defaultValue={APRIL_9}
          portalContainer={landmarkedPortalHost()}
        />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(document.body);
  });
});
