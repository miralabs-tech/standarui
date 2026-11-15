/**
 * Native `<input type="radio">`, one shared name, and the browser does the
 * arrows.
 *
 * This is the divergence worth naming: Zag and Ark build radio groups out of
 * buttons and re-implement arrow-to-select, wrapping and the skipping of
 * disabled items. A real radio group already has all of that, plus form
 * submission, autofill and `:required` validation. The machine's job here is
 * the value, the state attributes, the tab stop and where the indicator goes,
 * and that is all.
 *
 * **The indicator is measured, never derived from an index** — `tabs`' rule, and
 * for a sharper reason. A vertical radio track has no equaliser that would make
 * an index *be* a position. Its rows are sized by their own contents,
 * they are separated by a `gap`, and the track also holds the label, the
 * indicator itself and any separator the consumer put between two options — so
 * `100% / itemCount` is the height of no row at all and the arithmetic put the
 * highlight beside the thing it points at. The geometry lives in
 * `utils/indicator-rect`, is pure, and is expressed logically so RTL needs no
 * second rule anywhere.
 *
 * The cost is that the name has to be shared and unique, so it is derived from
 * the scope id when the consumer does not supply one: two groups with the same
 * name would silently become one group.
 *
 * **The tab stop is the one exception, and it is a roving tabindex.** Any
 * re-render of a hidden input while the focus is inside the group runs
 * react-dom's `updateInput`, which blanks `name` and puts it back, and chromium
 * then counts every radio of a group with no value as its own stop. The group
 * re-renders on each focus and so may any consumer, so the stop is written:
 * the focused radio, else the checked one, else the first enabled one. It
 * follows the focus because the focus can land without checking — read-only
 * arrows, the pad through the spatial engine, a programmatic `focus()` — and a
 * stop left behind would make Tab and Shift+Tab land on it instead of leaving.
 * WebKit still skips a whole group whose checked radio is disabled, which no
 * tabindex corrects (R57).
 */

import { getItemValue, getNextItem } from "../../collection/dom-collection";
import { observeChildren, observeResize } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { getRovingIntentAction } from "../../focus/roving-focus";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement, getInputModality, trackInputModality } from "../../nav";
import type { InputModality } from "../../types";
import { getIndicatorMetrics } from "../../utils/indicator-rect";
import {
  getEnabledItemValues,
  getItemEl,
  getItemEls,
  getItemInputEl,
  getItemValues,
  getRootEl,
  hasLabel,
  ownsFocus,
} from "./radio-group.dom";
import type { RadioGroupSchema } from "./radio-group.types";

/**
 * Where the highlight belongs, read from layout against the root — which is the
 * indicator's own containing block, so the number the sheet consumes as an
 * `inset` and the number measured here cannot disagree. Pulled out of the
 * actions on purpose: every caller gets the same measurement, and none of them
 * is tempted to reach for `event` to decide what to do with it.
 */
function readIndicatorMetrics({
  context,
  prop,
  scope,
}: Pick<MachineParams<RadioGroupSchema>, "context" | "prop" | "scope">): {
  offset: number | null;
  size: number | null;
} {
  const root = getRootEl(scope);
  const value = context.get("value");
  const item = value === null ? null : getItemEl(scope, value);
  if (root === null || item === null) return { offset: null, size: null };

  // From the root, which is where the measured geometry lives: with no `dir`
  // prop the sign of the offset follows whatever the page resolved around the
  // group.
  const metrics = getIndicatorMetrics(
    root.getBoundingClientRect(),
    item.getBoundingClientRect(),
    root,
    { orientation: prop("orientation"), dir: resolveDir(prop("dir"), root) },
  );
  return { offset: metrics.offset, size: metrics.size };
}

export const machine: Machine<RadioGroupSchema> = createMachine<RadioGroupSchema>({
  props({ props }) {
    return {
      orientation: "vertical",
      disabled: false,
      readOnly: false,
      invalid: false,
      required: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<string | null>(() => ({
        defaultValue: prop("defaultValue") === undefined ? null : prop("defaultValue"),
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "radio-group value",
      })),
      indicatorOffset: bindable<number | null>(() => ({ defaultValue: null })),
      indicatorSize: bindable<number | null>(() => ({ defaultValue: null })),
      indicatorAnimated: bindable<boolean>(() => ({ defaultValue: false })),
      focusedValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
      enabledItems: bindable<readonly string[] | null>(() => ({
        defaultValue: null,
        isEqual: (a, b) =>
          a === b ||
          (a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i])),
      })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackItems", "trackIndicator", "captureIntents"],

  watch({ context, prop, scope, track, action }) {
    // Two tracks, because the halves mean opposite things to the highlight and
    // `event` cannot tell them apart: the service keeps the last *delivered*
    // event (`machine/service.ts:98`, written only in `deliver`), so an action
    // run from this watch reads whatever happened to arrive last — a click from
    // minutes ago, or the observer's own first delivery. Both were measured, and
    // they gave a controlled value change opposite behaviours. Hence the rule
    // this file now keeps: **no action reachable from here reads `event`.** The
    // tracks carry the meaning, the actions only ever read context and props.
    //
    // A choice is the one thing allowed to travel, and the value changing is the
    // only thing that is a choice — whether a click moved it or the consumer did.
    track(
      () => [context.get("value")],
      () => action(["syncItems", "armIndicator", "syncIndicator"]),
    );

    // Everything else is a layout, and a layout has to *be* where it belongs
    // rather than slide there. The separator is spelled out rather than typed:
    // the raw byte used to sit in this file, which made ripgrep call the whole
    // module binary and skip it — every grep in the repo was blind to it. It
    // stays U+0000 because that is the one character an attribute value cannot
    // carry, so two different item lists can never key the same.
    track(
      () => [prop("orientation"), prop("dir"), getItemValues(scope).join("\u0000")],
      () => action(["syncItems", "settleIndicator", "syncIndicator"]),
    );

    // An item disabled or re-enabled moves the tab stop and nothing else.
    track(
      () => [getEnabledItemValues(scope).join("\u0000")],
      () => action(["syncItems"]),
    );
  },

  on: {
    "ITEM.SELECT": { guard: "isInteractive", actions: ["setValue"] },
    "ITEM.FOCUS": { actions: ["setFocusedValue"] },
    "ITEM.BLUR": { actions: ["clearFocus"] },
    // A child mutation is never a choice, but it is not necessarily a move
    // either: `observeChildren` watches `subtree: true`, so a consumer's own
    // re-render of an option lands here having shifted nothing. Settling it
    // unconditionally cancelled travels in flight; judge it on the geometry,
    // exactly as the observer's own delivery is judged.
    "ITEMS.SYNC": { actions: ["syncItems", "remeasureIndicator"] },
    "INDICATOR.MEASURE": { actions: ["remeasureIndicator"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      setValue({ context, event }) {
        if (event.type !== "ITEM.SELECT") return;
        // The value and nothing else. Arming the travel here armed it for a
        // write the bindable is free to refuse: `api.setValue(current)` lowered
        // `data-immediate` without anything moving, and a controlled group never
        // armed at all, its writes being no-ops. The watch arms instead, on the
        // value that actually changed — from a click or from the consumer.
        context.set("value", event.value);
      },
      setFocusedValue({ context, event, scope }) {
        if (event.type !== "ITEM.FOCUS") return;
        context.set("focusedValue", event.value);
        // Read here and held: an arrow key moving between radios is a new focus,
        // so the source follows a keyboard user across the group, while a mouse
        // merely crossing the page never touches it.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocus({ context }) {
        context.set("focusedValue", null);
        context.set("focusSource", null);
      },
      syncItems({ context, scope }) {
        context.set("hasLabel", hasLabel(scope));
        context.set("enabledItems", getEnabledItemValues(scope));
      },

      /**
       * The choice half of the watch, run before the remeasure it belongs to.
       * Decided on the *context* rather than on the event: a highlight travels
       * only from somewhere it already was.
       *
       * Written both ways on purpose. A version that merely declined to arm left
       * the latch standing across the empty state — deselecting armed it, the
       * offset then went to `null`, and the next choice sailed past a guard that
       * only ever refused to raise. The pill slid up from `inset-block-start: 0`,
       * which is the one thing `data-immediate` exists to prevent.
       */
      armIndicator({ context }) {
        context.set("indicatorAnimated", context.get("indicatorOffset") !== null);
      },

      /**
       * The layout half of the watch, run before the remeasure it belongs to.
       * A track only fires when its dependencies actually changed, so reaching
       * here *is* the proof that the geometry moved for a reason that was not a
       * choice — no equality guard to add, and nothing to compare against.
       */
      settleIndicator({ context }) {
        context.set("indicatorAnimated", false);
      },

      /** Writes where the highlight goes, and decides nothing about how. */
      syncIndicator(params) {
        const { context } = params;
        const { offset, size } = readIndicatorMetrics(params);
        context.set("indicatorOffset", offset);
        context.set("indicatorSize", size);
      },

      /**
       * The observer's own path, and the only action wired to a single
       * transition — which is what lets it compare instead of consult. A
       * remeasure that finds the box where it already was is not an event:
       * `ResizeObserver` delivers the size it was armed with at the first
       * rendering opportunity, which lands after the first selection a person
       * can make and coalesces with any real resize in between. Lowering the
       * latch on that delivery cancelled the spring the choice had just armed,
       * and the highlight jumped to its destination instead of travelling to it.
       */
      remeasureIndicator(params) {
        const { context } = params;
        const { offset, size } = readIndicatorMetrics(params);

        if (offset !== context.get("indicatorOffset") || size !== context.get("indicatorSize")) {
          context.set("indicatorAnimated", false);
        }
        context.set("indicatorOffset", offset);
        context.set("indicatorSize", size);
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackItems({ scope, send }) {
        send({ type: "ITEMS.SYNC" });
        return observeChildren(getRootEl(scope), () => send({ type: "ITEMS.SYNC" }));
      },

      /**
       * The highlight must not play a spring because the window moved or a font
       * finished loading, which is why this event carries nothing for the latch
       * to read: `remeasureIndicator` settles on its own comparison.
       *
       * The root alone is observed, and `tabs` observes every trigger — the
       * difference is the box. A tab list can be a fixed-size scroller, so a tab
       * growing inside it changes nothing the list's own observer would see. A
       * vertical radio track grows with its rows, and the inline axis is covered
       * from the other side: `grid-auto-columns: 1fr` makes a row's width the
       * root's business rather than its own. Items appearing and disappearing
       * are already `trackItems`' business, and `ITEMS.SYNC` remeasures.
       */
      trackIndicator({ scope, send }) {
        let disposed = false;
        const measure = (): void => {
          if (!disposed) send({ type: "INDICATOR.MEASURE" });
        };

        const stop = observeResize(getRootEl(scope), measure);
        // A one-shot, and the flag is why the disposer sets one at all: the
        // promise outlives the effect, and a measurement after teardown is a
        // `send` into a stopped service.
        void scope.getDoc().fonts?.ready.then(measure);

        return () => {
          disposed = true;
          stop();
        };
      },

      /**
       * The d-pad, which is the one input this component does not get for free.
       * An arrow key is the browser's — it moves the focus and checks what it
       * landed on, in a single step the machine never sees — while a pad's
       * intent falls through to the spatial engine, which moves the real focus
       * and stops there. The group therefore claims the move itself, does both
       * halves, and the two inputs end up indistinguishable again.
       *
       * Never claimed from a keyboard: a consumed intent has its native default
       * suppressed (`@standarx/nav`, `input-system.ts`), so claiming the arrows would
       * `preventDefault` the very key that already does this correctly, and buy
       * a second implementation of wrapping, of the skipping of disabled radios
       * and of RTL in exchange for nothing. Answered `"native"` instead, which
       * ends the walk unclaimed (ADR-0026 of the module): in the engine's `app`
       * mode the arrows reach the engine too, and it would otherwise move the
       * focus without checking. Not while read-only — firefox checks and fires
       * `change` before React restores the old radio, where the engine moves
       * the focus and touches nothing.
       *
       * Neither `trapped` nor `base`, and declined rather than swallowed in
       * every case it does not serve, from a pad and from a keyboard alike: off
       * the group's own axis, at either end of it, while nothing inside holds
       * the focus, while the focus is inside but on none of the radios, and
       * while the group refuses changes. Each one is a move the spatial engine
       * underneath should carry out of the group — a pad or a remote has no
       * Tab to escape with, so a radio group that wrapped the way the native
       * arrows do would be a trap.
       *
       * `disabled` is the one guard here with no witness, and deliberately so:
       * a disabled group disables every one of its radios, so the focus leaves
       * on its way in and `focusedValue` is already `null`. It is kept because
       * that reasoning rests on a browser blurring a control it has just
       * disabled, which is behaviour rather than a guarantee.
       */
      captureIntents({ prop, context, scope, send }) {
        const host = prop("intents");
        if (host === null || host === undefined) return;

        return host.pushScope(
          (event) => {
            if (prop("disabled") || prop("readOnly") || !ownsFocus(scope)) return false;

            const action = getRovingIntentAction(event.intent, {
              orientation: prop("orientation"),
              dir: resolveDir(prop("dir"), getRootEl(scope)),
            });
            // `first` and `last` among them: Home and End do nothing to a native
            // radio group, and a pad that could reach an end the arrows cannot is
            // the same divergence read backwards.
            if (action !== "next" && action !== "prev") return false;

            // Declined when the focus is inside the group but on none of its
            // radios — a `renderOption` that put a link in a row, or a focus set
            // before the first `ITEM.FOCUS` landed. `getNextIndex` treats an
            // unknown origin as an entry and answers the first item, so claiming
            // here would check an option nobody navigated to, and steal the focus
            // to do it. Entering a group is the spatial engine's business, and
            // entering one never checks anything — that is what Tab does too.
            const current = context.get("focusedValue");
            if (current === null) return false;

            const target = getNextItem(getItemEls(scope), current, action, false);
            if (target === null) return false;
            const value = getItemValue(target);
            if (value === "" || value === current) return false;

            // The browser's arrow, left to the browser so the walk stops before
            // the engine — but only toward a radio, never at an end. A remote's
            // arrows arrive as these same keys and it has no Tab, while the
            // native group wraps on chromium and firefox: answering there would
            // check the first radio and keep the remote in. The end is the
            // engine's, which carries the focus out of the group.
            if (event.source === "keyboard") return "native";

            // The radio, not the row: a row whose hidden input the consumer
            // replaced away has nothing to focus, and selecting into it would
            // write a value no `<input>` carries while consuming the intent that
            // was the way out. `composed.tsx` names dropping the input as a
            // supported cost, so this is a configuration, not a defensive branch.
            const input = getItemInputEl(scope, value);
            if (input === null) return false;

            // The real focus first, as the arrows move it, and the choice after —
            // `ITEM.FOCUS` arrives from the radio's own focus handler on the way.
            // The scroll is aimed at the row rather than left to `focus()`: the
            // radio is a 1×1 clipped box at the row's start corner, so the native
            // scroll guarantees that corner and nothing else, and having consumed
            // the intent we know the spatial engine will not scroll for us.
            focusElement(input, { preventScroll: true });
            getItemEl(scope, value)?.scrollIntoView({ block: "nearest", inline: "nearest" });
            send({ type: "ITEM.SELECT", value });
            return true;
          },
          { within: () => getRootEl(scope) },
        );
      },
    },
  },
});
