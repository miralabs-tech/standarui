/**
 * The dialog, and the two decisions the rest of the overlay family inherits.
 *
 * **`context.open` is the only source of truth; the state is a projection of it.**
 * Transitions never target `open`/`closed` directly — they write the bindable, and
 * a `watch` sends `OPEN.SYNC` to move the state. One path in, one path out, and the
 * controlled semantics come for free: a consumer that declines to update `open`
 * keeps the dialog open, which is exactly what "controlled" is supposed to mean.
 *
 * **The order the effects install in is a contract, not a detail.** The interpreter
 * tears down in reverse, so `hideOutside` has to be *installed after* the focus
 * management in order to be *removed before* it — otherwise focus is handed back to
 * an element that is still `inert`, and the browser silently refuses it. Read the
 * `open` state's list bottom-up to see the teardown: parts, intents, the page given
 * back, focus restored, scroll released, layer popped.
 *
 * Nothing here is density-aware beyond `computed.presentation`, which exists only
 * to write `data-presentation`. A sheet and a centred modal are the same machine.
 */

import { focusElement, getFirstTabbable, trackInputModality } from "@standarx/nav";
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
import type { Scope } from "../../machine/scope";
import type { Machine } from "../../machine/types";
import type { Density, Direction } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import {
  getBackdropEl,
  getCancelTriggerEl,
  getContentEl,
  getContentId,
  getDirAnchorEl,
  getEnvironmentEl,
  getPositionerEl,
  getTriggerEl,
  hasPart,
} from "./dialog.dom";
import type { DialogRole, DialogSchema } from "./dialog.types";

/**
 * Where focus goes when the surface opens, before any fallback. An alert dialog
 * opens on its *least destructive* action (APG `alertdialog`), and the fallback
 * both callers share — the first tabbable inside the surface — is the opposite of
 * that the moment the author writes the confirm button first, which reads
 * naturally and is what people write. Returning `null` hands the decision back:
 * the trap falls through to its own first-tabbable, and so does `focusInitial`.
 */
function resolveInitialFocus(
  requested: (() => HTMLElement | null) | undefined,
  role: DialogRole,
  scope: Scope,
): HTMLElement | null {
  return requested?.() ?? (role === "alertdialog" ? getCancelTriggerEl(scope) : null);
}

export const machine: Machine<DialogSchema> = createMachine<DialogSchema>({
  props({ props }) {
    const modal = props.modal ?? true;
    const role = props.role ?? "dialog";
    return {
      defaultOpen: false,
      presentation: "auto",
      restoreFocus: true,
      preventScroll: true,
      closeOnEscape: true,
      disabled: false,
      intents: null,
      ...props,
      role,
      modal,
      // An alert dialog interrupts the workflow to get a decision, and the whole
      // point of the role is that you do not leave it by accident: a click in the
      // gutter must not cancel a destructive confirmation. Decided in the machine
      // rather than in a React wrapper so every adapter inherits it, and still
      // overridable — a consumer who passes `false` explicitly means it.
      closeOnInteractOutside: props.closeOnInteractOutside ?? role !== "alertdialog",
      // A non-modal surface leaves the page reachable on purpose, so a trap that
      // held Tab inside it would be lying about where the user is allowed to go.
      trapFocus: modal && (props.trapFocus ?? true),
    };
  },

  context({ prop, bindable }) {
    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "dialog open",
      })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      hasTitle: bindable<boolean>(() => ({ defaultValue: false })),
      hasDescription: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    presentation({ prop, context }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      // iPhone is not `touch` and iPad is not `desktop`: the mapping is a design
      // decision per component, and here a coarse pointer gets the bottom sheet.
      return context.get("density") === "touch" ? "sheet" : "center";
    },
  },

  refs() {
    return { finalFocusEl: null };
  },

  // Pure, so the server renders the markup the client will hydrate into.
  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackEnvironment", "trackModality"],

  watch({ context, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    // A dependency like any other, so an adapter that re-renders the title into
    // existence is in step immediately rather than one mutation record later.
    track(
      () => [hasPart(scope, "title"), hasPart(scope, "description")],
      () => action(["syncParts"]),
    );
  },

  on: {
    "TRIGGER.CLICK": { guard: "isEnabled", actions: ["openDialog"] },
    "CLOSE.CLICK": { actions: ["closeDialog"] },
    "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closeDialog"] },
    "CONTENT.FOCUS": { actions: ["focusInitial"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
  },

  states: {
    /**
     * The capture is an *exit* action rather than the `open` state's entry: the
     * interpreter installs a state's effects before running its entry actions,
     * and `hideOutside` makes the trigger's ancestor `inert`, which blurs it. By
     * then there is nothing left to remember. Leaving `closed` happens before any
     * of that (spec §3 puts it in `entry`; this is the same intent, one step
     * earlier, because the interpreter's order makes `entry` too late).
     */
    closed: { exit: ["captureFinalFocus"] },
    open: {
      effects: [
        "trackSurfaceDir",
        "trackDismissable",
        "lockPageScroll",
        "trapDialogFocus",
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
      /**
       * Read live from the props rather than snapshotted into the dismissable
       * layer at install time: a consumer that flips `closeOnEscape` while the
       * dialog is open means it from that moment, not from the next open.
       */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        return prop("closeOnInteractOutside");
      },
    },

    actions: {
      openDialog({ context }) {
        context.set("open", true);
      },

      closeDialog({ context }) {
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
        // `<body>` is "nobody had focus", and restoring to it at the end would be
        // indistinguishable from the browser doing nothing — except that it would
        // also cancel whatever the consumer's `finalFocus` wanted.
        refs.set("finalFocusEl", active === null || active.tagName === "BODY" ? null : active);
      },

      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      syncParts({ context, scope }) {
        context.set("hasTitle", hasPart(scope, "title"));
        context.set("hasDescription", hasPart(scope, "description"));
      },

      focusInitial({ prop, scope }) {
        const content = getContentEl(scope);
        if (content === null) return;
        focusElement(
          resolveInitialFocus(prop("initialFocus"), prop("role"), scope) ??
            getFirstTabbable(content) ??
            content,
        );
      },
    },

    effects: {
      /**
       * Machine level, not state level: the presentation has to be resolved before
       * the first open, and the tracker only reports changes — hence the seed.
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

      trackEnvironment({ scope, send }) {
        const node = getEnvironmentEl(scope);
        const onChange = (density: Density): void => send({ type: "ENVIRONMENT.SYNC", density });
        onChange(resolveEnvironment(node).density);
        return watchEnvironment(node, {
          onChange: (environment) => onChange(environment.density),
        });
      },

      /**
       * No listener, and no `data-focus-visible` on any part: the dialog's three
       * buttons take their ring from `html[data-snav-input]`, and this only has to
       * make sure the attribute is there to read. A page whose only sui component
       * is a dialog had nothing else posting it, and every ring on the surface
       * fell back to the browser heuristic that CDC §4.4 rules out.
       */
      trackModality({ scope }) {
        // Guarded rather than assumed: the unit suite runs a full open/dismiss
        // cycle with no document in the room, and what this feeds is a stylesheet
        // rule, which needs one by definition. `getDoc()` throws where the other
        // DOM effects lean on helpers that return null.
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      trackDismissable({ scope, prop, send }) {
        return trackDismissableLayer(getContentEl(scope), {
          id: getContentId(scope),
          type: "dialog",
          modal: prop("modal"),
          parentId: prop("parentId"),
          // Without the trigger here, clicking it to close would dismiss on
          // pointerdown and reopen on the click that follows.
          exclude: () => [getTriggerEl(scope), ...(prop("persistentElements")?.() ?? [])],
          // A literal rather than the prop, exactly like the pointer channel it
          // sits next to: the layer opens the gate, `canDismiss` decides, and it
          // reads `closeOnInteractOutside` live. Passing `prop(...)` here would
          // snapshot the answer at install time and a consumer that flips the prop
          // mid-open would not be heard until the next open.
          dismissOnFocusOutside: true,
          onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
        });
      },

      // The document comes from the surface rather than from the scope: no
      // surface, nothing to lock, and no reason to demand a document exist.
      lockPageScroll({ prop, scope }) {
        if (!prop("modal") || !prop("preventScroll")) return;
        return lockScroll(getContentEl(scope)?.ownerDocument);
      },

      trapDialogFocus({ prop, refs, scope }) {
        if (!prop("trapFocus")) return;
        const content = getContentEl(scope);
        const id = getContentId(scope);
        return trapFocus(content, {
          initialFocus: () => resolveInitialFocus(prop("initialFocus"), prop("role"), scope),
          finalFocus: () => prop("finalFocus")?.() ?? refs.get("finalFocusEl"),
          restoreFocus: prop("restoreFocus"),
          loop: true,
          // A layer opened from the surface is portalled out of it and declares
          // this one as its parent: its focus is the dialog's own.
          owns: (target) =>
            content !== null && getLayerStack(content.ownerDocument).containsTarget(id, target),
        });
      },

      /**
       * The non-modal half of the pair, and mutually exclusive with the trap. Tab
       * out of a portalled surface has to land after the trigger, and the focus
       * has to come back by hand because no trap captured it on the way in. A
       * trigger disabled while open takes nothing, so `restoreFocus` falls back on
       * its neighbour (R61).
       */
      proxyTabs({ prop, refs, scope }) {
        if (prop("trapFocus")) return;
        const dispose = proxyTabFocus(getContentEl(scope), {
          triggerNode: () => getTriggerEl(scope),
        });
        if (!prop("restoreFocus")) return dispose;
        return () => {
          // Only if the user is still inside: closing a non-modal surface while
          // they are typing somewhere else must not yank the caret away.
          const content = getContentEl(scope);
          const inside = contains(content, scope.getActiveElement());
          dispose();
          if (!inside) return;
          const target = prop("finalFocus")?.() ?? refs.get("finalFocusEl");
          restoreFocus(target, content);
        };
      },

      /**
       * Three things have to be in the kept list, and each one is a bug if it is
       * missing.
       *
       * The **backdrop**, because `inert` on it swallows the pointerdown that
       * dismisses the dialog. The **positioner**, because it is the backdrop's
       * sibling: hiding everything around the backdrop marks the positioner, and
       * the positioner is the content's own parent — the surface would go inert
       * with the page. And **`persistentElements`**, because Monaco and xterm
       * mount their widgets straight onto `body`, outside the surface entirely.
       */
      hideOutside({ prop, scope }) {
        if (!prop("modal")) return;
        return hideOthers(
          [
            getContentEl(scope),
            getPositionerEl(scope),
            getBackdropEl(scope),
            ...(prop("persistentElements")?.() ?? []),
          ],
          { inert: true, layer: getContentId(scope) },
        );
      },

      /**
       * Trapped: nothing under the dialog sees a direction again until it closes.
       * Only `back` is answered. Since `@standarx/nav` 0.3.1 an unclaimed `select`
       * crosses the trap with `consumed: false`, so A and Enter still click the
       * focused control inside; every other intent a scope inside leaves unclaimed
       * (`secondary`, `contextMenu`, `scrollX`/`scrollY`, moves) is still swallowed
       * by the trap. `tabNext`/`tabPrev` escape a trap by construction because
       * Tab belongs to the focus trap.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        const content = getContentEl(scope);
        if (host === null || host === undefined || content === null) return;
        const id = getContentId(scope);
        const stack = getLayerStack(content.ownerDocument);
        return host.pushScope(
          (event) => {
            if (event.intent !== "back") return false;
            // B and Escape share one lock: a dialog Escape cannot close must not
            // close to a gamepad either.
            if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
            send({ type: "CONTENT.DISMISS", reason: "back" });
            return true;
          },
          // Names the surface, so a scope pushed before this one (React runs a
          // child's effect first) is still asked when its own `within` is inside.
          { trapped: true, within: () => getContentEl(scope) },
        );
      },

      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        const content = getContentEl(scope);
        const close = query(content, '[data-part~="dialog:close-trigger"]');
        warn(
          isDev() && close !== null && !hasAccessibleName(close),
          "a dialog close trigger has no accessible name — give it text, `aria-label` or `title`",
        );
        return observeChildren(content, () => send({ type: "PARTS.SYNC" }));
      },
    },
  },
});
