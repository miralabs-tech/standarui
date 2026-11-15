/**
 * A popover is a non-modal dialog that anchors instead of centring.
 *
 * It reuses the dialog's two structural decisions verbatim — `context.open` is the
 * only source of truth and the state is a projection of it, and the order the
 * effects install in is a contract because the interpreter tears down in reverse —
 * and adds one of its own.
 *
 * **The position is installed before the focus, which is the reverse of nothing
 * the dialog had to decide.** Focus lands in the surface the moment the trap or
 * the entry action runs; if the surface is still sitting at `0,0` at that point,
 * the browser scrolls the page to `0,0` to reveal it. A dialog never had this
 * problem because a dialog has nothing to position.
 *
 * **The sheet is the same machine, one effect short.** `PRESENTATION.SYNC` targets
 * `open` with `reenter: true`, so a density flip while the surface is open tears
 * the whole open state down and builds it back: the position tracker leaves, the
 * scroll lock arrives, the geometry changes. Without the re-entry a sheet would
 * still be driven by `trackPosition`.
 */

import { hasAccessibleName } from "../../a11y/accessible-name";
import { hideOthers } from "../../a11y/aria-hidden";
import { lockScroll } from "../../a11y/scroll-lock";
import { observeChildren } from "../../dom/observers";
import { contains, query } from "../../dom/query";
import { resolveDir } from "../../dom/text-dir";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { trapFocus } from "../../focus/focus-trap";
import { proxyTabFocus } from "../../focus/proxy-tab-focus";
import { restoreFocus } from "../../focus/restore-focus";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack, isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import { focusElement, getFirstTabbable, trackInputModality } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { Density, Direction } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import {
  getAnchorEl,
  getArrowEl,
  getBackdropEl,
  getContentEl,
  getContentId,
  getDirAnchorEl,
  getEnvironmentEl,
  getPositionerEl,
  getTriggerEl,
  hasPart,
} from "./popover.dom";
import type { PopoverSchema } from "./popover.types";

/** The inline properties `trackPosition` writes and never cleans up itself. */
const POSITION_STYLES = ["position", "top", "left", "transform", "width"] as const;

export const machine: Machine<PopoverSchema> = createMachine<PopoverSchema>({
  props({ props }) {
    const modal = props.modal ?? false;
    return {
      defaultOpen: false,
      presentation: "auto",
      placement: "bottom",
      // Air only. The arrow's depth is added on top by the effect, which measures
      // the rendered node — `arrowSize` clamps the cross axis and offsets nothing.
      gap: 8,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      // Measured to the arrow's **box** edge, the convention `computePosition`
      // clamps in. Derived as a ratio rather than copied as a
      // literal: the margin does not scale with the radius.
      arrowPadding: 20,
      matchWidth: false,
      strategy: "fixed",
      autoFocus: true,
      restoreFocus: true,
      closeOnEscape: true,
      closeOnInteractOutside: true,
      disabled: false,
      intents: null,
      ...props,
      modal,
      // The same words as the dialog: a surface that leaves the page reachable on
      // purpose must not hold Tab inside itself.
      trapFocus: modal && (props.trapFocus ?? true),
      preventScroll: props.preventScroll ?? modal,
      // A popover hung off a text field wants to survive the caret moving on, and
      // a non-modal surface is exactly the one a focus can walk out of.
      closeOnFocusOutside: props.closeOnFocusOutside ?? !modal,
    };
  },

  context({ prop, bindable }) {
    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "popover open",
      })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      // Seeded from the prop rather than from a constant: the server renders
      // `data-side` from this, and the first paint has to agree with the markup.
      currentPlacement: bindable(() => ({ defaultValue: prop("placement") })),
      hasTitle: bindable<boolean>(() => ({ defaultValue: false })),
      hasDescription: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    presentation({ prop, context }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      // A coarse pointer gets the sheet, which is the iPhone behaviour. An iPad is
      // `touch` too and is the one platform where the anchored popover exists —
      // so an iPad app declares `presentation="anchored"`. The library cannot
      // infer the device.
      return context.get("density") === "touch" ? "sheet" : "anchored";
    },
  },

  refs() {
    return { finalFocusEl: null };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackEnvironment", "trackModality"],

  watch({ context, computed, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    track(
      () => [computed("presentation")],
      () => send({ type: "PRESENTATION.SYNC" }),
    );
    // No `arrow` here, and none in the context either: the position effect measures
    // the rendered node itself, one source of truth, and it runs before `trackParts`
    // could have told it anything. A `hasArrow` flag would be state nobody reads.
    track(
      () => [hasPart(scope, "title"), hasPart(scope, "description")],
      () => action(["syncParts"]),
    );
  },

  on: {
    // A disclosure, not the dialog's open-only trigger: the same button closes it.
    "TRIGGER.CLICK": { guard: "isEnabled", actions: ["togglePopover"] },
    "TRIGGER.KEYDOWN": { guard: "shouldEnterOnTab", actions: ["focusFirstInside"] },
    "CLOSE.CLICK": { actions: ["closePopover"] },
    "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closePopover"] },
    "CONTENT.FOCUS": { actions: ["focusInitial"] },
    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    "PRESENTATION.SYNC": { guard: "isOpen", target: "open", reenter: true },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
  },

  states: {
    // Exit rather than the open state's entry, for the dialog's exact reason: the
    // interpreter installs effects before entry actions, and `hideOutside` makes
    // the trigger's ancestor `inert`, which blurs it.
    closed: { exit: ["captureFinalFocus"] },
    open: {
      entry: ["focusInitialIfAuto"],
      effects: [
        "trackSurfaceDir",
        "trackDismissable",
        "lockPageScroll",
        "trackAnchorPosition",
        "trapPopoverFocus",
        "proxyTabs",
        "hideOutside",
        "captureIntents",
        "trackParts",
      ],
    },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
      isOpen: ({ context }) => context.get("open"),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        if (event.reason === "focus-outside") return prop("closeOnFocusOutside");
        return prop("closeOnInteractOutside");
      },

      /**
       * `proxy-tab-focus` handles leaving the surface, never entering it. With
       * `autoFocus: false` the surface opens and the focus stays on the trigger,
       * so Tab has to be what walks in — otherwise the next Tab jumps straight
       * past a surface the user just opened.
       */
      shouldEnterOnTab({ prop, context, event }) {
        if (event.type !== "TRIGGER.KEYDOWN") return false;
        return context.get("open") && !prop("autoFocus") && event.key === "Tab" && !event.shiftKey;
      },
    },

    actions: {
      togglePopover({ context }) {
        context.set("open", !context.get("open"));
      },

      closePopover({ context }) {
        context.set("open", false);
      },

      setOpen({ context, event }) {
        if (event.type === "OPEN.SET") context.set("open", event.open);
      },

      invokeOnDismiss({ prop, event }) {
        if (event.type === "CONTENT.DISMISS") prop("onDismiss")?.({ reason: event.reason });
      },

      captureFinalFocus({ refs, scope }) {
        const active = scope.getActiveElement();
        refs.set("finalFocusEl", active === null || active.tagName === "BODY" ? null : active);
      },

      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      syncPlacement({ context, event }) {
        if (event.type === "POSITION.SYNC") context.set("currentPlacement", event.placement);
      },

      syncParts({ context, scope }) {
        context.set("hasTitle", hasPart(scope, "title"));
        context.set("hasDescription", hasPart(scope, "description"));
      },

      focusInitial({ prop, scope }) {
        const content = getContentEl(scope);
        if (content === null) return;
        focusElement(prop("initialFocus")?.() ?? getFirstTabbable(content) ?? content);
      },

      /**
       * Skipped when a trap is installed, because the trap does the same job with
       * the same fallbacks — running both would focus twice and fire two
       * `focusin` events at whatever is listening.
       */
      focusInitialIfAuto({ prop, scope }) {
        if (!prop("autoFocus") || prop("trapFocus")) return;
        const content = getContentEl(scope);
        if (content === null) return;
        focusElement(prop("initialFocus")?.() ?? getFirstTabbable(content) ?? content);
      },

      focusFirstInside({ scope }) {
        const content = getContentEl(scope);
        if (content === null) return;
        focusElement(getFirstTabbable(content) ?? content);
      },
    },

    effects: {
      trackEnvironment({ scope, send }) {
        const node = getEnvironmentEl(scope);
        const onChange = (density: Density): void => send({ type: "ENVIRONMENT.SYNC", density });
        onChange(resolveEnvironment(node).density);
        return watchEnvironment(node, {
          onChange: (environment) => onChange(environment.density),
        });
      },

      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      trackDismissable({ scope, prop, send }) {
        return trackDismissableLayer(getContentEl(scope), {
          id: getContentId(scope),
          type: "popover",
          modal: prop("modal"),
          parentId: prop("parentId"),
          // The anchor joins the trigger here: a popover anchored to a toolbar
          // must not dismiss when the user clicks the toolbar it points at.
          exclude: () => [
            getTriggerEl(scope),
            getAnchorEl(scope),
            ...(prop("persistentElements")?.() ?? []),
          ],
          // A literal, and the gate is `canDismiss`, which reads the prop live.
          // The focus channel is a separate lock here — that is the whole point
          // of the popover having `closeOnFocusOutside` at all.
          dismissOnFocusOutside: true,
          onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
        });
      },

      lockPageScroll({ prop, scope }) {
        if (!prop("modal") || !prop("preventScroll")) return;
        return lockScroll(getContentEl(scope)?.ownerDocument);
      },

      /**
       * Third, before anything that moves the focus: focus landing in a surface
       * still parked at `0,0` makes the browser scroll the page there to reveal
       * it, and the surface then jumps into place under a scrolled viewport.
       *
       * The sheet branch clears the inline styles a previous anchored pass left
       * behind, and it does it **on install rather than on teardown**.
       * `trackPosition` does not clean up after itself, and cleaning up in the
       * disposer would run while `open` is going false with the node still
       * mounted by `presence` — the surface would snap to `0,0` in the middle of
       * its exit animation. Clearing on the way in has neither problem.
       */
      /**
       * The surface is the one part that emits a `dir` nobody asked for,
       * and the portal is the whole reason. The adapter mounts it into
       * `document.body` (react/src/portal.tsx), outside whatever RTL region the
       * trigger sits in, and inheritance does not cross a portal — so the
       * direction has to be carried over explicitly. What was removed everywhere is the
       * ltr DEFAULT, not the attribute: a part still emits `dir` when the consumer
       * passes one. The default was the bug — emitting a direction nobody asked
       * for *overrode* the inheritance that already worked.
       *
       * Read from the anchor, never from the surface: the surface is in the body
       * and would only report the document's own direction back to itself. And in
       * an effect rather than in `connect`, so the server emits nothing and the
       * first client render has nothing to disagree with.
       */
      trackSurfaceDir({ prop, context, scope }) {
        context.set("surfaceDir", resolveDir(prop("dir"), getDirAnchorEl(scope)));
      },

      trackAnchorPosition({ prop, computed, scope, send }) {
        const positioner = getPositionerEl(scope);
        if (positioner === null) return;

        if (computed("presentation") !== "anchored") {
          for (const name of POSITION_STYLES) positioner.style.removeProperty(name);
          positioner.style.removeProperty("--sui-transform-origin");
          return;
        }

        // One source of truth for the arrow's size, and it is the stylesheet: the
        // token draws it, the effect measures what was drawn. `offsetWidth` is the
        // length along the cross axis and `offsetHeight` the depth into the gap —
        // the CSS box is the same either way, the rotation is a transform and
        // transforms do not move layout boxes.
        const arrow = getArrowEl(scope);
        const arrowSize = arrow?.offsetWidth ?? 0;
        const arrowDepth = arrow?.offsetHeight ?? 0;

        return trackPosition(getAnchorEl(scope), positioner, {
          placement: prop("placement"),
          gap: prop("gap") + arrowDepth,
          offset: prop("offset"),
          flip: prop("flip"),
          shift: prop("shift"),
          padding: prop("padding"),
          arrowSize,
          arrowPadding: prop("arrowPadding"),
          matchWidth: prop("matchWidth"),
          // From the anchor, not from the surface: the surface is portalled into
          // `document.body` and would report the document's direction, while
          // `start`/`end` alignment belongs to the region the anchor sits in.
          dir: resolveDir(prop("dir"), getDirAnchorEl(scope)),
          strategy: prop("strategy"),
          boundary: prop("boundary"),
          getAnchorRect: prop("getAnchorRect"),
          arrowNode: () => getArrowEl(scope),
          onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
        });
      },

      trapPopoverFocus({ prop, refs, scope }) {
        if (!prop("trapFocus")) return;
        const content = getContentEl(scope);
        const id = getContentId(scope);
        return trapFocus(content, {
          initialFocus: () => prop("initialFocus")?.() ?? null,
          finalFocus: () => prop("finalFocus")?.() ?? refs.get("finalFocusEl"),
          restoreFocus: prop("restoreFocus"),
          loop: true,
          owns: (target) =>
            content !== null && getLayerStack(content.ownerDocument).containsTarget(id, target),
        });
      },

      /**
       * The default path for a popover, and the module was written for it. A
       * popover opened from a store has no trigger, only an anchor, and Tab out
       * of it belongs after that anchor rather than at the end of the document. A
       * trigger disabled while open takes nothing, so `restoreFocus` falls back on
       * its neighbour (R61).
       */
      proxyTabs({ prop, refs, scope }) {
        if (prop("trapFocus")) return;
        const dispose = proxyTabFocus(getContentEl(scope), {
          triggerNode: () => getTriggerEl(scope) ?? getAnchorEl(scope),
        });
        if (!prop("restoreFocus")) return dispose;
        return () => {
          const content = getContentEl(scope);
          const inside = contains(content, scope.getActiveElement());
          dispose();
          if (!inside) return;
          const target = prop("finalFocus")?.() ?? refs.get("finalFocusEl");
          restoreFocus(target, content);
        };
      },

      /**
       * The arrow is listed even though it is the positioner's own child, for the
       * same reason the dialog lists the content: the kept list is read as the
       * statement of what stays reachable, and a reader should not have to
       * reconstruct the tree to be sure the tip did not go inert with the page.
       */
      hideOutside({ prop, scope }) {
        if (!prop("modal")) return;
        return hideOthers(
          [
            getContentEl(scope),
            getPositionerEl(scope),
            getArrowEl(scope),
            getBackdropEl(scope),
            ...(prop("persistentElements")?.() ?? []),
          ],
          { inert: true },
        );
      },

      /**
       * **Not `trapped`, and that is a deliberate divergence from the dialog.** A
       * trapped scope answers `consumed` for everything it declines, and the
       * spatial engine sits at the bottom of the stack — so a trapped surface
       * makes its own interior unreachable to a d-pad. Confinement is declared
       * where it belongs instead: `data-snav-trap` on the content, plus the
       * `inert` page when modal.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        const content = getContentEl(scope);
        if (host === null || host === undefined || content === null) return;
        const id = getContentId(scope);
        const stack = getLayerStack(content.ownerDocument);
        return host.pushScope((event) => {
          if (event.intent !== "back") return false;
          if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
          send({ type: "CONTENT.DISMISS", reason: "back" });
          return true;
        });
      },

      /** Watches the **positioner**: the arrow is not inside the content. */
      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        const positioner = getPositionerEl(scope);
        const close = query(positioner, '[data-part~="popover:close-trigger"]');
        warn(
          isDev() && close !== null && !hasAccessibleName(close),
          "a popover close trigger has no accessible name — give it text, `aria-label` or `title`",
        );
        return observeChildren(positioner, () => send({ type: "PARTS.SYNC" }));
      },
    },
  },
});
