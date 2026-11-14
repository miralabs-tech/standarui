/**
 * The APG toolbar: a row of heterogeneous controls reduced to one tab stop by a
 * roving tabindex. `toggle-group` minus the selection — same collection read from
 * the DOM, same modality capture, same single-stop arithmetic — and the two
 * differences are the whole component.
 *
 * **A toolbar visits, it does not choose.** Single-selection `toggle-group` is a
 * radio group, where an arrow moves *and* selects; nothing here follows the
 * focus, because the controls own their own activation.
 *
 * **Leaves are items, composites are islands.** Only `[data-part~="toolbar:item"]`
 * takes part in the roving, so a `toggle-group`, a `tabs` list or a search field
 * dropped into the bar keeps its own tab stop and its own arrows — APG's "avoid
 * including controls whose operation requires the arrow keys" turned into a rule
 * the markup states rather than one the machine has to detect. The arrows step
 * over an island because it is not in the collection, and Tab reaches it in DOM
 * order.
 */

import { focusElement, getInputModality, trackInputModality } from "@standarx/nav";
import { observeChildren } from "../../dom/observers";
import { getInitialIndex, getNextIndex } from "../../focus/roving-focus";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import { getCurrentValue, getItemEls, getItemValues, getRootEl } from "./toolbar.dom";
import type { ToolbarSchema } from "./toolbar.types";

export const machine: Machine<ToolbarSchema> = createMachine<ToolbarSchema>({
  props({ props }) {
    return {
      orientation: "horizontal",
      // APG leaves the wrap optional; `toggle-group` and `tabs` loop, so this one
      // does too. It is a keyboard politeness only — the d-pad deliberately gets
      // no `data-snav-wrap`, or the bar would be impossible to leave.
      loopFocus: true,
      ...props,
    };
  },

  context({ bindable }) {
    return {
      tabbableValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusedValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackItems", "warnIfAnonymous"],

  watch({ scope, track, action }) {
    // The item list is a dependency like any other: an adapter that re-renders
    // settles the tab stop synchronously, and the observer below is left to cover
    // the mutations no render caused.
    //
    // The separator is spelled rather than typed. The raw byte in a source file
    // makes ripgrep call the module binary and skip it — every grep in the repo,
    // and every review built on one, goes blind to it (the lesson `toggle-group`
    // paid for). U+0000 stays the character because it is the one an attribute
    // value cannot carry, so two different item lists can never key the same.
    track(
      () => [getItemValues(scope).join("\u0000")],
      () => action(["syncItems"]),
    );
    track(
      () => [getCurrentValue(scope)],
      () => action(["followCurrentPage"]),
    );
  },

  on: {
    "ITEM.FOCUS": { actions: ["setFocusedValue"] },
    "ITEM.BLUR": { actions: ["clearFocus"] },
    "ITEM.CLICK": { actions: ["rememberItem"] },
    "ITEM.NAVIGATE": { actions: ["navigate"] },
    "ITEMS.SYNC": { actions: ["syncItems"] },
    "ITEMS.CURRENT": { actions: ["followCurrentPage"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    actions: {
      setFocusedValue({ context, event, scope }) {
        if (event.type !== "ITEM.FOCUS") return;
        context.set("focusedValue", event.value);
        // APG: Tab may restore the control it left. It does here.
        context.set("tabbableValue", event.value);
        // Read at arrival and held: the modality of *now* flips to pointer after
        // 300ms of mouse movement whether or not the focus moved, and a ring that
        // blinks out under the user's hands was the result.
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocus({ context }) {
        context.set("focusedValue", null);
        // `tabbableValue` survives on purpose — it *is* the memory Tab returns to.
        context.set("focusSource", null);
      },

      // A pointer press moves the tab stop and nothing else. The activation
      // belongs to the control that was clicked, which is the whole premise of a
      // toolbar of composed controls.
      rememberItem({ context, event }) {
        if (event.type !== "ITEM.CLICK") return;
        context.set("tabbableValue", event.value);
      },

      navigate({ context, prop, scope, event }) {
        if (event.type !== "ITEM.NAVIGATE") return;
        const items = getItemEls(scope);
        const current = items.findIndex((item) => item.dataset.value === event.value);
        const next = getNextIndex(current, event.action, {
          count: items.length,
          loop: prop("loopFocus"),
          // Natively `disabled` only. An `aria-disabled` control stays reachable —
          // APG's discoverability clause, and the control itself is what refuses
          // the activation (`button`'s `focusableWhenDisabled`).
          isDisabled: (index) => items[index]?.hasAttribute("disabled") === true,
        });
        const target = items[next];
        if (target === undefined || next === current) return;

        focusElement(target);
        context.set("tabbableValue", target.dataset.value ?? "");
      },

      // The bar exposes exactly one tab stop, and it has to be one the browser
      // will actually stop on: parked on a disabled button, the only
      // `tabindex="0"` is skipped and the whole toolbar falls out of the tab
      // order.
      //
      // A bar whose stop has never been settled, or whose stop is gone, opens on the
      // page the user is on when one of its items says so with `aria-current="page"`,
      // and on the first enabled item otherwise.
      //
      // It never steals the focus. An item removed while focused drops the focus
      // on body, which is the browser's answer and an acceptable one here —
      // `getRemovalIndex` belongs to the transient collections (a menu), not to a
      // bar that is part of the page.
      syncItems({ context, scope }) {
        const items = getItemEls(scope);
        const values = getItemValues(scope);
        const isDisabled = (index: number): boolean =>
          items[index]?.hasAttribute("disabled") === true;

        const enabled = (value: string | null): boolean => {
          if (value === null) return false;
          const index = values.indexOf(value);
          return index !== -1 && !isDisabled(index);
        };

        if (enabled(context.get("tabbableValue"))) return;
        const current = getCurrentValue(scope);
        context.set(
          "tabbableValue",
          current ?? values[getInitialIndex({ count: items.length, isDisabled })] ?? null,
        );
      },

      // A route change moves the page the bar is on, and the stop goes with it so
      // that Tab enters on the new page. While the focus is inside the bar the stop
      // is the focused item and stays there; a re-render on the same page never gets
      // here, so the memory of where the user left the bar survives it.
      followCurrentPage({ context, scope }) {
        if (context.get("focusedValue") !== null) return;
        const current = getCurrentValue(scope);
        if (current !== null) context.set("tabbableValue", current);
      },
    },

    effects: {
      // No listener of its own: the source is read once, when focus lands. Holding
      // the handle is the whole job — the tracker has to be running before the
      // first Tab.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },

      /**
       * `role="toolbar"` with no accessible name is what the APG forbids and
       * what no automated check catches: axe has no rule for it, so the defect
       * ships green. Defaulting a name is worse than none — two bars both called
       * "Toolbar" are less navigable than two unnamed ones, because the name is
       * how a screen-reader user tells them apart — so the core says so instead.
       *
       * Read off the mounted element rather than off the props: `label` is only
       * one of the three ways in, and a consumer pointing at a visible heading
       * with their own `aria-labelledby` has done the right thing.
       */
      warnIfAnonymous({ scope }) {
        if (!isDev()) return;
        const root = getRootEl(scope);
        if (root === null) return;
        warn(
          !root.hasAttribute("aria-label") && !root.hasAttribute("aria-labelledby"),
          `a toolbar has no accessible name. Pass \`label\`, or point at a visible \
heading with your own \`aria-labelledby\` — the APG requires the name, and two \
unnamed bars on a page cannot be told apart.`,
        );
      },

      trackItems({ scope, send }) {
        send({ type: "ITEMS.SYNC" });
        // Controls appear and disappear with the app's own state; the tab stop has
        // to survive that without the consumer telling anyone.
        return observeChildren(
          getRootEl(scope),
          (_root, records) => {
            send({ type: "ITEMS.SYNC" });
            const moved = records.some(
              (record) =>
                record.type === "attributes" &&
                record.target.nodeType === 1 &&
                (record.target as Element).matches('[data-part~="toolbar:item"]') &&
                record.oldValue !== (record.target as Element).getAttribute("aria-current"),
            );
            if (moved) send({ type: "ITEMS.CURRENT" });
          },
          ["aria-current"],
        );
      },
    },
  },
});
