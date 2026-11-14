/**
 * A checkbox group is not a composite. APG makes it a `group` of independent tab
 * stops — no roving, no arrow keys, Space on each box — so there is no focus
 * machinery here at all, and no modality to track: every box already reports its
 * own.
 *
 * What is left is the two things a set of checkboxes cannot do for itself. It
 * owns the array of checked values, so several boxes submit as one field. And it
 * derives the tri-state summary, which is the whole reason the component exists.
 *
 * The summary is computed over the items the user can actually toggle. A
 * disabled item is excluded from both the reading and the writing: a parent that
 * says "mixed" when the only unchecked box is disabled would be a parent nobody
 * can resolve, and one that "selects all" by flipping a box the user cannot flip
 * would be doing something the user is not allowed to do. So the summary means
 * "everything you can toggle is on", and a disabled item keeps whatever state it
 * was given.
 */

import { observeChildren } from "../../dom/observers";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import {
  getGroupName,
  getItemInputEls,
  getItemKey,
  getRootEl,
  hasLabel,
} from "./checkbox-group.dom";
import type { CheckboxGroupSchema } from "./checkbox-group.types";

export const machine: Machine<CheckboxGroupSchema> = createMachine<CheckboxGroupSchema>({
  props({ props }) {
    return {
      orientation: "vertical",
      disabled: false,
      readOnly: false,
      invalid: false,
      required: false,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      value: bindable<readonly string[]>(() => ({
        defaultValue: prop("defaultValue") ?? [],
        value: prop("value"),
        // Order is not meaning: a group that reported a change because the same
        // values arrived in another order would loop against a consumer that
        // normalises them.
        isEqual: (a, b) => a.length === b.length && a.every((entry) => b.includes(entry)),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "checkbox-group value",
      })),
      enabledValues: bindable<readonly string[]>(() => ({
        defaultValue: [],
        // Order *is* meaning here — it is DOM order — and this list is rewritten
        // on every settle, so it needs an equality that stops the write.
        isEqual: (a, b) => a.length === b.length && a.every((entry, index) => b[index] === entry),
      })),
      itemCount: bindable<number>(() => ({ defaultValue: 0 })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    parentChecked({ context }) {
      const enabled = context.get("enabledValues");
      if (enabled.length === 0) return false;
      const value = context.get("value");
      const checked = enabled.filter((entry) => value.includes(entry)).length;
      if (checked === 0) return false;
      return checked === enabled.length ? true : "indeterminate";
    },
    // Nothing to summarise is not the same as an unchecked summary: a box that
    // does nothing when pressed is worse than one that says it cannot be.
    parentDisabled: ({ prop, context }) =>
      prop("disabled") || context.get("enabledValues").length === 0,
  },

  initialState() {
    return "idle";
  },

  effects: ["trackItems"],

  watch({ context, prop, scope, track, action }) {
    // The item list is a dependency like any other. Reading it here keeps the
    // summary in step synchronously with a render, and leaves the observer below
    // to cover the mutations no render caused.
    track(
      () => [context.get("value"), getItemKey(scope, getGroupName(scope, prop("name")))],
      () => action(["syncItems"]),
    );
  },

  on: {
    "ITEM.TOGGLE": { guard: "isInteractive", actions: ["toggleItem"] },
    "PARENT.TOGGLE": { guard: "isInteractive", actions: ["toggleAll"] },
    "VALUE.SET": { actions: ["setValue"] },
    "ITEMS.SYNC": { actions: ["syncItems"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      // Read-only is not disabled: the boxes stay focusable and announced, they
      // simply refuse to change — which is what a form in review mode wants.
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    },

    actions: {
      toggleItem({ context, event }) {
        if (event.type !== "ITEM.TOGGLE") return;
        const value = context.get("value");
        context.set(
          "value",
          value.includes(event.value)
            ? value.filter((entry) => entry !== event.value)
            : [...value, event.value],
        );
      },

      toggleAll({ context, event }) {
        if (event.type !== "PARENT.TOGGLE") return;
        const next = new Set(context.get("value"));
        for (const entry of context.get("enabledValues")) {
          if (event.checked) next.add(entry);
          else next.delete(entry);
        }
        // A disabled item's value survives both branches: it was never the
        // summary's to give or to take.
        context.set("value", [...next]);
      },

      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },

      syncItems({ context, prop, scope }) {
        const inputs = getItemInputEls(scope, getGroupName(scope, prop("name")));
        context.set("itemCount", inputs.length);
        context.set(
          "enabledValues",
          inputs.filter((input) => !input.disabled).map((input) => input.value),
        );
        context.set("hasLabel", hasLabel(scope));
      },
    },

    effects: {
      trackItems({ scope, send }) {
        send({ type: "ITEMS.SYNC" });
        // Items appear and disappear with the app's own state, and the summary
        // has to survive that without the consumer telling anyone. A box merely
        // becoming disabled is an attribute change this observer does not watch —
        // that one arrives through the `watch` above, on the settle that caused it.
        return observeChildren(getRootEl(scope), () => send({ type: "ITEMS.SYNC" }));
      },
    },
  },
});
