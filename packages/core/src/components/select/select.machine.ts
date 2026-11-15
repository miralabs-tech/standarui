/**
 * A select is the menu's surface with a value: overlay + collection, minus the
 * tree, plus the form. Every structural decision below is the menu's, kept
 * verbatim so the two components cannot drift apart:
 *
 * **Two states, projection of `context.open`** — the dialog/popover/menu
 * doctrine. **The collection is the DOM** (`select.dom.ts`): no `items` prop,
 * no `isEqual`, no registry. **The focus is real**, roving `tabindex` plus
 * `.focus()`, never `aria-activedescendant` — the APG select-only example uses
 * the latter, the Combobox pattern allows the former, and the library's hard
 * rule ("la manette pilote le vrai focus DOM") settles it.
 *
 * What is the select's own: `value`/`valueLabel` (the trigger reflects the
 * selection while the surface is closed, which is why adapters keep the content
 * mounted), the `hiddenSelect` form mirror with its `FORM.RESET` listener, and
 * the APG select-only keyboard grammar (a typed character on the closed trigger
 * opens and highlights, it never selects — the one divergence from the Windows
 * native control, and the APG's side of it).
 */

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
import type { RovingAction } from "../../focus/roving-focus";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack, isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { trackScrollEdges as trackEdges } from "../../interaction/scroll-edges";
import { createTypeaheadState, getByTypeahead } from "../../interaction/typeahead";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams, Transition } from "../../machine/types";
import { focusElement, getInputModality, trackInputModality } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { Density, Direction, InputModality } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import {
  getBackdropEl,
  getCancelTriggerEl,
  getContentEl,
  getContentId,
  getEnvironmentEl,
  getHiddenSelectEl,
  getItemEl,
  getItemEls,
  getItemLabel,
  getPositionerEl,
  getTriggerEl,
  hasSymbolGutter,
  ownsFocus,
} from "./select.dom";
import type { SelectSchema } from "./select.types";

type Params = MachineParams<SelectSchema>;

/** The inline properties `trackPosition` writes and never cleans up itself. */
const POSITION_STYLES = ["position", "top", "left", "transform", "width"] as const;

/**
 * `2 × --sui-duration-75`, the selection blink — the menu's constant,
 * restated for the menu's reason: the machine must not depend on a stylesheet
 * being loaded, and the deferral it buys the close is behaviour, not decoration.
 */
const FLASH_DURATION_MS = 150;

/**
 * How long after an opening press a click on the same trigger is *not* a toggle.
 * Press-drag-release: the pointer goes down, the select opens, and the release
 * that follows on the trigger must leave it open.
 */
const REOPEN_GRACE_MS = 300;

function windowOf({ scope }: Params): (Window & typeof globalThis) | null {
  return getContentEl(scope)?.ownerDocument.defaultView ?? null;
}

/**
 * The trigger's name, read the three ways it can arrive — and that is the whole
 * list, because `role="combobox"` takes none from its contents: the contents are
 * the *value* (`select.connect.ts`, `getTriggerProps`, where the same violation
 * is named).
 *
 * `labels` is the DOM's own answer to both `<label for>` and an enclosing
 * `<label>`, which is how a `field` above names this control — it hands the
 * trigger its control id and lets the association be native, so there is no
 * IDREF here to read. It is absent when the trigger was substituted for something
 * unlabelable, where only the ancestor form can apply anyway.
 */
function hasAccessibleName(node: HTMLElement): boolean {
  if (node.hasAttribute("aria-label") || node.hasAttribute("aria-labelledby")) return true;
  const labels = (node as Partial<HTMLButtonElement>).labels;
  if (labels !== undefined && labels !== null) return labels.length > 0;
  return node.closest("label") !== null;
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
 * The focus is real, always — and, past the ceiling of a capped surface, the
 * reveal is put back by hand, because `focusElement`'s `preventScroll` also
 * suppresses the user agent's own (the menu's WCAG 2.4.11 guard, kept).
 */
function focusHighlightedItem({ context, scope }: Params): void {
  const value = context.get("highlightedValue");
  if (value === null) return;
  const item = getItemEl(scope, value);
  focusElement(item);
  if (item === null) return;
  const content = getContentEl(scope);
  if (content === null || content.scrollHeight <= content.clientHeight) return;
  item.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: resolveEnvironment(content).reducedMotion ? "auto" : "smooth",
  });
}

/**
 * Disabled items are stepped over rather than focused — APG allows either, and
 * the library already chose skipping in the menu and the radio group.
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

/**
 * A page is ten options, the number the APG's own select-only example uses, and
 * it is clamped rather than wrapped: PageDown at the bottom of a list stays at
 * the bottom, where `ArrowDown` with `loopFocus` would come back to the top.
 * Paging is a reading gesture, and a reader who hits the end wants to know it.
 */
const PAGE_SIZE = 10;

/**
 * The optional half of the APG select-only table, and it is not optional here.
 * The claim it replaces — "the focus is real and inside the scroller, so the
 * browser pages the list itself" — is half true and therefore wrong: the browser
 * does scroll the scroller, and it leaves the roving tabindex exactly where it
 * was. The highlight then sits off-screen, the next arrow key jumps the view
 * back, and nothing the user did is undone by anything they can see.
 */
function applyPage(params: Params, direction: "next" | "prev"): void {
  const { context, scope } = params;
  const items = getItemEls(scope);
  if (items.length === 0) return;

  const current = context.get("highlightedValue");
  const from = current === null ? -1 : items.findIndex((item) => getItemValue(item) === current);
  const step = direction === "next" ? PAGE_SIZE : -PAGE_SIZE;
  // From an empty highlight a page lands at the end it came from, which is what
  // the first ArrowDown/ArrowUp does too.
  const wanted = from === -1 ? (direction === "next" ? items.length - 1 : 0) : from + step;
  const target = Math.min(Math.max(wanted, 0), items.length - 1);

  // Enabled items only, scanning back towards where the focus came from: a
  // disabled option at the landing spot must not swallow the whole gesture.
  const back = target > from ? -1 : 1;
  for (let index = target; index >= 0 && index < items.length; index += back) {
    const item = items[index];
    if (item === undefined || isItemDisabled(item)) continue;
    commitHighlight(params, getItemValue(item));
    return;
  }
}

function applyTypeahead(params: Params, key: string): void {
  const { context, refs, scope } = params;
  const items = getItemEls(scope);
  const value = context.get("highlightedValue");
  const match = getByTypeahead(refs.get("typeahead"), key, {
    items,
    itemToString: getItemLabel,
    isItemDisabled,
    activeIndex: items.findIndex((item) => getItemValue(item) === value),
  });
  if (match !== null) commitHighlight(params, getItemValue(match));
}

function openSurface(params: Params): void {
  const { context, refs, event } = params;
  if (event.type === "TRIGGER.KEYDOWN") refs.set("pendingHighlight", event.action);
  refs.set("openedAt", Date.now());
  context.set("open", true);
}

/** The item an event names — the click's value, or the hover's. */
function eventValue({ event }: Params): string | null {
  if (event.type === "ITEM.CLICK" || event.type === "ITEM.POINTERMOVE") return event.value;
  return null;
}

/**
 * Enabled unless the DOM says otherwise. Leaner than the menu's guard on
 * purpose: an `ITEM.*` event only ever originates from a rendered item's own
 * handler, so an unresolvable item is the node-harness case, not a user's — and
 * refusing there would make the machine's pure half untestable. The refusal of
 * a *disabled* item is what matters, and the DOM answers it whenever there is one.
 */
function isEventItemEnabled(params: Params): boolean {
  if (params.prop("disabled")) return false;
  const value = eventValue(params);
  if (value === null) return false;
  const item = getItemEl(params.scope, value);
  return item === null || !isItemDisabled(item);
}

/**
 * The commit, and only the commit: `context.value` moves (the bindable emits
 * `onValueChange` without writing when controlled) and the label follows through
 * `syncCollection`, which the `value` watcher triggers — one writer for the
 * label, so a controlled consumer who declines the change cannot end up with a
 * caption for a value they refused.
 */
function commitValue({ context, event }: Params): void {
  if (event.type === "ITEM.CLICK") context.set("value", event.value);
}

/**
 * Three branches, one array. Unlike the menu there is no per-item
 * `closeOnSelect` and no trigger item — the surface settles it alone.
 */
const SELECT_TRANSITIONS: Transition<SelectSchema> = [
  { guard: "shouldFlash", actions: ["selectItem", "flashSelection"] },
  { guard: "shouldCloseOnSelect", actions: ["selectItem", "closeSelect"] },
  { guard: "isItemEnabled", actions: ["selectItem"] },
];

export const machine: Machine<SelectSchema> = createMachine<SelectSchema>({
  props({ props }) {
    return {
      defaultValue: null,
      defaultOpen: false,
      presentation: "auto",
      // A simple default, not a computed: a select has no submenu to re-aim for.
      placement: "bottom-start",
      gap: 4,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      // The select's divergence from the menu (ROADMAP): the surface is never
      // narrower than its trigger. A floor, not an identity — the ROADMAP asks
      // for the feature, and native desktop pop-up menus are 18-40px wider
      // than their buttons, so clamping down would only truncate the rows.
      matchWidth: true,
      strategy: "fixed",
      loopFocus: true,
      typeahead: true,
      closeOnSelect: true,
      closeOnEscape: true,
      closeOnInteractOutside: true,
      preventOutsideActivation: true,
      modal: false,
      restoreFocus: true,
      required: false,
      invalid: false,
      disabled: false,
      selectionFlash: true,
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
        debugLabel: "select open",
      })),
      value: bindable<string | null>(() => ({
        defaultValue: prop("defaultValue"),
        value: prop("value"),
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "select value",
      })),
      valueLabel: bindable<string | null>(() => ({ defaultValue: null })),
      highlightedValue: bindable<string | null>(() => ({
        defaultValue: prop("defaultHighlightedValue") ?? null,
        value: prop("highlightedValue"),
        onChange: (value) => prop("onHighlightChange")?.({ value }),
        debugLabel: "select highlightedValue",
      })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      currentPlacement: bindable(() => ({ defaultValue: prop("placement") })),
      hasSymbolGutter: bindable<boolean>(() => ({ defaultValue: false })),
      flashingValue: bindable<string | null>(() => ({ defaultValue: null })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    presentation({ prop, context }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      return context.get("density") === "touch" ? "sheet" : "popup";
    },
    hasValue: ({ context }) => context.get("value") !== null,
  },

  refs({ prop }) {
    const controlled = prop("value");
    return {
      finalFocusEl: null,
      typeahead: createTypeaheadState(),
      pendingTypeaheadKey: null,
      pendingHighlight: null,
      flashTimer: null,
      openedAt: 0,
      closedByCommit: false,
      // `??` would fold an explicitly controlled `null` onto the default.
      initialValue: controlled === undefined ? prop("defaultValue") : controlled,
      labelValue: null,
    };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackEnvironment", "trackModality", "trackCollection", "trackFormReset"],

  watch({ context, computed, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    track(
      () => [computed("presentation")],
      () => send({ type: "PRESENTATION.SYNC" }),
    );
    // The collection is the DOM, so the DOM is a watch dependency: a content
    // that mounts late, a value that changes, a label that finally exists and a
    // glyph column that appears are all re-read on the adapter's next commit.
    track(
      () => {
        const value = context.get("value");
        const item = value === null ? null : getItemEl(scope, value);
        return [
          value,
          item === null ? null : getItemLabel(item),
          hasSymbolGutter(scope),
          getContentEl(scope) !== null,
        ];
      },
      () => action(["syncCollection"]),
    );
  },

  on: {
    "HIGHLIGHT.SET": { actions: ["highlightItem", "focusHighlighted"] },
    "VALUE.SET": { actions: ["setValue"] },
    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    // The density flip tears the open state down and builds it back: the
    // position tracker leaves, the scroll lock arrives, the geometry changes.
    //
    // It also replays the two focus-moving pieces: `focusContent`'s install, and
    // the entry `highlightInitial`, whose `focusHighlightedItem` calls
    // `focusElement(item)` without ever reading the active element. So a live
    // density flip puts the focus back on the highlighted item whatever a person
    // was doing. `date-picker` gates both on the event — the teardown half
    // included, since the disposer would otherwise yank focus from the other end —
    // and it was fixed there first because its segmented field sits *outside* the
    // surface, so even the disposer's `contains` guard never saw the victim. A
    // select's surface holds everything a person can be doing inside it, which
    // makes this the quiet case, not the absent one. Named debt (audit of
    // 2026-09-06): the same gate belongs here, and the two files settle together.
    "PRESENTATION.SYNC": { guard: "isOpen", target: "open", reenter: true },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "COLLECTION.SYNC": { actions: ["syncCollection"] },
    "FORM.RESET": { actions: ["resetToInitialValue"] },
  },

  states: {
    closed: {
      entry: ["clearTransient"],
      // Exit rather than the open state's entry, for the menu's reason: the
      // interpreter installs effects before entry actions, and an effect that
      // hides or moves things would blur the trigger before it was captured.
      exit: ["captureFinalFocus"],
      on: {
        "TRIGGER.CLICK": { guard: "isEnabled", actions: ["openSelect"] },
        "TRIGGER.POINTERDOWN": { guard: "isEnabled", actions: ["openSelect"] },
        "TRIGGER.KEYDOWN": { guard: "isEnabled", actions: ["openSelect"] },
        // APG select-only: a printable character on the closed trigger opens and
        // highlights the first match. It never selects while closed — the
        // deliberate divergence from the Windows native control.
        "TYPEAHEAD.KEY": {
          guard: "isTypeaheadEnabled",
          actions: ["deferTypeaheadKey", "openSelect"],
        },
      },
    },
    open: {
      entry: ["highlightInitial"],
      effects: [
        "trackSurfaceDir",
        "trackDismissable",
        "lockPageScroll",
        // Before anything that moves the focus. A focus landing in a surface
        // still parked at `0,0` scrolls the page there to reveal it.
        "trackAnchorPosition",
        "focusContent",
        "proxyTabs",
        "hideOutside",
        "captureIntents",
        "trackSelectionFlash",
        "trackScrollEdges",
      ],
      on: {
        // The release of the press that opened it is not a toggle.
        "TRIGGER.CLICK": [{ guard: "isWithinReopenGrace" }, { actions: ["closeSelect"] }],
        "ITEM.POINTERMOVE": {
          guard: "isItemEnabled",
          actions: ["highlightItem", "focusHighlighted"],
        },
        "ITEM.POINTERLEAVE": { guard: "isLeavingHighlighted", actions: ["clearHighlight"] },
        "ITEM.CLICK": SELECT_TRANSITIONS,
        // Enter, Space and the A button. It clicks the element rather than
        // shortcutting to the commit, so a keyboard activation and a pointer one
        // run exactly the same handlers (the menu's arrangement).
        "ITEM.ACTIVATE": { guard: "hasHighlight", actions: ["activateHighlighted"] },
        // Tab and Alt+ArrowUp. Not routed through the item's own click like
        // `ITEM.ACTIVATE` above, and the difference is the blink: both of these
        // move the focus out in the same gesture, so holding the surface open
        // for 150ms would blink a row nobody is looking at — and Tab's proxy
        // would take the focus out from under it while it did.
        "ITEM.COMMIT": [
          { guard: "hasHighlight", actions: ["commitHighlighted", "closeSelect"] },
          // Nothing highlighted is still a close: the gesture is "leave", and a
          // guard that only committed would leave the surface open behind a Tab
          // whose focus has already gone.
          { actions: ["closeSelect"] },
        ],
        "HIGHLIGHT.MOVE": { actions: ["moveHighlight", "focusHighlighted"] },
        "HIGHLIGHT.PAGE": { actions: ["pageHighlight", "focusHighlighted"] },
        "TYPEAHEAD.KEY": {
          guard: "isTypeaheadEnabled",
          actions: ["typeaheadHighlight", "focusHighlighted"],
        },
        "FLASH.END": { actions: ["clearFlash", "closeSelect"] },
        // Never a commit: Escape, an outside press and B all leave the value alone.
        "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closeSelect"] },
        "CANCEL.CLICK": { actions: ["invokeOnDismiss", "closeSelect"] },
      },
    },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
      isOpen: ({ context }) => context.get("open"),
      isItemEnabled: isEventItemEnabled,
      hasHighlight: ({ context, prop }) =>
        !prop("disabled") && context.get("highlightedValue") !== null,
      isLeavingHighlighted: ({ context, event }) =>
        event.type === "ITEM.POINTERLEAVE" && event.value === context.get("highlightedValue"),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        return prop("closeOnInteractOutside");
      },

      shouldCloseOnSelect(params) {
        return isEventItemEnabled(params) && params.prop("closeOnSelect");
      },

      /**
       * The blink only exists where it means something: a popup on a desktop
       * that is about to close — and through `resolveEnvironment`, so an app
       * pinned to `data-motion` keeps its own answer.
       */
      shouldFlash(params) {
        const { prop, computed, scope } = params;
        if (!prop("selectionFlash") || !prop("closeOnSelect")) return false;
        if (computed("presentation") !== "popup") return false;
        if (!isEventItemEnabled(params)) return false;
        return !resolveEnvironment(getContentEl(scope)).reducedMotion;
      },

      isTypeaheadEnabled: ({ prop }) => prop("typeahead") && !prop("disabled"),

      isWithinReopenGrace({ refs }) {
        const openedAt = refs.get("openedAt");
        return openedAt !== 0 && Date.now() - openedAt < REOPEN_GRACE_MS;
      },
    },

    actions: {
      openSelect: openSurface,

      closeSelect({ context, refs, event }) {
        refs.set("closedByCommit", event.type === "ITEM.COMMIT");
        context.set("open", false);
      },

      setOpen({ context, event }) {
        if (event.type === "OPEN.SET") context.set("open", event.open);
      },

      captureFinalFocus({ refs, scope }) {
        const active = scope.getActiveElement();
        refs.set("finalFocusEl", active === null || active.tagName === "BODY" ? null : active);
      },

      /**
       * The closed state starts clean: whatever a keystroke asked for on the way
       * in is void once the surface is gone, and the highlight goes with it.
       * Guarded on the *previous* state so the machine's very first entry cannot
       * erase a `defaultHighlightedValue` nobody has consumed yet.
       */
      clearTransient(params) {
        const { refs, state } = params;
        refs.set("pendingHighlight", null);
        refs.set("pendingTypeaheadKey", null);
        if (state.previous() === "open") commitHighlight(params, null);
      },

      /**
       * Runs as the open state's **entry** — after the effects, after the
       * adapter has painted — so the items exist and every request the trigger
       * recorded can finally be honoured, in priority order: the keystroke that
       * opened the surface, then Home/End (which force an end even past a
       * selection), then the selected item, then the end the arrow key named.
       *
       * The deferred typeahead key is consumed here rather than replayed by
       * `focusContent`, and the ordering is the reason: effects install before
       * entry actions, so a replay from the effect would be overwritten by this
       * very action a moment later.
       */
      highlightInitial(params) {
        const { context, refs, scope } = params;
        const key = refs.get("pendingTypeaheadKey");
        refs.set("pendingTypeaheadKey", null);
        if (key !== null) {
          applyTypeahead(params, key);
          focusHighlightedItem(params);
          return;
        }
        const pending = refs.get("pendingHighlight");
        refs.set("pendingHighlight", null);
        if (pending === "first" || pending === "last") {
          applyRoving(params, pending);
          focusHighlightedItem(params);
          return;
        }
        const value = context.get("value");
        const selected = value === null ? null : getItemEl(scope, value);
        if (selected !== null && !isItemDisabled(selected)) {
          commitHighlight(params, value);
        } else {
          applyRoving(params, pending ?? "next");
        }
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

      clearHighlight(params) {
        commitHighlight(params, null);
      },

      moveHighlight(params) {
        if (params.event.type === "HIGHLIGHT.MOVE") applyRoving(params, params.event.action);
      },

      pageHighlight(params) {
        if (params.event.type === "HIGHLIGHT.PAGE") applyPage(params, params.event.direction);
      },

      focusHighlighted: focusHighlightedItem,

      typeaheadHighlight(params) {
        if (params.event.type === "TYPEAHEAD.KEY") applyTypeahead(params, params.event.key);
      },

      deferTypeaheadKey({ refs, event }) {
        if (event.type === "TYPEAHEAD.KEY") refs.set("pendingTypeaheadKey", event.key);
      },

      selectItem: commitValue,

      /**
       * The same commit as `selectItem`, from the highlight rather than from a
       * click event. Written out rather than folded into `commitValue` because
       * the disabled check has no click to have already made it.
       */
      commitHighlighted({ context, prop, scope }) {
        if (prop("disabled")) return;
        const value = context.get("highlightedValue");
        if (value === null) return;
        const item = getItemEl(scope, value);
        if (item !== null && isItemDisabled(item)) return;
        context.set("value", value);
      },

      activateHighlighted({ context, prop, scope }) {
        if (prop("disabled")) return;
        const value = context.get("highlightedValue");
        if (value === null) return;
        const item = getItemEl(scope, value);
        if (item === null || isItemDisabled(item)) return;
        item.click();
      },

      /**
       * The blink owns the close: `FLASH.END` is what finally calls
       * `closeSelect`. The timer is cancelled by `trackSelectionFlash`'s
       * disposer — a select dismissed mid-blink would otherwise fire into a
       * surface that has already left.
       */
      flashSelection(params) {
        const { context, refs, event, send } = params;
        if (event.type !== "ITEM.CLICK") return;
        refs.get("flashTimer")?.();
        context.set("flashingValue", event.value);
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

      /**
       * One action for both ways out that are not a commit. The cancel button is
       * the touch twin of the B button, so it reports the same reason — the
       * layer-stack vocabulary has no "cancel", and inventing one would be a
       * change to another component's contract.
       */
      invokeOnDismiss({ prop, event }) {
        if (event.type === "CONTENT.DISMISS") prop("onDismiss")?.({ reason: event.reason });
        if (event.type === "CANCEL.CLICK") prop("onDismiss")?.({ reason: "back" });
      },

      /** `api.setValue` — the value moves, `open` never does. */
      setValue({ context, event }) {
        if (event.type === "VALUE.SET") context.set("value", event.value);
      },

      resetToInitialValue({ context, refs }) {
        context.set("value", refs.get("initialValue"));
      },

      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      syncPlacement({ context, event }) {
        if (event.type === "POSITION.SYNC") context.set("currentPlacement", event.placement);
      },

      /**
       * The one writer of `valueLabel`, so its three rules cannot contradict
       * each other: a `null` value clears it; a value whose item is rendered
       * captures the live label; a value whose item is *gone* keeps the last
       * capture — but only when it is a capture *of that value*. A value the
       * DOM has never answered for gets `null`, not a caption borrowed from
       * whatever was selected before.
       */
      syncCollection({ context, refs, scope }) {
        context.set("hasSymbolGutter", hasSymbolGutter(scope));
        const value = context.get("value");
        if (value === null) {
          refs.set("labelValue", null);
          context.set("valueLabel", null);
          return;
        }
        const item = getItemEl(scope, value);
        if (item !== null) {
          refs.set("labelValue", value);
          context.set("valueLabel", getItemLabel(item));
          return;
        }
        if (refs.get("labelValue") !== value) context.set("valueLabel", null);
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
       * Machine level, not open level, and that is the whole point of the
       * always-mounted content: the closed trigger shows the selected label, the
       * closed typeahead finds the items, and the form mirror knows what it
       * carries — three reads that need the collection while nothing is open.
       */
      trackCollection({ scope, send }) {
        send({ type: "COLLECTION.SYNC" });
        // Said here, where the collection is already being read, and said once:
        // `role="combobox"` demands a name and this component cannot invent one.
        // The menu makes the twin call for the surface it cannot name
        // (`menu.machine.ts`, `trackParts`). No deferral, unlike the slider's: the
        // name a `field` supplies is the trigger's own control id, written during
        // the render that commits both elements, not by an effect that runs after
        // this one. **Absent is not nameless** — nothing is rendered on a server,
        // and warning then would fire on every tree before its first paint.
        const trigger = getTriggerEl(scope);
        warn(
          isDev() && trigger !== null && !hasAccessibleName(trigger),
          "a select has no accessible name — pass `label` or `labelledBy`, or render it inside a `field`",
        );
        const content = getContentEl(scope);
        if (content === null) return;
        return observeChildren(content, () => send({ type: "COLLECTION.SYNC" }));
      },

      /**
       * The native `reset` runs first (`timeout 0`), then the machine follows it
       * — so the mirror and the trigger agree with the form instead of racing
       * it. The owner form is the mirror's own `form` property, which already
       * resolves both the attribute and the ancestor.
       */
      trackFormReset({ scope, send }) {
        const mirror = getHiddenSelectEl(scope);
        const form = mirror?.form ?? null;
        const win = form?.ownerDocument.defaultView ?? null;
        if (form === null || win === null) return;
        let cancel: VoidFunction | null = null;
        const remove = addDomEvent(form, "reset", () => {
          cancel?.();
          cancel = timeout(
            win,
            () => {
              cancel = null;
              send({ type: "FORM.RESET" });
            },
            0,
          );
        });
        return () => {
          cancel?.();
          remove();
        };
      },

      /**
       * Parity M5, inherited whole from the menu: `preventOutsideActivation`
       * makes the click that closes a select stop there instead of activating
       * what was underneath. The swallow logic lives in the shared layer options
       * — see `menu.machine.ts` for the archaeology of the one-shot listener.
       */
      trackDismissable({ prop, scope, send }) {
        const content = getContentEl(scope);
        const doc = content?.ownerDocument;
        const win = doc?.defaultView ?? null;

        return trackDismissableLayer(content, {
          id: getContentId(scope),
          type: "listbox",
          modal: prop("modal"),
          parentId: prop("parentId"),
          // The sheet's cancel too: it sits beside the listbox, so a press on it
          // was outside and reported `outside-pointer` instead of its own `back`
          // (R59). The cancel alone and not the positioner, whose box no stylesheet
          // is trusted to keep out of the pointer's way (decision 01).
          exclude: () => [
            getTriggerEl(scope),
            getCancelTriggerEl(scope),
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
            // A trusted click follows its own pointerup within a frame; the fuse
            // only exists so a gesture that ended in a drag cannot leave a
            // listener waiting for a click nobody meant.
            cancelFuse = timeout(win, removeClick, REOPEN_GRACE_MS);
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
       * The sheet branch clears what a previous popup pass left behind, on
       * install rather than on teardown: a disposer would run while `presence`
       * still holds the node for its exit, and the surface would snap to `0,0`
       * mid-fade.
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
        context.set("surfaceDir", resolveDir(prop("dir"), getTriggerEl(scope)));
      },

      trackAnchorPosition({ prop, context, computed, scope, send }) {
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
          matchWidth: prop("matchWidth"),
          // From the trigger, not from the surface: the surface is portalled into
          // `document.body` and would report the document direction, while the
          // alignment belongs to the region the trigger sits in.
          dir: resolveDir(prop("dir"), getTriggerEl(scope)),
          strategy: prop("strategy"),
          boundary: prop("boundary"),
          getAnchorRect: prop("getAnchorRect"),
          // Frozen for the length of the blink, and only there. The commit is
          // synchronous: `value` moves, `syncCollection` rewrites `valueLabel`,
          // the trigger's caption changes and the trigger resizes — while
          // `flashSelection` still holds the surface open for 150ms. Without
          // this, the `ResizeObserver` re-fits a fully opaque surface one frame
          // before it fades, which is the "truc chelou" of the review. Every
          // other way out closes in the same transition, so this effect's
          // disposer has already stopped the tracker by the observer's next
          // frame; and with `closeOnSelect` off there is no flash at all, so the
          // surface goes on tracking its new trigger, which is what it owes.
          paused: () => context.get("flashingValue") !== null,
          onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
        });
      },

      /**
       * The surface takes the focus so the keys reach it; `highlightInitial`
       * moves it onto an item straight after, from the open state's entry.
       *
       * The disposer is the restore, and it only fires when the focus is still
       * inside: a person who left by clicking elsewhere, or by tabbing past the
       * trigger, has already said where they want to be. Inside the positioner,
       * not the listbox: a press on the sheet's cancel beside it focuses the cancel.
       * A trigger disabled while open takes nothing, so `restoreFocus` falls back
       * on its neighbour (R61).
       */
      focusContent({ prop, refs, scope }) {
        const content = getContentEl(scope);
        if (content === null) return;
        const layer = getPositionerEl(scope) ?? content;
        focusElement(content);
        return () => {
          if (!prop("restoreFocus")) return;
          if (!contains(layer, scope.getActiveElement())) return;
          const target = prop("finalFocus")?.() ?? refs.get("finalFocusEl") ?? getTriggerEl(scope);
          restoreFocus(target, layer);
        };
      },

      /**
       * Tab out of the portalled surface lands after the trigger — and the
       * connect's own Tab handling has already closed the select without a
       * commit before this proxy carries the focus on (APG select-only).
       *
       * Modal: the step waits for this disposer. Effects tear down in reverse,
       * so `hideOutside` has released the page by then and the trigger and its
       * neighbours are focusable again; `focusContent`'s restore runs after and
       * finds the focus already out. Placed only when the surface is really
       * closing and by the commit the Tab asked for: a parent that refused that
       * close, then closed for Escape or a click, owes the trigger, and a
       * `reenter` keeps the surface open.
       */
      proxyTabs({ prop, context, refs, scope }) {
        return proxyTabFocus(getContentEl(scope), {
          triggerNode: () => getTriggerEl(scope),
          placeOnDispose: prop("modal")
            ? () => !context.get("open") && refs.get("closedByCommit")
            : undefined,
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
       * Not `trapped` — the popover's reason, kept: a trapped scope silences the
       * spatial engine at the bottom of the stack and makes the select's own
       * interior unreachable to a d-pad.
       *
       * The claimed set is deliberately narrow (components.md: « A ouvre,
       * D-pad, A choisit, B annule ») — `moveLeft`/`moveRight`, X, Y, the page
       * intents and the scroll stick all pass through, because the real focus
       * is inside the scroller and the platform already answers them.
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
            send({ type: "CONTENT.DISMISS", reason: "back" });
            return true;
          }
          if (!ownsFocus(scope)) return false;
          if (event.intent === "select") {
            send({ type: "ITEM.ACTIVATE" });
            return true;
          }
          if (event.intent === "moveDown") {
            send({ type: "HIGHLIGHT.MOVE", action: "next" });
            return true;
          }
          if (event.intent === "moveUp") {
            send({ type: "HIGHLIGHT.MOVE", action: "prev" });
            return true;
          }
          return false;
        });
      },

      /** See `flashSelection` — this effect exists for its disposer. */
      trackSelectionFlash({ refs, context }) {
        return () => {
          refs.get("flashTimer")?.();
          refs.set("flashTimer", null);
          context.set("flashingValue", null);
        };
      },

      /**
       * `data-scroll` on the scroller, written straight onto the node — the
       * shared affordance the menu introduced, and the select is its second
       * consumer. Never conditioned on reduced motion: it is not an animation,
       * it is the only indication that there is more list.
       */
      trackScrollEdges({ scope }) {
        return trackEdges(getContentEl(scope));
      },
    },
  },
});
