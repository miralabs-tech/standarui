/**
 * The group: the store's bridge to a page, and the three decisions that shape it.
 *
 * **Nothing ever steals the focus.** No `focus()` on arrival, whatever the
 * severity — a notification that yanks the caret out of an input is a bug the
 * severity does not excuse. The only ways in are the hotkey, `api.focusGroup()`
 * and a plain Tab; the only focus write the library performs is the hand-off when
 * the toast a person is standing on leaves under them.
 *
 * **Toasts are not a dismissable layer.** They never touch the layer stack, so a
 * global Escape or a gamepad B keeps dismissing the menus and dialogs above them
 * as if the region were not there. Both act on a toast only once the DOM focus is
 * already inside the region.
 *
 * **The role is on the card, the speech is the announcer's.** The root carries
 * `role="status"` or `role="alert"` so a screen reader can navigate to it, and
 * `aria-live="off"` so it does not also read itself — the text goes through the
 * document's shared live region, which is created empty and up front and is
 * therefore the only one that reliably speaks.
 */

import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { addDomEvent } from "../../dom/event";
import { observeChildren } from "../../dom/observers";
import { contains, isHTMLElement } from "../../dom/query";
import { getNextIndex, getRemovalIndex } from "../../focus/roving-focus";
import { trackScrollEdges } from "../../interaction/scroll-edges";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement } from "../../nav";
import { invariant } from "../../utils/invariant";
import { getGroupEl, getToastEl, getToastEls } from "./toast.dom";
import type { ResolvedToastGroupMachineProps, ToastGroupSchema, ToastRecord } from "./toast.types";

type Params = MachineParams<ToastGroupSchema>;

const DEFAULT_HOTKEY: readonly string[] = ["F6"];
const DEFAULT_GAP = 8;

/** One hold, shared by the pointer and the focus: two acquisitions, two releases. */
const INTERACTION = "interaction";
const PAGE_IDLE = "page-hidden";

const MODIFIERS: Readonly<Record<string, (event: KeyboardEvent) => boolean>> = {
  altKey: (event) => event.altKey,
  ctrlKey: (event) => event.ctrlKey,
  metaKey: (event) => event.metaKey,
  shiftKey: (event) => event.shiftKey,
};

/**
 * Every entry has to match. A modifier is named by its flag; anything else is
 * compared against `event.code` first — `KeyT` survives a Dvorak layout — and
 * then against `event.key`, which is what `"F6"` and `"Escape"` answer to.
 */
export function matchesHotkey(event: KeyboardEvent, hotkey: readonly string[]): boolean {
  if (hotkey.length === 0) return false;
  return hotkey.every((entry) => {
    const modifier = MODIFIERS[entry];
    if (modifier !== undefined) return modifier(event);
    return event.code === entry || event.key === entry;
  });
}

/**
 * By the record's own id, never by a position in a DOM walk: the index this
 * returns is read straight back out of `toasts`, so a walk whose order an adapter
 * had inverted would answer with a different record than the one under the focus.
 */
function focusedIndex(params: Params): number {
  const { scope, context } = params;
  const active = scope.getActiveElement();
  if (active === null) return -1;
  return context
    .get("toasts")
    .findIndex((record) => contains(getToastEl(scope, record.id), active));
}

function focusedToast(params: Params): ToastRecord | undefined {
  const index = focusedIndex(params);
  return index === -1 ? undefined : params.context.get("toasts")[index];
}

/**
 * The APG hand-off, and the whole reason `getRemovalIndex` is shared with the
 * roving composites: when the toast under the focus leaves, the focus goes to the
 * next one, then to the previous one, and only then back where it came from.
 * Done *before* the dismissal, because the node stays mounted for its exit — a
 * focus left on a card that is fading out is a focus nobody can see.
 */
function handOffFocus(params: Params, id: string | undefined): void {
  const { scope, refs, context } = params;
  const group = getGroupEl(scope);
  const active = scope.getActiveElement();
  const leaving = id === undefined ? group : getToastEl(scope, id);
  if (!contains(leaving, active)) return;

  const toasts = context.get("toasts");
  const index = id === undefined ? -1 : toasts.findIndex((record) => record.id === id);
  const target = index === -1 ? -1 : getRemovalIndex(index, { count: toasts.length });
  const next = target === -1 ? undefined : toasts[target];
  const node = next === undefined ? null : getToastEl(scope, next.id);
  if (node !== null) {
    focusElement(node);
    return;
  }
  const back = refs.get("returnFocusEl");
  if (back?.isConnected === true) focusElement(back);
}

function setInteractionPause(params: Params, paused: boolean): void {
  const toaster = params.prop("toaster");
  if (paused === params.context.get("pausedByInteraction")) return;
  params.context.set("pausedByInteraction", paused);
  if (paused) toaster.pause(INTERACTION);
  else toaster.resume(INTERACTION);
}

function pointerInside(params: Params): boolean {
  const group = getGroupEl(params.scope);
  return group?.matches(":hover") ?? false;
}

function focusInside(params: Params): boolean {
  return contains(getGroupEl(params.scope), params.scope.getActiveElement());
}

export const machine: Machine<ToastGroupSchema> = createMachine<ToastGroupSchema>({
  props({ props }) {
    const { toaster } = props;
    // Thrown rather than defaulted: there is no store to invent, and a region
    // rendered without one would sit there silently rendering nothing.
    invariant(
      toaster !== undefined,
      "a toast group needs a `toaster` — build one with `createToaster()`",
    );
    const resolved: ResolvedToastGroupMachineProps = {
      hotkey: DEFAULT_HOTKEY,
      pauseOnInteraction: true,
      pauseOnPageIdle: true,
      topLayer: true,
      intents: null,
      translations: {},
      ...props,
      toaster,
    };
    return resolved;
  },

  context({ prop, bindable }) {
    return {
      toasts: bindable<readonly ToastRecord[]>(() => ({
        defaultValue: prop("toaster").getVisibleToasts(),
        // Identity is not enough and deep equality is too much: what an adapter
        // has to re-render for is a toast arriving, leaving, starting its exit or
        // being updated — which is exactly the `(id, status, version)` sequence.
        isEqual: (a, b) =>
          a.length === b.length &&
          a.every((record, index) => {
            const other = b[index];
            return (
              other !== undefined &&
              record.id === other.id &&
              record.status === other.status &&
              record.version === other.version
            );
          }),
        debugLabel: "toast toasts",
      })),
      pausedByInteraction: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    visibleCount: ({ context }) => context.get("toasts").length,
    frontId: ({ context }) => context.get("toasts")[0]?.id ?? null,
  },

  refs() {
    return { returnFocusEl: null, announced: new Map<string, number>() };
  },

  // Pure: a store read, no document. The server renders the region it will hydrate.
  initialState({ prop }) {
    return prop("toaster").getVisibleToasts().length > 0 ? "active" : "empty";
  },

  effects: ["subscribeStore"],

  watch({ context, track, send }) {
    track(
      () => [context.get("toasts")],
      () => send({ type: "TOASTS.CHANGED" }),
    );
  },

  on: {
    "STORE.SYNC": { actions: ["syncToasts"] },
  },

  states: {
    empty: {
      on: {
        "TOASTS.CHANGED": { guard: "hasToasts", target: "active" },
      },
    },

    active: {
      effects: [
        "trackHotkey",
        "trackDocumentVisibility",
        "measureStack",
        "announceToasts",
        "captureIntents",
        "presentGroup",
        "trackGroupScrollEdges",
      ],
      on: {
        // The first branch is what keeps a non-empty change inside `active`; the
        // measurement is the observer's business, not a transition's.
        "TOASTS.CHANGED": [
          { guard: "hasToasts" },
          { target: "empty", actions: ["restoreFocusIfInside", "clearInteractionPause"] },
        ],
        "GROUP.POINTER_ENTER": { guard: "canPauseOnInteraction", actions: ["pauseForInteraction"] },
        "GROUP.POINTER_LEAVE": { guard: "canResumePointer", actions: ["resumeInteraction"] },
        "GROUP.FOCUS_ENTER": {
          actions: ["rememberReturnFocus", "pauseForInteractionIfEnabled"],
        },
        "GROUP.FOCUS_LEAVE": { actions: ["resumeInteractionIfEnabled", "forgetReturnFocus"] },
        "GROUP.HOTKEY": { actions: ["focusGroup"] },
        "TOAST.NAVIGATE": { actions: ["moveFocus"] },
        "TOAST.DISMISS": { actions: ["dismissToast"] },
        "TOAST.EXITED": { actions: ["removeToast"] },
        "DOC.VISIBILITY": [
          { guard: "isHiddenAndPausable", actions: ["pauseForPageIdle"] },
          { guard: "canResumePageIdle", actions: ["resumePageIdle"] },
        ],
      },
    },
  },

  implementations: {
    guards: {
      hasToasts: ({ context }) => context.get("toasts").length > 0,
      canPauseOnInteraction: ({ prop }) => prop("pauseOnInteraction"),
      // Both conditions have to fall away before the clock restarts: a pointer
      // leaving a region the keyboard is still inside has released nothing.
      canResumePointer: (params) =>
        params.context.get("pausedByInteraction") && !focusInside(params),
      isHiddenAndPausable: ({ prop, event }) =>
        event.type === "DOC.VISIBILITY" && event.hidden && prop("pauseOnPageIdle"),
      canResumePageIdle: ({ prop, event }) =>
        event.type === "DOC.VISIBILITY" && !event.hidden && prop("pauseOnPageIdle"),
    },

    actions: {
      syncToasts({ context, event }) {
        if (event.type === "STORE.SYNC") context.set("toasts", event.toasts);
      },

      pauseForInteraction: (params) => setInteractionPause(params, true),
      resumeInteraction: (params) => setInteractionPause(params, false),

      pauseForInteractionIfEnabled(params) {
        if (params.prop("pauseOnInteraction")) setInteractionPause(params, true);
      },

      resumeInteractionIfEnabled(params) {
        const { event, scope } = params;
        if (event.type !== "GROUP.FOCUS_LEAVE") return;
        // Moving between two toasts is not leaving, and a pointer still resting
        // on the region holds the clock on its own.
        if (contains(getGroupEl(scope), event.relatedTarget as Node | null)) return;
        if (pointerInside(params)) return;
        setInteractionPause(params, false);
      },

      clearInteractionPause: (params) => setInteractionPause(params, false),

      pauseForPageIdle({ prop }) {
        prop("toaster").pause(PAGE_IDLE);
      },

      resumePageIdle({ prop }) {
        prop("toaster").resume(PAGE_IDLE);
      },

      rememberReturnFocus({ refs, scope, event }) {
        if (event.type !== "GROUP.FOCUS_ENTER") return;
        const previous = event.relatedTarget;
        // Only the focus arriving from outside is worth remembering — moving
        // between two toasts must not overwrite where the person came from.
        if (contains(getGroupEl(scope), previous as Node | null)) return;
        // `isHTMLElement` rather than `instanceof`: the check has to survive an
        // iframe, where the constructor is a different realm's.
        refs.set("returnFocusEl", isHTMLElement(previous) ? previous : null);
      },

      forgetReturnFocus({ refs, scope, event }) {
        if (event.type !== "GROUP.FOCUS_LEAVE") return;
        if (contains(getGroupEl(scope), event.relatedTarget as Node | null)) return;
        refs.set("returnFocusEl", null);
      },

      focusGroup({ scope }) {
        focusElement(getGroupEl(scope));
      },

      moveFocus(params) {
        const { event, context, scope } = params;
        if (event.type !== "TOAST.NAVIGATE") return;
        const toasts = context.get("toasts");
        if (toasts.length === 0) return;
        // No loop: a stack has a front and a back, and wrapping from the last
        // card to the first would read as the list having moved under the focus.
        const next = getNextIndex(focusedIndex(params), event.to, {
          count: toasts.length,
          loop: false,
        });
        const record = toasts[next];
        if (record !== undefined) focusElement(getToastEl(scope, record.id));
      },

      dismissToast(params) {
        const { event, prop } = params;
        if (event.type !== "TOAST.DISMISS") return;
        handOffFocus(params, event.id);
        prop("toaster").dismiss(event.id, event.reason);
      },

      removeToast({ event, prop }) {
        if (event.type === "TOAST.EXITED") prop("toaster").remove(event.id);
      },

      restoreFocusIfInside({ refs, scope }) {
        const back = refs.get("returnFocusEl");
        refs.set("returnFocusEl", null);
        if (back === null || !back.isConnected) return;
        const active = scope.getActiveElement();
        // The last card has already left, so the focus is on `<body>` — or on
        // nothing at all, which is the same statement in a different browser.
        if (active !== null && active.tagName !== "BODY") return;
        focusElement(back);
      },
    },

    effects: {
      /**
       * Machine level, so the subscription outlives the empty ↔ active flip — and
       * it is this subscription that gates the store's clock: while no group is
       * mounted, no timer runs.
       */
      subscribeStore({ prop, send }) {
        const toaster = prop("toaster");
        send({ type: "STORE.SYNC", toasts: toaster.getVisibleToasts() });
        return toaster.subscribe((toasts) => send({ type: "STORE.SYNC", toasts }));
      },

      trackHotkey({ scope, prop, send }) {
        const group = getGroupEl(scope);
        if (group === null) return;
        // In capture, on the document, like every other global this library
        // installs: a page-level shortcut cannot depend on where the focus is.
        return addDomEvent(
          group.ownerDocument,
          "keydown",
          (event) => {
            if (!matchesHotkey(event, prop("hotkey"))) return;
            event.preventDefault();
            send({ type: "GROUP.HOTKEY" });
          },
          { capture: true },
        );
      },

      trackDocumentVisibility({ scope, send }) {
        const group = getGroupEl(scope);
        if (group === null) return;
        const doc = group.ownerDocument;
        return addDomEvent(doc, "visibilitychange", () => {
          send({ type: "DOC.VISIBILITY", hidden: doc.hidden });
        });
      },

      /**
       * The expanded position of every card, written **straight onto the node**:
       * it changes with every layout frame and no state depends on it, which is
       * the same trade `data-scroll` and `--sui-transform-origin` already make.
       *
       * The sheet cannot do this arithmetic itself. The cards are stacked in one
       * grid cell so that they can transform over each other, and a stacked card
       * has no idea how tall the ones in front of it are.
       */
      measureStack({ scope, prop }) {
        const group = getGroupEl(scope);
        const win = group?.ownerDocument.defaultView ?? null;
        if (group === null || win === null || !("ResizeObserver" in win)) return;
        // The core writes the offset already signed, so the sheet never has to
        // work out which way this placement grows.
        const direction = prop("toaster").placement.startsWith("bottom") ? -1 : 1;

        let observed: Element[] = [];

        const measure = (): void => {
          const style = win.getComputedStyle(group);
          const gap = Number.parseFloat(style.getPropertyValue("--sui-toast-gap"));
          const step = Number.isNaN(gap) ? DEFAULT_GAP : gap;
          let offset = 0;
          for (const node of getToastEls(scope)) {
            node.style.setProperty("--sui-toast-offset", `${offset * direction}px`);
            offset += node.offsetHeight + step;
          }
          // What the expanded stack occupies, so the region can cover it: a
          // hover that falls off the bottom of the region collapses the stack
          // out from under the pointer that was reaching for it.
          group.style.setProperty("--sui-toast-stack-size", `${Math.max(0, offset - step)}px`);
        };

        const observer = new win.ResizeObserver(() => measure());
        const sync = (): void => {
          for (const node of observed) observer.unobserve(node);
          observed = getToastEls(scope);
          for (const node of observed) observer.observe(node);
          measure();
        };

        sync();
        // A card added or removed changes every offset behind it, and a mutation
        // is the only signal for that — a `ResizeObserver` says nothing about a
        // node that has left.
        const stopChildren = observeChildren(group, sync);
        return () => {
          stopChildren();
          observer.disconnect();
        };
      },

      /**
       * One announcement per `(id, version)`. A re-render is not news, a promotion
       * out of the queue is — that is the moment a queued toast becomes something
       * a person can perceive, and the moment it is entitled to be read out.
       */
      announceToasts({ scope, prop, refs }) {
        const group = getGroupEl(scope);
        if (group === null) return;
        const announcer = getLiveAnnouncer(group.ownerDocument);
        const toaster = prop("toaster");

        const speak = (toasts: readonly ToastRecord[]): void => {
          const announced = refs.get("announced");
          const live = new Set<string>();
          for (const record of toasts) {
            live.add(record.id);
            if (record.status !== "visible") continue;
            if (announced.get(record.id) === record.version) continue;
            announced.set(record.id, record.version);
            const text =
              record.description === undefined
                ? record.title
                : `${record.title}. ${record.description}`;
            announcer.announce(text, record.politeness);
          }
          for (const id of [...announced.keys()]) {
            if (!live.has(id)) announced.delete(id);
          }
        };

        speak(toaster.getVisibleToasts());
        return toaster.subscribe(speak);
      },

      /**
       * Not trapped, and the handler answers only while the DOM focus is already
       * inside the region: B has to keep dismissing whatever is on the layer stack
       * as though the toasts were not there.
       */
      captureIntents(params) {
        const { prop, send, computed } = params;
        const host = prop("intents");
        if (host === null || host === undefined) return;
        return host.pushScope((event) => {
          if (!focusInside(params)) return false;
          switch (event.intent) {
            case "moveDown":
              send({ type: "TOAST.NAVIGATE", to: "next" });
              return true;
            case "moveUp":
              send({ type: "TOAST.NAVIGATE", to: "prev" });
              return true;
            case "home":
              send({ type: "TOAST.NAVIGATE", to: "first" });
              return true;
            case "end":
              send({ type: "TOAST.NAVIGATE", to: "last" });
              return true;
            case "back": {
              const id = focusedToast(params)?.id ?? computed("frontId") ?? undefined;
              if (id === undefined) return false;
              send({ type: "TOAST.DISMISS", id, reason: "back" });
              return true;
            }
            default:
              return false;
          }
        });
      },

      /**
       * The top layer, through the Popover API and with no light-dismiss: a modal
       * `<dialog>` anywhere on the page paints over any z-index, and a toast that
       * disappears behind one is a toast that did not happen. `manual` because
       * nothing here is dismissed by clicking elsewhere. Where the API is missing
       * the sheet's `--sui-z-toast` is the fallback, and it needs no code.
       */
      presentGroup({ scope, prop }) {
        const group = getGroupEl(scope);
        if (!prop("topLayer") || group === null || typeof group.showPopover !== "function") return;

        const lift = (): boolean => {
          try {
            group.showPopover();
            return true;
          } catch {
            return false;
          }
        };

        group.setAttribute("popover", "manual");
        if (!lift()) {
          // A region that cannot reach the top layer still renders: the sheet's
          // `--sui-z-toast` is the fallback, and it needs nothing from here.
          group.removeAttribute("popover");
          return;
        }

        /**
         * The top layer is a stack, not a plane: the last element to enter it
         * paints over everything already in it. Showing once was therefore only
         * half of what the comment above promises — a modal `<dialog>` opened
         * *after* the region covered the toasts, which is the exact case the
         * Popover API was reached for in the first place. Leaving and re-entering
         * is what moves an element back to the top.
         *
         * `showModal()` is observable because it writes `open` onto the dialog,
         * and nothing else has to be watched to catch it: a `<dialog open>`
         * rendered declaratively is *non-modal* and never reaches the top layer,
         * so there is no childList case and the observer stays an attribute
         * filter rather than a document-wide subtree scan.
         *
         * The one gap left, and it is named rather than papered over: another
         * `[popover]` shown after this one also lands above it, and a popover
         * entering the top layer changes no attribute and fires no event that
         * reaches this document. Consumers stacking a manual popover over a toast
         * region are on their own.
         */
        const doc = group.ownerDocument;
        const win = doc.defaultView;
        let observer: MutationObserver | null = null;
        if (win !== null) {
          observer = new win.MutationObserver((records) => {
            for (const record of records) {
              const target = record.target as Element;
              if (target.tagName !== "DIALOG" || !target.hasAttribute("open")) continue;
              try {
                group.hidePopover();
              } catch {
                // Already out of the top layer; re-entering is still the point.
              }
              if (!lift()) group.removeAttribute("popover");
              return;
            }
          });
          observer.observe(doc.documentElement, {
            subtree: true,
            attributes: true,
            attributeFilter: ["open"],
          });
        }

        return () => {
          observer?.disconnect();
          try {
            group.hidePopover();
          } catch {
            // Already hidden — the attribute below is still ours to take back.
          }
          group.removeAttribute("popover");
        };
      },

      trackGroupScrollEdges({ scope }) {
        return trackScrollEdges(getGroupEl(scope));
      },
    },
  },
});
