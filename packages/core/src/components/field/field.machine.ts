/**
 * The accessibility hub of every form control: one place that owns the label's
 * id, the description ids, and the three states — invalid, disabled, required —
 * that a control and its text have to agree on.
 *
 * The only thing it needs a machine for is presence. `aria-describedby` may only
 * point at ids that exist: a field that always described itself as having an
 * error message would fail validation the moment the message was not rendered.
 * So whether the helper and error texts are in the DOM is read from the DOM, and
 * re-read when the children change.
 */

import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { observeChildren } from "../../dom/observers";
import { query } from "../../dom/query";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { getRootEl, hasLabelableControl, hasPart } from "./field.dom";
import type { FieldSchema } from "./field.types";

export const machine: Machine<FieldSchema> = createMachine<FieldSchema>({
  props({ props }) {
    return {
      invalid: false,
      disabled: false,
      readOnly: false,
      required: false,
      group: false,
      ...props,
    };
  },

  context({ bindable }) {
    return {
      hasHelperText: bindable<boolean>(() => ({ defaultValue: false })),
      hasErrorText: bindable<boolean>(() => ({ defaultValue: false })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
      // The one default that is not `false`: see `hasLabelableControl`.
      hasLabelableControl: bindable<boolean>(() => ({ defaultValue: true })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackParts"],

  watch({ prop, scope, track, action }) {
    // A dependency like any other, so an adapter that re-renders is in step
    // immediately rather than one mutation record later.
    track(
      () => [
        hasPart(scope, "helper-text"),
        hasPart(scope, "error-text"),
        hasPart(scope, "label"),
        hasLabelableControl(scope),
      ],
      () => action(["syncParts"]),
    );
    track(
      () => [prop("invalid")],
      () => action(["announceError"]),
    );
  },

  on: {
    "PARTS.SYNC": { actions: ["syncParts"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    actions: {
      syncParts({ context, scope }) {
        context.set("hasHelperText", hasPart(scope, "helper-text"));
        context.set("hasErrorText", hasPart(scope, "error-text"));
        context.set("hasLabel", hasPart(scope, "label"));
        context.set("hasLabelableControl", hasLabelableControl(scope));
      },

      /**
       * Announced through the shared announcer rather than by making the error
       * element a live region. A live region that is `hidden` until it has
       * something to say is not registered while hidden, so it appears already
       * populated — and a region that appears with its content is the classic
       * way to be announced by nobody. The announcer's regions are created empty
       * up front and written on a later task, which is the whole point of it.
       */
      announceError({ prop, scope }) {
        if (!prop("invalid")) return;
        const message =
          query(getRootEl(scope), '[data-part~="field:error-text"]')?.textContent ?? "";
        if (message.trim() === "") return;
        getLiveAnnouncer(scope.getDoc()).announce(message, "polite");
      },
    },

    effects: {
      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        return observeChildren(getRootEl(scope), () => send({ type: "PARTS.SYNC" }));
      },
    },
  },
});
