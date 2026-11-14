/**
 * The search presentation of a text field: the same value handling as `input`,
 * plus the four things that only make sense for search — Escape empties the
 * field, a clear button that takes the focus back with it, a cancel button that
 * stands *outside* the capsule and says so to the consumer, and an opt-in
 * activation shortcut.
 *
 * Cancelling is clearing plus a notification, never a substitute for one: a
 * consumer filtering on `onValueChange` has to see the empty string or their
 * list stays filtered. What `onCancel` buys is the intention, which survives a
 * field that was already empty — and being fired last, so a consumer who moves
 * the focus inside it wins against the focus this machine hands back.
 *
 * It carries its own scope rather than riding `input`'s parts, and the reason is
 * the composition rule, not taste: `search-field:clear-trigger` and
 * `search-field:indicator` are parts of this presentation, and a consumer who
 * styles them must not have to know they were spelled `input:*`. What the two
 * share — the field box, the ring, the shapes, the disabled wash — is shared
 * through the tokens, which is where sharing costs nothing.
 *
 * The DOM's own value is the source of truth while typing; the machine only
 * records what the browser reports.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { getEventTarget } from "../../dom/query";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import { getControlEl } from "./search-field.dom";
import { isEditableTarget } from "./search-field.hotkey";
import type { SearchFieldSchema } from "./search-field.types";

export const machine: Machine<SearchFieldSchema> = createMachine<SearchFieldSchema>({
  props({ props }) {
    return {
      shape: "capsule",
      disabled: false,
      invalid: false,
      readOnly: false,
      required: false,
      // The one default that differs from `input`, and the one that makes this a
      // search field: native platforms empty the field on Escape. It still only
      // consumes the key when there is something to empty (see `connect`).
      clearOnEscape: true,
      // **Defaulted, unlike the field's own label, and the asymmetry is the
      // point.** A search field with no label has an alternative path — compose it
      // into `field`, which names it — so the library declines to invent one. The
      // clear button has none: rendered without this, it is an icon-only
      // `<button>` with an `aria-hidden` glyph and no accessible name at all,
      // which axe grades `button-name` and WCAG 2.2 grades a level A failure. The
      // library already ships English here for exactly this reason —
      // `breadcrumb.ellipsisLabel` and pagination's three — and a wrong-language
      // name is recoverable where an absent one is not.
      clearLabel: "Clear search",
      // Same argument, and stronger: the clear button is out of the tab order,
      // this one is a tab stop a keyboard user arrives at head-on. An unnamed
      // `<button>` there is a level A failure nobody can route around.
      cancelLabel: "Cancel search",
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<string>(() => ({
        defaultValue: prop("defaultValue") ?? "",
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "search-field value",
      })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  refs() {
    return { cancelFocused: false };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackHotkey"],

  // The cancel button is a tab stop that disappears the moment the field goes
  // empty, so somebody else emptying it — a controlled `value=""`, `api.clear()`
  // — drops the focus on `<body>`. Played post-render by the adapter (the
  // DOM-before-watch hard rule), and the decision is read off the ref rather than
  // off `activeElement`: by the time this runs the button is already gone, so the
  // DOM no longer remembers that the focus was ever ours.
  watch({ context, track, action }) {
    track(
      () => [context.get("value")],
      () => action(["rescueCancelFocus"]),
    );
  },

  on: {
    "VALUE.SET": { guard: "isInteractive", actions: ["setValue"] },
    "VALUE.CLEAR": { guard: "isInteractive", actions: ["clearValue"] },
    // `api.cancel()`: the same asymmetry `VALUE.CLEAR` has against `CLEAR.CLICK`
    // — it empties and says so, and it takes nobody's caret. On an already-empty
    // field the bindable short-circuits, so `onValueChange` stays silent and
    // `onCancel` still fires: cancelling is an intention, not a change of value.
    "VALUE.CANCEL": { guard: "isInteractive", actions: ["clearValue", "notifyCancel"] },
    // Distinct from `VALUE.CLEAR` on purpose: `api.clear()` must not steal the
    // focus, and the gesture on the button must hand it back — the button is
    // about to disappear, and a focus left on a removed node lands on `<body>`.
    "CLEAR.CLICK": { guard: "isInteractive", actions: ["clearValue", "focusControl"] },
    // Cancelling is clearing plus a word about it, and the order matters:
    // `notifyCancel` is LAST so that a consumer who moves the focus inside
    // `onCancel` keeps it against `focusControl`, which has already run.
    "CANCEL.CLICK": {
      guard: "isInteractive",
      actions: ["clearValue", "focusControl", "notifyCancel"],
    },
    // No target on either: whether that button holds the focus is not a state of
    // this field, and nothing in the sheet is keyed on it.
    "CANCEL.FOCUS": { actions: ["markCancelFocused"] },
    "CANCEL.BLUR": { actions: ["clearCancelFocused"] },
    "CONTROL.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource"],
      on: { "CONTROL.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },
      clearValue({ context }) {
        context.set("value", "");
      },
      focusControl({ scope }) {
        getControlEl(scope)?.focus();
      },
      notifyCancel({ prop }) {
        prop("onCancel")?.();
      },
      markCancelFocused({ refs }) {
        refs.set("cancelFocused", true);
      },
      clearCancelFocused({ refs }) {
        refs.set("cancelFocused", false);
      },
      rescueCancelFocus({ context, refs, scope }) {
        // Nothing to rescue unless the button was holding the focus *and* the
        // value that just changed went empty — which is exactly when the button
        // stops being rendered. A field that merely lost a character keeps it.
        if (!refs.get("cancelFocused") || context.get("value") !== "") return;
        refs.set("cancelFocused", false);
        getControlEl(scope)?.focus();
      },
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },
      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },
    },

    effects: {
      // No listener: the source is read once, when focus lands, so a modality
      // change no longer has to reach every mounted control. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      trackHotkey({ prop, scope }) {
        const match = prop("hotkey");
        // Not an optimisation: a page that did not ask for the shortcut keeps
        // find-in-page, and pays zero listeners for the field it never bound.
        if (match === undefined) return;

        const doc = scope.getDoc();
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.defaultPrevented || !match(event)) return;
          if (prop("disabled") || prop("readOnly")) return;

          const control = getControlEl(scope);
          if (control === null) return;

          // Somebody typing in another field keeps their keystroke: Ctrl+F is
          // caret-forward in native desktop text fields and in Emacs bindings alike.
          const target = getEventTarget(event);
          if (target !== control && isEditableTarget(target)) return;

          // Taking the browser's find-in-page is the contract of the opt-in, not
          // a side effect of it.
          event.preventDefault();
          control.focus();
          // ⌘F on an already-filled field retypes rather than appends, which is
          // what native desktop fields do with their own.
          if (control instanceof scope.getWin().HTMLInputElement) control.select();
        };

        // Capture, and installed natively rather than through a part's props:
        // both are hard rules, and capture is what lets the field answer before
        // an overlay swallows the key.
        doc.addEventListener("keydown", onKeyDown, true);
        return () => doc.removeEventListener("keydown", onKeyDown, true);
      },
    },
  },
});
