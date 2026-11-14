/**
 * Pure, DOM-free, replayable on a server. Every handler checks `defaultPrevented`
 * first, which is what lets a consumer's own handler veto the machine.
 *
 * **The two custom properties here are part of `style`, not an effect.** They are
 * derived from props rather than measured, so `connect` returns them from the first
 * render (the React adapter writes them by the CSSOM, decision 69) — the
 * arbitrage `--sui-calendar-columns` already made, and
 * the opposite of `--sui-drag-offset`, which is measured and therefore written
 * onto the node by the machine.
 */

import { type EngageIntent, isFocusVisibleModality, isTextEntryTarget } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./drawer.anatomy";
import { getBackdropId, getContentId, getGrabberId, getPositionerId } from "./drawer.dom";
import type { DrawerApi, DrawerAxis, DrawerGrabberProps, DrawerSchema } from "./drawer.types";

/**
 * Arrow keys are **physical**, exactly like the d-pad, and they are turned into the
 * same intents so the machine does the "which way is bigger" arithmetic once. The
 * off-axis pair is deliberately absent: left and right on a bottom sheet belong to
 * whatever is inside it.
 */
function intentFromKey(key: string, axis: DrawerAxis): EngageIntent | null {
  if (key === "Home") return "home";
  if (key === "End") return "end";
  if (axis === "block") {
    if (key === "ArrowUp") return "moveUp";
    return key === "ArrowDown" ? "moveDown" : null;
  }
  if (key === "ArrowLeft") return "moveLeft";
  return key === "ArrowRight" ? "moveRight" : null;
}

export function connect<T extends PropTypes>(
  service: Service<DrawerSchema>,
  normalize: NormalizeProps<T>,
): DrawerApi<T> {
  const { context, prop, computed, send, scope, state } = service;

  const edge = prop("edge");
  const axis = computed("axis");
  const detents = computed("detents");
  const detentValue = computed("detentValue");
  const maxDetent = computed("maxDetent");
  const hasTrack = computed("hasTrack");
  const disabled = prop("disabled");
  // Context, not a state — the gesture has to run without the machine changing
  // state at all, or the effect holding the captured pointer is recycled under it
  // (`drawer.types.ts`). The same shape `slider` derives its own `dragging` from.
  const dragging = context.get("dragging");
  const engaged = state.matches("engaged");
  const open = prop("open");

  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  // Equivalent to "the largest detent, and that detent is the whole positioner":
  // the list is clamped to 1, so reaching 1 is reaching the top of the track. A
  // drawer whose largest detent is 0.6 is never edge-to-edge and stays translucent,
  // which is a design rule and not an index the sheet could have guessed.
  const detentPosition = detentValue === 1 ? "full" : "partial";

  const adjust = (key: string): EngageIntent | null => intentFromKey(key, axis);

  return {
    detent: context.get("detent"),
    detentIndex: computed("detentIndex"),
    detents,
    edge,
    axis,
    dragging,
    engaged,
    disabled,
    hasTrack,
    focusSource,
    focusVisible,

    setDetent(detent): void {
      send({ type: "DETENT.SET", detent });
    },
    stepDetent(delta): void {
      send({ type: "DETENT.STEP", delta });
    },

    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-edge": edge,
        "data-state": open ? "open" : "closed",
      }),

    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "data-edge": edge,
        "data-state": open ? "open" : "closed",
        // The scrim takes the gesture's progress, and a scrim that took it through
        // the dialog's 300ms opacity transition would trail the surface it veils by
        // a fifth of a second. The sheet silences its own transition on the same
        // grounds (`_drawer.scss`, "two engines on one property").
        "data-dragging": dataAttr(dragging),
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope),
        // No role, no `aria-modal`, no `tabindex`, no `aria-labelledby`: this is a
        // co-identity on the decorated surface's own content, and everything about
        // being a dialog stays with the machine that is one.
        "data-edge": edge,
        "data-detent": detentValue,
        "data-detent-position": detentPosition,
        "data-dragging": dataAttr(dragging),
        "data-engaged": dataAttr(engaged),
        "data-disabled": dataAttr(disabled),
        style: {
          "--sui-drawer-detent": detentValue,
          "--sui-drawer-detent-max": maxDetent,
        },
        onKeyDown(event) {
          if (event.defaultPrevented || disabled || !hasTrack) return;
          if (!event.ctrlKey || event.metaKey || event.altKey) return;
          // Inside a textarea, Ctrl+Up/Down walks the caret by paragraph on some
          // platforms. Stealing it would turn a sheet into a trap for typing.
          if (isTextEntryTarget(event.target)) return;
          const intent = adjust(event.key);
          if (intent === null || intent === "home" || intent === "end") return;
          event.preventDefault();
          send({ type: "DETENT.ADJUST", intent });
        },
      }),

    getGrabberProps: (props?: DrawerGrabberProps): T["element"] =>
      normalize.element({
        ...parts.grabber.attrs,
        id: getGrabberId(scope),
        // APG Window Splitter, term for term: a focusable that resizes a panel
        // along an axis. Not a `button`, which would promise a one-shot action, and
        // not `role="slider"`, which would promise a continuum where the track is
        // discrete. `splitter` (Phase 7) inherits the role and the sheet with it.
        role: "separator",
        tabIndex: disabled ? undefined : 0,
        "aria-orientation": axis === "block" ? "horizontal" : "vertical",
        "aria-valuenow": computed("percent"),
        "aria-valuemin": Math.round((detents[0] ?? 1) * 100),
        "aria-valuemax": Math.round(maxDetent * 100),
        "aria-valuetext": props?.valueText,
        "aria-controls": getContentId(scope),
        "aria-disabled": ariaAttr(disabled),
        "data-edge": edge,
        "data-dragging": dataAttr(dragging),
        "data-engaged": dataAttr(engaged),
        "data-disabled": dataAttr(disabled),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        onFocus(event) {
          if (event.defaultPrevented) return;
          // No source: this file is DOM-free and cannot read the modality store,
          // and the one it used to name was a guess that was always "keyboard".
          send({ type: "GRABBER.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "GRABBER.BLUR" });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || disabled) return;
          // Escape is deliberately untouched: it belongs to the dismissable layer
          // of whatever this decorates, and a drawer that ate it would make a sheet
          // the one overlay in the library you cannot leave with the keyboard.
          if (event.key === " ") {
            // Held here so the page does not scroll under an open sheet; acted on
            // at keyup, which is what a native control does (input.md §1).
            event.preventDefault();
            return;
          }
          if (event.repeat) return;
          if (event.key === "Enter") {
            event.preventDefault();
            send({ type: "DETENT.TOGGLE" });
            return;
          }
          const intent = adjust(event.key);
          if (intent === null) return;
          event.preventDefault();
          send({ type: "DETENT.ADJUST", intent });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || disabled || event.key !== " ") return;
          event.preventDefault();
          send({ type: "DETENT.TOGGLE" });
        },
      }),
  };
}
