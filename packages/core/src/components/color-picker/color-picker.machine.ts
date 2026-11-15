/**
 * The colour picker: an overlay, a collection, a two-dimensional value control and
 * up to four one-dimensional ones, in a single machine.
 *
 * **Two states, and `engaged` is deliberately not a third.** The interpreter is
 * flat — `runTransition` tears down the exited state's effects before entering
 * the next one (`machine/service.ts`). The slider can afford `engaged` as a
 * sibling state because the state it leaves owns exactly one effect; here `open`
 * owns the dismissable layer, the position tracker, the focus trap, the scroll
 * lock and the `aria-hidden` sweep, and tearing those down to take hold of a knob
 * would pop the layer, re-fit the surface and hand the focus back to the trigger
 * in the middle of a gesture. So the hold is `context.engagedTarget` plus a scope
 * whose dispose lives in a ref, and `trackEngage` — an effect of `open` — is what
 * guarantees it is detached when the surface goes. Same guarantee, in the one
 * place that can survive the hold.
 *
 * **Events carry a ratio, never a coordinate** (the slider's rule): the pointer
 * effects hold the elements, so they do the conversion and every transition stays
 * reachable from a node test. The area sends two of them, one per axis.
 *
 * **HSVA is the context, sRGB is the view.** `utils/color` explains why, and
 * `anchorHue` is the reason a brightness dragged to zero and back comes up the
 * colour it went down as.
 */

import { getLiveAnnouncer } from "../../a11y/live-announcer";
import { getRowCount } from "../../collection/grid-collection";
import { addDomEvent } from "../../dom/event";
import { observeChildren } from "../../dom/observers";
import { timeout } from "../../dom/raf";
import { resolveDir } from "../../dom/text-dir";
import {
  resolveEnvironment,
  trackEnvironment as watchEnvironment,
} from "../../environment/environment";
import { isEscapeLikeDismissal } from "../../interaction/layer-stack";
import { createMachine } from "../../machine/create-machine";
import type { Machine, MachineParams, Transition } from "../../machine/types";
import { focusElement, getInputModality, pushEngageScope, trackInputModality } from "../../nav";
import type { Density, Direction, InputModality } from "../../types";
import {
  anchorHue,
  type ColorNumericChannel,
  type ColorValue,
  colorEquals,
  formatColor,
  getChannelRange,
  getChannelValue,
  getColorName,
  hsvToRgb,
  parseColor,
  wrapHue,
} from "../../utils/color";
import { arrayEquals, shallowEqual } from "../../utils/equality";
import {
  getAreaXInputEl,
  getChannelThumbEl,
  getContentEl,
  getEnvironmentEl,
  getEyedropperTriggerEl,
  getHiddenInputEl,
  getLabelledChannels,
  getRootEl,
  getSurfaceEl,
  getSwatchEl,
  hasPart,
  hasSurfacePart,
} from "./color-picker.dom";
import { trackAreaPointer, trackChannelPointer } from "./color-picker.pointer";
import {
  getAreaAxis,
  resolveDirection,
  toAreaAdjustEvent,
  toChannelAdjustEvent,
} from "./color-picker.props";
import {
  captureSurfaceIntents,
  hideOutside,
  lockPageScroll,
  trackAnchorPosition,
  trackDismissable,
  trackFocusTrap,
  trackSurfaceDir,
} from "./color-picker.surface";
import type { ColorPickerEngageTarget, ColorPickerSchema } from "./color-picker.types";
import {
  applyString,
  FALLBACK,
  focusedEngageTarget,
  strideOf,
  writeArea,
  writeChannel,
  writeColor,
} from "./color-picker.value";

// A controlled getter still returns the parent's string until it answers, so
// the report reads the write itself; consumed even with no callback to call.
// A colour the parent already holds goes back as the parent's own string: the
// formatted one is a different spelling of it, and a parent that re-parses what
// it is told would drift off its colour on every gesture that ended where it began.
// The colour held is the cell's own, which carries the hue a grey or a black
// cannot spell; the string only has to be one the picker can read, since an
// unreadable or stale one leaves the cell on a colour it no longer describes.
// The module's write is dropped once it is no longer the prop: a detection that
// answers late must not bring back a part the prop has taken away.
const detectModule = (params: MachineParams<ColorPickerSchema>): void => {
  const { context, prop, refs } = params;
  const module = prop("eyedropper");
  const set: typeof context.set = (key, value) => {
    if (prop("eyedropper") === module) context.set(key, value);
  };
  refs.set("eyedropperEnd", module?.detect({ ...params, context: { ...context, set } }) ?? null);
};

const endModule = ({ refs }: MachineParams<ColorPickerSchema>): void => {
  refs.get("eyedropperEnd")?.();
  refs.set("eyedropperEnd", null);
};

const reportEnd = ({ context, refs, prop }: MachineParams<ColorPickerSchema>): void => {
  const color = refs.get("changed") ?? context.get("color");
  refs.set("changed", null);
  const held = prop("value") ?? "";
  const value =
    parseColor(held) !== null && colorEquals(color, context.get("color"))
      ? held
      : formatColor(color, context.get("format"));
  prop("onValueChangeEnd")?.({ value, color });
};

/**
 * Outside a hold every adjustment *is* the whole gesture and reports on the spot;
 * inside one the hold is the gesture and `CHANNEL.RELEASE` is its only end — so
 * A, →, →, B reports once rather than three times. The slider's arrangement, with
 * a guard where it has a state.
 */
const CHANNEL_ADJUST: Transition<ColorPickerSchema> = [
  { guard: "isEngaged", actions: ["adjustChannel"] },
  { guard: "isInteractive", actions: ["adjustChannel", "invokeChangeEnd"] },
];

const CHANNEL_EXTREME: Transition<ColorPickerSchema> = [
  { guard: "isEngaged", actions: ["setChannelExtreme"] },
  { guard: "isInteractive", actions: ["setChannelExtreme", "invokeChangeEnd"] },
];

const AREA_ADJUST: Transition<ColorPickerSchema> = [
  { guard: "isEngaged", actions: ["adjustArea"] },
  { guard: "isInteractive", actions: ["adjustArea", "invokeChangeEnd"] },
];

const AREA_EXTREME: Transition<ColorPickerSchema> = [
  { guard: "isEngaged", actions: ["setAreaExtreme"] },
  { guard: "isInteractive", actions: ["setAreaExtreme", "invokeChangeEnd"] },
];

export const machine: Machine<ColorPickerSchema> = createMachine<ColorPickerSchema>({
  props({ props }) {
    return {
      defaultValue: "#000000",
      defaultFormat: "hex",
      formats: ["hex", "rgb", "hsl", "hsb"],
      alpha: true,
      defaultOpen: false,
      presentation: "auto",
      placement: "bottom-start",
      gap: 4,
      offset: 0,
      flip: true,
      shift: true,
      padding: 8,
      strategy: "fixed",
      closeOnEscape: true,
      closeOnInteractOutside: true,
      restoreFocus: true,
      disabled: false,
      readOnly: false,
      invalid: false,
      required: false,
      variant: "well",
      step: 1,
      swatches: [],
      maxSwatches: 12,
      loopSwatches: false,
      intents: null,
      ...props,
    };
  },

  context({ prop, bindable, getContext }) {
    // The controlled string is parsed once per distinct value rather than on every
    // read: `createBindable` re-invokes this factory's `init` on each `get`, and a
    // regex per read of a colour is a cost with no reason. The anchor is the last
    // colour the parent confirmed — a parse, or an emission it handed back or
    // already held — which for a controlled picker is the context itself.
    const declaredDefault = (): ColorValue => parseColor(prop("defaultValue")) ?? FALLBACK;
    let lastRaw: string | undefined;
    let lastParsed: ColorValue | undefined;
    // The string folds what the object keeps (a hue of 360 reads back as 0), so
    // the emitted colour is held apart and adopted when the parent's string is
    // the one that was sent — handed back, or already held; a read in between
    // still sees the parent's own.
    let sent: string | undefined;
    let sentColor: ColorValue | undefined;
    const controlledColor = (): ColorValue | undefined => {
      const raw = prop("value");
      if (raw === undefined) return undefined;
      if (raw === sent) {
        lastRaw = raw;
        lastParsed = sentColor;
        sent = undefined;
      } else if (raw !== lastRaw) {
        lastRaw = raw;
        sent = undefined;
        const parsed = parseColor(raw);
        lastParsed =
          parsed === null ? lastParsed : anchorHue(parsed, lastParsed ?? declaredDefault());
      }
      return lastParsed;
    };

    return {
      color: bindable<ColorValue>(() => ({
        defaultValue: declaredDefault(),
        value: controlledColor(),
        // Without this every write of a fresh object — which is every write —
        // would report a change and re-render, forever.
        isEqual: colorEquals,
        onChange: (color) => {
          const value = formatColor(color, getContext().get("format"));
          sent = value;
          sentColor = color;
          prop("onValueChange")?.({ value, color });
        },
        debugLabel: "color-picker color",
      })),
      open: bindable<boolean>(() => ({
        // `inline` has no surface to close, so its openness is not a decision.
        defaultValue: prop("presentation") === "inline" ? true : prop("defaultOpen"),
        value: prop("presentation") === "inline" ? true : prop("open"),
        onChange: (open) => prop("onOpenChange")?.({ open }),
        debugLabel: "color-picker open",
      })),
      format: bindable(() => ({
        defaultValue: prop("defaultFormat"),
        value: prop("format"),
        onChange: (format) => prop("onFormatChange")?.({ format }),
        debugLabel: "color-picker format",
      })),
      activeChannel: bindable<ColorPickerEngageTarget | null>(() => ({ defaultValue: null })),
      engagedTarget: bindable<ColorPickerEngageTarget | null>(() => ({ defaultValue: null })),
      areaDragging: bindable<boolean>(() => ({ defaultValue: false })),
      highlightedSwatch: bindable<number>(() => ({ defaultValue: -1 })),
      savedSwatches: bindable<string[]>(() => ({ defaultValue: [], isEqual: arrayEquals })),
      density: bindable<Density>(() => ({ defaultValue: "desktop" })),
      surfaceDir: bindable<Direction | null>(() => ({ defaultValue: null })),
      currentPlacement: bindable(() => ({ defaultValue: prop("placement") })),
      eyedropperSupported: bindable<boolean>(() => ({ defaultValue: false })),
      inputDrafts: bindable<Record<string, string>>(() => ({
        defaultValue: {},
        isEqual: shallowEqual,
      })),
      invalidDrafts: bindable<string[]>(() => ({ defaultValue: [], isEqual: arrayEquals })),
      focusSource: bindable<InputModality | null>(() => ({ defaultValue: null })),
      hasLabel: bindable<boolean>(() => ({ defaultValue: false })),
      hasTitle: bindable<boolean>(() => ({ defaultValue: false })),
      hasValueText: bindable<boolean>(() => ({ defaultValue: false })),
      labelledChannels: bindable<string[]>(() => ({ defaultValue: [], isEqual: arrayEquals })),
    };
  },

  computed: {
    presentation({ prop, context }) {
      const requested = prop("presentation");
      if (requested !== "auto") return requested;
      return context.get("density") === "touch" ? "sheet" : "popup";
    },
    isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
    // `inline` has nothing to trap and nothing to close, so `modal` cannot reach it.
    isModal({ prop, computed }) {
      const presentation = computed("presentation");
      return presentation !== "inline" && (prop("modal") ?? presentation === "sheet");
    },
    valueString: ({ context }) => formatColor(context.get("color"), context.get("format")),
    rgb: ({ context }) => hsvToRgb(context.get("color")),
    /**
     * The tracks that are drawn, in tab order. `rgb` shows its three channels;
     * every other format shows the hue, because the area already *is* the
     * saturation and the brightness and a second copy of them is furniture.
     */
    channels({ prop, context }) {
      const base: ColorNumericChannel[] =
        context.get("format") === "rgb" ? ["red", "green", "blue"] : ["hue"];
      return prop("alpha") ? [...base, "alpha"] : base;
    },
    swatchList: ({ prop, context }) =>
      [...prop("swatches"), ...context.get("savedSwatches")].slice(0, prop("maxSwatches")),
    swatchColumns: ({ prop, context }) =>
      prop("swatchColumns") ?? (context.get("density") === "touch" ? 6 : 12),
    swatchRows: ({ computed }) =>
      getRowCount(computed("swatchList").length, computed("swatchColumns")),
    colorName: ({ context }) => getColorName(context.get("color")),
  },

  refs({ prop }) {
    return {
      entryColor: null,
      openColor: null,
      changed: null,
      finalFocusEl: null,
      engageDispose: null,
      eyedropperAbort: null,
      eyedropperEnd: null,
      initialValue: prop("value") ?? prop("defaultValue"),
    };
  },

  // Pure: no DOM, no environment. `inline` is open from the first byte the server
  // writes, which is what makes its hydration deterministic.
  initialState({ prop }) {
    if (prop("presentation") === "inline") return "open";
    return (prop("open") ?? prop("defaultOpen")) ? "open" : "closed";
  },

  effects: [
    "trackEnvironment",
    "trackModality",
    "trackParts",
    "trackFormReset",
    "detectEyedropper",
  ],

  watch({ context, computed, prop, scope, track, send, action }) {
    track(
      () => [context.get("open")],
      () => send({ type: "OPEN.SYNC" }),
    );
    track(
      () => [computed("presentation")],
      () => send({ type: "PRESENTATION.SYNC" }),
    );
    // The surface is portalled, so its parts are a watch dependency like any
    // other: a title and a set of channel labels that mount with the panel are
    // re-read on the adapter's next commit rather than one mutation record later.
    track(
      // The channels are joined rather than counted: a boolean stayed `true` when a
      // second label mounted beside the first, and the set behind it went stale.
      () => [
        hasPart(scope, "label"),
        hasSurfacePart(scope, "title"),
        getLabelledChannels(scope).join(" "),
      ],
      () => action(["syncParts"]),
    );
    track(
      () => [prop("eyedropper")],
      () => action(["syncEyedropper"]),
    );
  },

  on: {
    "VALUE.SET": { guard: "isInteractive", actions: ["setValueFromString", "invokeChangeEnd"] },
    "CHANNEL.SET": { guard: "isInteractive", actions: ["setChannelValue", "invokeChangeEnd"] },
    "FORMAT.SET": { actions: ["setFormat", "clearDrafts"] },
    "OPEN.SET": { actions: ["setOpen"] },
    "OPEN.SYNC": [{ guard: "isOpen", target: "open" }, { target: "closed" }],
    // The density flip tears the open state down and builds it back: the position
    // tracker leaves, the scroll lock arrives, the geometry changes.
    "PRESENTATION.SYNC": { guard: "isOpen", target: "open", reenter: true },
    "POSITION.SYNC": { actions: ["syncPlacement"] },
    "ENVIRONMENT.SYNC": { actions: ["syncEnvironment"] },
    "PARTS.SYNC": { actions: ["syncParts"] },
    "FORM.RESET": { actions: ["resetToInitialValue"] },
    "FOCUS.IN": { actions: ["captureFocusSource"] },
    /**
     * A Tab out of a held control ends the hold by committing. We do not trap the
     * focus inside an engage: somebody who tabs wants to leave, and losing their
     * value on the way would be a surprise. B stays the only cancel.
     */
    "FOCUS.OUT": [
      {
        guard: "isEngaged",
        actions: ["releaseTarget", "clearSnapshot", "invokeChangeEnd", "clearFocusSource"],
      },
      { actions: ["clearFocusSource"] },
    ],
  },

  states: {
    closed: {
      // Exit rather than the open state's entry, for the menu's reason: the
      // interpreter installs effects before entry actions, and an effect that
      // hides or moves things would blur the trigger before it was captured.
      exit: ["captureFinalFocus"],
      on: {
        "TRIGGER.CLICK": { guard: "isInteractive", actions: ["openSurface"] },
      },
    },

    open: {
      /**
       * The snapshot is taken on entry and read on the way out. It is deliberately
       * *not* cleared on exit: the interpreter runs a state's exit actions before
       * the transition's own, so an exit that cleared it would erase the value the
       * cancel is there to restore. A hold takes its own (`entryColor`), so the
       * cancel still puts back the colour the surface opened with (R36).
       */
      entry: ["snapshotOpenColor"],
      effects: [
        "trackSurfaceDir",
        "trackDismissable",
        "lockPageScroll",
        // Before anything that moves the focus: a focus landing in a surface
        // still parked at `0,0` scrolls the page there to reveal it.
        "trackAnchorPosition",
        "trackFocusTrap",
        "hideOutside",
        "captureSurfaceIntents",
        "captureSelectIntent",
        "trackEngage",
        "trackAreaPointer",
        "trackChannelPointer",
      ],
      on: {
        "TRIGGER.CLICK": { actions: ["closeSurface"] },
        "CONTENT.DISMISS": [
          // Decision 68: during a hold, Escape does what B does — it lets the hold
          // go to its start and the surface stays. Under a `NavProvider` mounted
          // first, the engage scope eats the key before the layer sees it; this
          // branch gives the same answer when the layer's listener runs first.
          {
            guard: ({ context, event }) =>
              context.get("engagedTarget") !== null &&
              event.type === "CONTENT.DISMISS" &&
              event.reason === "escape",
            actions: ["releaseTarget", "restoreEntryColor", "invokeChangeEnd"],
          },
          // In a sheet, outside a hold, Escape and B are the cancel's doubles. The
          // backdrop, and a popup that has no cancel, keep the colour.
          {
            guard: ({ computed, event, prop }) =>
              computed("presentation") === "sheet" &&
              event.type === "CONTENT.DISMISS" &&
              (event.reason === "escape" || event.reason === "back") &&
              prop("closeOnEscape"),
            actions: ["restoreOpenColor", "invokeChangeEnd", "invokeOnDismiss", "closeSurface"],
          },
          { guard: "canDismiss", actions: ["invokeOnDismiss", "closeSurface"] },
        ],
        // The touch twin of B: it puts the colour back and then leaves. It ends a
        // hold itself: a parent holding `open` can keep the surface, and the hold
        // left running would put its start back over the cancel on the next B.
        "CANCEL.CLICK": {
          actions: [
            "releaseTarget",
            "restoreOpenColor",
            "invokeChangeEnd",
            "invokeOnDismiss",
            "closeSurface",
          ],
        },
        "CLOSE.CLICK": { actions: ["closeSurface"] },

        "AREA.PRESS": {
          guard: "isInteractive",
          // `focusAreaInput` last, and it has to be: moving the focus fires a
          // synchronous `focus` event whose handler re-enters the machine and
          // replaces the event the actions still to run were reading.
          actions: ["startAreaDrag", "setAreaFromPoint", "focusAreaInput"],
        },
        "AREA.DRAG": { guard: "isAreaDragging", actions: ["setAreaFromPoint"] },
        // No `isInteractive` guard on purpose: a control that goes disabled
        // halfway through a gesture still has to finish it cleanly.
        "AREA.DRAG_END": { actions: ["endAreaDrag", "invokeChangeEnd"] },
        "AREA.SET": { guard: "isInteractive", actions: ["setAreaAxis", "invokeChangeEnd"] },
        "AREA.ADJUST": AREA_ADJUST,
        "AREA.SET_EXTREME": AREA_EXTREME,

        "CHANNEL.PRESS": {
          guard: "isInteractive",
          actions: ["startChannelDrag", "setChannelFromPercent", "focusChannelThumb"],
        },
        "CHANNEL.DRAG": { guard: "isChannelDragging", actions: ["setChannelFromPercent"] },
        "CHANNEL.DRAG_END": { actions: ["endChannelDrag", "invokeChangeEnd"] },
        "CHANNEL.INCREMENT": CHANNEL_ADJUST,
        "CHANNEL.DECREMENT": CHANNEL_ADJUST,
        "CHANNEL.SET_MIN": CHANNEL_EXTREME,
        "CHANNEL.SET_MAX": CHANNEL_EXTREME,

        "CHANNEL.ENGAGE": { guard: "canEngage", actions: ["snapshotColor", "engageTarget"] },
        "CHANNEL.RELEASE": [
          {
            guard: ({ event }) => event.type === "CHANNEL.RELEASE" && event.committed,
            actions: ["releaseTarget", "clearSnapshot", "invokeChangeEnd"],
          },
          { actions: ["releaseTarget", "restoreEntryColor", "invokeChangeEnd"] },
        ],

        "INPUT.CHANGE": { actions: ["setDraft"] },
        "INPUT.COMMIT": { guard: "isInteractive", actions: ["commitDraft"] },
        "INPUT.REVERT": { actions: ["clearDraft"] },

        "SWATCH.SELECT": { guard: "isInteractive", actions: ["selectSwatch", "invokeChangeEnd"] },
        "SWATCH.HIGHLIGHT": { actions: ["highlightSwatch"] },
        "SWATCH.ADD": { guard: "isInteractive", actions: ["saveCurrentSwatch"] },

        "EYEDROPPER.OPEN": { guard: "canEyedrop", actions: ["openEyedropper"] },
        "EYEDROPPER.RESULT": { actions: ["applyEyedropper", "invokeChangeEnd"] },
        // A cancelled gesture writes nothing, reports nothing and announces
        // nothing — an Escape during the pick is not an event to narrate.
        "EYEDROPPER.DISMISS": { actions: ["clearEyedropper"] },
      },
    },
  },

  implementations: {
    guards: {
      isInteractive: ({ prop }) => !prop("disabled") && !prop("readOnly"),
      isOpen: ({ context }) => context.get("open"),
      isAreaDragging: ({ context }) => context.get("areaDragging"),
      isChannelDragging: ({ context }) => {
        const active = context.get("activeChannel");
        return active !== null && active !== "area" && context.get("engagedTarget") === null;
      },
      isEngaged: ({ context, prop }) =>
        context.get("engagedTarget") !== null && !prop("disabled") && !prop("readOnly"),
      // The slider's guard, copied: a pad that is not wired cannot take hold.
      canEngage: ({ prop }) => !prop("disabled") && !prop("readOnly") && prop("intents") !== null,
      canEyedrop: ({ prop, context }) =>
        context.get("eyedropperSupported") && !prop("disabled") && !prop("readOnly"),

      /** Read live from the props, never snapshotted into the layer at install. */
      canDismiss({ prop, computed, event }) {
        if (computed("presentation") === "inline") return false;
        if (event.type !== "CONTENT.DISMISS") return false;
        if (isEscapeLikeDismissal(event.reason)) return prop("closeOnEscape");
        return prop("closeOnInteractOutside");
      },
    },

    actions: {
      openSurface({ context }) {
        context.set("open", true);
      },

      closeSurface({ context, prop }) {
        if (prop("presentation") === "inline") return;
        context.set("open", false);
      },

      setOpen({ context, prop, event }) {
        if (event.type !== "OPEN.SET" || prop("presentation") === "inline") return;
        context.set("open", event.open);
      },

      captureFinalFocus({ refs, scope }) {
        const active = scope.getActiveElement();
        refs.set("finalFocusEl", active === null || active.tagName === "BODY" ? null : active);
      },

      snapshotColor({ context, refs }) {
        refs.set("entryColor", context.get("color"));
        refs.set("changed", null);
      },

      snapshotOpenColor({ context, refs }) {
        refs.set("openColor", context.get("color"));
        refs.set("changed", null);
      },

      restoreOpenColor(params) {
        const open = params.refs.get("openColor");
        if (open !== null) writeColor(params, open);
      },

      restoreEntryColor(params) {
        const entry = params.refs.get("entryColor");
        params.refs.set("entryColor", null);
        if (entry !== null) writeColor(params, entry);
        else params.refs.set("changed", null);
      },

      clearSnapshot({ refs }) {
        refs.set("entryColor", null);
      },

      startAreaDrag({ context }) {
        context.set("areaDragging", true);
        context.set("activeChannel", "area");
      },

      endAreaDrag({ context }) {
        context.set("areaDragging", false);
        if (context.get("engagedTarget") === null) context.set("activeChannel", null);
      },

      setAreaFromPoint(params) {
        const { event } = params;
        if (event.type !== "AREA.PRESS" && event.type !== "AREA.DRAG") return;
        writeArea(params, event.x, event.y);
      },

      /** The `change` a real `<input type="range">` fires when a reader pushes a value. */
      setAreaAxis(params) {
        const { event } = params;
        if (event.type !== "AREA.SET") return;
        writeChannel(params, event.axis === "x" ? "saturation" : "brightness", event.value);
      },

      adjustArea(params) {
        const { event, prop, context } = params;
        if (event.type !== "AREA.ADJUST") return;
        const channel: ColorNumericChannel = event.axis === "x" ? "saturation" : "brightness";
        const stride = strideOf(prop, channel, event.large);
        const current = getChannelValue(context.get("color"), channel);
        writeChannel(
          params,
          channel,
          current + (event.direction === "decrement" ? -stride : stride),
        );
      },

      setAreaExtreme(params) {
        const { event } = params;
        if (event.type !== "AREA.SET_EXTREME") return;
        const channel: ColorNumericChannel = event.axis === "x" ? "saturation" : "brightness";
        const range = getChannelRange(channel);
        writeChannel(params, channel, event.edge === "min" ? range.min : range.max);
      },

      focusAreaInput({ scope, event }) {
        if (event.type === "AREA.PRESS") focusElement(getAreaXInputEl(scope));
      },

      startChannelDrag({ context, event }) {
        if (event.type === "CHANNEL.PRESS") context.set("activeChannel", event.channel);
      },

      endChannelDrag({ context }) {
        if (context.get("engagedTarget") === null) context.set("activeChannel", null);
      },

      setChannelFromPercent(params) {
        const { event, context } = params;
        if (event.type !== "CHANNEL.PRESS" && event.type !== "CHANNEL.DRAG") return;
        const active =
          event.type === "CHANNEL.PRESS" ? event.channel : context.get("activeChannel");
        if (active === null || active === "area") return;
        const range = getChannelRange(active);
        writeChannel(params, active, range.min + event.percent * (range.max - range.min));
      },

      setChannelValue(params) {
        const { event } = params;
        if (event.type !== "CHANNEL.SET") return;
        writeChannel(params, event.channel, event.value);
      },

      /**
       * Hue is the one circular channel: `359 + 1` is `0` rather than a value the
       * clamp would have held still at. Every other channel clamps.
       */
      adjustChannel(params) {
        const { event, prop, context } = params;
        if (event.type !== "CHANNEL.INCREMENT" && event.type !== "CHANNEL.DECREMENT") return;
        const stride = strideOf(prop, event.channel, event.large);
        const current = getChannelValue(context.get("color"), event.channel);
        const next = current + (event.type === "CHANNEL.DECREMENT" ? -stride : stride);
        writeChannel(params, event.channel, event.channel === "hue" ? wrapHue(next) : next);
      },

      setChannelExtreme(params) {
        const { event } = params;
        if (event.type !== "CHANNEL.SET_MIN" && event.type !== "CHANNEL.SET_MAX") return;
        const range = getChannelRange(event.channel);
        writeChannel(
          params,
          event.channel,
          event.type === "CHANNEL.SET_MIN" ? range.min : range.max,
        );
      },

      // APG: pressing anywhere on a track moves the value *and* the focus, so the
      // arrow keys carry on from where the pointer left off.
      focusChannelThumb({ scope, event }) {
        if (event.type === "CHANNEL.PRESS") focusElement(getChannelThumbEl(scope, event.channel));
      },

      /**
       * The pad's hold on the value. `pushEngageScope` consumes `back`, so B puts
       * the entry colour back instead of popping the layer underneath — a picker
       * whose B closed the surface on the way out of a channel would be unusable.
       */
      engageTarget(params) {
        const { prop, context, refs, scope, send, event } = params;
        if (event.type !== "CHANNEL.ENGAGE") return;
        const host = prop("intents");
        if (host === null) return;
        refs.get("engageDispose")?.();
        context.set("engagedTarget", event.target);
        context.set("activeChannel", event.target);
        refs.set(
          "engageDispose",
          pushEngageScope(host, {
            onAdjust: (intent) => {
              const target = context.get("engagedTarget");
              if (target === null) return;
              const dir = resolveDir(prop("dir"), getSurfaceEl(scope));
              const adjustment = resolveDirection(intent, dir);
              send(
                target === "area"
                  ? toAreaAdjustEvent(adjustment, getAreaAxis(intent))
                  : toChannelAdjustEvent(adjustment, target),
              );
            },
            onRelease: (committed) => {
              // The scope has already popped itself; dropping the handle here is
              // what keeps `releaseTarget` from popping a second time.
              refs.set("engageDispose", null);
              send({ type: "CHANNEL.RELEASE", committed });
            },
          }),
        );
      },

      releaseTarget({ context, refs }) {
        refs.get("engageDispose")?.();
        refs.set("engageDispose", null);
        context.set("engagedTarget", null);
        context.set("activeChannel", null);
      },

      setDraft({ context, event }) {
        if (event.type !== "INPUT.CHANGE") return;
        context.set("inputDrafts", { ...context.get("inputDrafts"), [event.channel]: event.text });
      },

      /**
       * Unparsable text leaves the colour alone and marks **the field**, not the
       * component: `invalid` is a statement about the value, and the value has not
       * moved. The draft survives so the user can fix what they typed.
       */
      commitDraft(params) {
        const { context, event } = params;
        if (event.type !== "INPUT.COMMIT") return;
        const channel = event.channel;
        const drafts = context.get("inputDrafts");
        const text = drafts[channel];
        if (text === undefined) return;

        const invalid = context.get("invalidDrafts");
        const accept = (): void => {
          const { [channel]: _dropped, ...rest } = drafts;
          context.set("inputDrafts", rest);
          if (invalid.includes(channel)) {
            context.set(
              "invalidDrafts",
              invalid.filter((name) => name !== channel),
            );
          }
          reportEnd(params);
        };
        const reject = (): void => {
          if (!invalid.includes(channel)) context.set("invalidDrafts", [...invalid, channel]);
        };

        if (channel === "hex") {
          if (parseColor(text) === null) {
            reject();
            return;
          }
          applyString(params, text);
          accept();
          return;
        }

        const typed = text.trim().replace(/%$/, "");
        const value = Number(typed);
        if (typed === "" || !Number.isFinite(value)) {
          reject();
          return;
        }
        // The opacity field is in per cent ("100 %"),
        // while the channel itself runs 0…1 — so the field's unit is converted
        // here rather than leaking a second scale into `withChannel`.
        writeChannel(params, channel, channel === "alpha" ? value / 100 : value);
        accept();
      },

      clearDraft({ context, event }) {
        if (event.type !== "INPUT.REVERT") return;
        const { [event.channel]: _dropped, ...rest } = context.get("inputDrafts");
        context.set("inputDrafts", rest);
        context.set(
          "invalidDrafts",
          context.get("invalidDrafts").filter((name) => name !== event.channel),
        );
      },

      /**
       * A format change swaps the list of fields on screen, so a draft still
       * holding "255" would land on a channel that now means `H`. They are wiped
       * rather than kept: a silently wrong value at the next blur is worse than a
       * retyped one.
       */
      clearDrafts({ context }) {
        context.set("inputDrafts", {});
        context.set("invalidDrafts", []);
      },

      setFormat({ context, event }) {
        if (event.type === "FORMAT.SET") context.set("format", event.format);
      },

      selectSwatch(params) {
        const { computed, event } = params;
        if (event.type !== "SWATCH.SELECT") return;
        const value = computed("swatchList")[event.index];
        if (value === undefined) return;
        applyString(params, value);
      },

      highlightSwatch({ context, scope, event }) {
        if (event.type !== "SWATCH.HIGHLIGHT") return;
        context.set("highlightedSwatch", event.index);
        if (event.index >= 0) focusElement(getSwatchEl(scope, event.index));
      },

      /**
       * The most recent colours win: the panel is a list of what was just used,
       * so a full one drops its oldest rather than refusing the new one.
       */
      saveCurrentSwatch({ context, computed, prop }) {
        const value = computed("valueString");
        const saved = context.get("savedSwatches");
        const provided = prop("swatches");
        if (provided.includes(value) || saved.includes(value)) return;
        const room = Math.max(prop("maxSwatches") - provided.length, 0);
        if (room === 0) return;
        const next = [...saved, value];
        context.set("savedSwatches", next.slice(Math.max(next.length - room, 0)));
      },

      openEyedropper: (params) => params.prop("eyedropper")?.open(params),

      /**
       * The module is a prop, so it can come, go or change after the mount; the
       * effect that first asked it only ran once. The outgoing module's disposer
       * runs, support is asked again, and a pick left without a module — or on an
       * engine that has none — is called off while the trigger is still in the
       * document, so the focus it held moves to the area (the panel itself where
       * there is none) rather than falling to `body` with the part.
       */
      syncEyedropper(params) {
        const { context, prop, refs, scope } = params;
        endModule(params);
        detectModule(params);
        if (prop("eyedropper") === undefined) context.set("eyedropperSupported", false);
        if (context.get("eyedropperSupported")) return;
        refs.get("eyedropperAbort")?.abort();
        refs.set("eyedropperAbort", null);
        if (scope.isActiveElement(getEyedropperTriggerEl(scope))) {
          focusElement(getAreaXInputEl(scope) ?? getContentEl(scope));
        }
      },

      /**
       * The one place this component announces anything. Every other value lives
       * on a `role="slider"` or an `<input type="range">` that publishes it
       * already; a screen pick changes the colour while nothing is focused, so
       * without this it changes in silence.
       */
      applyEyedropper(params) {
        const { event, scope, refs, context } = params;
        if (event.type !== "EYEDROPPER.RESULT") return;
        applyString(params, event.sRGBHex);
        if (scope.getRootNode() === null) return;
        getLiveAnnouncer(scope.getDoc()).announce(
          `${getColorName(refs.get("changed") ?? context.get("color"))} selected`,
          "polite",
        );
      },

      /**
       * The focus went to the screen picker's own overlay and comes back to the
       * button that opened it — the place a user who pressed Escape expects to be.
       */
      clearEyedropper({ refs, scope }) {
        refs.set("eyedropperAbort", null);
        focusElement(getEyedropperTriggerEl(scope));
      },

      // Read once, when focus lands, and held: the modality of *now* flips to
      // pointer after 300 ms of mouse movement whether or not the focus moved, and
      // a ring that blinks out under the user's hands was the result.
      captureFocusSource({ context, scope }) {
        if (scope.getRootNode() === null) return;
        context.set("focusSource", getInputModality(scope.getDoc()));
      },

      clearFocusSource({ context }) {
        context.set("focusSource", null);
      },

      setValueFromString(params) {
        const { event } = params;
        if (event.type !== "VALUE.SET") return;
        applyString(params, event.value);
      },

      resetToInitialValue(params) {
        applyString(params, params.refs.get("initialValue"));
        params.refs.set("changed", null);
      },

      invokeChangeEnd: reportEnd,

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
        context.set("hasLabel", hasPart(scope, "label"));
        context.set("hasTitle", hasSurfacePart(scope, "title"));
        context.set("hasValueText", hasPart(scope, "value-text"));
        context.set("labelledChannels", getLabelledChannels(scope));
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

      // No listener: the source is read once, when focus lands. Holding the handle
      // is the whole job — the tracker has to be running before the first Tab.
      trackModality({ scope }) {
        if (scope.getRootNode() === null) return;
        return trackInputModality(scope.getDoc());
      },

      trackParts({ scope, send }) {
        send({ type: "PARTS.SYNC" });
        return observeChildren(getRootEl(scope), () => send({ type: "PARTS.SYNC" }));
      },

      /**
       * The native `reset` runs first (`timeout 0`), then the machine follows it —
       * so the hidden input and the swatch agree with the form instead of racing it.
       */
      trackFormReset({ scope, send }) {
        const mirror = getHiddenInputEl(scope);
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

      // Opt-in: the module lives at its own sub-path (`./eyedropper`), and a
      // picker handed none never looks for an `EyeDropper` at all. The disposer
      // is held in a ref that `syncEyedropper` shares, so whichever module is
      // current when the picker stops is the one that is ended.
      detectEyedropper(params) {
        detectModule(params);
        return () => endModule(params);
      },

      trackSurfaceDir,
      trackDismissable,
      lockPageScroll,
      trackAnchorPosition,
      trackFocusTrap,
      hideOutside,
      captureSurfaceIntents,

      /**
       * A is how a pad takes hold. Never from a keyboard: Enter belongs to the form
       * around the picker, the arrows already move the value without holding
       * anything, and a keyboard engage would hand Escape the power to rewind a
       * value the user had settled on.
       */
      captureSelectIntent(params) {
        const { prop, send } = params;
        const host = prop("intents");
        if (host === null) return;
        return host.pushScope(
          (event) => {
            if (event.intent !== "select" || event.source === "keyboard") return false;
            if (prop("disabled") || prop("readOnly")) return false;
            const target = focusedEngageTarget(params);
            if (target === null) return false;
            send({ type: "CHANNEL.ENGAGE", target });
            return true;
          },
          { within: () => getSurfaceEl(params.scope) },
        );
      },

      /**
       * The hold's teardown, and the reason `engaged` does not need to be a state.
       * `pushEngageScope`'s dispose detaches silently — unmounting a picker is not
       * the user letting go, so `onRelease` does not fire here.
       */
      trackEngage({ context, refs }) {
        return () => {
          refs.get("engageDispose")?.();
          refs.set("engageDispose", null);
          refs.set("changed", null);
          context.set("engagedTarget", null);
          context.set("activeChannel", null);
        };
      },

      trackAreaPointer,
      trackChannelPointer,
    },
  },
});
