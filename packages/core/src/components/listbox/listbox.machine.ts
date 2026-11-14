/**
 * A listbox is a collection with no surface, and every decision below follows from
 * that one fact.
 *
 * **One state.** There is nothing to open, nothing to dismiss, no presence and no
 * layer — so everything lives on the machine-level `on:` and the machine-level
 * effects, the shape `radio-group` and `tabs` already have.
 *
 * **The selection is `collection/selection`, not arithmetic written again here.**
 * That module was written for this component — its `toggle()` names the gamepad X
 * button on a listbox — and it holds the one rule a file list lives by: the anchor
 * survives a range extension, so extending twice from the same anchor *replaces*
 * the range instead of growing it.
 *
 * **A range never takes a disabled row.** Every `ordered` handed to `extend` and
 * `selectAll` is the enabled collection, which is what makes "no path selects a
 * disabled item" an invariant rather than a promise.
 *
 * **The selection is not pruned when the collection shrinks.** A value whose row
 * has been filtered out of the DOM stays selected: that is the contract a filtered
 * list needs (a search that hides a chosen row has not unchosen it), and it is why
 * `value` and the DOM order are two different questions here.
 */

import { focusElement, getInputModality, trackInputModality } from "@standarx/nav";
import { getItemValue, getNextItem, isItemDisabled } from "../../collection/dom-collection";
import {
  clearSelection as emptySelectionState,
  extend,
  type SelectionOptions,
  type SelectionState,
  select,
  selectAll,
  toggle,
} from "../../collection/selection";
import { observeChildren } from "../../dom/observers";
import { resolveDir } from "../../dom/text-dir";
import { getInitialIndex, getRemovalIndex, getRovingIntentAction } from "../../focus/roving-focus";
import { trackScrollEdges as trackEdges } from "../../interaction/scroll-edges";
import { createTypeaheadState, getByTypeahead } from "../../interaction/typeahead";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import type { InputModality } from "../../types";
import {
  getContentEl,
  getItemEl,
  getItemEls,
  getItemLabel,
  getItemValues,
  getPageSize,
  hasLabel,
  ownsFocus,
} from "./listbox.dom";
import type { ListboxSchema } from "./listbox.types";

type Params = MachineParams<ListboxSchema>;

/**
 * A watch key for a list of values. Length-prefixed rather than joined on a
 * separator: `["a b"]` and `["a", "b"]` are different collections, and every
 * separator is a character a consumer is allowed to put in a `data-value`. The
 * other machines in the repo key theirs on U+0000, which cannot be written here
 * without a raw NUL in the source — and a raw NUL makes ripgrep call the file
 * binary, which hid two machines from every grep in the repo once already.
 */
function collectionKey(values: readonly string[]): string {
  let key = "";
  for (const value of values) key += `${value.length}:${value}`;
  return key;
}

function selectionOptions(params: Params): SelectionOptions {
  return {
    mode: params.computed("multiple") ? "multiple" : "single",
    deselectable: params.prop("deselectable"),
  };
}

/**
 * The same options with `deselectable` off, for the two paths that must only ever
 * *add* a selection: an arrow key under `selectOnHighlight`, and the imperative
 * `api.select()`. Moving onto the selected row and having it clear itself is a
 * toggle, and neither of those is one.
 */
function followOptions(params: Params): SelectionOptions {
  return { mode: params.computed("multiple") ? "multiple" : "single", deselectable: false };
}

function selectionState(params: Params): SelectionState {
  return { value: params.context.get("value"), anchor: params.refs.get("anchor") };
}

/** The one place the selection is written, so the anchor can never be forgotten. */
function commitSelection(params: Params, next: SelectionState): void {
  params.context.set("value", next.value);
  params.refs.set("anchor", next.anchor);
}

/** What a range and a select-all are allowed to reach: the enabled rows, in DOM order. */
function orderedEnabled(params: Params): string[] {
  return getItemEls(params.scope)
    .filter((item) => !isItemDisabled(item))
    .map(getItemValue);
}

/** The one place `highlightedValue` is written, so the modality is never forgotten. */
function commitHighlight(params: Params, value: string | null): void {
  const { context, scope } = params;
  // Read at arrival and held: the modality of *now* flips to pointer after 300ms of
  // mouse movement whether or not the focus moved, and a ring that blinks out under
  // the user's hands was the result.
  if (scope.getRootNode() !== null) {
    context.set("focusSource", value === null ? null : getInputModality(scope.getDoc()));
  }
  context.set("highlightedValue", value);
}

/**
 * The focus is real, always: roving `tabindex` and a `.focus()` on the highlighted
 * row, never `aria-activedescendant` (règle dure).
 *
 * `preventScroll: false` is the deliberate half. The library focuses without
 * scrolling everywhere else because an overlay that jumps the page on open is a
 * bug — but a listbox *is* the page, its rows are reached by arrow, and a focused
 * option left outside its own scroller is WCAG 2.4.11. So the user agent's own
 * reveal runs, and the sheet's `scroll-margin-block` decides how much of the row's
 * surroundings come with it. No manual `scrollIntoView`, and therefore no second
 * opinion about smooth versus instant.
 */
function revealAndFocus(item: HTMLElement): void {
  focusElement(item, { preventScroll: false });
}

/**
 * Where every highlight move ends: the row takes the focus, and the selection
 * follows it or does not. `extend` wins over `followFocus` — a Shift move is a
 * range, and a range is not a sequence of single selections.
 */
function applyHighlightTarget(
  params: Params,
  target: HTMLElement,
  options: { extend: boolean; quiet: boolean },
): void {
  const value = getItemValue(target);
  commitHighlight(params, value);
  revealAndFocus(target);

  if (options.extend && params.computed("multiple")) {
    commitSelection(
      params,
      extend(selectionState(params), value, orderedEnabled(params), selectionOptions(params)),
    );
    return;
  }
  if (options.quiet || !params.computed("followFocus")) return;
  commitSelection(params, select(selectionState(params), value, followOptions(params)));
}

export const machine: Machine<ListboxSchema> = createMachine<ListboxSchema>({
  props({ props }) {
    return {
      orientation: "vertical",
      selectionMode: "single",
      deselectable: false,
      // A list does not wrap. The menu does, and says so — there the collection is
      // the whole surface, here it is a region of a page a person can walk out of.
      loopFocus: false,
      typeahead: true,
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<readonly string[]>(() => ({
        defaultValue: prop("defaultValue") ?? [],
        value: prop("value"),
        // Order is not meaning: a selection that reported a change because the same
        // values arrived in another order would loop against a consumer that
        // normalises them.
        isEqual: (a, b) => a.length === b.length && a.every((entry) => b.includes(entry)),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "listbox value",
      })),
      highlightedValue: bindable<string | null>(() => ({
        defaultValue: prop("defaultHighlightedValue") ?? null,
        value: prop("highlightedValue"),
        onChange: (value) => prop("onHighlightChange")?.({ value }),
        debugLabel: "listbox highlightedValue",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      // `-1` is "not measured yet", and it is not the same fact as "empty": a server
      // render that answered 0 would promise a tab stop and an empty state the
      // client takes back on its first sync.
      itemCount: bindable<number>(() => ({ defaultValue: -1 })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
      tabbableValue: bindable<string | null>(() => ({ defaultValue: null })),
    };
  },

  refs() {
    return { anchor: null, typeahead: createTypeaheadState(), orderedValues: [] };
  },

  computed: {
    multiple: ({ prop }) => prop("selectionMode") === "multiple",
    // The native `<select>` model in single mode, off in multiple — where an arrow
    // that selected as it moved would make a range impossible to build.
    followFocus: ({ prop }) => prop("selectOnHighlight") ?? prop("selectionMode") !== "multiple",
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackItems", "trackScrollEdges", "captureIntents"],

  watch({ context, scope, track, action }) {
    // The tab stop rides on the selection, which no child mutation announces — so
    // the collection is a dependency like any other and the observer below is left
    // to cover the mutations no render caused.
    //
    // Keyed through `collectionKey` rather than a join: two different lists must
    // never produce the same string, and no separator character is safe in a
    // `data-value` a consumer chose.
    track(
      () => [
        collectionKey(context.get("value")),
        context.get("highlightedValue"),
        collectionKey(getItemValues(scope)),
      ],
      () => action(["syncItems"]),
    );
  },

  on: {
    // **The focus is moved last, and the order is a contract.** `focusElement`
    // dispatches synchronously, the row's own handler answers it with `ITEM.FOCUS`,
    // and the interpreter delivers that re-entrantly — so `event` is the focus by
    // the time anything after it runs. An action that still had to read the click
    // would find one that was never sent.
    "ITEM.CLICK": {
      guard: "isItemEnabled",
      actions: ["highlightItem", "applyClick", "focusHighlighted"],
    },
    "ITEM.FOCUS": { actions: ["adoptFocus"] },
    "CONTENT.BLUR": { actions: ["clearFocusSource"] },
    "HIGHLIGHT.MOVE": { guard: "isInteractive", actions: ["moveHighlight"] },
    "HIGHLIGHT.PAGE": { guard: "isInteractive", actions: ["pageHighlight"] },
    "HIGHLIGHT.SET": { actions: ["setHighlight"] },
    "ITEM.TOGGLE": { guard: "isInteractive", actions: ["toggleItem"] },
    "SELECTION.SELECT": { guard: "isInteractive", actions: ["selectItem"] },
    "SELECTION.EXTEND": { guard: "isInteractive", actions: ["extendToItem"] },
    "SELECTION.ALL": { guard: "isMultiple", actions: ["selectAllItems"] },
    "SELECTION.CLEAR": { actions: ["clearSelection"] },
    "VALUE.SET": { actions: ["setValue"] },
    "TYPEAHEAD.KEY": { guard: "isTypeaheadEnabled", actions: ["typeaheadHighlight"] },
    "ITEMS.SYNC": { actions: ["syncItems"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
      // Interactivity folded in: a transition takes one guard, and select-all is
      // meaningless in single mode — "all" is not a value a radio-shaped list has.
      isMultiple: ({ prop, computed }) => !prop("disabled") && computed("multiple"),
      isItemEnabled({ prop, event, scope }) {
        if (prop("disabled") || event.type !== "ITEM.CLICK") return false;
        const item = getItemEl(scope, event.value);
        return item !== null && !isItemDisabled(item);
      },
      isTypeaheadEnabled: ({ prop }) => prop("typeahead") && !prop("disabled"),
    },

    actions: {
      highlightItem(params) {
        if (params.event.type === "ITEM.CLICK") commitHighlight(params, params.event.value);
      },

      /**
       * A real focus arriving from outside — a Tab, a spatial move, a click that
       * landed on a row. It moves the highlight and nothing else: even under
       * `selectOnHighlight`, entering a list does not choose from it. Only an arrow
       * does that.
       */
      adoptFocus(params) {
        const { event, scope } = params;
        if (event.type !== "ITEM.FOCUS") return;
        // A disabled row stays focusable — `aria-disabled`, never `disabled` — so a
        // pointer can still land on one. The highlight is what the arrows measure
        // from, and it must not come to rest on a row they step over.
        const item = getItemEl(scope, event.value);
        if (item !== null && isItemDisabled(item)) return;
        commitHighlight(params, event.value);
      },

      /**
       * The highlight is deliberately kept: it is the memory the tab stop comes back
       * to, and the same row the spatial zone's `last` entry strategy points at.
       */
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      moveHighlight(params) {
        const { context, event, prop, scope } = params;
        if (event.type !== "HIGHLIGHT.MOVE") return;
        const current = context.get("highlightedValue");
        const target = getNextItem(getItemEls(scope), current, event.action, prop("loopFocus"));
        // `null` is an empty collection; an unchanged value is the end of the list.
        // The keyboard holds a list at its ends — the connect has already stopped
        // the page from scrolling instead — while the d-pad hands the move back to
        // the spatial engine (see `captureIntents`).
        if (target === null || getItemValue(target) === current) return;
        applyHighlightTarget(params, target, {
          extend: event.extend === true,
          quiet: event.quiet === true,
        });
      },

      pageHighlight(params) {
        const { context, event, prop, scope } = params;
        if (event.type !== "HIGHLIGHT.PAGE") return;
        const items = getItemEls(scope);
        const action = event.delta === 1 ? "next" : "prev";
        // A screenful minus one row: the overlap every paging list keeps, so the
        // reader has a line in common between the view they left and the one they
        // arrive at.
        const step = Math.max(1, getPageSize(scope, prop("orientation")) - 1);

        let current = context.get("highlightedValue");
        let target: HTMLElement | null = null;
        for (let count = 0; count < step; count++) {
          // Never looping, whatever `loopFocus` says: a page jump that wrapped would
          // answer "move by a screenful" with "jump to the other end".
          const next = getNextItem(items, current, action, false);
          if (next === null) break;
          const value = getItemValue(next);
          if (value === current) break;
          current = value;
          target = next;
        }
        if (target === null) return;
        applyHighlightTarget(params, target, { extend: event.extend === true, quiet: false });
      },

      setHighlight(params) {
        if (params.event.type === "HIGHLIGHT.SET") commitHighlight(params, params.event.value);
      },

      focusHighlighted({ context, scope }) {
        const value = context.get("highlightedValue");
        if (value === null) return;
        const item = getItemEl(scope, value);
        // Explicit, and not a formality: WebKit does not focus a `div` under a
        // click, so the roving tab stop and the real focus would part company on the
        // first pointer selection.
        if (item !== null) revealAndFocus(item);
      },

      applyClick(params) {
        const { computed, event, prop } = params;
        if (event.type !== "ITEM.CLICK") return;
        const options = selectionOptions(params);
        const state = selectionState(params);

        if (computed("multiple") && event.shift) {
          commitSelection(params, extend(state, event.value, orderedEnabled(params), options));
        } else if (computed("multiple") && event.toggle) {
          commitSelection(params, toggle(state, event.value, options));
        } else {
          // Replaces in both modes: `select` in multiple mode is the plain click of
          // every file list, the one that drops everything else.
          commitSelection(params, select(state, event.value, options));
        }
        prop("onSelect")?.({ value: event.value });
      },

      selectItem(params) {
        const { event, prop } = params;
        if (event.type !== "SELECTION.SELECT") return;
        commitSelection(params, select(selectionState(params), event.value, followOptions(params)));
        prop("onSelect")?.({ value: event.value });
      },

      toggleItem(params) {
        const { context, event, prop, scope } = params;
        if (event.type !== "ITEM.TOGGLE") return;
        const target = event.value ?? context.get("highlightedValue");
        if (target === null) return;
        // A value with no row is allowed through: the selection outlives a filter,
        // so unselecting something the search has hidden has to keep working. A row
        // that *is* rendered and disabled is refused.
        const item = getItemEl(scope, target);
        if (item !== null && isItemDisabled(item)) return;
        commitSelection(params, toggle(selectionState(params), target, selectionOptions(params)));
        prop("onSelect")?.({ value: target });
      },

      extendToItem(params) {
        const { context, event, prop, scope } = params;
        if (event.type !== "SELECTION.EXTEND") return;
        const target = event.value ?? context.get("highlightedValue");
        if (target === null) return;
        const item = getItemEl(scope, target);
        if (item !== null && isItemDisabled(item)) return;
        // With no anchor `extend` falls back to a plain select, which is already
        // written and already right: the first half of a range is a selection.
        commitSelection(
          params,
          extend(selectionState(params), target, orderedEnabled(params), selectionOptions(params)),
        );
        prop("onSelect")?.({ value: target });
      },

      selectAllItems(params) {
        commitSelection(
          params,
          selectAll(selectionState(params), orderedEnabled(params), selectionOptions(params)),
        );
      },

      clearSelection(params) {
        commitSelection(params, emptySelectionState());
      },

      setValue(params) {
        const { event } = params;
        if (event.type !== "VALUE.SET") return;
        // The anchor follows the last value written, exactly as `toggle` leaves it:
        // a range extended straight after a programmatic write has to measure from
        // somewhere a consumer can predict.
        commitSelection(params, { value: event.value, anchor: event.value.at(-1) ?? null });
      },

      typeaheadHighlight(params) {
        const { context, event, refs, scope } = params;
        if (event.type !== "TYPEAHEAD.KEY") return;
        const items = getItemEls(scope);
        const current = context.get("highlightedValue");
        const match = getByTypeahead(refs.get("typeahead"), event.key, {
          items,
          itemToString: getItemLabel,
          isItemDisabled,
          activeIndex: items.findIndex((item) => getItemValue(item) === current),
        });
        if (match === null) return;
        // Never a range: typing a letter is a jump, and a jump that grew a selection
        // would make the keyboard the one input that cannot browse a list.
        applyHighlightTarget(params, match, { extend: false, quiet: false });
      },

      /**
       * Everything the machine knows about its own collection, re-read in one place.
       *
       * The focus rescue is the half that matters (parity with the reference app's filtered
       * palettes): a list that re-renders under a filter takes the highlighted row
       * away with it, and the browser drops the focus on `<body>`. APG says where it
       * goes — the next enabled row, the previous one when there is no next — and
       * the index it counts from is the one the row *had*, read from the snapshot
       * this action leaves behind on every pass.
       */
      syncItems(params) {
        const { context, refs, scope } = params;
        // "I cannot see the items" is not "there are no items": a server render and
        // the first client pass both land here before anything exists, and settling
        // on that would publish an empty state nobody is in.
        if (getContentEl(scope) === null) return;

        const items = getItemEls(scope);
        const values = items.map(getItemValue);
        const isDisabled = (index: number): boolean => {
          const item = items[index];
          return item !== undefined && isItemDisabled(item);
        };

        context.set("itemCount", values.length);
        context.set("hasLabel", hasLabel(scope));

        const previous = refs.get("orderedValues");
        let highlighted = context.get("highlightedValue");
        if (
          highlighted !== null &&
          !values.includes(highlighted) &&
          previous.includes(highlighted)
        ) {
          const from = Math.min(previous.indexOf(highlighted), values.length - 1);
          const rescued =
            values.length === 0
              ? -1
              : isDisabled(from)
                ? getRemovalIndex(from, { count: values.length, isDisabled })
                : from;
          highlighted = rescued === -1 ? null : (values[rescued] ?? null);
          commitHighlight(params, highlighted);

          // Only when the focus really fell out of the document's control. Reading
          // `activeElement` rather than a flag is what makes this engine-independent:
          // removing a focused node fires `blur` in some engines and silently moves
          // the focus to `<body>` in others, so the attribute this could have keyed
          // on is not reliably there.
          const active = scope.getActiveElement();
          const lost =
            active === null || active === scope.getDoc().body || active === getContentEl(scope);
          if (lost && highlighted !== null) {
            const item = getItemEl(scope, highlighted);
            if (item !== null) revealAndFocus(item);
          }
        }

        // The single tab stop, and its precedence is APG's: focus enters a listbox at
        // the selected option, then at wherever it was left, then at the top.
        const value = context.get("value");
        let stop: string | null = null;
        for (let index = 0; index < values.length; index++) {
          const candidate = values[index];
          if (candidate === undefined || isDisabled(index)) continue;
          if (value.includes(candidate)) {
            stop = candidate;
            break;
          }
        }
        if (stop === null && highlighted !== null) {
          const index = values.indexOf(highlighted);
          if (index !== -1 && !isDisabled(index)) stop = highlighted;
        }
        if (stop === null) {
          const first = getInitialIndex({ count: values.length, isDisabled });
          stop = first === -1 ? null : (values[first] ?? null);
        }
        context.set("tabbableValue", stop);

        refs.set("orderedValues", values);
      },
    },

    effects: {
      // No listener: the source is read once, when the focus lands. Holding the
      // handle is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      trackItems({ scope, send }) {
        send({ type: "ITEMS.SYNC" });
        // Rows appear and disappear with the app's own state — a filter above the
        // list is the whole reason this component exists in the reference app — and the machine
        // has to survive that without the consumer telling anyone.
        return observeChildren(getContentEl(scope), () => send({ type: "ITEMS.SYNC" }));
      },

      /**
       * A list in a page can be capped by whatever holds it, with no scrollbar to
       * say so: native desktop overlay scrollbars hide until the pointer moves, and a finger
       * gets none at all. Never conditioned on `prefers-reduced-motion` — this is not
       * an animation, it is the only indication that there is more list.
       */
      trackScrollEdges({ scope }) {
        return trackEdges(getContentEl(scope));
      },

      /**
       * Neither `trapped` nor `base`. A trapping scope answers `consumed` to
       * everything it declines and silences every non-`base` scope under it
       * outside its surface; a list is not a surface, and the spatial engine, a
       * `base` scope, would move the focus out of it anyway.
       *
       * `back` (B) is deliberately not claimed: a listbox is not a layer, and one
       * that swallowed B would make a dialog containing a list impossible to leave.
       * Neither is `contextMenu` (Y), which is the gesture that opens a context menu
       * on the focused row, nor `select` (A) — the input system clicks the focused
       * element for that, so a pad activation runs exactly the handlers a click does.
       * One path in, never two.
       */
      captureIntents({ prop, computed, context, scope, send }) {
        const host = prop("intents");
        if (host === null || host === undefined) return;

        return host.pushScope(
          (event) => {
            if (prop("disabled") || !ownsFocus(scope)) return false;

            if (event.intent === "secondary") {
              // X toggles the highlighted row without moving it (CDC §4.4). In single
              // mode it is left free for whoever else wants it.
              if (!computed("multiple")) return false;
              send({ type: "ITEM.TOGGLE" });
              return true;
            }

            if (event.intent === "pageUp" || event.intent === "pageDown") {
              send({ type: "HIGHLIGHT.PAGE", delta: event.intent === "pageDown" ? 1 : -1 });
              return true;
            }

            // The mirror lives in `roving-focus`, once, and is entered from here by
            // the intent rather than by the key it is the twin of: the intents are
            // physical by contract, and an off-axis one resolves to `null` so a
            // sideways press walks out of the list instead of being swallowed.
            const action = getRovingIntentAction(event.intent, {
              orientation: prop("orientation"),
              dir: resolveDir(prop("dir"), getContentEl(scope)),
            });
            if (action === null) return false;

            if (action === "next" || action === "prev") {
              const current = context.get("highlightedValue");
              const target = getNextItem(getItemEls(scope), current, action, prop("loopFocus"));
              // **Declined at the end of the list, and that is the rule that keeps a
              // d-pad out of a trap.** The intent falls through to the spatial engine,
              // which walks the focus out of the zone geometrically. The keyboard holds
              // the stop instead, because its fallback is the page scrolling, not a
              // navigation engine.
              if (target === null || getItemValue(target) === current) return false;
            }

            send({ type: "HIGHLIGHT.MOVE", action });
            return true;
          },
          { within: () => getContentEl(scope) },
        );
      },
    },
  },
});
