/**
 * The drawer decorates a surface's geometry. It is **not an overlay**, and that is
 * the whole design: it owns `edge`, the detent track, the gesture, the engage grip
 * and the stack effect, and it owns nothing about being open. It reads `open` as a
 * prop from whatever surface it decorates and asks that surface to close through
 * `onDismissRequest` — never by writing `open` itself, which would make it a second
 * owner of a truth the dialog already holds.
 *
 * The consequence is the point: **the decorator does not know what it decorates.**
 * An action sheet at two heights is `menu` plus this machine, and touch `sidebar`
 * is `sidebar` plus this machine at `edge: "start"`, neither of them learning a
 * word about gestures. Five components in this library already have a sheet
 * presentation; a `presentation: "drawer"` inside `dialog` would have let exactly
 * one of them ever have a grabber.
 *
 * **Measurements are not context.** The drag offset, the container size and the
 * running settle live in `refs` and are written straight onto the node — an offset
 * passed through a bindable at 60 Hz is sixty transitions, sixty notifications and
 * sixty adapter renders a second for a number no state depends on. The same
 * arbitrage `data-scroll` and `--sui-collapse-height` already made, and there is no
 * exception left: every detent is a number a caller passed.
 *
 * **What the machine writes, and what it refuses to know.** It publishes
 * `--sui-drag-offset` in signed logical pixels — positive meaning "toward closed"
 * — and lets the sheet turn that into a physical direction per `data-edge`. The
 * settle animates that same custom property rather than `translate`, so the whole
 * geometry (which way `bottom` moves, what `start` means in RTL, the `dvb` maths)
 * stays in one place instead of being restated in JS. It costs the sheet one
 * `@property` registration and buys a machine that never computes a position.
 */

import {
  type EngageIntent,
  getInputModality,
  pushEngageScope,
  trackInputModality,
} from "@standarx/nav";
import { contains } from "../../dom/query";
import { resolveDir } from "../../dom/text-dir";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { settleTo } from "../../gesture/settle";
import { trackDragAxis } from "../../interaction/drag-axis";
import { hasScrollRoom } from "../../interaction/scroll-edges";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams } from "../../machine/types";
import type { Density, InputModality } from "../../types";
import { isDev } from "../../utils/env";
import { warn } from "../../utils/invariant";
import { getBackdropEl, getContentEl, getEnvironmentEl, getGrabberEl } from "./drawer.dom";
import type { DrawerDetent, DrawerEdge, DrawerSchema } from "./drawer.types";

/** The property the sheet reads, and the one the settle animates. */
const DRAG_OFFSET = "--sui-drag-offset";
const PROGRESS = "--sui-drawer-progress";

/** A flick: fast enough that where the finger *is* stops being the question. */
const FLICK_VELOCITY = 0.5;

type Params = MachineParams<DrawerSchema>;

/**
 * Anything at or below zero dropped, anything above one clamped to it, deduplicated,
 * ascending.
 *
 * **No detent means dismissed.** Zero is rejected rather than kept as a bottom rung:
 * a track that can reach nothing is a surface that closes by arriving, and closing
 * belongs to the decorated machine. An empty list resolves to `[1]` — one height,
 * no track, no grabber, which is a plain sheet and a legitimate thing to ask for.
 *
 * **Deduplicated at the percent the splitter announces, not at full precision.** Two
 * rungs closer than a point are one rung to everything that can perceive them: the
 * grabber publishes `aria-valuemin`/`-max`/`-now` as whole percentages, so keeping
 * both would give a focusable `role="separator"` a range whose ends are equal and a
 * keystroke with no audible effect — it passes axe and fails APG.
 */
function resolveDetents(detents: readonly DrawerDetent[]): number[] {
  const out: number[] = [];
  for (const detent of detents) {
    if (!Number.isFinite(detent) || detent <= 0) continue;
    const clamped = Math.min(1, detent);
    if (!out.some((kept) => Math.round(kept * 100) === Math.round(clamped * 100))) {
      out.push(clamped);
    }
  }
  if (out.length === 0) return [1];
  return out.sort((a, b) => a - b);
}

function nearestDetent(detents: number[], value: number): number {
  let best = detents[0] ?? 1;
  for (const detent of detents) {
    if (Math.abs(detent - value) < Math.abs(best - value)) best = detent;
  }
  return best;
}

function fractionOf(detent: DrawerDetent, detents: number[]): number {
  if (!Number.isFinite(detent)) return detents[0] ?? 1;
  return nearestDetent(detents, Math.min(1, Math.max(0, detent)));
}

/**
 * The edge a drag toward "closed" pulls the content away from. `bottom` and `start`
 * close by travelling toward the inline/block start, `top` and `end` toward the end
 * — which is the whole of the direction arithmetic, because `drag-axis` has already
 * mirrored the inline axis for RTL and reports a logical delta.
 */
function closingEdge(edge: DrawerEdge): "start" | "end" {
  return edge === "bottom" || edge === "start" ? "start" : "end";
}

/**
 * Every scroller between the finger and the surface has to be parked at the edge
 * the drag would pull from. Without this, dragging a list downward closes the sheet
 * instead of scrolling it — the first defect of every drawer on the web.
 */
function gestureBelongsToSurface(params: Params, target: EventTarget | null): boolean {
  const content = getContentEl(params.scope);
  if (content === null) return true;
  const axis = params.computed("axis");
  const towards = closingEdge(params.prop("edge"));
  let node = target instanceof Element ? target : null;
  while (node !== null && contains(content, node)) {
    if (hasScrollRoom(node, axis, towards)) return false;
    node = node.parentElement;
  }
  return true;
}

function commitDetent(params: Params, next: DrawerDetent): void {
  const { context, prop, computed } = params;
  if (context.get("detent") === next) return;
  context.set("detent", next);
  prop("onDetentChange")?.({ detent: next, index: computed("detentIndex") });
}

function stepTo(params: Params, delta: number): void {
  const detents = params.computed("detents");
  const index = params.computed("detentIndex") + delta;
  // Hard stops at both ends, and no wrap. A keystroke is discrete and would close
  // by accident; the gesture is the only thing with an "underneath" to fall into.
  if (index < 0 || index >= detents.length) return;
  const next = detents[index];
  if (next !== undefined) commitDetent(params, next);
}

function writeOffset(params: Params, offset: number): void {
  const content = getContentEl(params.scope);
  if (content === null) return;
  content.style.setProperty(DRAG_OFFSET, `${offset}px`);
}

function clearOffset(params: Params): void {
  getContentEl(params.scope)?.style.removeProperty(DRAG_OFFSET);
}

/**
 * Only while a gesture is in flight. Setting it for the life of the surface would
 * cost the content its own scrolling, which is most of what a sheet is.
 *
 * Written from the actions rather than from an effect, because there is no longer a
 * state whose lifetime is the gesture — and there must not be one, or the effect
 * holding the pointer would be recycled along with it (`drawer.types.ts`). The
 * previous value is kept so a consumer who declared `touch-action` inline gets
 * theirs back instead of an empty string.
 */
function freezeScroll(params: Params): void {
  const content = getContentEl(params.scope);
  if (content === null) return;
  params.refs.set("touchAction", content.style.touchAction);
  content.style.touchAction = "none";
}

function thawScroll(params: Params): void {
  const content = getContentEl(params.scope);
  if (content === null) return;
  content.style.touchAction = params.refs.get("touchAction") ?? "";
  params.refs.set("touchAction", null);
}

/**
 * 0…1, and the same number reaches the scrim and the receding page behind it.
 *
 * The backdrop is written to by name rather than left to inherit, and it has to be:
 * it is not a descendant of the surface — the dialog's scrim is a sibling of the
 * positioner the content sits inside — so no value published on the content can
 * ever reach it. A scrim that did not take this number stayed at full strength
 * while the sheet was dragged out from under it.
 */
function publishProgressValue(params: Params, progress: number): void {
  const value = String(Math.max(0, Math.min(1, progress)));
  getContentEl(params.scope)?.style.setProperty(PROGRESS, value);
  getBackdropEl(params.scope)?.style.setProperty(PROGRESS, value);
  params.prop("stackElement")?.()?.style.setProperty(PROGRESS, value);
}

/**
 * The intents are **physical** — `moveRight` is the right-hand side of the pad and
 * of the keyboard, never "forward" (`architecture.md:63`). Turning that into
 * "bigger" or "smaller" is this table plus one sign, and the sign is why the table
 * alone is not enough: a drawer anchored at the bottom grows upward, one anchored
 * at the top grows downward, and on the inline axis the whole thing mirrors again
 * in RTL.
 */
const ENGAGE_STEP: Readonly<Record<EngageIntent, number | "min" | "max">> = {
  moveUp: 1,
  moveDown: -1,
  moveRight: 1,
  moveLeft: -1,
  pageUp: "max",
  pageDown: "min",
  home: "min",
  end: "max",
};

/**
 * Turns `drag-axis`'s travel into this machine's "toward closed", and it is the one
 * multiplication that makes the two agree.
 *
 * `drag-axis` reports a signed distance along an axis, already mirrored for RTL on
 * the inline one. This machine reads a positive number as travel toward *closed*.
 * Those are the same statement only where the sheet is anchored at the **end** of
 * its axis — `bottom` on the block axis, `end` on the inline one — because closing
 * then runs the way the coordinate grows. A `top` or `start` drawer closes toward
 * the origin, so its travel arrives negated, and without this the sheet grew when
 * the finger pushed it away.
 *
 * **No RTL term here, deliberately.** `drag-axis` has already mirrored the inline
 * axis; adding a second mirror would cancel it, which is what made `start` in RTL
 * look correct while `start` in LTR was inverted — one bug hiding another.
 */
function dragSign(edge: DrawerEdge): number {
  return edge === "bottom" || edge === "end" ? 1 : -1;
}

function growSign(params: Params): number {
  const edge = params.prop("edge");
  const anchored = closingEdge(edge) === "start" ? 1 : -1;
  if (params.computed("axis") === "block") return anchored;
  return resolveDir(params.prop("dir"), getContentEl(params.scope)) === "rtl"
    ? -anchored
    : anchored;
}

export const machine: Machine<DrawerSchema> = createMachine<DrawerSchema>({
  props({ props }) {
    return {
      open: false,
      edge: "bottom",
      // The same pair in both densities. `1` is
      // "as tall as the positioner allows", and the sheet takes the safe area off.
      // Forking a default by density is forking the machine through the back door.
      detents: [0.5, 1],
      dismissible: true,
      dismissThreshold: 0.5,
      draggable: true,
      dragFrom: "content",
      stack: false,
      disabled: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable }) {
    return {
      detent: bindable<DrawerDetent>(() => ({
        defaultValue: prop("defaultDetent") ?? prop("detents")[0] ?? 1,
        value: prop("detent"),
        debugLabel: "drawer detent",
      })),
      dragging: bindable<boolean>(() => ({ defaultValue: false })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
    };
  },

  computed: {
    detents({ prop }) {
      return resolveDetents(prop("detents"));
    },
    detentValue({ prop, context }) {
      return fractionOf(context.get("detent"), resolveDetents(prop("detents")));
    },
    detentIndex({ prop, context }) {
      const detents = resolveDetents(prop("detents"));
      return detents.indexOf(fractionOf(context.get("detent"), detents));
    },
    minDetent({ prop }) {
      return resolveDetents(prop("detents"))[0] ?? 1;
    },
    maxDetent({ prop }) {
      const detents = resolveDetents(prop("detents"));
      return detents[detents.length - 1] ?? 1;
    },
    axis({ prop }) {
      const edge = prop("edge");
      return edge === "bottom" || edge === "top" ? "block" : "inline";
    },
    percent({ prop, context }) {
      const detents = resolveDetents(prop("detents"));
      return Math.round(fractionOf(context.get("detent"), detents) * 100);
    },
    hasTrack({ prop }) {
      return resolveDetents(prop("detents")).length > 1;
    },
  },

  refs() {
    return {
      containerSize: null,
      dragOffset: 0,
      entryDetent: null,
      settle: null,
      touchAction: null,
    };
  },

  // Pure, so the server renders the markup the client hydrates into.
  initialState({ prop }) {
    return prop("open") ? "idle" : "closed";
  },

  effects: ["trackEnvironment", "trackModality"],

  watch({ prop, track, send }) {
    track(
      () => [prop("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
  },

  on: {
    "OPEN.SYNC": [{ guard: "isOpen", target: "idle" }, { target: "closed" }],
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "GRABBER.FOCUS": { actions: ["captureFocusSource"] },
    "GRABBER.BLUR": { actions: ["clearFocusSource"] },
    // Top-level rather than per-state: an arrow key and a d-pad press are the same
    // event here, and a surface being dragged is still one whose detent can be
    // named. `closed` cannot be reached by it — nothing is focusable in there.
    "DETENT.ADJUST": { guard: "isEnabled", actions: ["adjustFromIntent"] },
  },

  states: {
    /**
     * Reopening returns to the initial detent, which is what iOS does and what a
     * bindable gives for free: a consumer holding `detent` controlled keeps theirs.
     */
    closed: {
      entry: ["resetDetent", "clearDragOffset"],
    },

    /**
     * A gesture runs **inside** this state and never leaves it, which is the whole
     * reason `dragging` is context (`drawer.types.ts`): `trackDragInput` is the
     * effect holding the captured pointer, and a state change would recycle it
     * mid-gesture and drop the rest of the finger's travel on the floor.
     */
    idle: {
      effects: ["trackDragInput", "publishProgress", "trackStack", "captureSelectIntent"],
      on: {
        "CONTENT.DRAG_START": { guard: "isDraggable", actions: ["beginDrag"] },
        "CONTENT.DRAG": { actions: ["updateDrag"] },
        "CONTENT.DRAG_END": { actions: ["settleDrag"] },
        "CONTENT.DRAG_CANCEL": { actions: ["cancelDrag"] },
        "DETENT.SET": { guard: "isEnabled", actions: ["setDetent"] },
        "DETENT.STEP": { guard: "isEnabled", actions: ["stepDetent"] },
        "DETENT.TOGGLE": { guard: "isEnabled", actions: ["toggleDetent"] },
        "ENGAGE.START": { guard: "canEngage", target: "engaged" },
      },
    },

    /**
     * The snapshot is taken on entry and read on the way out, never cleared on exit:
     * the interpreter runs a state's exit actions before the transition's own, so
     * an exit that cleared it would erase the detent B is there to restore.
     */
    engaged: {
      entry: ["snapshotDetent"],
      effects: ["trackDragInput", "publishProgress", "trackStack", "trackEngage"],
      on: {
        "ENGAGE.END": [
          {
            guard: ({ event }) => event.type === "ENGAGE.END" && event.committed,
            target: "idle",
            actions: ["clearSnapshot"],
          },
          { target: "idle", actions: ["restoreDetent"] },
        ],
      },
    },
  },

  implementations: {
    guards: {
      isOpen: ({ prop }) => prop("open"),
      isEnabled: ({ prop }) => !prop("disabled"),
      isDraggable: ({ prop }) => prop("draggable") && !prop("disabled"),
      // The last clause is what the gesture-in-`idle` shape buys back: a pad
      // pressing A while a finger is mid-drag would move to `engaged` and recycle
      // the very effect holding that finger. It was impossible before only because
      // a drag used to be a state of its own.
      canEngage: ({ prop, computed, context }) =>
        !prop("disabled") &&
        prop("intents") !== null &&
        computed("hasTrack") &&
        !context.get("dragging"),
    },

    actions: {
      syncEnvironment({ context, event }) {
        if (event.type === "ENVIRONMENT.SYNC") context.set("density", event.density);
      },

      /**
       * The modality the page is really being driven with, read once when focus
       * lands — `input`'s shape, and the only one that can be right. The event
       * used to carry a `source` the prop getter filled in with `"keyboard"`
       * whatever had happened, so the pill wore its ring after a mouse press and
       * after a touch, which on a sheet is the *primary* gesture. Read once and
       * held rather than subscribed: the modality of `now` flips to pointer after
       * 300ms of mouse movement whether or not the focus moved.
       */
      captureFocusSource({ context, scope }) {
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      setDetent(params) {
        if (params.event.type !== "DETENT.SET") return;
        commitDetent(params, params.event.detent);
      },

      stepDetent(params) {
        if (params.event.type !== "DETENT.STEP") return;
        stepTo(params, params.event.delta);
      },

      /**
       * The window splitter's collapse/restore: anything below the top goes to the
       * top, and the top steps back one. Not "back to the smallest" — with three
       * detents that would throw away the one the person was actually using.
       */
      toggleDetent(params) {
        const detents = params.computed("detents");
        const index = params.computed("detentIndex");
        if (index === detents.length - 1) {
          stepTo(params, -1);
          return;
        }
        const top = detents[detents.length - 1];
        if (top !== undefined) commitDetent(params, top);
      },

      resetDetent({ context, prop }) {
        context.set("detent", prop("defaultDetent") ?? prop("detents")[0] ?? 1);
      },

      adjustFromIntent(params) {
        if (params.event.type !== "DETENT.ADJUST") return;
        const step = ENGAGE_STEP[params.event.intent];
        const detents = params.computed("detents");
        if (step === "min") {
          const first = detents[0];
          if (first !== undefined) commitDetent(params, first);
          return;
        }
        if (step === "max") {
          const last = detents[detents.length - 1];
          if (last !== undefined) commitDetent(params, last);
          return;
        }
        stepTo(params, step * growSign(params));
      },

      snapshotDetent({ context, refs }) {
        refs.set("entryDetent", context.get("detent"));
      },

      restoreDetent(params) {
        const entry = params.refs.get("entryDetent");
        if (entry !== null) commitDetent(params, entry);
        params.refs.set("entryDetent", null);
      },

      clearSnapshot({ refs }) {
        refs.set("entryDetent", null);
      },

      beginDrag(params) {
        const { refs, computed, scope } = params;
        refs.get("settle")?.cancel();
        refs.set("settle", null);
        refs.set("entryDetent", params.context.get("detent"));
        refs.set("dragOffset", 0);
        params.context.set("dragging", true);
        freezeScroll(params);
        const content = getContentEl(scope);
        const box = content?.getBoundingClientRect();
        // Once per gesture. The surface is the largest detent tall, so the container
        // it travels in is that box divided by the fraction it is showing.
        const extent =
          box === undefined ? 0 : computed("axis") === "block" ? box.height : box.width;
        refs.set("containerSize", extent / (computed("maxDetent") || 1));
      },

      updateDrag(params) {
        if (params.event.type !== "CONTENT.DRAG") return;
        const offset = params.event.position;
        params.refs.set("dragOffset", offset);
        writeOffset(params, offset);
        const container = params.refs.get("containerSize");
        if (container === null || container <= 0) return;
        publishProgressValue(
          params,
          1 - offset / (container * params.computed("detentValue") || 1),
        );
      },

      /**
       * Three branches, and the order between them is the decision: velocity beats
       * position. A flick is a statement about intent that a position cannot
       * contradict — the finger that throws a sheet down an inch has said "away".
       */
      settleDrag(params) {
        if (params.event.type !== "CONTENT.DRAG_END") return;
        params.context.set("dragging", false);
        thawScroll(params);
        const { refs, computed, prop } = params;
        const detents = computed("detents");
        const container = refs.get("containerSize") ?? 0;
        const entry = refs.get("entryDetent") ?? params.context.get("detent");
        const entryValue = fractionOf(entry, detents);
        const { position, velocity } = params.event;
        const travelled = container > 0 ? position / container : 0;
        const landed = entryValue - travelled;
        const index = detents.indexOf(entryValue);

        let target: number | null;
        if (Math.abs(velocity) >= FLICK_VELOCITY) {
          const next = index + (velocity > 0 ? -1 : 1);
          target = next < 0 ? null : (detents[Math.min(next, detents.length - 1)] ?? entryValue);
        } else if (landed < (detents[0] ?? 1) * prop("dismissThreshold")) {
          target = null;
        } else {
          target = nearestDetent(detents, landed);
        }

        // A track that cannot be left by a gesture keeps the person on its bottom
        // rung rather than dropping them out of a surface they cannot reopen.
        if (target === null && !prop("dismissible")) target = detents[0] ?? 1;

        const dismissed = target === null;
        const settled = target ?? entryValue;
        prop("onDragEnd")?.({ detent: dismissed ? entry : settled, dismissed, velocity });

        if (dismissed) {
          refs.set("dragOffset", 0);
          clearOffset(params);
          prop("onDismissRequest")?.();
          return;
        }

        commitDetent(params, settled);
        // Back to "at rest", and it has to be said here rather than left to the
        // `publishProgress` effect: that one republishes on entry to `idle`, and a
        // gesture no longer leaves `idle` to come back to it. Without this the scrim
        // and the receding page stay frozen at whatever fraction the finger let go
        // at — the one thing the state-to-context move could have broken silently.
        publishProgressValue(params, 1);
        // The rest position has moved with the detent, so the offset that keeps the
        // surface visually still is the drag's plus what the track just shifted
        // under it. Animating that back to zero is the settle, and the sheet never
        // learns that anything happened.
        const carried = refs.get("dragOffset") + (settled - entryValue) * container;
        refs.set("dragOffset", carried);
        writeOffset(params, carried);
        const content = getContentEl(params.scope);
        const animation = settleTo(content, {
          property: DRAG_OFFSET,
          from: `${carried}px`,
          to: "0px",
          velocity,
        });
        refs.set("settle", animation);
        refs.set("dragOffset", 0);
        if (animation === null) {
          clearOffset(params);
          return;
        }
        // Written straight onto the node rather than published through `connect`,
        // for the reason `data-scroll` is: it is the lifetime of an animation and
        // no state depends on it. What it buys is real — while WAAPI drives the
        // offset, a CSS transition on the same axis is a second engine on one
        // property, and two engines on one property is a tremble.
        content?.setAttribute("data-settling", "");
        animation.finished
          .then(() => {
            clearOffset(params);
            content?.removeAttribute("data-settling");
          })
          .catch(() => {
            // Cancelled by the next gesture, which has written its own offset
            // already — but the attribute is this animation's to take back.
            content?.removeAttribute("data-settling");
          });
      },

      cancelDrag(params) {
        params.context.set("dragging", false);
        thawScroll(params);
        params.refs.set("dragOffset", 0);
        clearOffset(params);
        publishProgressValue(params, 1);
      },

      clearDragOffset(params) {
        params.refs.get("settle")?.cancel();
        params.refs.set("settle", null);
        params.refs.set("dragOffset", 0);
        clearOffset(params);
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

      /**
       * Guarded rather than assumed, the way the dialog guards it: the unit suite
       * runs a whole gesture with no document in the room, and `getDoc()` throws
       * where the other DOM helpers return null.
       */
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      trackDragInput(params) {
        const { scope, prop, send, computed } = params;
        const from = prop("dragFrom") === "grabber" ? getGrabberEl(scope) : getContentEl(scope);
        if (from === null) return;

        warn(
          isDev() && prop("stack") && prop("stackElement") === undefined,
          "a drawer with `stack` has no `stackElement` — the page behind it will never recede",
        );

        return trackDragAxis(from, {
          axis: computed("axis"),
          dir: prop("dir"),
          isDisabled: () => !prop("draggable") || prop("disabled"),
          canStart: (event) => gestureBelongsToSurface(params, event.target),
          onDragStart: () => send({ type: "CONTENT.DRAG_START" }),
          // Converted once, here, so nothing downstream ever has to ask which way
          // an edge points — and the velocity with it, since the release table
          // reads its sign to tell a flick toward closed from one toward open.
          onDrag: (event) =>
            send({ type: "CONTENT.DRAG", position: event.position * dragSign(prop("edge")) }),
          onDragEnd: (event) => {
            const toClosing = dragSign(prop("edge"));
            send({
              type: "CONTENT.DRAG_END",
              position: event.position * toClosing,
              velocity: event.velocity * toClosing,
            });
          },
          onDragCancel: () => send({ type: "CONTENT.DRAG_CANCEL" }),
        });
      },

      /**
       * Installed after `trackDragInput` so it is torn down before it: the last
       * frame of a gesture must not write onto a node whose listener has already
       * gone. Bottom-up is how a state's effect list reads.
       */
      publishProgress(params) {
        publishProgressValue(params, 1);
        return () => {
          getContentEl(params.scope)?.style.removeProperty(PROGRESS);
          getBackdropEl(params.scope)?.style.removeProperty(PROGRESS);
          params.prop("stackElement")?.()?.style.removeProperty(PROGRESS);
        };
      },

      /** The cleanup is the half that breaks: a page left shrunk after a close. */
      trackStack({ prop }) {
        if (!prop("stack")) return;
        const page = prop("stackElement")?.();
        if (page === null || page === undefined) return;
        page.setAttribute("data-sui-stacked", "");
        return () => {
          page.removeAttribute("data-sui-stacked");
          page.style.removeProperty(PROGRESS);
        };
      },

      /**
       * A is how a pad takes hold, claimed only while the grabber has the focus, so
       * the scope sits on the stack for exactly as long as the grip is possible.
       * Never from a keyboard: Enter and Space on a splitter belong to its own
       * collapse/restore, which the grabber answers directly.
       */
      captureSelectIntent({ prop, context, send }) {
        const host = prop("intents");
        if (host === null) return;
        return host.pushScope((event) => {
          if (event.intent !== "select" || event.source === "keyboard") return false;
          if (prop("disabled") || context.get("focusSource") === null) return false;
          send({ type: "ENGAGE.START" });
          return true;
        });
      },

      trackEngage({ prop, send, scope }) {
        const host = prop("intents");
        if (host === null) return;
        warn(
          isDev() && getGrabberEl(scope) === null,
          "a drawer engaged without a grabber — render the grabber part so the grip has a target",
        );
        // `pushEngageScope` consumes `back`, so B puts the detent back instead of
        // popping the dialog underneath: two B presses to leave, and that is right.
        return pushEngageScope(host, {
          onAdjust: (intent) => send({ type: "DETENT.ADJUST", intent }),
          onRelease: (committed) => send({ type: "ENGAGE.END", committed }),
        });
      },
    },
  },
});
