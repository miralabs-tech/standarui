/**
 * A menu is the first surface in the library that is an overlay **and** a
 * collection, and every decision below comes from refusing to pay twice for that.
 *
 * **Two states, not four.** `context.open` is the only source of truth and the
 * state is a projection of it — the dialog's and the popover's decision, kept
 * verbatim. The submenu delays are famously modelled as `opening`/`closing`
 * elsewhere; they are not states here, because a state that `open` does not
 * project would break the controlled path the moment a consumer drives `open`
 * from outside. They live in timers that `trackPointerIntent` owns and releases.
 *
 * **The order the effects install in is a contract**, because the interpreter
 * tears down in reverse: `trackAnchorPosition` runs before anything that moves
 * the focus, for the popover's exact reason — a focus landing in a surface still
 * parked at `0,0` makes the browser scroll the page there to reveal it.
 *
 * **Nothing about the item list is in context.** It is read from the live DOM
 * (`menu.dom.ts`), so there is no `isEqual`, no ordering to synchronise and no
 * registry a consumer has to maintain.
 *
 * **The value of an option item is not the menu's either.** `getOptionItemProps`
 * is controlled by the consumer — a divergence from `radio-group`, and a
 * deliberate one: a menu is transient and unmounts, so the checked state belongs
 * to the model behind it.
 */

import { hasAccessibleName } from "../../a11y/accessible-name";
import { hideOthers } from "../../a11y/aria-hidden";
import { lockScroll } from "../../a11y/scroll-lock";
import { getItemValue, getNextItem, isItemDisabled } from "../../collection/dom-collection";
import { addDomEvent } from "../../dom/event";
import { observeChildren } from "../../dom/observers";
import { contains } from "../../dom/query";
import { timeout } from "../../dom/raf";
import { resolveDir } from "../../dom/text-dir";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { proxyTabFocus } from "../../focus/proxy-tab-focus";
import { restoreFocus } from "../../focus/restore-focus";
import { getRovingKeyAction, type RovingAction } from "../../focus/roving-focus";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack, isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { trackLongPress } from "../../interaction/long-press";
import { isPointerHeadingTo, pushTrail } from "../../interaction/safe-triangle";
import { trackScrollEdges as trackEdges } from "../../interaction/scroll-edges";
import { createTypeaheadState, getByTypeahead } from "../../interaction/typeahead";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams, Transition } from "../../machine/types";
import { focusElement, getInputModality, trackInputModality } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { Density, Direction, InputModality, Rect } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import {
  getAnchorEl,
  getBackdropEl,
  getCancelTriggerEl,
  getContentEl,
  getContentId,
  getContextTriggerEl,
  getDirAnchorEl,
  getEnvironmentEl,
  getItemEl,
  getItemEls,
  getItemLabel,
  getPositionerEl,
  getTriggerEl,
  getTriggerId,
  hasSelectionGutter,
  hasSymbolGutter,
  isTriggerItem,
  ownsFocus,
} from "./menu.dom";
import { getSubmenuIntentAction, toRovingIntentKey } from "./menu.keys";
import type { MenuSchema } from "./menu.types";

type Params = MachineParams<MenuSchema>;

/** The inline properties `trackPosition` writes and never cleans up itself. */
const POSITION_STYLES = ["position", "top", "left", "transform", "width"] as const;

/**
 * `2 × --sui-duration-75`, the selection blink. A number rather than a read
 * of the custom property: the machine must not depend on a stylesheet being
 * loaded, and the deferral it buys the close is a behaviour, not a decoration.
 */
const FLASH_DURATION_MS = 150;

/**
 * How long after an opening press a click on the same trigger is *not* a toggle.
 * Press-drag-release: the pointer goes down, the menu opens, and the release that
 * follows on the trigger must leave it open.
 */
const REOPEN_GRACE_MS = 300;

/**
 * How long the swallow of a dismissing click stays armed. A trusted click follows
 * its own pointerup within a frame; the fuse exists only so a gesture that ended in
 * a drag cannot leave a listener behind waiting for a click nobody meant.
 */
const CLICK_SWALLOW_MS = 300;

const ZERO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Where a submenu goes when `right-start` does not fit. Sideways first — that is
 * what keeps it clear of the surface it came out of, and it is what
 * native menus draw — and only then off the axis, under or over the row that opened it.
 *
 * Leaving the axis is free here and nowhere else: the anchor **is** the row
 * (`getTriggerItemProps` gives the parent's row the child's trigger id), so
 * `bottom-start` already means "under this item, aligned to its leading edge".
 *
 * A root menu passes nothing and keeps the single-opposite flip it always had.
 */
const SUBMENU_FALLBACKS = ["left-start", "bottom-start", "top-start"] as const;

function windowOf({ scope }: Params): (Window & typeof globalThis) | null {
  return getContentEl(scope)?.ownerDocument.defaultView ?? null;
}

function childContentRect({ refs }: Params): Rect | null {
  const child = refs.get("child");
  if (child === null) return null;
  const content = getContentEl(child.scope);
  if (content === null) return null;
  const { x, y, width, height } = content.getBoundingClientRect();
  return { x, y, width, height };
}

function cancelIntent({ refs }: Params): void {
  refs.get("intentTimer")?.();
  refs.set("intentTimer", null);
}

/** The one place `highlightedValue` is written, so the modality is never forgotten. */
function commitHighlight(params: Params, value: string | null): void {
  const { context, scope } = params;
  if (scope.getRootNode() !== null) {
    context.set("focusSource", value === null ? null : getInputModality(scope.getDoc()));
  }
  context.set("highlightedValue", value);
}

/**
 * The focus is real, always: roving `tabindex` and a `.focus()` on the highlighted
 * item, never `aria-activedescendant` (règle dure — "la manette pilote le vrai
 * focus DOM"). `data-focus-source` is what keeps the ring off under a pointer.
 */
function focusHighlightedItem({ context, scope }: Params): void {
  const value = context.get("highlightedValue");
  if (value === null) return;
  const item = getItemEl(scope, value);
  focusElement(item);
  if (item === null) return;

  // **The focus moved and the surface never did.** `focusElement` asks for
  // `preventScroll: true` — right, because the ring must not make the page jump —
  // but that also suppresses the user agent's own reveal, and nothing here put it
  // back. Past the seventh row of a capped menu the highlighted item was outside
  // its own surface, so a keyboard or a d-pad could not reach the tail of a long
  // menu at all: WCAG 2.2 §2.4.11, against the AA floor of CDC §5.2. The guard is
  // `tabs`', and so is the motion resolution — attributes before media queries.
  const content = getContentEl(scope);
  if (content === null || content.scrollHeight <= content.clientHeight) return;
  item.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: resolveEnvironment(content).reducedMotion ? "auto" : "smooth",
  });
}

/**
 * Disabled items are stepped over rather than focused: APG allows either, and the
 * library already chose skipping in `radio-group` and `toggle-group`.
 */
function applyRoving(params: Params, action: RovingAction): void {
  const { context, prop, scope } = params;
  const target = getNextItem(
    getItemEls(scope),
    context.get("highlightedValue"),
    action,
    prop("loopFocus"),
  );
  if (target !== null) commitHighlight(params, getItemValue(target));
}

function openSurface(params: Params): void {
  const { context, refs, event } = params;
  if (event.type === "TRIGGER.KEYDOWN") refs.set("pendingHighlight", event.action);
  if (event.type === "TRIGGER.CONTEXTMENU" || event.type === "TRIGGER.LONGPRESS") {
    refs.set("pendingHighlight", "first");
  } else {
    // A menu opened from its button anchors to the button, whatever a previous
    // right click left behind.
    refs.set("anchorPoint", null);
  }
  refs.set("openedAt", Date.now());
  context.set("open", true);
}

function selectedValue(params: Params): string | null {
  const { event } = params;
  if (event.type === "ITEM.CLICK" || event.type === "ITEM.SELECT") return event.value;
  return null;
}

function selectedItem(params: Params): HTMLElement | null {
  const value = selectedValue(params);
  return value === null ? null : getItemEl(params.scope, value);
}

/**
 * The item an event *names*, which is one more than the item it selects: a hover
 * names one too, and the guard that lets a hover through has to be able to see it.
 * Reading `selectedItem` there answered `null` for every `ITEM.POINTERMOVE`, so the
 * guarded branch never ran — no highlight under the pointer, and no submenu ever
 * armed — while the unguarded fallback recorded the trail and made it look alive.
 */
function eventItem(params: Params): HTMLElement | null {
  const { event, scope } = params;
  if (event.type === "ITEM.POINTERMOVE") return getItemEl(scope, event.value);
  return selectedItem(params);
}

function closesOnSelect(params: Params): boolean {
  const { event, prop } = params;
  if (event.type !== "ITEM.CLICK" && event.type !== "ITEM.SELECT") return false;
  return event.closeOnSelect ?? prop("closeOnSelect");
}

/**
 * Whether the one child slot belongs to the item the highlight is on.
 *
 * The machine holds a **single** child, and the adapter hands that slot to
 * whichever submenu the highlight sits on. Without this, `CHILD.OPEN` arriving
 * from a plain item opened the *neighbour's* submenu — anchored to a row the
 * highlight was nowhere near, which is what `ArrowRight` on a non-trigger item
 * did until 2026-09-02.
 *
 * Answered from the DOM rather than from a ref, and that is not a shortcut: a
 * trigger item **is** the child's trigger, `getTriggerItemProps` gives that node
 * the child's own trigger id by construction, so the id is the link.
 */
function ownsChildSlot(params: Params): boolean {
  const { context, event, refs, scope } = params;
  const child = refs.get("child");
  if (child === null) return false;
  // A click names its own item: a touch tap and a synthetic `.click()` both reach
  // the trigger item with no `pointermove` ahead of them, so there is no highlight
  // to read and the highlight would refuse a perfectly good request. Everything
  // else — the arrow, the d-pad, the hover timer — is about the highlight.
  const named = event.type === "CHILD.OPEN" ? event.value : undefined;
  const value = named ?? context.get("highlightedValue");
  if (value === null || value === undefined) return false;
  const item = getItemEl(scope, value);
  if (item === null || !isTriggerItem(item)) return false;
  return item.id === getTriggerId(child.scope);
}

/**
 * Four branches, one array, two event names. `ITEM.CLICK` is what the element's
 * own handler sends and `ITEM.SELECT` is the programmatic twin; they resolve
 * identically, so they share the list rather than restating it.
 */
const SELECT_TRANSITIONS: Transition<MenuSchema> = [
  { guard: "isTriggerItem", actions: ["openChild"] },
  { guard: "shouldFlash", actions: ["invokeOnSelect", "flashSelection"] },
  { guard: "shouldCloseOnSelect", actions: ["invokeOnSelect", "closeTree"] },
  { guard: "isItemEnabled", actions: ["invokeOnSelect"] },
];

export const machine: Machine<MenuSchema> = createMachine<MenuSchema>({
  props({ props }) {
    return {
      defaultOpen: false,
      presentation: "auto",
      // No `placement` default: which of `bottom-start` and `right-start` applies
      // is only known once a parent has been wired, so it is a `computed`.
      gap: 4,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      matchWidth: false,
      strategy: "fixed",
      // Native desktop menus wrap. So does the d-pad, through `data-snav-wrap="y"`.
      loopFocus: true,
      typeahead: true,
      closeOnSelect: true,
      closeOnEscape: true,
      closeOnInteractOutside: true,
      preventOutsideActivation: true,
      modal: false,
      autoFocus: true,
      restoreFocus: true,
      submenuOpenDelay: 100,
      submenuCloseDelay: 250,
      selectionFlash: true,
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "menu open",
      })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      // Seeded from the props rather than from a constant: the server renders
      // `data-side` from this, and the first paint has to agree with the markup.
      // `parentId` is the only submenu hint available before `PARENT.SET` lands.
      currentPlacement: bindable(() => ({
        defaultValue:
          prop("placement") ?? (prop("parentId") === undefined ? "bottom-start" : "right-start"),
      })),
      highlightedValue: bindable<string | null>(() => ({
        defaultValue: prop("defaultHighlightedValue") ?? null,
        value: prop("highlightedValue"),
        onChange: (value) => prop("onHighlightChange")?.({ value }),
        debugLabel: "menu highlightedValue",
      })),
      hasSelectionGutter: bindable<boolean>(() => ({ defaultValue: false })),
      hasSymbolGutter: bindable<boolean>(() => ({ defaultValue: false })),
      hasTrigger: bindable<boolean>(() => ({ defaultValue: false })),
      hasParent: bindable<boolean>(() => ({ defaultValue: false })),
      flashingValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    presentation({ prop, context, refs }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      // **It descends, and it did not until now.** A submenu is its own
      // `<MenuRoot>` with its own props, so `"auto"` resolved on the child's own
      // density and a sheet's submenu came out a `popup`: portalled, anchored
      // `right-start` on a row as wide as the sheet, and therefore a 13px ribbon
      // pinned to the screen edge with both its labels clipped to nothing. Read
      // live from the parent rather than copied at `PARENT.SET`, because `computed`
      // is deliberately not memoised — so a density flip at the root reaches every
      // level of the tree without an event, a context key or a second source of
      // truth to keep in step.
      const parent = refs.get("parent");
      if (parent !== null) return parent.computed("presentation");
      // Touch gets the sheet, which is the iOS action sheet, and with it the
      // drill-in submenus and the cancel button. One machine either way.
      return context.get("density") === "touch" ? "sheet" : "popup";
    },

    isSubmenu: ({ context, prop }) => context.get("hasParent") || prop("parentId") !== undefined,

    placement({ prop, context }) {
      const requested = prop("placement");
      if (requested !== undefined) return requested;
      const submenu = context.get("hasParent") || prop("parentId") !== undefined;
      return submenu ? "right-start" : "bottom-start";
    },
  },

  refs() {
    return {
      finalFocusEl: null,
      anchorPoint: null,
      parent: null,
      child: null,
      typeahead: createTypeaheadState(),
      intentTimer: null,
      flashTimer: null,
      pointerTrail: [],
      openedAt: 0,
      pendingHighlight: null,
    };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackEnvironment", "trackModality", "trackContextTrigger"],

  watch({ context, computed, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    track(
      () => [computed("presentation")],
      () => send({ type: "PRESENTATION.SYNC" }),
    );
    track(
      () => [hasSelectionGutter(scope), hasSymbolGutter(scope), getTriggerEl(scope) !== null],
      () => action(["syncParts"]),
    );
  },

  on: {
    "TRIGGER.CLICK": { guard: "isEnabled", actions: ["toggleMenu"] },
    // A press on the trigger of a menu that is *already* open is the first half of
    // the click that closes it, so it opens nothing and — the part that matters —
    // must not refresh `openedAt`. Refreshing it put every second click inside the
    // press-drag-release grace, and a menu button that could not be closed by the
    // button is not a menu button (APG).
    "TRIGGER.POINTERDOWN": [{ guard: "isOpen" }, { guard: "isEnabled", actions: ["openMenu"] }],
    "TRIGGER.KEYDOWN": { guard: "isEnabled", actions: ["openMenu"] },
    "TRIGGER.CONTEXTMENU": { guard: "isEnabled", actions: ["setAnchorPoint", "openMenu"] },
    "TRIGGER.LONGPRESS": { guard: "isEnabled", actions: ["setAnchorPoint", "openMenu"] },

    // The safe triangle wins over the highlight: a pointer cutting diagonally
    // towards an open submenu must not re-aim the parent at whatever item it
    // happens to be crossing.
    "ITEM.POINTERMOVE": [
      { guard: "isPointerHeadingToChild", actions: ["recordPointer"] },
      {
        guard: "isItemEnabled",
        actions: ["recordPointer", "highlightItem", "focusHighlighted", "scheduleChild"],
      },
      { actions: ["recordPointer"] },
    ],
    "ITEM.POINTERLEAVE": [
      { guard: "isPointerHeadingToChild" },
      { actions: ["scheduleChildClose"] },
    ],

    "ITEM.CLICK": SELECT_TRANSITIONS,
    "ITEM.SELECT": SELECT_TRANSITIONS,
    // Enter, Space and the A button. It clicks the element rather than shortcutting
    // to `invokeOnSelect`, so a keyboard activation and a pointer one run exactly
    // the same handlers — which is what makes `onCheckedChange` and any consumer
    // handler on the item work without the machine knowing they exist.
    "ITEM.ACTIVATE": { actions: ["activateHighlighted"] },

    // `closeStaleChild` closes on the way out of a trigger item: the pointer path
    // has `ITEM.POINTERLEAVE` for that, these three had nothing.
    "HIGHLIGHT.MOVE": { actions: ["moveHighlight", "focusHighlighted", "closeStaleChild"] },
    // `null` clears it, which is why there is no second event for that.
    "HIGHLIGHT.SET": { actions: ["highlightItem", "focusHighlighted", "closeStaleChild"] },
    "TYPEAHEAD.KEY": {
      guard: "isTypeaheadEnabled",
      actions: ["typeaheadHighlight", "focusHighlighted", "closeStaleChild"],
    },

    "FLASH.END": { actions: ["clearFlash", "closeTree"] },

    // Guarded, because the slot is not always the highlight's. See
    // `highlightOwnsChild`: unguarded, ArrowRight on a plain item opened whichever
    // submenu happened to hold the slot.
    "CHILD.OPEN": { guard: "hasChildFor", actions: ["openChild"] },
    // One event, two readings, and they compose into the `back` grammar: close the
    // child if there is one open, otherwise close *this* level when it is itself a
    // submenu, otherwise do nothing at all.
    "CHILD.CLOSE": [
      { guard: "hasOpenChild", actions: ["closeChild", "focusHighlighted"] },
      { guard: "isSubmenu", actions: ["closeMenu"] },
    ],
    "CHILD.SET": { actions: ["setChild"] },
    "PARENT.SET": { actions: ["setParent"] },

    "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closeMenu"] },
    "TREE.CLOSE": { actions: ["closeTree"] },
    "CANCEL.CLICK": { actions: ["closeTree"] },

    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    // The density flip tears the open state down and builds it back: the position
    // tracker leaves, the scroll lock arrives, the geometry changes.
    "PRESENTATION.SYNC": { guard: "isOpen", target: "open", reenter: true },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
  },

  states: {
    closed: {
      // Downward cascade, and it recurses on its own: a child entering `closed`
      // closes its own child. Upward is `closeTree`.
      entry: ["closeChild"],
      // Exit rather than the open state's entry, for the dialog's reason: the
      // interpreter installs effects before entry actions, and `hideOutside`
      // makes the trigger's ancestor inert, which blurs it.
      exit: ["captureFinalFocus"],
    },
    open: {
      entry: ["highlightInitial"],
      effects: [
        "trackSurfaceDir",
        "trackDismissable",
        "lockPageScroll",
        // Before anything that moves the focus. A focus landing in a surface still
        // parked at `0,0` scrolls the page there to reveal it.
        "trackAnchorPosition",
        "focusContent",
        "proxyTabs",
        "hideOutside",
        "captureIntents",
        "trackPointerIntent",
        "trackSelectionFlash",
        "trackParts",
        // Last, and after `trackParts` on purpose: the gutter attributes that
        // effect publishes are what decide how tall a row is, so reading whether
        // the surface overflows before they land measures a layout nobody will see.
        "trackScrollEdges",
      ],
    },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
      isOpen: ({ context }) => context.get("open"),
      isSubmenu: ({ computed }) => computed("isSubmenu"),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        return prop("closeOnInteractOutside");
      },

      isItemEnabled(params) {
        if (params.prop("disabled")) return false;
        const item = eventItem(params);
        return item !== null && !isItemDisabled(item);
      },

      isTriggerItem(params) {
        if (params.prop("disabled")) return false;
        const item = selectedItem(params);
        return item !== null && !isItemDisabled(item) && isTriggerItem(item);
      },

      isPointerHeadingToChild(params) {
        const { event, refs } = params;
        if (event.type !== "ITEM.POINTERMOVE" && event.type !== "ITEM.POINTERLEAVE") return false;
        const child = refs.get("child");
        if (child === null || !child.context.get("open")) return false;
        const trail =
          event.type === "ITEM.POINTERMOVE"
            ? pushTrail(refs.get("pointerTrail"), { x: event.x, y: event.y })
            : refs.get("pointerTrail");
        return isPointerHeadingTo(trail, childContentRect(params));
      },

      hasOpenChild: ({ refs }) => refs.get("child")?.context.get("open") === true,

      hasChildFor: ownsChildSlot,

      shouldCloseOnSelect(params) {
        if (params.prop("disabled")) return false;
        const item = selectedItem(params);
        if (item === null || isItemDisabled(item)) return false;
        return closesOnSelect(params);
      },

      /**
       * The blink only exists where it means something: a popup on a desktop that
       * is about to close. It is read here rather than in `connect` because
       * `matchMedia` is a platform read and `connect` is pure — and it goes
       * through `resolveEnvironment`, so an app pinned to `data-motion="full"`
       * keeps its blink and one pinned to `reduced` loses it.
       */
      shouldFlash(params) {
        const { prop, computed, scope } = params;
        if (prop("disabled") || !prop("selectionFlash")) return false;
        if (computed("presentation") !== "popup") return false;
        const item = selectedItem(params);
        if (item === null || isItemDisabled(item)) return false;
        if (!closesOnSelect(params)) return false;
        return !resolveEnvironment(getContentEl(scope)).reducedMotion;
      },

      isTypeaheadEnabled: ({ prop }) => prop("typeahead") && !prop("disabled"),
    },

    actions: {
      /**
       * The disclosure. `openedAt` is what makes press-drag-release work: the
       * click that lands on the trigger right after the press that opened the menu
       * is the *release*, not a second press, and closing there would make a menu
       * impossible to open with a normal click.
       */
      toggleMenu(params) {
        const { context, refs } = params;
        if (!context.get("open")) {
          openSurface(params);
          return;
        }
        const openedAt = refs.get("openedAt");
        if (openedAt !== 0 && Date.now() - openedAt < REOPEN_GRACE_MS) return;
        context.set("open", false);
      },

      openMenu: openSurface,

      /** This level only. `TREE.CLOSE` is the one that walks up. */
      closeMenu({ context }) {
        context.set("open", false);
      },

      /**
       * Up the chain, one hop at a time: each parent runs this same action, so a
       * three-deep tree closes in three sends and nothing has to know its depth.
       * Downwards is `closed.entry`, which cascades on its own.
       */
      closeTree({ context, refs }) {
        context.set("open", false);
        refs.get("parent")?.send({ type: "TREE.CLOSE" });
      },

      setOpen({ context, refs, event }) {
        if (event.type !== "OPEN.SET") return;
        if (event.open && event.highlight !== undefined) {
          refs.set("pendingHighlight", event.highlight);
        }
        context.set("open", event.open);
      },

      setAnchorPoint({ refs, event }) {
        if (event.type === "TRIGGER.CONTEXTMENU" || event.type === "TRIGGER.LONGPRESS") {
          refs.set("anchorPoint", { x: event.x, y: event.y });
        }
      },

      captureFinalFocus({ refs, scope }) {
        const active = scope.getActiveElement();
        refs.set("finalFocusEl", active === null || active.tagName === "BODY" ? null : active);
      },

      /**
       * Runs as the open state's **entry**, which the interpreter schedules after
       * the effects — and after the adapter has painted, because it is a `watch`
       * that flipped the state. So the content exists here, and a request the
       * keyboard made before it did (`pendingHighlight`) can finally be honoured.
       */
      highlightInitial(params) {
        const { refs, prop } = params;
        const pending = refs.get("pendingHighlight");
        refs.set("pendingHighlight", null);
        if (pending !== null) {
          applyRoving(params, pending);
          focusHighlightedItem(params);
          return;
        }
        const initial = prop("defaultHighlightedValue") ?? null;
        if (initial === null) return;
        commitHighlight(params, initial);
        focusHighlightedItem(params);
      },

      highlightItem(params) {
        const { event } = params;
        if (event.type === "ITEM.POINTERMOVE") {
          commitHighlight(params, event.value);
          return;
        }
        if (event.type === "HIGHLIGHT.SET") commitHighlight(params, event.value);
      },

      moveHighlight(params) {
        if (params.event.type === "HIGHLIGHT.MOVE") applyRoving(params, params.event.action);
      },

      focusHighlighted: focusHighlightedItem,

      typeaheadHighlight(params) {
        const { event, refs, scope, context } = params;
        if (event.type !== "TYPEAHEAD.KEY") return;
        const items = getItemEls(scope);
        const value = context.get("highlightedValue");
        const match = getByTypeahead(refs.get("typeahead"), event.key, {
          items,
          itemToString: getItemLabel,
          isItemDisabled,
          activeIndex: items.findIndex((item) => getItemValue(item) === value),
        });
        if (match !== null) commitHighlight(params, getItemValue(match));
      },

      recordPointer({ refs, event }) {
        if (event.type !== "ITEM.POINTERMOVE") return;
        refs.set("pointerTrail", pushTrail(refs.get("pointerTrail"), { x: event.x, y: event.y }));
      },

      /**
       * The submenu delay, and its counterpart. Hovering the item that owns a
       * submenu arms the open; hovering any other item arms the close of whatever
       * is already open — which is the only reason a cascade ever collapses under
       * a pointer that never leaves the menu.
       */
      scheduleChild(params) {
        const { prop, refs, scope, event, send } = params;
        if (event.type !== "ITEM.POINTERMOVE") return;
        cancelIntent(params);
        const win = windowOf(params);
        if (win === null) return;

        const item = getItemEl(scope, event.value);
        if (item !== null && isTriggerItem(item)) {
          if (refs.get("child")?.context.get("open") === true) return;
          refs.set(
            "intentTimer",
            timeout(win, () => send({ type: "CHILD.OPEN" }), prop("submenuOpenDelay")),
          );
          return;
        }
        if (refs.get("child")?.context.get("open") !== true) return;
        refs.set(
          "intentTimer",
          timeout(win, () => send({ type: "CHILD.CLOSE" }), prop("submenuCloseDelay")),
        );
      },

      /**
       * Armed, but re-checked when it fires. The pointer leaving a trigger item is
       * usually the pointer entering the submenu, and by then the focus has moved
       * in with it — so the timer asks before it closes anything.
       */
      scheduleChildClose(params) {
        const { prop, refs, send } = params;
        cancelIntent(params);
        const win = windowOf(params);
        if (win === null || refs.get("child")?.context.get("open") !== true) return;
        refs.set(
          "intentTimer",
          timeout(
            win,
            () => {
              refs.set("intentTimer", null);
              const child = refs.get("child");
              if (child === null) return;
              const content = getContentEl(child.scope);
              if (contains(content, child.scope.getActiveElement())) return;
              send({ type: "CHILD.CLOSE" });
            },
            prop("submenuCloseDelay"),
          ),
        );
      },

      activateHighlighted({ context, scope, prop }) {
        if (prop("disabled")) return;
        const value = context.get("highlightedValue");
        if (value === null) return;
        const item = getItemEl(scope, value);
        if (item === null || isItemDisabled(item)) return;
        item.click();
      },

      invokeOnSelect(params) {
        const value = selectedValue(params);
        if (value !== null) params.prop("onSelect")?.({ value });
      },

      /**
       * The blink owns the close: `FLASH.END` is what finally calls `closeTree`.
       * The timer is cancelled by `trackSelectionFlash`'s disposer — a menu closed
       * mid-blink would otherwise send `TREE.CLOSE` into a dead service.
       */
      flashSelection(params) {
        const { context, refs, send } = params;
        const value = selectedValue(params);
        if (value === null) return;
        refs.get("flashTimer")?.();
        context.set("flashingValue", value);
        const win = windowOf(params);
        if (win === null) {
          send({ type: "FLASH.END" });
          return;
        }
        refs.set(
          "flashTimer",
          timeout(
            win,
            () => {
              refs.set("flashTimer", null);
              send({ type: "FLASH.END" });
            },
            FLASH_DURATION_MS,
          ),
        );
      },

      clearFlash({ context, refs }) {
        refs.get("flashTimer")?.();
        refs.set("flashTimer", null);
        context.set("flashingValue", null);
      },

      openChild({ refs, event }) {
        const child = refs.get("child");
        if (child === null) return;
        // `highlight` rather than a second send: the child's content is not mounted
        // yet, so the request has to survive until its open state is entered.
        child.send({
          type: "OPEN.SET",
          open: true,
          highlight: event.type === "CHILD.OPEN" && event.focus === true ? "first" : undefined,
        });
      },

      closeChild({ refs }) {
        refs.get("child")?.send({ type: "OPEN.SET", open: false });
      },

      setChild({ refs, event }) {
        if (event.type === "CHILD.SET") refs.set("child", event.child);
      },

      setParent({ context, refs, event }) {
        if (event.type !== "PARENT.SET") return;
        refs.set("parent", event.parent);
        context.set("hasParent", event.parent !== null);
      },

      invokeOnDismiss({ prop, event }) {
        if (event.type === "CONTENT.DISMISS") prop("onDismiss")?.({ reason: event.reason });
      },

      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      syncPlacement({ context, event }) {
        if (event.type === "POSITION.SYNC") context.set("currentPlacement", event.placement);
      },

      syncParts({ context, scope }) {
        context.set("hasSelectionGutter", hasSelectionGutter(scope));
        context.set("hasSymbolGutter", hasSymbolGutter(scope));
        context.set("hasTrigger", getTriggerEl(scope) !== null);
      },

      /**
       * Moving the highlight off a trigger item closes what that item opened. The
       * pointer path already did it — `ITEM.POINTERLEAVE` schedules the close —
       * but the keyboard and the d-pad did not, so a submenu opened by a hover
       * survived an arrow key and stayed anchored to a row that was no longer
       * highlighted. Closing an already-closed child is a no-op, so this needs no
       * guard of its own beyond the ownership question.
       */
      closeStaleChild(params) {
        if (ownsChildSlot(params)) return;
        params.refs.get("child")?.send({ type: "OPEN.SET", open: false });
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

      /**
       * Machine level, not open level: a context menu's opener has to be listening
       * while the surface is closed. `allowMouse: false` — on a pointer device the
       * gesture is a right click, and `threshold: 500` is the iOS delay.
       */
      trackContextTrigger({ prop, scope, send }) {
        const node = getContextTriggerEl(scope);
        if (node === null) return;
        const onContextMenu = (event: MouseEvent): void => {
          if (prop("disabled")) return;
          event.preventDefault();
          send({ type: "TRIGGER.CONTEXTMENU", x: event.clientX, y: event.clientY });
        };
        const removeContextMenu = addDomEvent(node, "contextmenu", onContextMenu);
        const removeLongPress = trackLongPress(node, {
          threshold: 500,
          allowMouse: false,
          isDisabled: () => prop("disabled"),
          onLongPress: (event) => send({ type: "TRIGGER.LONGPRESS", x: event.x, y: event.y }),
        });

        // **The keyboard and the pad, which had no opener at all until 2026-09-02.**
        // Shift+F10 and the pad's Y both arrive as the `contextMenu` intent and
        // neither produces a `contextmenu` event, so a region whose only opener was
        // the two listeners above could be reached by a mouse and by a finger and by
        // nothing else — WCAG 2.1.1 on the one gesture the part exists for. Pushed
        // here rather than in `captureIntents` because it has to answer while the
        // surface is *closed*, which is the same reason this whole effect is machine
        // level. The open menu's own scope sits above this one and deliberately
        // declines `contextMenu` (see `captureIntents`), so the two never race: when
        // the menu is open the focus is in the portalled content, `contains` is
        // false, and this scope declines too.
        //
        // Anchored on the focused element, since there is no pointer to anchor to —
        // its bottom edge, which is where a context menu opened from a row belongs.
        // A region with nothing focusable inside it stays mouse- and touch-only, and
        // that is correct: there is no focus for the gesture to be *about*.
        const host = prop("intents");
        const removeIntents =
          host === null || host === undefined
            ? (): void => {}
            : host.pushScope(
                (event) => {
                  if (event.intent !== "contextMenu" || prop("disabled")) return false;
                  const active = scope.getActiveElement();
                  if (active === null || !contains(node, active)) return false;
                  const rect = active.getBoundingClientRect();
                  send({
                    type: "TRIGGER.CONTEXTMENU",
                    x: rect.left + rect.width / 2,
                    y: rect.bottom,
                  });
                  return true;
                },
                { within: node },
              );

        return () => {
          removeIntents();
          removeLongPress();
          removeContextMenu();
        };
      },

      /**
       * Parity M5, and the whole of it: `preventOutsideActivation` makes the click
       * that closes a menu stop there instead of activating what was underneath —
       * the native behaviour, and the one the reference app's own context menu had. The pointer
       * default is suppressed *and* a one-shot capture listener eats the `click`
       * that the browser will still synthesise, because `preventDefault` on
       * `pointerdown` does not cancel it.
       *
       * **The swallow outlives this effect, and it has to.** The dismissal is
       * decided on the pointerup that follows, which tears the open state down —
       * so a listener the disposer took back off would be gone by the time the
       * click it exists for arrives, and the button underneath would fire. It
       * disarms itself on that click, and on a short fuse for the gesture that
       * ended in a drag and produced none.
       */
      trackDismissable({ prop, scope, send }) {
        const content = getContentEl(scope);
        const doc = content?.ownerDocument;
        const win = doc?.defaultView ?? null;

        return trackDismissableLayer(content, {
          id: getContentId(scope),
          type: "menu",
          modal: prop("modal"),
          // The stack already answers "does this node descend from that layer", so
          // a click inside a portalled submenu never dismisses its parent.
          parentId: prop("parentId"),
          exclude: () => [
            getTriggerEl(scope),
            getContextTriggerEl(scope),
            ...(prop("persistentElements")?.() ?? []),
          ],
          onPointerDownOutside(event) {
            if (!prop("preventOutsideActivation") || doc === undefined || win === null) return;
            event.preventDefault();
            let cancelFuse: VoidFunction | undefined;
            const removeClick = addDomEvent(
              doc,
              "click",
              (click) => {
                click.preventDefault();
                click.stopPropagation();
                cancelFuse?.();
              },
              { capture: true, once: true },
            );
            cancelFuse = timeout(win, removeClick, CLICK_SWALLOW_MS);
          },
          onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
        });
      },

      lockPageScroll({ prop, computed, scope }) {
        if (computed("presentation") !== "sheet") return;
        if (prop("preventScroll") === false) return;
        return lockScroll(getContentEl(scope)?.ownerDocument);
      },

      /**
       * The sheet branch clears what a previous popup pass left behind, and it does
       * it **on install rather than on teardown**: cleaning up in the disposer
       * would run while `open` is going false with the node still mounted by
       * `presence`, and the surface would snap to `0,0` mid-exit.
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

      trackAnchorPosition({ prop, computed, refs, scope, send }) {
        const positioner = getPositionerEl(scope);
        if (positioner === null) return;

        if (computed("presentation") !== "popup") {
          for (const name of POSITION_STYLES) positioner.style.removeProperty(name);
          positioner.style.removeProperty("--sui-transform-origin");
          return;
        }

        // A right click anchors to the point, not to the region: a zero-sized rect
        // where the pointer landed is exactly what `computePosition` wants.
        const point = refs.get("anchorPoint");
        const getAnchorRect =
          prop("getAnchorRect") ??
          (point === null
            ? undefined
            : (): Rect => {
                const current = refs.get("anchorPoint");
                return current === null
                  ? ZERO_RECT
                  : { x: current.x, y: current.y, width: 0, height: 0 };
              });

        return trackPosition(getAnchorEl(scope), positioner, {
          placement: computed("placement"),
          ...(computed("isSubmenu") ? { fallbackPlacements: SUBMENU_FALLBACKS } : {}),
          gap: prop("gap"),
          offset: prop("offset"),
          flip: prop("flip"),
          shift: prop("shift"),
          padding: prop("padding"),
          matchWidth: prop("matchWidth"),
          // From the anchor, not from the surface: the surface is portalled into
          // `document.body` and would report the document's direction, while the
          // side a submenu opens on is decided by the region the trigger sits in.
          dir: resolveDir(prop("dir"), getDirAnchorEl(scope)),
          strategy: prop("strategy"),
          boundary: prop("boundary"),
          getAnchorRect,
          onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
        });
      },

      /**
       * The surface takes the focus so the keys reach it; `highlightInitial` moves
       * it onto an item straight after, from the open state's entry.
       *
       * The disposer is the restore, and it only fires when the focus is still
       * inside: a person who left by clicking elsewhere, or by tabbing past the
       * trigger, has already said where they want to be. A trigger disabled while
       * open takes nothing, so `restoreFocus` falls back on its neighbour (R61).
       */
      focusContent({ prop, refs, scope }) {
        const content = getContentEl(scope);
        if (content === null) return;
        if (prop("autoFocus")) focusElement(prop("initialFocus")?.() ?? content);
        return () => {
          if (!prop("restoreFocus")) return;
          if (!contains(content, scope.getActiveElement())) return;
          const target = prop("finalFocus")?.() ?? refs.get("finalFocusEl") ?? getAnchorEl(scope);
          restoreFocus(target, content);
        };
      },

      /**
       * Tab closes the whole tree (APG Menu Button); this places the step past the
       * root's anchor, for the focus in any open submenu too.
       *
       * Modal: the trigger is inert until `hideOutside` releases it, which the
       * reverse teardown does before this disposer, so the step is held until
       * then — and only when the menu is really closing: a refused close and a
       * `reenter` keep it open, and the focus stays inside.
       */
      proxyTabs({ context, scope }) {
        return proxyTabFocus(getContentEl(scope), {
          triggerNode: () => getAnchorEl(scope),
          placeOnDispose: () => !context.get("open"),
        });
      },

      hideOutside({ prop, scope }) {
        if (!prop("modal")) return;
        return hideOthers(
          [
            getContentEl(scope),
            getPositionerEl(scope),
            getBackdropEl(scope),
            ...(prop("persistentElements")?.() ?? []),
          ],
          { inert: true },
        );
      },

      /**
       * **Not `trapped`:** a trapped scope answers `consumed` for everything it
       * declines and silences every non-`base` scope under it outside its surface,
       * whether or not the menu is modal. The spatial engine is a `base` scope and
       * is asked either way, so trapping buys no confinement: that is declared
       * where it belongs, `data-snav-trap` on the content when the menu is modal.
       *
       * `contextMenu` (Y) is deliberately *not* claimed: Y is what opens a context
       * menu on the focused element, so a menu that swallowed it would make the
       * one gesture it exists for impossible from inside itself.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        const content = getContentEl(scope);
        if (host === null || host === undefined || content === null) return;
        const id = getContentId(scope);
        const stack = getLayerStack(content.ownerDocument);

        return host.pushScope((event) => {
          if (event.intent === "back") {
            if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
            // Through the layer — the top one, checked above — which counts it: see
            // `LayerStack.dismissals`. Under a `NavProvider` Escape arrives here as
            // `back` too, so a held Tab is dropped for both only on this road.
            stack.dismissTop("back");
            return true;
          }
          // Everything else is about the highlight, and the highlight is this
          // menu's only when the real focus is in it — a parent and its open child
          // both hold a scope.
          if (!ownsFocus(scope)) return false;

          if (event.intent === "select") {
            send({ type: "ITEM.ACTIVATE" });
            return true;
          }

          const intentDir = resolveDir(prop("dir"), content);

          const submenu = getSubmenuIntentAction(event.intent, intentDir);
          if (submenu !== null) {
            send(
              submenu === "open" ? { type: "CHILD.OPEN", focus: true } : { type: "CHILD.CLOSE" },
            );
            return true;
          }

          const key = toRovingIntentKey(event.intent);
          if (key === null) return false;
          const action = getRovingKeyAction(key, {
            orientation: "vertical",
            dir: intentDir,
          });
          if (action === null) return false;
          send({ type: "HIGHLIGHT.MOVE", action });
          return true;
        });
      },

      /**
       * Owns the submenu timer and the pointer trail, and hands both back: a menu
       * that closed while a submenu was about to open would otherwise fire into a
       * service that has already stopped.
       */
      trackPointerIntent(params) {
        return () => {
          cancelIntent(params);
          params.refs.set("pointerTrail", []);
        };
      },

      /** See `flashSelection` — this effect exists for its disposer. */
      trackSelectionFlash({ refs, context }) {
        return () => {
          refs.get("flashTimer")?.();
          refs.set("flashTimer", null);
          context.set("flashingValue", null);
        };
      },

      trackParts({ prop, scope, send }) {
        send({ type: "PARTS.SYNC" });
        const content = getContentEl(scope);
        const cancel = getCancelTriggerEl(scope);
        warn(
          isDev() && cancel !== null && !hasAccessibleName(cancel),
          "a menu cancel trigger has no accessible name — give it text, `aria-label` or `title`",
        );
        // The surface names itself after its trigger, and a context menu has none.
        // `aria-labelledby` is withheld in that case rather than left dangling, so
        // without a `label` the menu ends up unnamed — which is worth saying out
        // loud, because the alternative is an IDREF that resolves to nothing and
        // that axe only ever reports as `incomplete`.
        warn(
          isDev() && prop("label") === undefined && getTriggerEl(scope) === null,
          "a menu with no trigger has no accessible name — pass `label`, or render a trigger",
        );
        return observeChildren(content, () => send({ type: "PARTS.SYNC" }));
      },

      /**
       * WCAG 2.2 §1.4.13 has nothing to say here, but the CDC parity list does:
       * a menu that caps itself against the viewport is the one surface in this
       * library whose content can be cut off with no scrollbar to say so — desktop
       * overlay scrollbars hide until the pointer moves, and a finger gets none at
       * all. So the surface says it itself, and the sheet draws the edge.
       *
       * No `prefers-reduced-motion` guard, and that is the point: this is not an
       * animation, it is the only indication that there is more menu. Reduced
       * motion softens how a thing arrives; it never deletes what the thing says.
       */
      trackScrollEdges({ scope }) {
        return trackEdges(getContentEl(scope));
      },
    },
  },
});
