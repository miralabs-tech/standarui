import { visuallyHiddenStyle } from "../../a11y/visually-hidden";
import { getGridKeyAction, getGridNextIndex } from "../../collection/grid-collection";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import { getRovingTabIndex } from "../../focus/roving-focus";
import type { InputProps, NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import type { Align, Side } from "../../positioner/compute-position";
import {
  type ColorChannel,
  type ColorFormat,
  type ColorNumericChannel,
  type ColorValue,
  getChannelRange,
  getChannelValue,
  toHex,
} from "../../utils/color";
import { roundToPrecision, toPercent } from "../../utils/range";
import { parts } from "./color-picker.anatomy";
import {
  getAreaId,
  getAreaXInputId,
  getAreaYInputId,
  getBackdropId,
  getCancelTriggerId,
  getChannelInputId,
  getChannelLabelId,
  getChannelThumbId,
  getCloseTriggerId,
  getContentId,
  getEyedropperTriggerId,
  getFormatSelectId,
  getHiddenInputId,
  getLabelId,
  getPositionerId,
  getRootId,
  getSurfaceEl,
  getSwatchGroupId,
  getSwatchId,
  getTitleId,
  getTriggerId,
  getValueTextId,
} from "./color-picker.dom";
import { getAreaKeyEvent, getChannelKeyEvent } from "./color-picker.props";
import type {
  ColorPickerApi,
  ColorPickerChannelProps,
  ColorPickerInputProps,
  ColorPickerSchema,
  ColorPickerSwatchProps,
  ColorPickerSwatchRowProps,
} from "./color-picker.types";

/**
 * The core places percentages, the sheet does the layout. Rounded, so a third of
 * a track does not serialise seventeen digits into the markup — and so the server
 * and the client write the same string.
 */
function pct(ratio: number): string {
  return `${roundToPrecision(ratio * 100, 4)}%`;
}

/**
 * The name a channel answers to when the consumer renders no `channelLabel` and
 * passes no `translations.channelLabel`.
 *
 * English on purpose — the panel's icon-only controls have no `:empty` glyph, so
 * withholding a name would ship a nameless button — but reachable, which is the
 * part that was missing. The comment here used to justify the strings by
 * `dialog:close-trigger`'s "Close"; that precedent does not exist
 * (`dialog.connect.ts` emits id, type, state and click, and no name at all), and
 * the honest precedent is `toast` and `pagination`, which ship an English default
 * behind a `translations` seam.
 */
const CHANNEL_NAMES: Readonly<Record<ColorChannel, string>> = {
  hue: "Hue",
  saturation: "Saturation",
  brightness: "Brightness",
  alpha: "Opacity",
  red: "Red",
  green: "Green",
  blue: "Blue",
  hex: "Hex",
};

/** Alpha is shown and typed in per cent. */
function displayValue(color: ColorValue, channel: ColorNumericChannel): number {
  const raw = getChannelValue(color, channel);
  return Math.round(channel === "alpha" ? raw * 100 : raw);
}

export function connect<T extends PropTypes>(
  service: Service<ColorPickerSchema>,
  normalize: NormalizeProps<T>,
): ColorPickerApi<T> {
  const { context, computed, prop, send, scope } = service;

  const color = context.get("color");
  const open = context.get("open");
  const format = context.get("format");
  const presentation = computed("presentation");
  const interactive = computed("isInteractive");
  const valueString = computed("valueString");
  const colorName = computed("colorName");
  const translations = prop("translations");
  const channels = computed("channels");
  const swatchList = computed("swatchList");
  const swatchColumns = computed("swatchColumns");
  const rgb = computed("rgb");

  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  const required = prop("required");
  const dir = prop("dir");
  const alphaEnabled = prop("alpha");

  const state = open ? "open" : "closed";
  const placement = context.get("currentPlacement");
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const engagedTarget = context.get("engagedTarget");
  const engaged = engagedTarget !== null;
  const activeChannel = context.get("activeChannel");
  const areaDragging = context.get("areaDragging");
  const dragging = areaDragging || (activeChannel !== null && !engaged);
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const drafts = context.get("inputDrafts");
  const invalidDrafts = context.get("invalidDrafts");
  const highlighted = context.get("highlightedSwatch");
  const selectedSwatch = swatchList.indexOf(valueString);
  // Exactly one cell is in the tab order: the highlighted one, else the selected
  // one, else the first — `getRovingTabIndex` compares against this and nothing else.
  const rovingSwatch = highlighted >= 0 ? highlighted : selectedSwatch >= 0 ? selectedSwatch : 0;

  const triggerId = getTriggerId(scope);
  const contentId = getContentId(scope);
  const hasLabel = context.get("hasLabel");
  const hasTitle = context.get("hasTitle");
  const hasValueText = context.get("hasValueText");
  const labelledChannels = context.get("labelledChannels");
  const label = prop("label");
  const labelledBy = prop("labelledBy");

  const opaque = `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)})`;
  const painted = `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)} / ${roundToPrecision(color.a, 4)})`;

  /**
   * The colour, published for the sheet on every part that paints with it. The
   * hue goes out twice — as a number for arithmetic and as a colour — because
   * composing `hsl()` from an unregistered custom property is fragile and
   * `@property` is not part of the contract.
   */
  const colorVars: Readonly<Record<string, string>> = {
    "--sui-color-picker-value": painted,
    "--sui-color-picker-opaque": opaque,
    "--sui-color-picker-hue": String(roundToPrecision(color.h, 2)),
    "--sui-color-picker-hue-color": `hsl(${roundToPrecision(color.h, 2)} 100% 50%)`,
    "--sui-color-picker-alpha": String(roundToPrecision(color.a, 4)),
  };

  const stateAttrs = {
    "data-disabled": dataAttr(disabled),
    "data-readonly": dataAttr(readOnly),
    "data-invalid": dataAttr(invalid),
  };

  const channelPercent = (channel: ColorNumericChannel): number => {
    const range = getChannelRange(channel);
    return toPercent(getChannelValue(color, channel), range.min, range.max);
  };

  const channelName = (channel: ColorChannel): string =>
    translations?.channelLabel?.(channel) ?? CHANNEL_NAMES[channel];

  interface ChannelNaming {
    readonly "aria-labelledby"?: string | undefined;
    readonly "aria-label"?: string | undefined;
  }

  /**
   * One text names the thumb *and* the field beside it —
   * but only when that text is on screen. A `channelLabel` nobody rendered would
   * make `aria-labelledby` a dangling IDREF *and* leave the control nameless, so
   * the library's own name stands in.
   *
   * Asked per channel, because a panel that labels its sliders and not its hex
   * field is an ordinary composition: a single flag for the whole surface answered
   * "labelled" for the field too (audit of 2026-09-05).
   */
  const channelNaming = (channel: ColorChannel): ChannelNaming =>
    labelledChannels.includes(channel)
      ? { "aria-labelledby": getChannelLabelId(scope, channel) }
      : { "aria-label": channelName(channel) };

  const channelValueText = (channel: ColorNumericChannel): string | undefined => {
    if (channel === "hue") return `${Math.round(color.h)}°, ${colorName}`;
    if (channel === "alpha") return `${Math.round(color.a * 100)}%`;
    if (channel === "saturation" || channel === "brightness") {
      return `${Math.round(getChannelValue(color, channel))}%`;
    }
    // Red, green and blue: the number *is* the whole story, and a `valuetext`
    // repeating `valuenow` makes some readers say it twice (the slider's rule).
    return undefined;
  };

  const areaValueText = (lead: "saturation" | "brightness"): string => {
    const s = Math.round(color.s);
    const v = Math.round(color.v);
    const override = translations?.areaValueText;
    if (override !== undefined) {
      return override({ lead, saturation: s, brightness: v, colorName });
    }
    return lead === "saturation"
      ? `Saturation ${s}%, brightness ${v}%, ${colorName}`
      : `Brightness ${v}%, saturation ${s}%, ${colorName}`;
  };

  function onAreaKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    // The direction is resolved here rather than at the top of `connect`: with no
    // `dir` prop the answer is read off the surface, and a DOM read during render
    // would run on the server.
    const next = getAreaKeyEvent(event.key, {
      dir: resolveDir(dir, getSurfaceEl(scope)),
      shiftKey: event.shiftKey,
    });
    if (next === null) return;
    // **Always, and before the guard's answer can matter.** These are real
    // `<input type="range">` elements: their own step logic would run *in
    // addition* to ours on every one of these keys, including Home, End and the
    // page keys, and the value would move twice.
    event.preventDefault();
    if (!interactive) return;
    send(next);
  }

  function areaInputProps(axis: "x" | "y"): InputProps {
    const horizontal = axis === "x";
    const channel = horizontal ? "saturation" : "brightness";
    return {
      type: "range",
      min: 0,
      max: 100,
      step: prop("step"),
      // Written from the context on every render and never read back as input:
      // the colour is the source of truth, and the native value is a mirror.
      value: Math.round(getChannelValue(color, channel)),
      disabled,
      // `aria-readonly`, not the HTML `readonly`: that one is inert on a range input.
      "aria-readonly": ariaAttr(readOnly),
      style: visuallyHiddenStyle,
      "aria-label": channelName(channel),
      "aria-valuetext": areaValueText(channel),
      // One tab stop for the area. The second axis exists so its value is
      // published and so a pad can aim at it, never so a Tab can land on it.
      tabIndex: horizontal ? undefined : -1,
      "data-axis": axis,
      onKeyDown: onAreaKeyDown,
      onChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement | null;
        if (input === null) return;
        send({ type: "AREA.SET", axis, value: Number(input.value) });
      },
      onFocusIn() {
        send({ type: "FOCUS.IN" });
      },
      onFocusOut() {
        send({ type: "FOCUS.OUT" });
      },
    };
  }

  return {
    open,
    value: valueString,
    color,
    rgb,
    format,
    formats: prop("formats"),
    channels,
    swatches: swatchList,
    swatchColumns,
    swatchRows: computed("swatchRows"),
    highlightedSwatch: highlighted,
    presentation,
    placement,
    dragging,
    engaged,
    engagedTarget,
    disabled,
    eyedropperSupported: context.get("eyedropperSupported"),
    focusSource,
    focusVisible,
    triggerId,
    contentId,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    setValue(next: string): void {
      send({ type: "VALUE.SET", value: next });
    },

    setColor(next: ColorValue): void {
      send({ type: "VALUE.SET", value: toHex(next, next.a < 1) });
    },

    setFormat(next: ColorFormat): void {
      send({ type: "FORMAT.SET", format: next });
    },

    setChannelValue(channel: ColorNumericChannel, next: number): void {
      send({ type: "CHANNEL.SET", channel, value: next });
    },

    getChannelValue: (channel: ColorNumericChannel): number => getChannelValue(color, channel),
    getChannelPercent: channelPercent,
    getChannelName: channelName,

    addSwatch(): void {
      send({ type: "SWATCH.ADD" });
    },

    selectSwatch(index: number): void {
      send({ type: "SWATCH.SELECT", index });
    },

    openEyedropper(): void {
      send({ type: "EYEDROPPER.OPEN" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        ...stateAttrs,
        id: getRootId(scope),
        dir,
        "data-presentation": presentation,
        "data-state": state,
        "data-variant": prop("variant"),
        "data-format": format,
        // Not `aria-required`, and not on the trigger where it used to sit: the
        // trigger declares no `role`, so it is an implicit `button`, and the only
        // role-specific ARIA it admits is `aria-expanded` and `aria-pressed`. The
        // global attributes ride on every role — which is why `aria-invalid` below
        // is legal — and `aria-required` is not one of them, so axe counted it
        // under `aria-allowed-attr`. `checkbox-group.connect.ts:55-60` already
        // settled this shape: the state is published as data, and requiredness
        // belongs to the consumer's validation. On the root because
        // `presentation="inline"` renders no trigger at all
        // (`color-picker.anatomy.ts:6`), and the root is the one part that exists
        // in every presentation and already carries the `data-*` state family.
        "data-required": dataAttr(required),
        // On the root *and* on the element being held — the `data-engaged`
        // contract (architecture.md), whose first emitter was the slider.
        "data-engaged": dataAttr(engaged),
        "data-dragging": dataAttr(dragging),
        "data-empty": dataAttr(color.a === 0),
        style: colorVars,
      }),

    // A `span`, not a `<label>`: `for` only names *labelable* elements, and
    // neither a `<button>`-less inline panel nor a `div[role="slider"]` is one in
    // every presentation. The trigger points back with `aria-labelledby`.
    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, ...stateAttrs, id: getLabelId(scope) }),

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        ...stateAttrs,
        id: triggerId,
        type: "button",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": boolAttr(open),
        // Only while the surface exists: `content` is unmounted when closed, and
        // an IDREF pointing at nothing is a dangling reference *and* an axe
        // failure (`aria-valid-attr-value`).
        "aria-controls": open ? contentId : undefined,
        // The label *and* the colour, in that order. `aria-labelledby` replaces the
        // element's text outright, so pointing it at the label alone drops the colour
        // from the name entirely: a picker that renders the `label` part announces
        // "Tint" and never which colour it holds, while one without a label announces
        // the colour through `aria-label` below.
        //
        // Naming the element's own id is how ARIA says "and my own contents", and it
        // is the one IDREF that can never dangle — but it only says anything when the
        // button *has* contents. It does not: the composed layer renders `valueText`
        // beside the trigger, not inside it (the default `well` variant is a 48x24
        // swatch with no room for a string), and the swatch within is `aria-hidden`.
        // Measured on the shipped demo, both triggers came out named "Accent" and
        // "Brand", never the colour — the very regression this comment used to say
        // was fixed.
        //
        // So point at `valueText` when it is on the page, and keep the self-reference
        // as the fallback when it is not. `hasValueText` is read from the live DOM by
        // `syncParts`, like `hasLabel` beside it, which is what keeps the IDREF from
        // dangling on a picker that leaves the part out.
        "aria-labelledby": hasLabel
          ? `${getLabelId(scope)} ${hasValueText ? getValueTextId(scope) : triggerId}`
          : labelledBy,
        "aria-describedby": prop("describedBy"),
        // `aria-invalid` alone. `aria-required` sat here too until it was measured:
        // this button declares no `role`, so its role is the implicit `button`,
        // which admits `aria-expanded` and `aria-pressed` on top of the global
        // attributes. `aria-invalid` survives because it is global; `aria-required`
        // is not, so the role threw it away and axe counted it under
        // `aria-allowed-attr`. The comment it replaces claimed `select` as the
        // precedent for the pair; `select` is only legal because
        // `select.connect.ts:272` declares `role: "combobox"`, which this trigger
        // cannot take (a combobox requires `aria-controls`, and the content is
        // unmounted while closed — see the note above). Requiredness is published
        // as `data-required` on the root, the way `checkbox-group.connect.ts:55-60`
        // settled it.
        "aria-invalid": ariaAttr(invalid),
        // Named by the value when nothing else names it: the swatch inside is
        // decoration, so without this the button would reach axe with no name.
        "aria-label": hasLabel || labelledBy !== undefined ? undefined : (label ?? valueString),
        "data-presentation": presentation,
        "data-state": state,
        "data-variant": prop("variant"),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        style: colorVars,
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || disabled || event.repeat) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          // Space opens on keyup — the APG split, and what stops the press from
          // leaking into the surface it opens.
          if (event.key === " ") {
            event.preventDefault();
            return;
          }
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          send({ type: "TRIGGER.CLICK" });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || disabled || event.key !== " ") return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          send({ type: "TRIGGER.CLICK" });
        },
        onFocusIn() {
          send({ type: "FOCUS.IN" });
        },
        onFocusOut() {
          send({ type: "FOCUS.OUT" });
        },
      }),

    getTriggerSwatchProps: (): T["element"] =>
      normalize.element({
        ...parts.triggerSwatch.attrs,
        ...stateAttrs,
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        style: colorVars,
      }),

    /**
     * Real text, and deliberately not `aria-hidden`: on a `<button>` the contents
     * *are* the name, so hiding the only string in there is how a control ends up
     * nameless. The trigger's `aria-label` says the same words, so nothing is read
     * twice.
     */
    getValueTextProps: (): T["element"] =>
      normalize.element({
        ...parts.valueText.attrs,
        ...stateAttrs,
        id: getValueTextId(scope),
        "data-format": format,
      }),

    /**
     * `type="hidden"`, never `type="color"`. A real colour input would open the
     * platform's own picker on click and put a second value-bearing control in the
     * accessibility tree — two elements each claiming to hold the colour.
     */
    getHiddenInputProps: (): T["input"] =>
      normalize.input({
        ...parts.hiddenInput.attrs,
        id: getHiddenInputId(scope),
        type: "hidden",
        name: prop("name"),
        form: prop("form"),
        // Native rule: a disabled control is not submitted.
        disabled,
        value: valueString,
      }),

    // The sheet's alone: an anchored popup that dimmed the page would swallow the
    // very click meant to dismiss it.
    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-presentation": presentation,
      }),

    /**
     * The floating element. `data-side`/`data-align` are deliberately absent here
     * — the position effect writes onto this node directly, and an adapter that
     * also rendered them would fight it over every commit.
     */
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-sui-layer-parent": prop("parentId"),
        "data-state": state,
        "data-presentation": presentation,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        ...stateAttrs,
        id: contentId,
        // Inline, the panel is always open, never modal and has no way out: it is
        // embedded content, and a `dialog` would promise a closing it cannot keep.
        role: presentation === "inline" ? "group" : "dialog",
        "aria-modal": computed("isModal") ? "true" : undefined,
        dir: context.get("surfaceDir") ?? dir,
        tabIndex: -1,
        // The naming a `field` hands down reaches here too, and it has to: in
        // `presentation="inline"` there is no trigger, so a hub that stopped at the
        // trigger left the panel — the only thing on screen — tied to nothing at
        // all. Order of preference: a rendered `title`, then whatever named the
        // control from outside, then the library's own default.
        "aria-labelledby": hasTitle ? getTitleId(scope) : labelledBy,
        "aria-label": hasTitle || labelledBy !== undefined ? undefined : (label ?? "Color picker"),
        "aria-describedby": prop("describedBy"),
        "data-presentation": presentation,
        "data-state": state,
        "data-format": format,
        "data-side": side,
        "data-align": align,
        "data-placement": placement,
        "data-engaged": dataAttr(engaged),
        // The surface applies the glass material, so it owes its contents
        // the on-glass palette (architecture.md).
        "data-sui-on-glass": "",
        "data-snav": "container",
        "data-snav-trap": computed("isModal") ? "" : undefined,
        style: colorVars,
      }),

    getArrowProps: (): T["element"] =>
      normalize.element({
        ...parts.arrow.attrs,
        "aria-hidden": ariaAttr(true),
        "data-side": side,
      }),

    getTitleProps: (): T["element"] =>
      normalize.element({ ...parts.title.attrs, id: getTitleId(scope) }),

    /**
     * Sheet only, and a sibling of the dialog. `tabindex="-1"`: a pointer and touch
     * affordance whose keyboard and screen-reader path is Escape or B — the
     * `select:cancelTrigger` precedent, and it is what keeps `End` from landing on
     * a row the native control does not draw.
     */
    getCancelTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        id: getCancelTriggerId(scope),
        type: "button",
        tabIndex: -1,
        "data-state": state,
        "data-presentation": presentation,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.CLICK" });
        },
      }),

    // Never disabled with the rest of the picker: a surface opened and then
    // disabled keeps it as its one tab stop, and a sheet's cancel card is already
    // out of the tab order (decision 61).
    getCloseTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.closeTrigger.attrs,
        id: getCloseTriggerId(scope),
        type: "button",
        "aria-label": translations?.closeLabel ?? "Close",
        "data-state": state,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CLOSE.CLICK" });
        },
      }),

    /**
     * `role="group"`, never `role="application"`. WAI-ARIA 1.3 has no
     * two-dimensional slider and the APG has no colour-picker pattern; the two
     * hidden `<input type="range">` in the thumb are what publish a value, a name
     * and a `valuetext` a reader can use, where `application` would only silence
     * the browse mode and announce nothing.
     */
    getAreaProps: (): T["element"] =>
      normalize.element({
        ...parts.area.attrs,
        ...stateAttrs,
        id: getAreaId(scope),
        role: "group",
        "aria-label": translations?.areaLabel ?? "Saturation and brightness",
        "data-dragging": dataAttr(areaDragging),
        "data-engaged": dataAttr(engagedTarget === "area"),
        // The modality alone, paired with `:focus-within` in the sheet: the ring
        // belongs to whichever element actually has the focus, and the core has no
        // business asking the document which one that is during a render.
        "data-focus-source": focusSource ?? undefined,
        // The finger owns both axes for the length of the gesture; a scroll
        // container underneath must not take either away mid-drag.
        style: { ...colorVars, touchAction: "none" },
      }),

    getAreaBackgroundProps: (): T["element"] =>
      normalize.element({
        ...parts.areaBackground.attrs,
        "aria-hidden": ariaAttr(true),
        style: colorVars,
      }),

    getAreaThumbProps: (): T["element"] =>
      normalize.element({
        ...parts.areaThumb.attrs,
        role: "presentation",
        "data-dragging": dataAttr(areaDragging),
        "data-engaged": dataAttr(engagedTarget === "area"),
        style: {
          ...colorVars,
          "--sui-color-picker-area-x": pct(color.s / 100),
          "--sui-color-picker-area-y": pct(color.v / 100),
        },
      }),

    getAreaXInputProps: (): T["input"] =>
      normalize.input({
        ...parts.areaXInput.attrs,
        id: getAreaXInputId(scope),
        ...areaInputProps("x"),
      }),

    getAreaYInputProps: (): T["input"] =>
      normalize.input({
        ...parts.areaYInput.attrs,
        id: getAreaYInputId(scope),
        ...areaInputProps("y"),
      }),

    getChannelSliderProps: ({ channel }: ColorPickerChannelProps): T["element"] =>
      normalize.element({
        ...parts.channelSlider.attrs,
        ...stateAttrs,
        "data-channel": channel,
        // Horizontal in v1: no design draws a vertical colour track, and an
        // orientation nobody renders is a second geometry to keep correct.
        "data-orientation": "horizontal",
        "data-dragging": dataAttr(activeChannel === channel && !engaged),
        "data-engaged": dataAttr(engagedTarget === channel),
        style: {
          ...colorVars,
          "--sui-color-picker-channel-percent": pct(channelPercent(channel)),
          touchAction: "none",
        },
      }),

    getChannelLabelProps: ({ channel }: ColorPickerInputProps): T["element"] =>
      normalize.element({
        ...parts.channelLabel.attrs,
        id: getChannelLabelId(scope, channel),
        "data-channel": channel,
      }),

    getChannelSliderTrackProps: ({ channel }: ColorPickerChannelProps): T["element"] =>
      normalize.element({
        ...parts.channelSliderTrack.attrs,
        "aria-hidden": ariaAttr(true),
        "data-channel": channel,
        style: {
          ...colorVars,
          "--sui-color-picker-channel-percent": pct(channelPercent(channel)),
        },
      }),

    getChannelSliderRangeProps: ({ channel }: ColorPickerChannelProps): T["element"] =>
      normalize.element({
        ...parts.channelSliderRange.attrs,
        "aria-hidden": ariaAttr(true),
        "data-channel": channel,
        style: { "--sui-color-picker-channel-percent": pct(channelPercent(channel)) },
      }),

    /**
     * The house `div[role="slider"]`, unlike the area's native pair: a channel is
     * one tab stop with one value, which is exactly what the role describes, and
     * it already carries `data-engaged` for the pad.
     */
    getChannelSliderThumbProps: ({ channel }: ColorPickerChannelProps): T["element"] => {
      const range = getChannelRange(channel);
      const current = getChannelValue(color, channel);
      const text = channelValueText(channel);

      return normalize.element({
        ...parts.channelSliderThumb.attrs,
        ...stateAttrs,
        id: getChannelThumbId(scope, channel),
        role: "slider",
        // Dropped rather than set to -1: a disabled picker is out of the tab order
        // entirely, and a lone `tabindex="-1"` still answers a script's `.focus()`.
        tabIndex: disabled ? undefined : 0,
        "data-channel": channel,
        "data-orientation": "horizontal",
        "data-engaged": dataAttr(engagedTarget === channel),
        "data-dragging": dataAttr(activeChannel === channel && !engaged),
        // On every thumb, and the sheet's `:focus` picks the one that matters.
        //
        // This is the one place left in the repo that does not follow
        // architecture.md:51 ("un composite ne le pose que sur l'item focalisé").
        // The comment here used to call it "the `select:item` arrangement" — the
        // opposite is true: `select`, `listbox`, `menu`, `calendar`, `toggle-group`
        // and `slider` all gate it on the focused item, and the swatch below now
        // does too. The reason this one cannot is that `FOCUS.IN` carries no
        // channel, so the machine does not know *which* thumb has the focus, where
        // `slider` keeps a `focusedIndex`. Closing it means a payload and a piece
        // of state on a line already at 99% of its ceiling — named debt, measured,
        // not a shrug.
        "data-focus-source": focusSource ?? undefined,
        "aria-valuemin": range.min,
        "aria-valuemax": range.max,
        "aria-valuenow": roundToPrecision(current, 2),
        "aria-valuetext": text,
        "aria-orientation": "horizontal",
        ...channelNaming(channel),
        "aria-disabled": ariaAttr(disabled),
        "aria-readonly": ariaAttr(readOnly),
        style: {
          ...colorVars,
          "--sui-color-picker-channel-percent": pct(channelPercent(channel)),
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          const next = getChannelKeyEvent(event.key, channel, {
            dir: resolveDir(dir, getSurfaceEl(scope)),
            shiftKey: event.shiftKey,
          });
          // The interactive test sits before `preventDefault`, deliberately: on a
          // read-only picker PageDown still belongs to the page.
          if (next === null || !interactive) return;
          event.preventDefault();
          send(next);
        },
        onFocusIn() {
          send({ type: "FOCUS.IN" });
        },
        onFocusOut() {
          send({ type: "FOCUS.OUT" });
        },
      });
    },

    /**
     * A text field, never a `type="number"`: the hex channel is not a number, and
     * a spinner on the other seven would put a second pair of steppers next to a
     * slider that already has arrow keys.
     */
    getChannelInputProps: ({ channel }: ColorPickerInputProps): T["input"] => {
      const draft = drafts[channel];
      const shown =
        channel === "hex"
          ? toHex(color, alphaEnabled && color.a < 1)
          : String(displayValue(color, channel));

      return normalize.input({
        ...parts.channelInput.attrs,
        id: getChannelInputId(scope, channel),
        type: "text",
        inputMode: channel === "hex" ? "text" : "numeric",
        autoComplete: "off",
        spellCheck: false,
        disabled,
        readOnly,
        value: draft ?? shown,
        "data-channel": channel,
        // The *field* is invalid, not the component: the value has not moved.
        "data-invalid": dataAttr(invalidDrafts.includes(channel)),
        ...channelNaming(channel),
        onChange(event: Event) {
          const input = event.currentTarget as HTMLInputElement | null;
          if (input === null) return;
          send({ type: "INPUT.CHANGE", channel, text: input.value });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "Enter") {
            event.preventDefault();
            send({ type: "INPUT.COMMIT", channel });
            return;
          }
          if (event.key === "Escape") {
            // The first Escape reverts the field, the second closes the surface.
            // The *veto* over the close lives in the dismissable layer's
            // `onEscapeKeyDown` — that listener is on the document in capture and
            // nothing here could get in front of it. This is the revert itself,
            // and it is what answers in `presentation="inline"`, where there is no
            // layer at all. Idempotent, so running twice costs nothing.
            event.stopPropagation();
            send({ type: "INPUT.REVERT", channel });
            return;
          }
          if (channel === "hex") return;
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          send(
            event.key === "ArrowUp"
              ? { type: "CHANNEL.INCREMENT", channel, large: event.shiftKey }
              : { type: "CHANNEL.DECREMENT", channel, large: event.shiftKey },
          );
        },
        // Blur is an implicit commit — a Tab away must not silently discard what
        // was typed, which is the APG's answer for the same shape on a combobox.
        onFocusOut() {
          send({ type: "INPUT.COMMIT", channel });
          send({ type: "FOCUS.OUT" });
        },
        onFocusIn() {
          send({ type: "FOCUS.IN" });
        },
      });
    },

    /**
     * A real `<select>`: the one native control in the anatomy, because a format
     * switch is a four-item list with no styling worth a second machine. It is
     * excluded from the dismissable layer (§5.5) — its dropdown is painted by the
     * system, outside the DOM, and a click inside it reads as outside the surface.
     */
    getFormatSelectProps: (): T["select"] =>
      normalize.select({
        ...parts.formatSelect.attrs,
        id: getFormatSelectId(scope),
        "aria-label": translations?.formatSelectLabel ?? "Color format",
        disabled: disabled || readOnly,
        value: format,
        onChange(event: Event) {
          const element = event.currentTarget as HTMLSelectElement | null;
          if (element === null) return;
          send({ type: "FORMAT.SET", format: element.value as ColorFormat });
        },
      }),

    /**
     * `role="grid"`, not `role="listbox"`: the rows carry meaning — the
     * palette is a ramp of greys on row one and a hue × lightness matrix below it —
     * and the APG sends every interactive two-dimensional layout to
     * the Grid pattern. It is also what makes `Home`/`End` bounded to a row
     * coherent rather than a listbox wearing a grid's keyboard.
     */
    getSwatchGroupProps: (): T["element"] =>
      normalize.element({
        ...parts.swatchGroup.attrs,
        ...stateAttrs,
        id: getSwatchGroupId(scope),
        role: "grid",
        "aria-label": translations?.swatchGroupLabel ?? "Color swatches",
        "aria-readonly": ariaAttr(readOnly),
        "data-columns": swatchColumns,
        style: { "--sui-color-picker-columns": String(swatchColumns) },
      }),

    getSwatchRowProps: ({ row }: ColorPickerSwatchRowProps): T["element"] =>
      normalize.element({ ...parts.swatchRow.attrs, role: "row", "data-row": row }),

    getSwatchProps: ({ index }: ColorPickerSwatchProps): T["element"] => {
      const swatch = swatchList[index] ?? "transparent";
      const selected = index === selectedSwatch;

      return normalize.element({
        ...parts.swatch.attrs,
        id: getSwatchId(scope, index),
        role: "gridcell",
        tabIndex: disabled ? undefined : getRovingTabIndex(index, rovingSwatch),
        "aria-selected": boolAttr(selected),
        "aria-label": swatch,
        "data-value": swatch,
        "data-index": index,
        "data-selected": dataAttr(selected),
        "data-highlighted": dataAttr(index === highlighted),
        // On the roving cell alone — the one cell of the grid that can hold the
        // focus. It was on all of them until 2026-09-06, which is what
        // architecture.md:51 forbids in as many words ("un composite ne le pose que
        // sur l'item focalisé") and what `select`, `listbox`, `menu`, `calendar`,
        // `toggle-group` and `slider` all already do.
        "data-focus-source": index === rovingSwatch ? (focusSource ?? undefined) : undefined,
        style: { "--sui-color-picker-swatch-color": swatch },
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "SWATCH.HIGHLIGHT", index });
          send({ type: "SWATCH.SELECT", index });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.metaKey) return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) send({ type: "SWATCH.SELECT", index });
            return;
          }
          // Space activates on keyup — the APG split, and the defect this library
          // already found once on `tabs`.
          if (event.key === " ") {
            event.preventDefault();
            return;
          }
          const action = getGridKeyAction(event.key, {
            ctrlKey: event.ctrlKey,
            dir: resolveDir(dir, getSurfaceEl(scope)),
          });
          if (action === null) return;
          event.preventDefault();
          send({
            type: "SWATCH.HIGHLIGHT",
            index: getGridNextIndex(index, action, {
              count: swatchList.length,
              columns: swatchColumns,
              loop: prop("loopSwatches"),
              page: 1,
            }),
          });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || event.key !== " ") return;
          event.preventDefault();
          send({ type: "SWATCH.SELECT", index });
        },
        onFocusIn() {
          send({ type: "FOCUS.IN" });
        },
        onFocusOut() {
          send({ type: "FOCUS.OUT" });
        },
      });
    },

    getSwatchIndicatorProps: ({ index }: ColorPickerSwatchProps): T["element"] =>
      normalize.element({
        ...parts.swatchIndicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-state": index === selectedSwatch ? "checked" : "unchecked",
      }),

    /**
     * The "+" button, and it lives **outside** the grid: a
     * `<button>` inside a `gridcell` is `nested-interactive`, which the APG
     * forbids and axe fails on.
     */
    getSwatchTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.swatchTrigger.attrs,
        type: "button",
        disabled: disabled || readOnly,
        "aria-label": translations?.swatchTriggerLabel ?? "Add current color",
        style: colorVars,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "SWATCH.ADD" });
        },
      }),

    getEyedropperTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.eyedropperTrigger.attrs,
        id: getEyedropperTriggerId(scope),
        type: "button",
        disabled: disabled || readOnly,
        "aria-label": translations?.eyedropperLabel ?? "Pick a color from the screen",
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "EYEDROPPER.OPEN" });
        },
      }),

    getTransparencyGridProps: (): T["element"] =>
      normalize.element({ ...parts.transparencyGrid.attrs, "aria-hidden": ariaAttr(true) }),
  };
}
