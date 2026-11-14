/**
 * The node half of `date-field`: no document, no framework, the shape a server
 * render has — and the shape that matters most for this component, because the
 * locale decides the *order of the children* here. If `connect` reached for a
 * clock or a browser locale, the server would emit one order and the client
 * another, and the mismatch would be structural rather than cosmetic.
 *
 * The keyboard itself lives in `connect`, so what is exercised below is the
 * machine's own vocabulary: the events a key resolves to, and nothing about keys.
 */

import { createIntentBus } from "@standarx/nav";
import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./date-field.connect";
import { machine } from "./date-field.machine";
import type {
  DateFieldApi,
  DateFieldMachineProps,
  DateFieldSchema,
  DateSegment,
  DateSegmentType,
} from "./date-field.types";

type Api = DateFieldApi<PlainPropTypes>;

const build = (props: DateFieldMachineProps = {}) =>
  connectWithoutDom<DateFieldSchema, Api>({ machine, connect, id: "d1", props });

/** Started, because every event below is one a client sends. */
function run(props: DateFieldMachineProps = {}) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

const shape = (segments: readonly DateSegment[]): string =>
  segments.map((segment) => (segment.type === "literal" ? segment.text : segment.type)).join("");

const text = (segments: readonly DateSegment[]): string =>
  segments.map((segment) => segment.text).join("");

function type(
  harness: ReturnType<typeof run>,
  segment: DateSegmentType,
  digits: readonly number[],
): void {
  harness.service.send({ type: "SEGMENT.FOCUS", segment });
  for (const digit of digits) {
    harness.service.send({
      type: "SEGMENT.INPUT",
      segment: harness.service.context.get("focusedSegment") ?? segment,
      digit,
    });
  }
}

describe("date-field without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultValue: { year: 2026, month: 4, day: 9 } });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps()["data-scope"]).toBe("date-field");
    expect(api.getRootProps().id).toBe("date-field:d1:root");
    expect(api.getControlProps().id).toBe("date-field:d1:control");
    expect(api.getControlProps().role).toBe("group");
    expect(api.valueAsString).toBe("2026-04-09");
  });

  it("lays the segments out the way the locale writes them", () => {
    // The order, not the strings: ICU's own separators drift between engines and
    // between versions, and asserting one would be asserting the runtime.
    expect(shape(build({ locale: "en-US" }).api().segments)).toBe("month/day/year");
    expect(shape(build({ locale: "de-DE" }).api().segments)).toBe("day.month.year");
    expect(shape(build({ locale: "ja-JP" }).api().segments)).toBe("year/month/day");
  });

  it("keeps a non-Gregorian locale on the Gregorian year", () => {
    // `date-format` forces `calendar: "gregory"`; without it `th-TH` would render
    // 2569 while the machine counted 2026, and `formatToParts` would report an era
    // segment nothing here knows how to edit.
    const segments = build({
      locale: "th-TH",
      defaultValue: { year: 2026, month: 4, day: 9 },
    }).api().segments;
    const year = segments.find((segment) => segment.type === "year");

    expect(year?.text).toBe("2026");
    expect(segments.some((segment) => segment.type === "literal" && segment.text === "")).toBe(
      false,
    );
  });

  it("draws dashes as wide as the number they stand in for", () => {
    const segments = build().api().segments;

    expect(text(segments)).toBe("--/--/----");
    expect(segments.every((segment) => segment.value === null)).toBe(true);
    // Nothing is submitted until every unit is filled: a form must not receive the
    // 1st of a month nobody chose.
    expect(build().api().valueAsString).toBe("");
    expect(build().api().value).toBeNull();
  });

  it("publishes each unit's own bounds, and none of them read a clock", () => {
    const bounds = (props: DateFieldMachineProps, type: DateSegmentType) => {
      const segment = build(props)
        .api()
        .segments.find((entry) => entry.type === type);
      return [segment?.min, segment?.max];
    };

    expect(bounds({}, "year")).toEqual([1, 9999]);
    expect(bounds({}, "month")).toEqual([1, 12]);
    // 31 while the month is unknown: the largest day a user is entitled to type,
    // and a number a server and a client cannot disagree about.
    expect(bounds({}, "day")).toEqual([1, 31]);
    expect(bounds({ defaultValue: { year: 2026, month: 2, day: 1 } }, "day")).toEqual([1, 28]);
    expect(bounds({ defaultValue: { year: 2024, month: 2, day: 1 } }, "day")).toEqual([1, 29]);
    expect(bounds({ granularity: "minute", hourCycle: "h23" }, "hour")).toEqual([0, 23]);
    expect(bounds({ granularity: "minute", hourCycle: "h12" }, "hour")).toEqual([1, 12]);
    expect(bounds({ granularity: "minute" }, "minute")).toEqual([0, 59]);
  });

  it("names its own group when there is nothing outside it to do the naming", () => {
    // `labelledBy` covers the field case, where a `field` hands its label's id
    // down. On its own — the minimal shape the DoD asks every component to
    // ship — a `div[role="group"]` is not labelable, so `<label for>` cannot
    // reach it and there was no seam left at all.
    expect(build({ label: "Date of birth" }).api().getControlProps()["aria-label"]).toBe(
      "Date of birth",
    );
  });

  it("says a padded number once, and a word that is not the number as well", () => {
    const api = build({
      granularity: "minute",
      hourCycle: "h12",
      defaultValue: { year: 2026, month: 4, day: 9, hour: 13, minute: 5 },
    }).api();
    const of = (type: DateSegmentType) => {
      const segment = api.segments.find((entry) => entry.type === type);
      if (segment === undefined) throw new Error(`no segment "${type}"`);
      return { segment, props: api.getSegmentProps(segment) };
    };

    // The guard exists to stop a reader saying the same number twice, and a
    // leading zero is not a second number: `valuenow=4` beside `valuetext="04"`
    // is exactly the announcement it was written to prevent.
    expect(of("month").props["aria-valuenow"]).toBe(4);
    expect(of("month").props["aria-valuetext"]).toBeUndefined();
    expect(of("hour").props["aria-valuetext"]).toBeUndefined();
    expect(of("year").props["aria-valuetext"]).toBeUndefined();

    // And it still speaks where the text is genuinely another reading: "1" says
    // nothing a listener can act on, the word does.
    const period = of("dayPeriod");
    expect(period.props["aria-valuenow"]).toBe(1);
    expect(period.props["aria-valuetext"]).toBe(period.segment.text);
  });

  it("names every unit in the field's own locale", () => {
    const label = (locale: string, type: DateSegmentType): string | undefined =>
      build({ locale })
        .api()
        .segments.find((segment) => segment.type === type)?.label;

    // The strings come from `Intl.DisplayNames`, so the assertion is that they are
    // localised at all — never an equality on a translation.
    expect(label("en-US", "month")).toBe("month");
    expect(label("fr-FR", "month")).not.toBe(label("en-US", "month"));
    expect(label("en-US", "year")).not.toBe(label("en-US", "month"));
  });
});

describe("date-field typing", () => {
  it("fills a segment and moves on when no further digit could fit", () => {
    const harness = run();
    type(harness, "month", [1, 2]);

    expect(harness.service.context.get("parts").month).toBe(12);
    // 120 is not a month, so the field advances rather than waiting for a keystroke
    // it would have to throw away.
    expect(harness.service.context.get("focusedSegment")).toBe("day");
  });

  it("keeps what a segment holds when the next digit would overflow it, and opens the next one with it", () => {
    const harness = run();
    type(harness, "month", [1, 3]);

    expect(harness.service.context.get("parts")).toMatchObject({ month: 1, day: 3 });
    expect(harness.service.context.get("focusedSegment")).toBe("day");
  });

  it("reports the value only once every unit the granularity asks for is filled", () => {
    const onValueChange = vi.fn();
    const harness = run({ onValueChange });

    type(harness, "month", [4]);
    expect(onValueChange).toHaveBeenLastCalledWith({ value: null });

    type(harness, "day", [9]);
    type(harness, "year", [2, 0, 2, 6]);

    expect(onValueChange).toHaveBeenLastCalledWith({ value: { year: 2026, month: 4, day: 9 } });
    expect(harness.api().valueAsString).toBe("2026-04-09");
  });

  it("empties a segment back to its placeholder", () => {
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 } });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "month" });
    harness.service.send({ type: "SEGMENT.CLEAR", segment: "month" });

    const month = harness.api().segments.find((segment) => segment.type === "month");
    expect(month?.isPlaceholder).toBe(true);
    expect(month?.text).toBe("--");
    expect(harness.api().value).toBeNull();
    expect(harness.api().valueAsString).toBe("");
  });

  /**
   * The half of the rule above that was missing: typing is not range-checked, and
   * it is not *announced* as out of range either while a unit is half typed. Every
   * prefix of 2026 is a year below a 2026 minimum, so the first three digits each
   * flipped the field to invalid — and since `aria-invalid` reaches the segment a
   * reader heard "invalid" on three keystrokes out of four, on the way to a
   * perfectly valid date.
   */
  it("stays silent about the range until the unit being typed is finished", () => {
    const harness = run({ min: { year: 2026, month: 1, day: 1 } });
    type(harness, "month", [4]);
    type(harness, "day", [9]);
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "year" });

    const seen: boolean[] = [];
    for (const digit of [2, 0, 2, 6]) {
      harness.service.send({ type: "SEGMENT.INPUT", segment: "year", digit });
      seen.push(harness.api().outOfRange);
    }

    expect(seen).toEqual([false, false, false, false]);
  });

  it("types a date the range refuses, and says so rather than swallowing the keystroke", () => {
    // Typing is never range-checked: with the year typed last, every prefix of
    // 2026 is out of range, and a field that refused them could not be filled in
    // at all. `input[type=date]` reports the same thing through `:out-of-range`.
    const harness = run({ min: { year: 2026, month: 1, day: 1 } });
    type(harness, "month", [4]);
    type(harness, "day", [9]);
    type(harness, "year", [2, 0, 2, 5]);

    expect(harness.api().value).toEqual({ year: 2025, month: 4, day: 9 });
    expect(harness.api().outOfRange).toBe(true);
    expect(harness.api().getControlProps()["aria-invalid"]).toBe("true");
    // And on the segment, not only on the group. The group is a `div` nothing
    // ever focuses; the segment is the `role="spinbutton"` the user is standing
    // on, so a field asserted only on the group was asserting the one place a
    // reader never visits.
    const year = harness.api().segments.find((segment) => segment.type === "year");
    expect(year && harness.api().getSegmentProps(year)["aria-invalid"]).toBe("true");
    expect(harness.api().getRootProps()["data-out-of-range"]).toBe("");
  });
});

describe("date-field stepping", () => {
  const stepped = (props: DateFieldMachineProps, segment: DateSegmentType, large = false) => {
    const harness = run(props);
    harness.service.send({ type: "SEGMENT.INCREMENT", segment, large });
    return harness.service.context.get("parts");
  };

  it("wraps inside the unit rather than carrying into the next", () => {
    expect(stepped({ defaultValue: { year: 2026, month: 12, day: 9 } }, "month").month).toBe(1);
    expect(stepped({ defaultValue: { year: 2026, month: 12, day: 31 } }, "day").day).toBe(1);
  });

  it("takes the day with a month that cannot hold it", () => {
    const harness = run({ defaultValue: { year: 2026, month: 1, day: 31 } });
    harness.service.send({ type: "SEGMENT.INCREMENT", segment: "month", large: false });

    expect(harness.api().value).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("steps by ten on the large step", () => {
    expect(stepped({ defaultValue: { year: 2026, month: 4, day: 9 } }, "day", true).day).toBe(19);
  });

  it("starts an empty segment on the placeholder rather than wrapping in from nowhere", () => {
    const harness = run({ placeholder: { year: 2030, month: 7, day: 4 } });
    harness.service.send({ type: "SEGMENT.INCREMENT", segment: "month", large: false });

    expect(harness.service.context.get("parts").month).toBe(7);
  });

  it("reads the bounds after the whole date is recomposed, not unit by unit", () => {
    const harness = run({
      defaultValue: { year: 2026, month: 4, day: 30 },
      max: { year: 2026, month: 5, day: 1 },
    });

    // A month a segment would happily take, and a date the field may not hold.
    harness.service.send({ type: "SEGMENT.INCREMENT", segment: "month", large: false });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 30 });

    harness.service.send({ type: "SEGMENT.DECREMENT", segment: "day", large: false });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 29 });
  });

  it("steps the segment a stepper points at, which is the focused one", () => {
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 } });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "year" });
    harness.service.send({ type: "TRIGGER.INCREMENT" });

    expect(harness.api().value).toEqual({ year: 2027, month: 4, day: 9 });
  });

  it("refuses to move at all while read-only", () => {
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, readOnly: true });
    harness.service.send({ type: "SEGMENT.INCREMENT", segment: "day", large: false });

    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 9 });
  });
});

describe("date-field granularity", () => {
  it("grows a clock without a second machine behind it", () => {
    const segments = build({ granularity: "minute", locale: "en-US" }).api().segments;

    expect(shape(segments)).toContain("hour:minute");
    expect(segments.some((segment) => segment.type === "dayPeriod")).toBe(true);
  });

  it("drops the day period on a 24-hour clock", () => {
    const segments = build({ granularity: "minute", hourCycle: "h23" }).api().segments;

    expect(segments.some((segment) => segment.type === "dayPeriod")).toBe(false);
  });

  it("holds one hour and reads the pair out of it", () => {
    const harness = run({
      granularity: "minute",
      hourCycle: "h12",
      defaultValue: { year: 2026, month: 4, day: 9, hour: 13, minute: 5 },
    });
    const segment = (type: DateSegmentType) =>
      harness.api().segments.find((entry) => entry.type === type);

    expect(segment("hour")?.value).toBe(1);
    expect(segment("dayPeriod")?.value).toBe(1);

    harness.service.send({ type: "SEGMENT.DECREMENT", segment: "dayPeriod", large: false });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 9, hour: 1, minute: 5 });
  });

  it("truncates the value towards the coarser granularity, and keeps what it typed", () => {
    const harness = run({
      granularity: "minute",
      defaultValue: { year: 2026, month: 4, day: 9, hour: 13, minute: 5 },
    });
    expect(harness.api().valueAsString).toBe("2026-04-09T13:05");

    harness.setProps({ granularity: "day" });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 9 });
    expect(harness.api().valueAsString).toBe("2026-04-09");

    // Back again, and the time is still there: the parts are the state, and a
    // granularity only decides how much of them a value carries.
    harness.setProps({ granularity: "minute" });
    expect(harness.api().valueAsString).toBe("2026-04-09T13:05");
  });

  /**
   * The other half of the truncation rule: a
   * granularity that *grows* asks for units the field never had, and the answer
   * is the declared placeholder. The clause was written and never implemented,
   * and the test that stood here asserted the divergence — it passed no
   * `placeholder` at all, so it only ever exercised the branch a no-op happens
   * to satisfy.
   */
  it("fills the clock a finer granularity asks for from the placeholder, and invents none without one", () => {
    const declared = run({
      defaultValue: { year: 2026, month: 4, day: 9 },
      placeholder: { year: 2030, month: 7, day: 4, hour: 8, minute: 30 },
    });
    declared.setProps({ granularity: "minute" });

    expect(declared.api().value).toEqual({
      year: 2026,
      month: 4,
      day: 9,
      hour: 8,
      minute: 30,
    });
    // The date is the one that was there: a placeholder fills what is missing and
    // never overwrites what the user typed.
    expect(declared.api().valueAsString).toBe("2026-04-09T08:30");

    // And with no placeholder declared, the new units stay dashes. Reading the
    // clock here would submit a time nobody chose, and put a server's hour into
    // markup the client would then disagree with.
    const bare = run({ defaultValue: { year: 2026, month: 4, day: 9 } });
    bare.setProps({ granularity: "minute" });

    const hour = bare.api().segments.find((segment) => segment.type === "hour");
    expect(hour?.isPlaceholder).toBe(true);
    expect(bare.api().value).toBeNull();
  });

  it("asks the placeholder for no more than the granularity wants", () => {
    const harness = run({
      defaultValue: { year: 2026, month: 4, day: 9 },
      placeholder: { year: 2030, month: 7, day: 4, hour: 8, minute: 30, second: 45 },
    });
    harness.setProps({ granularity: "hour" });

    // An hour field has no minute to fill, and writing one anyway would have it
    // surface untouched the day the granularity grew again.
    expect(harness.service.context.get("parts")).toMatchObject({ hour: 8, minute: null });
  });
});

describe("date-field at a narrow viewport", () => {
  const strip = (props: DateFieldMachineProps): string => text(build(props).api().segments);

  /**
   * §4.6 asks for 320px, and the pixel measurement belongs to the sheet — but
   * what makes *one* measurement enough is decided here: every unfilled unit
   * draws as many dashes as its number has digits, so the field is exactly as
   * wide before it is typed into as after, in every configuration it offers. A
   * sheet measured on a filled field would otherwise say nothing about an empty
   * one.
   *
   * The lengths are compared to each other and never to a constant: ICU moves
   * its own separators between engines and between versions, and pinning a
   * number here would be pinning the runtime.
   */
  it("never changes width between empty and filled, whatever the granularity asks for", () => {
    const filled = { year: 2026, month: 4, day: 9, hour: 7, minute: 5, second: 3 };

    for (const granularity of ["day", "hour", "minute", "second"] as const) {
      for (const hourCycle of ["h12", "h23"] as const) {
        expect(strip({ granularity, hourCycle }).length).toBe(
          strip({ granularity, hourCycle, defaultValue: filled }).length,
        );
      }
    }
  });

  it("is at its widest counting seconds on a twelve-hour clock", () => {
    // Which shape the sheet has to be measured in: the day period is two glyphs
    // and a space no 24-hour field ever draws.
    const widest = strip({ granularity: "second", hourCycle: "h12" }).length;

    expect(widest).toBeGreaterThan(strip({ granularity: "second", hourCycle: "h23" }).length);
    expect(widest).toBeGreaterThan(strip({ granularity: "minute", hourCycle: "h12" }).length);
    expect(strip({ granularity: "day" }).length).toBeLessThan(widest);
  });
});

describe("date-field form association", () => {
  it("submits through a hidden input rather than a second date control in the a11y tree", () => {
    const input = build({
      defaultValue: { year: 2026, month: 4, day: 9 },
      name: "born",
      form: "profile",
    })
      .api()
      .getHiddenInputProps();

    expect(input.type).toBe("hidden");
    expect(input.name).toBe("born");
    expect(input.form).toBe("profile");
    expect(input.value).toBe("2026-04-09");
  });

  it("writes the time into the submitted value past a day", () => {
    expect(
      build({
        granularity: "second",
        defaultValue: { year: 2026, month: 4, day: 9, hour: 7, minute: 5, second: 3 },
      }).api().valueAsString,
    ).toBe("2026-04-09T07:05:03");
  });

  it("keeps a disabled field out of the submission, the way HTML does", () => {
    expect(build({ disabled: true }).api().getHiddenInputProps().disabled).toBe(true);
  });

  it("puts the field back where it started on a form reset", () => {
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 } });
    harness.service.send({ type: "SEGMENT.INCREMENT", segment: "day", large: false });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 10 });

    harness.service.send({ type: "FORM.RESET" });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 9 });
  });
});

describe("date-field on a pad", () => {
  it("takes hold on A, adjusts on the pad, and gives the value back on B", () => {
    const intents = createIntentBus();
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, intents });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "day" });

    intents.dispatch({ intent: "select", source: "gamepad" });
    expect(harness.service.state.get()).toBe("engaged");
    expect(harness.api().getRootProps()["data-engaged"]).toBe("");

    intents.dispatch({ intent: "moveUp", source: "gamepad" });
    intents.dispatch({ intent: "pageUp", source: "gamepad" });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 20 });

    intents.dispatch({ intent: "back", source: "gamepad" });
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 9 });
    expect(harness.service.state.get()).toBe("focused");
  });

  it("keeps what A committed", () => {
    const intents = createIntentBus();
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, intents });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "day" });

    intents.dispatch({ intent: "select", source: "gamepad" });
    intents.dispatch({ intent: "moveUp", source: "gamepad" });
    intents.dispatch({ intent: "select", source: "gamepad" });

    expect(harness.service.state.get()).toBe("focused");
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 10 });
  });

  it("never takes hold from a keyboard: Enter in a field belongs to the form", () => {
    const intents = createIntentBus();
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, intents });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "day" });

    intents.dispatch({ intent: "select", source: "keyboard" });
    expect(harness.service.state.get()).toBe("focused");
  });

  it("answers no pad at all when the consumer says so", () => {
    const intents = createIntentBus();
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, intents: null });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "day" });

    intents.dispatch({ intent: "select", source: "gamepad" });
    expect(harness.service.state.get()).toBe("focused");
  });

  /**
   * The second half of the `movingFocus` rule, which every pad test above leaves
   * unexercised because they all let go through `ENGAGE.END`. A blur the machine
   * did not order is the user leaving — tabbing out, clicking elsewhere, the
   * window losing focus — and the hold ends with it, without putting the value
   * back: a departure is not a `back`.
   */
  it("ends the hold on a real departure, and keeps what the pad did", () => {
    const intents = createIntentBus();
    const harness = run({ defaultValue: { year: 2026, month: 4, day: 9 }, intents });
    harness.service.send({ type: "SEGMENT.FOCUS", segment: "day" });

    intents.dispatch({ intent: "select", source: "gamepad" });
    intents.dispatch({ intent: "moveUp", source: "gamepad" });
    expect(harness.service.state.get()).toBe("engaged");
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 10 });

    harness.service.send({ type: "SEGMENT.BLUR" });

    expect(harness.service.state.get()).toBe("idle");
    expect(harness.api().focusedSegment).toBeNull();
    expect(harness.api().value).toEqual({ year: 2026, month: 4, day: 10 });
  });
});
