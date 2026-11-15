/**
 * The overlay half of the machine's effects, in a module of its own.
 *
 * Not a second component and not a barrel — the folder's own `index.ts` is still
 * the only one. This is the split the size of the machine asked for: the picker
 * carries an overlay, a collection, a two-dimensional control and up to four
 * one-dimensional ones, and the surface's six effects are the one group that has
 * nothing to do with the colour. They are the same effects the machine installs;
 * they are simply written where they can be read.
 *
 * Every one of them is inert in `presentation="inline"`: there is no layer to
 * dismiss, nothing to anchor, no focus to trap and no page to lock.
 */

import { hideOthers } from "../../a11y/aria-hidden";
import { lockScroll } from "../../a11y/scroll-lock";
import { resolveDir } from "../../dom/text-dir";
import { trapFocus } from "../../focus/focus-trap";
import { proxyTabFocus } from "../../focus/proxy-tab-focus";
import { focusWentElsewhere, restoreFocus } from "../../focus/restore-focus";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack } from "../../interaction/layer-stack";
import type { EffectCleanup, MachineParams } from "../../machine/types";
import { focusElement, getFirstTabbable } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { ColorChannel } from "../../utils/color";
import {
  getBackdropId,
  getCancelTriggerId,
  getContentEl,
  getContentId,
  getFormatSelectEl,
  getPositionerEl,
  getRootEl,
  getTriggerEl,
} from "./color-picker.dom";
import type { ColorPickerSchema } from "./color-picker.types";

type Params = MachineParams<ColorPickerSchema>;

/** The inline properties `trackPosition` writes and never cleans up itself. */
const POSITION_STYLES = ["position", "top", "left", "transform", "width"] as const;

/**
 * The surface is portalled into the body, outside whatever RTL region the trigger
 * sits in, and inheritance does not cross a portal — so the direction is read from
 * the anchor and carried over explicitly. In an effect, so the server emits
 * nothing and the first client render has nothing to disagree with.
 */
export function trackSurfaceDir({ prop, context, computed, scope }: Params): EffectCleanup {
  if (computed("presentation") === "inline") return;
  context.set("surfaceDir", resolveDir(prop("dir"), getTriggerEl(scope) ?? getRootEl(scope)));
}

export function trackDismissable({ prop, context, computed, scope, send }: Params): EffectCleanup {
  if (computed("presentation") === "inline") return;
  return trackDismissableLayer(getContentEl(scope), {
    /**
     * The first Escape inside a channel field reverts what was typed; the second
     * one closes the surface. The veto has to live here and not on the field: the
     * layer listens on the *document in capture*, so a `stopPropagation` from the
     * target could never get there first.
     */
    onEscapeKeyDown(event) {
      const active = scope.getActiveElement();
      const part = active?.getAttribute("data-part") ?? "";
      if (!part.split(" ").includes("color-picker:channel-input")) return;
      const channel = active?.getAttribute("data-channel") ?? null;
      if (channel === null || context.get("inputDrafts")[channel] === undefined) return;
      event.preventDefault();
      send({ type: "INPUT.REVERT", channel: channel as ColorChannel });
    },
    id: getContentId(scope),
    type: "dialog",
    modal: computed("isModal"),
    parentId: prop("parentId"),
    // The format select is the one native control in the anatomy and its dropdown
    // is painted by the system, outside the DOM: on some engines a click inside it
    // arrives as an interaction *outside* the surface. The sheet's cancel may sit
    // beside the content, as the date picker's does: a press on it was outside and
    // closed with `outside-pointer`, keeping the colour it exists to put back (R73).
    exclude: () => [
      getTriggerEl(scope),
      getFormatSelectEl(scope),
      scope.getById(getCancelTriggerId(scope)),
      ...(prop("persistentElements")?.() ?? []),
    ],
    onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
  });
}

export function lockPageScroll({ computed, scope }: Params): EffectCleanup {
  if (!computed("isModal")) return;
  return lockScroll(getContentEl(scope)?.ownerDocument);
}

/**
 * The sheet branch clears what a previous popup pass left behind, on install
 * rather than on teardown: a disposer would run while `presence` still holds the
 * node for its exit, and the surface would snap to `0,0` mid-fade.
 */
export function trackAnchorPosition({ prop, computed, scope, send }: Params): EffectCleanup {
  const positioner = getPositionerEl(scope);
  if (positioner === null) return;

  if (computed("presentation") !== "popup") {
    for (const name of POSITION_STYLES) positioner.style.removeProperty(name);
    positioner.style.removeProperty("--sui-transform-origin");
    return;
  }

  return trackPosition(getTriggerEl(scope), positioner, {
    placement: prop("placement"),
    gap: prop("gap"),
    offset: prop("offset"),
    flip: prop("flip"),
    shift: prop("shift"),
    padding: prop("padding"),
    dir: resolveDir(prop("dir"), getTriggerEl(scope)),
    strategy: prop("strategy"),
    boundary: prop("boundary"),
    onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
  });
}

/**
 * Modal surfaces trap; anchored ones place the focus, send Tab on past the
 * trigger as a popover does, and hand the focus back. The trap is never installed
 * on a popup, for the popover's reason: a trapped scope silences the spatial
 * engine and makes the surface's own interior unreachable to a d-pad.
 */
export function trackFocusTrap({ prop, computed, refs, scope }: Params): EffectCleanup {
  if (computed("presentation") === "inline") return;
  const content = getContentEl(scope);
  if (content === null) return;
  const finalFocus = (): HTMLElement | null =>
    prop("finalFocus")?.() ?? refs.get("finalFocusEl") ?? getTriggerEl(scope);

  if (computed("isModal")) {
    // Spec §5.5 promises two rules for the format select in a modal surface.
    // Rule 1 — excluded from outside-pointer dismiss — lives in `trackDismissable`
    // above. Rule 2 is missing: `trapFocus` should not redirect a `focusout`
    // whose `relatedTarget` is `null` while the format select is the
    // `activeElement`, the signature of its own OS-drawn dropdown rather than a
    // focus leak, and neither `trapFocus` nor this call site knows that
    // exemption. Left open because mainstream engines keep `activeElement`
    // pinned on a `<select>` for the whole life of its dropdown — nothing in the
    // support matrix has been seen to hit the gap — and proving a fix would mean
    // adding an exemption option to `focus-trap.ts`, shared by every modal
    // surface in the library, carried entirely by a synthetic `focusout` standing
    // in for a browser behaviour no real engine here produces. That is the cost:
    // a shared-file change plus a synthetic-event test, for a guarantee no engine
    // currently forces.
    return trapFocus(content, { finalFocus, restoreFocus: prop("restoreFocus") });
  }

  // The positioner, not the content: the sheet's cancel may sit beside the
  // content, and a press on it leaves the focus there (R73).
  const layer = getPositionerEl(scope) ?? content;
  focusElement(getFirstTabbable(content) ?? content);
  const disposeTabs = proxyTabFocus(content, { triggerNode: () => getTriggerEl(scope) });
  return () => {
    disposeTabs();
    if (!prop("restoreFocus")) return;
    if (focusWentElsewhere(scope.getDoc(), layer, scope.getActiveElement())) return;
    const target = finalFocus();
    restoreFocus(target, layer);
  };
}

export function hideOutside({ prop, computed, scope }: Params): EffectCleanup {
  if (!computed("isModal")) return;
  return hideOthers(
    [
      getContentEl(scope),
      getPositionerEl(scope),
      scope.getById(getBackdropId(scope)),
      ...(prop("persistentElements")?.() ?? []),
    ],
    { inert: true },
  );
}

/**
 * B closes the surface — but only while nothing is held: the engage scope is
 * pushed above this one and consumes `back` first, which is what lets a gamepad
 * back out of a channel without losing the panel. A keyboard `back` is left to
 * the dismissable layer, whose Escape veto reverts a typed draft first.
 */
export function captureSurfaceIntents({ prop, computed, scope, send }: Params): EffectCleanup {
  if (computed("presentation") === "inline") return;
  const host = prop("intents");
  const content = getContentEl(scope);
  if (host === null || content === null) return;
  const id = getContentId(scope);
  const stack = getLayerStack(content.ownerDocument);

  return host.pushScope((event) => {
    if (event.intent !== "back" || event.source === "keyboard") return false;
    if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
    send({ type: "CONTENT.DISMISS", reason: "back" });
    return true;
  });
}
