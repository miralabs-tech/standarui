/**
 * The date picker is the select's surface with a *date* — and, unlike the select,
 * it owns none of what is inside it. The month grid is a `calendar` and the typed
 * date is a `date-field`, two machines this one drives **by props**
 * (`getCalendarProps`, `getFieldProps`) rather than by reaching into them
 * That is the whole reason the family is three
 * components: an inline calendar has one state and pays none of the eight effects
 * below, and a birth-date field needs no surface at all (§2).
 *
 * Everything structural here is `select.machine.ts`, kept verbatim so the two
 * surfaces cannot drift: two states projecting `context.open`, `PRESENTATION.SYNC`
 * re-entering `open` on a density flip, `captureFinalFocus` on the **exit** of
 * `closed` (the interpreter installs effects before entry actions, and an effect
 * that hides or moves things would blur the trigger before it was captured), and
 * the eight effects of `select.machine.ts:389-398`. The two that close the
 * select's list are deliberately not taken: there is no selection blink on a
 * grid, and a month does not scroll, so neither `trackSelectionFlash` nor
 * `trackScrollEdges` has anything to say here (§5.3).
 *
 * What `open` adds is an entry, `focusInitialCell` — `select.machine.ts:387` is
 * the precedent, `highlightInitial`. The APG's Date Picker Dialog opens onto the
 * day, and the day is the grid's single roving tab stop, so the picker can put the
 * focus there without knowing which component drew the grid.
 */

import { hasAccessibleName } from "../../a11y/accessible-name";
import { hideOthers } from "../../a11y/aria-hidden";
import { lockScroll } from "../../a11y/scroll-lock";
import { addDomEvent } from "../../dom/event";
import { timeout } from "../../dom/raf";
import { resolveDir } from "../../dom/text-dir";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { proxyTabFocus } from "../../focus/proxy-tab-focus";
import { focusWentElsewhere, restoreFocus } from "../../focus/restore-focus";
import { trackDismissableLayer } from "../../interaction/dismissable";
import { getLayerStack, isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import { focusElement, getFirstTabbable } from "../../nav";
import { trackPosition } from "../../positioner/track-position";
import type { Density, Direction } from "../../types";
import { getToday } from "../../utils/date-format";
import { isDev } from "../../utils/env";
import { shallowEqual } from "../../utils/equality";
import { warn } from "../../utils/invariant";
import { clampDate, type DateValue } from "../../utils/plain-date";
import {
  getBackdropId,
  getCancelTriggerId,
  getCloseTriggerEl,
  getContentEl,
  getContentId,
  getEnvironmentEl,
  getInitialCellEl,
  getPositionerEl,
  getRootEl,
  getTriggerEl,
  hasLabel,
  hasTitle,
} from "./date-picker.dom";
import type { DatePickerSchema } from "./date-picker.types";

type Params = MachineParams<DatePickerSchema>;

/** The inline properties `trackPosition` writes and never cleans up itself. */
const POSITION_STYLES = [
  "position",
  "top",
  "left",
  "transform",
  "width",
  "--sui-transform-origin",
] as const;

/**
 * How long a swallowed outside press keeps waiting for the click that belongs to
 * it. The select's constant, and the select's reason: a trusted click follows its
 * own pointerup within a frame, so the fuse only exists for a gesture that ended
 * in a drag and will never produce one.
 */
const OUTSIDE_CLICK_FUSE_MS = 300;

/**
 * One shape for the value, whichever child reported it. A `date-field` at a finer
 * granularity hands back an object with `hour` on it, and `shallowEqual` compares
 * key sets — so a value that round-tripped through the field would never compare
 * equal to the same day chosen in the grid, and every commit would notify.
 */
function toPlainDate(value: DateValue | null): DateValue | null {
  if (value === null) return null;
  return { year: value.year, month: value.month, day: value.day };
}

/**
 * Kept word for word from `dialog`, `menu` and `popover`. `select` has its own and
 * it is deliberately not this one: its trigger renders the picked value as real
 * text, so it asks `labels`/`closest("label")` where this asks `textContent`. A
 * date-picker trigger renders nothing by default, which is why it takes this side.
 */
/**
 * `PRESENTATION.SYNC` re-enters `open` from `open`, so the two focus-moving pieces
 * would replay on a live density flip: `focusContent` puts the focus back in the
 * surface, `focusInitialCell` moves it onto the day, and whoever was typing in the
 * segmented field — which is not portalled, and sits outside `content` entirely —
 * loses the caret mid-date. The six other effects genuinely must rebuild, which is
 * why the reentry stays and only these two are silenced.
 *
 * Both halves of the reentry, not just the reinstall: the interpreter tears the
 * effects down before it installs them again, and `focusContent`'s disposer would
 * otherwise see the focus still inside the surface and hand it back to the trigger.
 * That disposer belongs to the install the *open* made, so the event has to be read
 * live at teardown rather than captured when the effect went in.
 */
function isPresentationReentry(event: Params["event"]): boolean {
  return event.type === "PRESENTATION.SYNC";
}

function commit(params: Params, value: DateValue | null): void {
  params.context.set("value", toPlainDate(value));
}

export const machine: Machine<DatePickerSchema> = createMachine<DatePickerSchema>({
  props({ props }) {
    return {
      defaultValue: null,
      defaultOpen: false,
      presentation: "auto",
      closeOnSelect: true,
      clearable: false,
      placement: "bottom-start",
      gap: 4,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      // The select's `true` inverted, and the reason is the content: a listbox is
      // a widened trigger, a month is seven cells wide whatever the field measures.
      matchWidth: false,
      strategy: "fixed",
      closeOnEscape: true,
      closeOnInteractOutside: true,
      preventOutsideActivation: true,
      modal: false,
      restoreFocus: true,
      readOnly: false,
      required: false,
      invalid: false,
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    // Read once for the life of the service: `context` runs once, while every
    // `init` below is re-invoked on each read, so a clock placed inside one would
    // be consulted on every property access. The calendar narrows the same
    // divergence the same way — the markup depends on the page, not on the day.
    const fallbackPage = prop("today") ?? getToday();

    return {
      open: bindable<boolean>(() => ({
        defaultValue: prop("defaultOpen"),
        value: prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "date-picker open",
      })),
      value: bindable<DateValue | null>(() => ({
        defaultValue: prop("defaultValue") ?? null,
        value: prop("value"),
        // Without it every commit would be a fresh object, and both children —
        // a month of 42 cells and a strip of spinbuttons — would re-render for a
        // date that had not moved.
        isEqual: shallowEqual,
        onChange: (value) => prop("onValueChange")?.({ value }),
        debugLabel: "date-picker value",
      })),
      /**
       * Internal, and deliberately not a prop: a consumer who wants a page names a
       * `defaultValue`. What it exists for is the seam — the calendar is controlled
       * on it, so a date typed in the field moves the grid and a grid that paged
       * itself is where the next open starts.
       */
      focusedValue: bindable<DateValue>(() => ({
        defaultValue: clampDate(
          prop("value") ?? prop("defaultValue") ?? fallbackPage,
          prop("min"),
          prop("max"),
        ),
        isEqual: shallowEqual,
      })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      currentPlacement: bindable(() => ({ defaultValue: prop("placement") })),
      hasTitle: bindable<boolean>(() => ({ defaultValue: false })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
    };
  },

  computed: {
    presentation({ prop, context }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      return context.get("density") === "touch" ? "sheet" : "popup";
    },
    hasValue: ({ context }) => context.get("value") !== null,
    /**
     * One answer for every consequence of modality: `aria-modal`, the spatial
     * trap, the dismissable layer and `hideOutside`. Four sites tested `modal`
     * alone until 2026-09-06, so `modal` on an anchored popup hid the whole page
     * from assistive technology and trapped the d-pad, while the surface itself
     * correctly declined to claim `aria-modal`. `lockPageScroll` stays out of
     * this on purpose: it answers the *presentation*, because a sheet covers the
     * screen whether or not it is modal (`preventScroll` says so in its type).
     */
    isModal: ({ prop, computed }) => computed("presentation") === "sheet" && prop("modal"),
  },

  /**
   * No `initialValue` photo here. One was written until 2026-09-06, with a comment
   * promising "the field's own `FORM.RESET`" — a reset this machine never had, and
   * never needs: the form is the field's (`getFieldProps`, and this anatomy has no
   * hidden input of its own), so a reset restores the field, which reports back
   * through `onValueChange` like any other edit. The ref was written once and read
   * nowhere.
   */
  refs() {
    return { finalFocusEl: null };
  },

  initialState({ prop }) {
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: ["trackEnvironment"],

  watch({ context, computed, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    track(
      () => [computed("presentation")],
      () => send({ type: "PRESENTATION.SYNC" }),
    );
    // The one place the two children are joined: a date arriving from either of
    // them moves the page, so the grid shows the month of what was just typed
    // rather than the month it happened to be on.
    track(
      () => [context.get("value")],
      () => action(["syncPage"]),
    );
    // The popover's arrangement, and no effect of its own: the title mounts with
    // the surface in the same commit, and an adapter plays its watchers after that
    // commit — so reading the DOM here is reading it once it exists.
    track(
      () => [hasTitle(scope), hasLabel(scope)],
      () => action(["syncParts"]),
    );
  },

  on: {
    "VALUE.SET": { actions: ["setValue"] },
    "FIELD.CHANGE": { actions: ["setValue"] },
    "CALENDAR.PAGE": { actions: ["setPage"] },
    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    // The density flip tears the open state down and builds it back: the position
    // tracker leaves, the scroll lock arrives, the geometry changes.
    //
    // `select.machine.ts:381` re-enters the same way and replays the same two
    // focus-moving pieces — `focusContent` and the entry `highlightInitial`, which
    // calls `focusHighlightedItem` with no read of the active element either. The
    // gate below is taken here and not there because the exposure is not the same:
    // a select's surface holds everything a person can be doing, while this one has
    // a segmented field beside it, outside `content`, where a date is typed while
    // the grid is open. Named debt (audit of 2026-09-06), and the two files must be
    // settled together — the select's `PRESENTATION.SYNC` wants the twin comment.
    "PRESENTATION.SYNC": { guard: "isOpen", target: "open", reenter: true },
    "PARTS.SYNC": { actions: ["syncParts"] },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "CLEAR.CLICK": { guard: "isClearable", actions: ["clearValue"] },
  },

  states: {
    closed: {
      // Exit rather than the open state's entry, for the select's reason: the
      // interpreter installs effects before entry actions, and an effect that
      // hides or moves things would blur the trigger before it was captured.
      exit: ["captureFinalFocus"],
      on: {
        "TRIGGER.CLICK": { guard: "isEnabled", actions: ["openPicker"] },
      },
    },
    open: {
      entry: ["focusInitialCell"],
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
        "warnCloseTriggerName",
      ],
      on: {
        // A disclosure, not the select's open-only trigger: the same button closes.
        "TRIGGER.CLICK": { actions: ["closePicker"] },
        "CALENDAR.SELECT": [
          { guard: "shouldCloseOnSelect", actions: ["commitValue", "closePicker"] },
          { actions: ["commitValue"] },
        ],
        // Never a commit: Escape, an outside press and B all leave the value alone.
        "CONTENT.DISMISS": { guard: "canDismiss", actions: ["invokeOnDismiss", "closePicker"] },
        "CANCEL.CLICK": { actions: ["invokeOnDismiss", "closePicker"] },
        "CLOSE.CLICK": { actions: ["closePicker"] },
      },
    },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
      isOpen: ({ context }) => context.get("open"),
      isClearable: ({ prop }) => prop("clearable") && !prop("disabled") && !prop("readOnly"),
      shouldCloseOnSelect: ({ prop }) => prop("closeOnSelect"),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, event }) {
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        return prop("closeOnInteractOutside");
      },
    },

    actions: {
      openPicker({ context }) {
        context.set("open", true);
      },

      closePicker({ context }) {
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
       * The open state's **entry** — after the effects, after the adapter has
       * painted — so the grid exists and `focusContent` has already put the focus
       * in the surface. This moves it onto the day the APG asks for, and falls back
       * to the first tabbable for a surface that holds no grid at all.
       *
       * Not on a reentry: see `isPresentationReentry`.
       */
      focusInitialCell({ event, scope }) {
        if (isPresentationReentry(event)) return;
        const content = getContentEl(scope);
        if (content === null) return;
        const target = getInitialCellEl(scope) ?? getFirstTabbable(content);
        if (target !== null) focusElement(target);
      },

      commitValue(params) {
        if (params.event.type === "CALENDAR.SELECT") commit(params, params.event.value);
      },

      setValue(params) {
        const { event } = params;
        if (event.type === "VALUE.SET" || event.type === "FIELD.CHANGE") {
          commit(params, event.value);
        }
      },

      clearValue({ context }) {
        context.set("value", null);
      },

      setPage({ context, event }) {
        if (event.type === "CALENDAR.PAGE") context.set("focusedValue", event.value);
      },

      /**
       * A cleared value leaves the page where it was: the month somebody was
       * looking at is not something a clear button asked to change.
       */
      syncPage({ context }) {
        const value = context.get("value");
        if (value !== null) context.set("focusedValue", value);
      },

      /**
       * One action for both ways out that are not a commit. The cancel button is
       * the touch twin of the B button, so it reports the same reason — the
       * layer-stack vocabulary has no "cancel", and inventing one would be a change
       * to another component's contract.
       */
      invokeOnDismiss({ prop, event }) {
        prop("onDismiss")?.({ reason: event.type === "CONTENT.DISMISS" ? event.reason : "back" });
      },

      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      syncPlacement({ context, event }) {
        if (event.type === "POSITION.SYNC") context.set("currentPlacement", event.placement);
      },

      syncParts({ context, scope }) {
        context.set("hasTitle", hasTitle(scope));
        context.set("hasLabel", hasLabel(scope));
      },
    },

    effects: {
      trackEnvironment({ scope, send }) {
        const node = getEnvironmentEl(scope);
        // Said here, where the DOM is already being read, and said once — the
        // select's arrangement (`trackCollection`), for the select's reason: an
        // `aria-haspopup="dialog"` button demands a name and this component can
        // invent none. The rendered `label` part names the *field*, never this,
        // so `label`, `labelledBy` or a `field` above is the whole of it.
        // **Absent is not nameless** — nothing is rendered on a server, and a
        // machine that never started never reaches this line.
        const trigger = getTriggerEl(scope);
        warn(
          isDev() && trigger !== null && !hasAccessibleName(trigger),
          "a date picker has no accessible name — pass `label` or `labelledBy`, or render it inside a `field`",
        );
        const onChange = (density: Density): void => send({ type: "ENVIRONMENT.SYNC", density });
        onChange(resolveEnvironment(node).density);
        return watchEnvironment(node, {
          onChange: (environment) => onChange(environment.density),
        });
      },

      /**
       * The surface is the one part that emits a `dir` nobody asked for, and the
       * portal is the whole reason: inheritance does not cross one, so the
       * direction has to be carried over explicitly. Read from the trigger, never
       * from the surface, which sits in the body and would only report the
       * document's own direction back to itself — and in an effect rather than in
       * `connect`, so the server emits nothing and the first client render has
       * nothing to disagree with.
       */
      trackSurfaceDir({ prop, context, scope }) {
        context.set("surfaceDir", resolveDir(prop("dir"), getTriggerEl(scope)));
      },

      /**
       * Parity M5, inherited from the select: `preventOutsideActivation` makes the
       * click that closes a picker stop there instead of activating what was
       * underneath. The swallow logic lives in the shared layer options.
       */
      trackDismissable({ prop, computed, scope, send }) {
        const content = getContentEl(scope);
        const doc = content?.ownerDocument;
        const win = doc?.defaultView ?? null;

        return trackDismissableLayer(content, {
          id: getContentId(scope),
          type: "dialog",
          modal: computed("isModal"),
          parentId: prop("parentId"),
          // The root and not just the trigger. This is the first component whose
          // `root` holds other controls beside the trigger — the segmented field,
          // the clear button, the label — and the shape was inherited from `select`,
          // where the trigger is all there is. With the surface open, a click on the
          // clear button was "outside": the pointerdown was prevented, the click
          // that followed was cancelled in capture, the surface closed and the focus
          // went back to the trigger, so the button did nothing on the first press
          // (audit of 2026-09-05). Same widening as `color-picker.surface.ts:77-81`.
          // The sheet's cancel too: it sits beside the content, so a press on it
          // was outside and reported `outside-pointer` instead of its own `back`
          // (R59). The cancel alone and not the positioner, whose box no stylesheet
          // is trusted to keep out of the pointer's way (decision 01). The close
          // trigger for the same reason when it is placed there (R62).
          exclude: () => [
            getRootEl(scope),
            scope.getById(getCancelTriggerId(scope)),
            getCloseTriggerEl(scope),
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
            // only exists so a gesture that ended in a drag cannot leave a listener
            // waiting for a click nobody meant.
            cancelFuse = timeout(win, removeClick, OUTSIDE_CLICK_FUSE_MS);
          },
          onDismiss: (reason) => send({ type: "CONTENT.DISMISS", reason }),
        });
      },

      lockPageScroll({ prop, computed, scope }) {
        if (computed("presentation") === "sheet" && prop("preventScroll") !== false) {
          return lockScroll(getContentEl(scope)?.ownerDocument);
        }
      },

      /**
       * The sheet branch clears what a previous popup pass left behind, on install
       * rather than on teardown: a disposer would run while `presence` still holds
       * the node for its exit, and the surface would snap to `0,0` mid-fade.
       */
      trackAnchorPosition({ prop, computed, scope, send }) {
        const positioner = getPositionerEl(scope);
        if (positioner === null) return;

        if (computed("presentation") !== "popup") {
          for (const name of POSITION_STYLES) positioner.style.removeProperty(name);
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
          onPositioned: (result) => send({ type: "POSITION.SYNC", placement: result.placement }),
        });
      },

      /**
       * The surface takes the focus so the keys reach it; `focusInitialCell` moves
       * it onto the day straight after, from the open state's entry.
       *
       * The disposer is the restore, and it fires when the focus is inside the
       * layer or nowhere (`body`, read on the document, since a shadow root
       * answers `null` for any focus outside it): a person who focused something
       * else, by a click or by tabbing past the trigger, has already said where
       * they want to be. Nowhere covers WebKit, which never focuses a pressed
       * button, so a real press on the trigger blurs the day onto `body` (R63),
       * and a press on blank space with `preventOutsideActivation={false}`.
       * The layer is the positioner, not the content: a press on the sheet's
       * cancel beside it focuses the cancel. A trigger disabled while open takes
       * nothing, so `restoreFocus` falls back on its neighbour (R58).
       *
       * Neither half runs for a reentry: see `isPresentationReentry`.
       */
      focusContent(params) {
        const { prop, refs, scope } = params;
        const content = getContentEl(scope);
        if (content === null) return;
        const layer = getPositionerEl(scope) ?? content;
        if (!isPresentationReentry(params.event)) focusElement(content);
        return () => {
          if (isPresentationReentry(params.event) || !prop("restoreFocus")) return;
          if (focusWentElsewhere(scope.getDoc(), layer, scope.getActiveElement())) return;
          restoreFocus(
            prop("finalFocus")?.() ?? refs.get("finalFocusEl") ?? getTriggerEl(scope),
            layer,
          );
        };
      },

      /**
       * Non-modal, Tab out of the portalled surface goes where the author wrote
       * it: past the trigger, or back onto it.
       *
       * Modal (`isModal`), `hideOutside` makes the trigger and everything around
       * it inert, so there is no "after the trigger" — and unlike `select` and
       * `menu`, Tab does not close this surface, so `placeOnDispose` has nothing
       * to place. Until 2026-10-11 the proxy still handed the step to the inert
       * trigger and the key died on the edge. The proxy now reads the inert
       * trigger and the content's `aria-modal="true"` (from `isModal`) and
       * wraps: Tab from the last stop goes to the first, and
       * back, the grid one stop. Inside a modal dialog, the dialog's trap holds
       * the key for the proxy (`holdTab`, `claimTab`) and stands down.
       *
       * Not `trapFocus`, measured: wiring the trap here cost the date family 62 B
       * gzip, and the family sits 10 B under its CDC ceiling (`scripts/size-budget.ts`).
       * The intents are left alone either way, so the pad still walks the grid.
       */
      proxyTabs({ scope }) {
        return proxyTabFocus(getContentEl(scope), {
          triggerNode: () => getTriggerEl(scope),
        });
      },

      hideOutside({ prop, computed, scope }) {
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
      },

      /**
       * **B and nothing else**. The calendar inside
       * this surface pushed its own scope while it mounted — an adapter starts a
       * child's machine before the parent's watchers run — so this scope sits on
       * top of it, and every intent it declines falls straight through to the grid:
       * the directions, A, and LT/RT for the month. Claiming any of them here would
       * take them away from the component that already answers them.
       *
       * Not `trapped`, the popover's reason kept: a trapped scope answers
       * `consumed` to what it refuses, which would silence the calendar underneath
       * it and the spatial engine at the bottom of the stack.
       */
      captureIntents({ prop, scope, send }) {
        const host = prop("intents");
        const content = getContentEl(scope);
        if (host === null || host === undefined || content === null) return;
        const id = getContentId(scope);
        const stack = getLayerStack(content.ownerDocument);

        return host.pushScope((event) => {
          if (event.intent !== "back") return false;
          // The top-most test and not `ownsFocus`: B is the way back out of a
          // layer whether or not the pad ever walked into it, and a picker with
          // something opened over it must not answer for that layer's B.
          if (!prop("closeOnEscape") || !stack.isTopMost(id)) return false;
          send({ type: "CONTENT.DISMISS", reason: "back" });
          return true;
        });
      },

      /**
       * `close-trigger` is the one part here that carries no name of its own — the
       * consumer gives it one or does not render it, the rule
       * `dialog:close-trigger` lives by — and until 2026-09-06 nothing said so out
       * loud, while `dialog`, `menu` and `popover` all warn for the same part. In
       * the open state because that is when the part exists, and looked up by id
       * rather than queried, so a consumer who places it beside the surface in the
       * positioner is heard too.
       */
      warnCloseTriggerName({ scope }) {
        const close = getCloseTriggerEl(scope);
        warn(
          isDev() && close !== null && !hasAccessibleName(close),
          "a date picker close trigger has no accessible name — give it text, `aria-label` or `title`",
        );
      },
    },
  },
});
