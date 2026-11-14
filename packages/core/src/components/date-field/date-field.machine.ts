/**
 * A date typed unit by unit: one `role="spinbutton"` per year, month and day, plus
 * — past `granularity: "day"` — an hour, a minute, a second and a day period.
 * `time-field` is this machine at a finer granularity and not a second component
 * behind it, which is CDC D10 in the small: the same reading that made
 * `password-input` a presentation of `input`.
 *
 * **One piece of state, and it is not the value.** `parts` holds a number per unit
 * or `null`, because a half-typed date is a state a user can really be in and a
 * `DateValue` is not — there is no `{ year: 2026, month: null }`. The value is
 * *composed* from the parts and reported only once every unit the granularity asks
 * for is filled, so the bindable carrying the controlled/uncontrolled contract is
 * the parts record itself and there is nothing to keep in step with anything.
 *
 * **Three states, and each one owns an effect to unmount.** `focused` holds the
 * scope A is claimed on and `engaged` holds the one that turns a direction into an
 * adjustment (CDC §4.4). The spec asked for two; a field inside a dialog is what
 * settled it, because the scope has to be pushed when focus lands rather than at
 * mount — mount is too early, and the surface's own scope would sit above it.
 *
 * **The type-ahead buffer keeps no timer.** A digit records when it landed and the
 * next one asks how long ago that was. A `setTimeout` here would be an effect per
 * keystroke and a cleanup to get wrong, for a deadline nothing rendered can see.
 *
 * **`min`/`max` bound the arrows, never the digits.** A range check on typing
 * would refuse the keystroke that completes a date from the wrong end — type the
 * year last under `min: 2026-01-01` and 2 is out of range before 2026 exists. A
 * complete value outside the range is reported instead, on `isOutOfRange`, which
 * is what `input[type=date]` does with `:out-of-range`.
 */

import { focusElement, getInputModality, pushEngageScope, trackInputModality } from "@standarx/nav";
import { addDomEvent } from "../../dom/event";
import { resolveDir } from "../../dom/text-dir";
import { getNextIndex, type RovingAction } from "../../focus/roving-focus";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import type { InputModality } from "../../types";
import { getToday } from "../../utils/date-format";
import { getControlEl, getHiddenInputEl, getSegmentEl } from "./date-field.dom";
import {
  adjustSegment,
  buildSegments,
  composeDateValue,
  EMPTY_SEGMENT_VALUES,
  editableSegments,
  isWithinRange,
  type SegmentContext,
  segmentValuesEqual,
  TYPE_BUFFER_MS,
  toSegmentValues,
  typeDigit,
  withoutSegment,
} from "./date-field.segments";
import type {
  DateFieldSchema,
  DateFieldValue,
  DateSegmentType,
  DateSegmentValues,
} from "./date-field.types";

type Params = MachineParams<DateFieldSchema>;

/** PageUp/PageDown, the spinbutton's large step. */
const LARGE_STEP = 10;

function layout(params: Params): SegmentContext {
  return {
    locale: params.prop("locale"),
    granularity: params.prop("granularity"),
    hourCycle: params.prop("hourCycle"),
  };
}

/**
 * Where an arrow starts from on an empty segment, and the one place a clock is
 * read. It is called from `adjustSegment` alone — never from a computed value —
 * so a server that has a different day than the client cannot put its own date
 * into an attribute the client then has to disagree with.
 */
function placeholderOf(params: Params): DateFieldValue {
  const declared = params.prop("placeholder");
  if (declared !== undefined) return declared;
  let today = params.refs.get("today");
  if (today === null) {
    today = getToday();
    params.refs.set("today", today);
  }
  return today;
}

function order(params: Params): DateSegmentType[] {
  return editableSegments(params.computed("segments"));
}

/**
 * Moves the real focus, and it has to come last in any action list: focusing an
 * element fires `focus` synchronously, the segment answers with `SEGMENT.FOCUS`,
 * and that re-entrant delivery replaces the event the actions still to run are
 * reading — the ordering `slider`'s `focusThumb` pays for too.
 */
function focusSegment(params: Params, segment: DateSegmentType): void {
  params.context.set("focusedSegment", segment);
  params.context.set("typeBuffer", "");
  // The blur this fires is not the user leaving: it is the machine walking to the
  // next unit, and an engaged field that treated it as a departure would drop the
  // hold every time a d-pad moved sideways.
  params.refs.set("movingFocus", true);
  focusElement(getSegmentEl(params.scope, segment));
  params.refs.set("movingFocus", false);
}

/** The next segment along, or nothing when the field ends there. Tab is what leaves. */
function neighbour(
  types: readonly DateSegmentType[],
  from: DateSegmentType,
): DateSegmentType | null {
  const index = types.indexOf(from);
  if (index < 0) return null;
  return types[index + 1] ?? null;
}

function adjustBy(params: Params, segment: DateSegmentType, delta: number): void {
  const { context, prop } = params;
  const next = adjustSegment(
    context.get("parts"),
    segment,
    delta,
    prop("hourCycle"),
    placeholderOf(params),
  );
  // The bounds are read after the whole date is recomposed, not unit by unit:
  // stepping a month is legal or not because of the date it lands on.
  if (!isWithinRange(composeDateValue(next, prop("granularity")), prop("min"), prop("max"))) return;
  context.set("parts", next);
}

/** The segment an `aria-hidden` stepper acts on: the focused one, or the first. */
function targetSegment(params: Params): DateSegmentType | null {
  return params.context.get("focusedSegment") ?? order(params)[0] ?? null;
}

/**
 * `moveLeft`/`moveRight` are physical — a d-pad has no writing direction — so the
 * mirror happens here, once, exactly where `getRovingKeyAction` does it for the
 * keyboard.
 */
function toRovingAction(
  intent: "moveLeft" | "moveRight" | "home" | "end",
  params: Params,
): RovingAction {
  if (intent === "home") return "first";
  if (intent === "end") return "last";
  const rtl = resolveDir(params.prop("dir"), getControlEl(params.scope)) === "rtl";
  return (intent === "moveRight") === rtl ? "prev" : "next";
}

export const machine: Machine<DateFieldSchema> = createMachine<DateFieldSchema>({
  props({ props }) {
    return {
      granularity: "day",
      hourCycle: "h12",
      // Pinned, for the same reason `slider` and `progress` pin theirs — and with
      // more at stake: this one decides the *order* of the children, so a locale
      // read from the browser would have the server and the client render
      // different markup, not merely a different string.
      locale: "en-US",
      disabled: false,
      invalid: false,
      readOnly: false,
      required: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      parts: bindable<DateSegmentValues>(() => ({
        defaultValue: toSegmentValues(prop("defaultValue")),
        // Passed through rather than normalised on every read: a controlled value
        // belongs to the consumer, and the segments clamp what they draw.
        value: prop("value") === undefined ? undefined : toSegmentValues(prop("value")),
        // Without this, every write of a fresh record — which is every write —
        // would report a change and re-render, forever.
        isEqual: segmentValuesEqual,
        onChange: (parts) =>
          prop("onValueChange")?.({ value: composeDateValue(parts, prop("granularity")) }),
        debugLabel: "date-field value",
      })),
      focusedSegment: bindable<DateSegmentType | null>(() => ({ defaultValue: null })),
      typeBuffer: bindable<string>(() => ({ defaultValue: "" })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    value: ({ context, prop }) => composeDateValue(context.get("parts"), prop("granularity")),
    segments: (params) => buildSegments(params.context.get("parts"), layout(params)),
    isEditable: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    /**
     * Never while a unit is half typed. Typing is not range-checked — every prefix
     * of 2026 is a year outside a 2026 minimum, and a field that refused them
     * could not be filled in at all — but *announcing* it is another matter: the
     * first three digits of a four-digit year each flipped the field to invalid,
     * and since `aria-invalid` reached the segment (2026-09-06) a reader heard it
     * on every keystroke. A non-empty `typeBuffer` is exactly "this unit is not
     * finished", so the range is asked once it is.
     */
    isOutOfRange: ({ context, prop }) =>
      context.get("typeBuffer") === "" &&
      !isWithinRange(
        composeDateValue(context.get("parts"), prop("granularity")),
        prop("min"),
        prop("max"),
      ),
  },

  refs() {
    return { entryParts: null, lastDigitAt: 0, movingFocus: false, today: null };
  },

  // Pure: no DOM, no clock, no environment. The server renders what the client
  // hydrates, down to the order of the segments.
  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackFormReset"],

  watch({ prop, track, action }) {
    // Only a granularity that *grew* has anything to do here, and the action
    // answers for that: the other direction needs nothing, because the value is
    // composed from the parts and a coarser granularity simply stops asking for
    // the ones it does not want (`composeDateValue`).
    track(
      () => [prop("granularity")],
      () => action(["fillFromPlaceholder"]),
    );
  },

  on: {
    "VALUE.SET": { guard: "isEditable", actions: ["setValue"] },
    "VALUE.CLEAR": { guard: "isEditable", actions: ["clearValue"] },
    "SEGMENT.FOCUS": { target: "focused", actions: ["setFocusedSegment", "captureFocusSource"] },
    "SEGMENT.BLUR": { target: "idle", actions: ["clearFocusedSegment", "clearFocusSource"] },
    "SEGMENT.MOVE": { actions: ["moveSegment"] },
    "SEGMENT.INPUT": { guard: "isEditable", actions: ["appendDigit"] },
    "SEGMENT.INCREMENT": { guard: "isEditable", actions: ["adjustSegment"] },
    "SEGMENT.DECREMENT": { guard: "isEditable", actions: ["adjustSegment"] },
    "SEGMENT.CLEAR": { guard: "isEditable", actions: ["clearSegment"] },
    "TRIGGER.INCREMENT": { guard: "isEditable", actions: ["adjustFocusedSegment"] },
    "TRIGGER.DECREMENT": { guard: "isEditable", actions: ["adjustFocusedSegment"] },
    "FORM.RESET": { actions: ["restoreInitialValue"] },
  },

  states: {
    idle: {},

    /**
     * The scope A pushes lives here and not at machine level, and the reason is
     * the stack: a field inside a dialog mounts before the dialog's own effects
     * install, so a scope pushed at mount would sit *under* the surface's and
     * never see the button. Pushed when focus lands, it is on top of whatever
     * opened around it — the arrangement `slider.focused` already pays for.
     */
    focused: {
      effects: ["captureSelectIntent"],
      on: { "ENGAGE.START": { guard: "canEngage", target: "engaged" } },
    },

    /**
     * The snapshot is taken on entry and read on the way out, and deliberately not
     * cleared on exit: the interpreter runs a state's exit actions before the
     * transition's own, so an exit that cleared it would erase the value B is
     * there to restore. Entry overwrites it, which is the same guarantee one step
     * later — the arrangement `slider.engaged` already carries.
     */
    engaged: {
      entry: ["snapshotParts"],
      effects: ["captureEngageIntents"],
      on: {
        "ENGAGE.END": [
          {
            guard: ({ event }) => event.type === "ENGAGE.END" && event.committed,
            target: "focused",
            actions: ["clearSnapshot"],
          },
          { target: "focused", actions: ["restoreParts"] },
        ],
        // A blur the machine ordered itself is a step sideways, not a departure;
        // any other one is the user leaving, and the hold ends with it — the
        // effect's own dispose pops the scope without reporting a release, which
        // is what unmounting means as opposed to letting go.
        "SEGMENT.BLUR": [
          { guard: "isMovingFocus" },
          { target: "idle", actions: ["clearFocusedSegment", "clearFocusSource"] },
        ],
        "SEGMENT.FOCUS": { actions: ["setFocusedSegment"] },
      },
    },
  },

  implementations: {
    guards: {
      isEditable: ({ prop }) => !prop("disabled") && !prop("readOnly"),
      canEngage: ({ prop, context }) =>
        !prop("disabled") &&
        !prop("readOnly") &&
        prop("intents") !== null &&
        context.get("focusedSegment") !== null,
      isMovingFocus: ({ refs }) => refs.get("movingFocus"),
    },

    actions: {
      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("parts", toSegmentValues(event.value));
      },

      clearValue({ context }) {
        context.set("parts", EMPTY_SEGMENT_VALUES);
        context.set("typeBuffer", "");
      },

      setFocusedSegment({ context, event }) {
        if (event.type !== "SEGMENT.FOCUS") return;
        context.set("focusedSegment", event.segment);
        context.set("typeBuffer", "");
      },

      clearFocusedSegment({ context }) {
        context.set("focusedSegment", null);
        context.set("typeBuffer", "");
      },

      moveSegment(params) {
        const { event, context } = params;
        if (event.type !== "SEGMENT.MOVE") return;
        const types = order(params);
        if (types.length === 0) return;
        const current = context.get("focusedSegment");
        const index = current === null ? -1 : types.indexOf(current);
        // No wrap: a segmented field ends where it ends, and Tab is what leaves
        // it — an arrow that looped would take the year back to the month and
        // never reach whatever comes after the control.
        const next = types[getNextIndex(index, event.action, { count: types.length, loop: false })];
        if (next !== undefined) focusSegment(params, next);
      },

      adjustSegment(params) {
        const { event } = params;
        if (event.type !== "SEGMENT.INCREMENT" && event.type !== "SEGMENT.DECREMENT") return;
        const magnitude = event.large ? LARGE_STEP : 1;
        adjustBy(
          params,
          event.segment,
          event.type === "SEGMENT.INCREMENT" ? magnitude : -magnitude,
        );
      },

      adjustFocusedSegment(params) {
        const { event } = params;
        if (event.type !== "TRIGGER.INCREMENT" && event.type !== "TRIGGER.DECREMENT") return;
        const segment = targetSegment(params);
        if (segment === null) return;
        adjustBy(params, segment, event.type === "TRIGGER.INCREMENT" ? 1 : -1);
      },

      /**
       * The two-digit buffer and the auto-advance it owes. `12` in a month fills
       * it and moves on, because no third digit could fit; `1` then `3` keeps
       * January and opens the next segment with the 3, because 13 is not a month
       * and swallowing the keystroke would leave a user typing into a segment
       * that will never take it.
       */
      appendDigit(params) {
        const { context, prop, refs, event } = params;
        if (event.type !== "SEGMENT.INPUT") return;
        const now = Date.now();
        const stale = now - refs.get("lastDigitAt") > TYPE_BUFFER_MS;
        const buffer =
          stale || context.get("focusedSegment") !== event.segment ? "" : context.get("typeBuffer");
        const parts = context.get("parts");
        const hourCycle = prop("hourCycle");

        const typed = typeDigit(parts, event.segment, event.digit, buffer, hourCycle);
        if (typed !== null) {
          refs.set("lastDigitAt", now);
          context.set("parts", typed.parts);
          // Emptied the moment the unit is complete, and not only when there is a
          // next segment to move to: the buffer is what says "a unit is half
          // typed", and the last segment of the order had no way of ever saying it
          // was finished. `isOutOfRange` reads it — see the computed.
          context.set("typeBuffer", typed.complete ? "" : typed.buffer);
          if (!typed.complete) return;
          const after = neighbour(order(params), event.segment);
          if (after !== null) focusSegment(params, after);
          return;
        }

        const next = neighbour(order(params), event.segment);
        if (next === null) return;
        const restarted = typeDigit(parts, next, event.digit, "", hourCycle);
        if (restarted === null) return;
        refs.set("lastDigitAt", now);
        context.set("parts", restarted.parts);
        const after = restarted.complete ? neighbour(order(params), next) : null;
        focusSegment(params, after ?? next);
        if (after === null) context.set("typeBuffer", restarted.buffer);
      },

      clearSegment(params) {
        const { context, event } = params;
        if (event.type !== "SEGMENT.CLEAR") return;
        context.set("parts", withoutSegment(context.get("parts"), event.segment));
        context.set("typeBuffer", "");
      },

      captureFocusSource({ context, scope }) {
        // A segment can be focused without a document in reach — a machine test
        // sends the event, and `getDoc` throws rather than invent one.
        if (scope.getRootNode() === null) return;
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      /**
       * A granularity switched up mid-session asks for units the field never
       * had, and the declared placeholder is where they come from — never the
       * clock `placeholderOf` falls back to. Filling from today would put a time
       * nobody chose into a form, and a server's hour into markup a client would
       * disagree with; with no `placeholder` prop the new segments stay dashes,
       * which is the spec's own second clause.
       *
       * Nothing above the granularity is written either: a `second` copied into
       * an `hour` field would sit there unseen and surface the day the field
       * grew again, which is inventing a value one step late.
       */
      fillFromPlaceholder({ context, prop }) {
        const from = prop("placeholder");
        const granularity = prop("granularity");
        if (from === undefined || granularity === "day") return;
        const parts = context.get("parts");
        context.set("parts", {
          ...parts,
          hour: parts.hour ?? from.hour ?? null,
          minute: granularity === "hour" ? parts.minute : (parts.minute ?? from.minute ?? null),
          second: granularity === "second" ? (parts.second ?? from.second ?? null) : parts.second,
        });
      },

      snapshotParts({ context, refs }) {
        refs.set("entryParts", context.get("parts"));
      },

      restoreParts({ context, refs }) {
        const entry = refs.get("entryParts");
        if (entry !== null) context.set("parts", entry);
      },

      clearSnapshot({ refs }) {
        refs.set("entryParts", null);
      },

      restoreInitialValue({ context }) {
        context.set("parts", context.initial("parts"));
        context.set("typeBuffer", "");
      },
    },

    effects: {
      // No listener of its own: the source is read once, when focus lands. Holding
      // the handle is the whole job — the tracker has to be running before the
      // first Tab.
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      /**
       * A `type="hidden"` input carries no default the browser will restore — the
       * adapter owns its value — so the form's own `reset` is what puts the field
       * back where it started. In capture, so a listener that cancels the reset
       * further down cannot silently take the field out of it.
       */
      trackFormReset({ scope, send }) {
        return addDomEvent(
          getHiddenInputEl(scope)?.form,
          "reset",
          () => send({ type: "FORM.RESET" }),
          { capture: true },
        );
      },

      /**
       * A is how a pad takes hold, claimed while a segment is focused and nowhere
       * else, so the scope is on the stack for exactly as long as the grab is
       * possible. Never from a keyboard: Enter in a field belongs to the form
       * around it, and a keyboard engage would hand Escape the power to rewind a
       * date the user had settled on.
       */
      captureSelectIntent({ prop, context, send }) {
        const host = prop("intents");
        if (host === null) return;
        return host.pushScope((event) => {
          if (event.intent !== "select" || event.source === "keyboard") return false;
          if (prop("disabled") || prop("readOnly")) return false;
          if (context.get("focusedSegment") === null) return false;
          send({ type: "ENGAGE.START" });
          return true;
        });
      },

      /**
       * The pad's hold on the value: up and down adjust, left and right walk the
       * segments, A commits and B puts back the value the hold started on.
       * `pushEngageScope` consumes `back`, so B releases the segment instead of
       * popping the layer underneath — a date field inside a popover must not
       * close the popover on the way out.
       */
      captureEngageIntents(params) {
        const { prop, context, send } = params;
        const host = prop("intents");
        if (host === null) return;
        return pushEngageScope(host, {
          onAdjust: (intent) => {
            const segment = context.get("focusedSegment");
            if (segment === null) return;
            if (intent === "moveUp" || intent === "pageUp") {
              send({ type: "SEGMENT.INCREMENT", segment, large: intent === "pageUp" });
              return;
            }
            if (intent === "moveDown" || intent === "pageDown") {
              send({ type: "SEGMENT.DECREMENT", segment, large: intent === "pageDown" });
              return;
            }
            send({ type: "SEGMENT.MOVE", action: toRovingAction(intent, params) });
          },
          onRelease: (committed) => send({ type: "ENGAGE.END", committed }),
        });
      },
    },
  },
});
