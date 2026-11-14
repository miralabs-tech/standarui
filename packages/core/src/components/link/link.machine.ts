/**
 * A link is smaller than a button and still needs a machine, for the two things
 * a pure `connect` cannot carry: `data-focus-source` is the modality captured
 * at the moment focus lands and frozen until it leaves, and `data-pressed` has
 * to survive the finger sliding off the control and coming back — pointer
 * capture, an effect with a cleanup.
 *
 * What it does not need is button's activation arbitration. Activation is the
 * browser's: a real `<a>` turns Enter into a click and a pointer sequence ends
 * in a compatibility click, both of which arrive as `ROOT.CLICK`. Only a
 * substituted root, where Enter produces no native click, gets `ROOT.PRESS`
 * synthesised by the connect — the two paths are mutually exclusive by
 * construction, so `invokeOnPress` never has to pick one.
 *
 * The press primitive runs with its keyboard mode off, always: that mode is
 * shaped like a button — it activates on Space and calls `preventDefault(" ")`
 * — which is exactly wrong for a link, where Space must keep scrolling the
 * page. The primitive only serves the pointer visual here.
 */

import { getInputModality, trackInputModality } from "@standarx/nav";
import { trackPress } from "../../interaction/press";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import type { InputModality } from "../../types";
import { getRootEl } from "./link.dom";
import type { LinkSchema } from "./link.types";

export const machine: Machine<LinkSchema> = createMachine<LinkSchema>({
  props({ props }) {
    const variant = props.variant ?? "tint";
    return {
      external: false,
      current: false,
      disabled: false,
      focusableWhenDisabled: false,
      nativeLink: true,
      ...props,
      variant,
      // Resolved after `variant`: a plain link without an underline is not
      // identifiable as a link at all (WCAG 1.4.1).
      underline: props.underline ?? (variant === "plain" ? "always" : "hover"),
    };
  },

  context({ bindable }) {
    return {
      pressed: bindable<boolean>(() => ({ defaultValue: false })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  initialState() {
    return "idle";
  },

  effects: ["trackModality", "trackPointerPress"],

  watch({ prop, track, action }) {
    // A link disabled mid-press must not stay stuck in `data-pressed`.
    track(
      () => [prop("disabled")],
      () => action(["clearPressed"]),
    );
  },

  on: {
    "ROOT.CLICK": { guard: "isInteractive", actions: ["invokeOnPress"] },
    "ROOT.PRESS": { guard: "isInteractive", actions: ["invokeOnPress"] },
    "ROOT.PRESS_START": { guard: "isInteractive", actions: ["setPressed"] },
    "ROOT.PRESS_END": { actions: ["clearPressed"] },
    "ROOT.FOCUS": { target: "focused", actions: ["captureFocusSource"] },
  },

  states: {
    idle: {},
    focused: {
      exit: ["clearFocusSource", "clearPressed"],
      on: { "ROOT.BLUR": { target: "idle" } },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled"),
    },

    actions: {
      invokeOnPress({ prop, event }) {
        // No arbitration, only narrowing: ROOT.PRESS is only ever sent for a
        // substituted root and ROOT.CLICK covers everything else, so accepting
        // both cannot double-fire — see the note at the top of the file.
        if (event.type !== "ROOT.CLICK" && event.type !== "ROOT.PRESS") return;
        prop("onPress")?.({ originalEvent: event.originalEvent });
      },
      setPressed({ context }) {
        context.set("pressed", true);
      },
      clearPressed({ context }) {
        context.set("pressed", false);
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

      trackPointerPress({ scope, prop, send }) {
        return trackPress(getRootEl(scope), {
          isDisabled: () => prop("disabled"),
          // Always off, and no `onPress` either: activation never comes from
          // the primitive — see the note at the top of the file.
          keyboard: false,
          onPressStart: () => send({ type: "ROOT.PRESS_START" }),
          onPressEnd: () => send({ type: "ROOT.PRESS_END" }),
          onPressCancel: () => send({ type: "ROOT.PRESS_END" }),
        });
      },
    },
  },
});
