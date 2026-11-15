import type { DismissReason } from "../../interaction/layer-stack";
import type { PropTypes } from "../../machine/prop-types";
import type { EffectCleanup, MachineSchema } from "../../machine/types";
import type { IntentScopeHost } from "../../nav";
import type { Placement } from "../../positioner/compute-position";
import type { Density, Direction, InputModality, Rect } from "../../types";
import type {
  ColorChannel,
  ColorFormat,
  ColorNumericChannel,
  ColorValue,
  RgbColor,
} from "../../utils/color";

/** What the surface actually is once the density has had its say. */
export type ColorPickerPresentation = "popup" | "sheet" | "inline";

export type ColorPickerPresentationProp = "auto" | ColorPickerPresentation;

/** The well is the capsule; the wheel is its round twin. */
export type ColorPickerVariant = "well" | "wheel";

/** What a gamepad can take hold of: any channel, or the area's two axes at once. */
export type ColorPickerEngageTarget = ColorNumericChannel | "area";

export type ColorPickerAreaAxis = "x" | "y";

export interface ColorPickerValueChangeDetails {
  /**
   * The colour formatted in the current format. The one exception is the end of a
   * gesture (`onValueChangeEnd`) under a controlled parent: when the reported
   * colour is the one the parent holds and that string parses, `value` is the
   * parent's own string, unchanged, whatever its notation. The hidden input still
   * submits the formatted colour.
   */
  readonly value: string;
  readonly color: ColorValue;
}

export interface ColorPickerOpenChangeDetails {
  readonly open: boolean;
}

export interface ColorPickerFormatChangeDetails {
  readonly format: ColorFormat;
}

export interface ColorPickerDismissDetails {
  readonly reason: DismissReason;
}

/**
 * The accessible names the panel owes when the consumer renders no label part of
 * its own, behind one named seam — the shape `toast` and `pagination` already use
 * (`ToastTranslations`, `PaginationTranslations`).
 *
 * The defaults stay English and stay in `connect`: five components in this library
 * ship an English default this way, and the alternative is a nameless icon-only
 * button. What was wrong until 2026-09-06 was not the English, it was that the
 * strings were written at the getter with no seam at all — the one component in
 * the repo in that position. `calendar` and `date-field` need no equivalent
 * because `Intl` has a table for weekday and field names; there is none for
 * "Add current color".
 *
 * `areaValueText` is the one that matters most and the one no part prop could
 * reach: it is composed inside the getter, and it is the sentence a screen reader
 * actually speaks on every drag of the area.
 */
export interface ColorPickerTranslations {
  /** Defaults to `"Close"`. */
  readonly closeLabel?: string | undefined;
  /** Defaults to `"Saturation and brightness"`. */
  readonly areaLabel?: string | undefined;
  /** Defaults to `"Color format"`. */
  readonly formatSelectLabel?: string | undefined;
  /** Defaults to `"Color swatches"`. */
  readonly swatchGroupLabel?: string | undefined;
  /** Defaults to `"Add current color"`. */
  readonly swatchTriggerLabel?: string | undefined;
  /** Defaults to `"Pick a color from the screen"`. */
  readonly eyedropperLabel?: string | undefined;
  /**
   * The name of one channel, used both for a slider with no `channelLabel` part
   * and for the two visually hidden range inputs of the area. Defaults to `"Hue"`,
   * `"Saturation"`, `"Brightness"`, `"Opacity"`, `"Red"`, `"Green"`, `"Blue"`,
   * `"Hex"`.
   */
  readonly channelLabel?: ((channel: ColorChannel) => string) | undefined;
  /**
   * What the area announces. Defaults to `"Saturation 40%, brightness 90%, <name>"`,
   * led by whichever axis the reader is on.
   */
  readonly areaValueText?:
    | ((details: {
        readonly lead: "saturation" | "brightness";
        readonly saturation: number;
        readonly brightness: number;
        readonly colorName: string;
      }) => string)
    | undefined;
}

/**
 * The screen picker, imported from `@standarui/core/color-picker/eyedropper` and
 * passed as is. Opaque on purpose: the module's own functions take the machine's
 * params, and method signatures are bivariant in their parameters, so they stay
 * assignable without this public type naming the machine's schema. The disposer
 * `detect` returns runs when the prop changes and when the picker goes away.
 */
export interface ColorPickerEyedropper {
  detect(params: object): EffectCleanup;
  open(params: object): void;
}

export interface ColorPickerMachineProps {
  // --- value -----------------------------------------------------------------
  /** A CSS colour string. Controlled when present — the machine reports, never writes. */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((details: ColorPickerValueChangeDetails) => void) | undefined;
  /** Once per gesture, with the colour the gesture aimed at — whether or not a controlled parent has answered yet; a gesture that writes nothing, or whose write lands back on the colour held (a drag brought back, B, Cancel), reports that colour — as the parent's own string when it holds it and that string parses. */
  readonly onValueChangeEnd?: ((details: ColorPickerValueChangeDetails) => void) | undefined;
  readonly format?: ColorFormat | undefined;
  readonly defaultFormat?: ColorFormat | undefined;
  readonly onFormatChange?: ((details: ColorPickerFormatChangeDetails) => void) | undefined;
  /** What the format select offers. Defaults to all four. */
  readonly formats?: readonly ColorFormat[] | undefined;
  /** `false` pins alpha at 1 and takes the alpha channel out of the anatomy. */
  readonly alpha?: boolean | undefined;

  // --- surface ---------------------------------------------------------------
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((details: ColorPickerOpenChangeDetails) => void) | undefined;
  readonly presentation?: ColorPickerPresentationProp | undefined;
  readonly placement?: Placement | undefined;
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;
  /** Defaults to `false` in `popup` and `true` in `sheet`; ignored in `inline`. */
  readonly modal?: boolean | undefined;
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  readonly restoreFocus?: boolean | undefined;
  readonly finalFocus?: (() => HTMLElement | null) | undefined;
  readonly onDismiss?: ((details: ColorPickerDismissDetails) => void) | undefined;
  /** The layer this picker opened from — adapters default it from their context. */
  readonly parentId?: string | undefined;
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;

  // --- control ---------------------------------------------------------------
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly variant?: ColorPickerVariant | undefined;
  /** One arrow key, in the unit of whichever channel it lands on. */
  readonly step?: number | undefined;
  /**
   * Shift+arrow, PageUp/PageDown and the triggers. Absent, each channel takes a
   * tenth of its own range — 10 on saturation, 36 on hue, 0.1 on alpha — because
   * a flat ten would be a rounding error on a 0→360 channel.
   */
  readonly largeStep?: number | undefined;
  readonly swatches?: readonly string[] | undefined;
  readonly maxSwatches?: number | undefined;
  /** Defaults to 12 on desktop and 6 on touch — see the density table (§8). */
  readonly swatchColumns?: number | undefined;
  readonly loopSwatches?: boolean | undefined;
  /** The screen picker, imported from `@standarui/core/color-picker/eyedropper`; without it the part never renders, on any engine. */
  readonly eyedropper?: ColorPickerEyedropper | undefined;
  readonly labelledBy?: string | undefined;
  readonly describedBy?: string | undefined;
  /** The accessible name of the surface when no `title` part is rendered. */
  readonly label?: string | undefined;
  readonly translations?: ColorPickerTranslations | undefined;
  readonly intents?: IntentScopeHost | null | undefined;
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
}

export interface ResolvedColorPickerMachineProps extends ColorPickerMachineProps {
  readonly defaultValue: string;
  readonly defaultFormat: ColorFormat;
  readonly formats: readonly ColorFormat[];
  readonly alpha: boolean;
  readonly defaultOpen: boolean;
  readonly presentation: ColorPickerPresentationProp;
  readonly placement: Placement;
  readonly gap: number;
  readonly offset: number;
  readonly flip: boolean;
  readonly shift: boolean;
  readonly padding: number;
  readonly strategy: "absolute" | "fixed";
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly restoreFocus: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly variant: ColorPickerVariant;
  readonly step: number;
  readonly swatches: readonly string[];
  readonly maxSwatches: number;
  readonly loopSwatches: boolean;
  readonly intents: IntentScopeHost | null;
}

/** The four value events an area axis produces, whatever pressed the key. */
export type ColorPickerAreaAdjustEvent =
  | {
      type: "AREA.ADJUST";
      axis: ColorPickerAreaAxis;
      direction: "increment" | "decrement";
      large: boolean;
    }
  | { type: "AREA.SET_EXTREME"; axis: ColorPickerAreaAxis; edge: "min" | "max" };

/** The four value events a channel produces, whatever pressed the key. */
export type ColorPickerChannelAdjustEvent =
  | { type: "CHANNEL.INCREMENT"; channel: ColorNumericChannel; large: boolean }
  | { type: "CHANNEL.DECREMENT"; channel: ColorNumericChannel; large: boolean }
  | { type: "CHANNEL.SET_MIN"; channel: ColorNumericChannel }
  | { type: "CHANNEL.SET_MAX"; channel: ColorNumericChannel };

export interface ColorPickerSchema extends MachineSchema {
  /**
   * **Two states, and `engaged` is deliberately not a third.** This interpreter
   * is flat: entering a state tears down the effects of the one it left
   * (`machine/service.ts`, `runTransition`). The slider can afford `engaged` as a
   * sibling because the state it leaves owns one effect; here `open` owns the
   * dismissable layer, the position tracker, the focus trap, the scroll lock and
   * the `aria-hidden` sweep — tearing those down to take hold of a knob would
   * close the layer, re-fit the surface and hand the focus back to the trigger.
   * The hold is `context.engagedTarget` plus a scope disposed by `trackEngage`,
   * which is the same guarantee with the effect where it can survive.
   */
  state: "closed" | "open";
  props: ResolvedColorPickerMachineProps;
  context: {
    /** HSVA, the source of truth. `colorEquals` keeps a fresh object from reading as a change. */
    color: ColorValue;
    open: boolean;
    format: ColorFormat;
    /** The channel a pointer or a pad is currently moving, `null` when none is. */
    activeChannel: ColorPickerEngageTarget | null;
    /** What the gamepad is holding, `null` when it holds nothing. */
    engagedTarget: ColorPickerEngageTarget | null;
    areaDragging: boolean;
    /** Roving index into the swatch grid; `-1` when nothing is highlighted. */
    highlightedSwatch: number;
    savedSwatches: string[];
    density: Density;
    surfaceDir: Direction | null;
    currentPlacement: Placement;
    /**
     * `false` until an effect has looked, so the server and the first client
     * render agree and the trigger appears after hydration rather than during it.
     */
    eyedropperSupported: boolean;
    /** The text a channel field holds before it is committed, keyed by channel. */
    inputDrafts: Record<string, string>;
    /** Channels whose last commit could not be parsed — `data-invalid` on the field alone. */
    invalidDrafts: string[];
    focusSource: InputModality | null;
    /**
     * Whether the parts an `aria-labelledby` would point at are rendered.
     * Read from the live DOM rather than assumed: an IDREF written blind is a
     * dangling reference *and* no accessible name at once, and `axe`'s
     * `aria-valid-attr-value` fails on it (the lesson `menu` and `field` both
     * carry).
     */
    hasLabel: boolean;
    hasTitle: boolean;
    /**
     * Whether `value-text` is on the page, which decides whether the trigger's
     * name can carry the colour. The trigger points its `aria-labelledby` at its
     * own id to mean "and my own contents" — but that is worth nothing when the
     * only child is the swatch, which is `aria-hidden`. Measured on the shipped
     * demo: the name came out "Accent", never the colour.
     */
    hasValueText: boolean;
    /** Which channels a `channel-label` was rendered for — see `getLabelledChannels`. */
    labelledChannels: string[];
  };
  computed: {
    presentation: ColorPickerPresentation;
    isInteractive: boolean;
    isModal: boolean;
    valueString: string;
    rgb: RgbColor;
    /** The channels that get a slider, in tab order. */
    channels: readonly ColorNumericChannel[];
    swatchList: readonly string[];
    swatchColumns: number;
    swatchRows: number;
    colorName: string;
  };
  refs: {
    /** The snapshot B restores to inside a hold — taken on every engage. */
    entryColor: ColorValue | null;
    /** The colour the surface opened with, which the sheet's cancel puts back. */
    openColor: ColorValue | null;
    /** The colour the last write aimed at, emitted or not, cleared when the end of a gesture reports it. */
    changed: ColorValue | null;
    finalFocusEl: HTMLElement | null;
    /** The live engage scope's dispose, so a release and an unmount share one path. */
    engageDispose: VoidFunction | null;
    /** Cancels a screen pick still in flight when the surface goes away. */
    eyedropperAbort: AbortController | null;
    /** The current module's disposer, one slot for the mount and for every change of the prop. */
    eyedropperEnd: VoidFunction | null;
    /** The photo `FORM.RESET` restores. */
    initialValue: string;
  };
  event:
    | ColorPickerAreaAdjustEvent
    | ColorPickerChannelAdjustEvent
    | { type: "TRIGGER.CLICK" }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CANCEL.CLICK" }
    | { type: "CLOSE.CLICK" }
    | { type: "AREA.PRESS"; x: number; y: number }
    | { type: "AREA.DRAG"; x: number; y: number }
    | { type: "AREA.DRAG_END"; moved: boolean }
    /** The assistive-technology path: a real `<input type="range">` pushed a value. */
    | { type: "AREA.SET"; axis: ColorPickerAreaAxis; value: number }
    | { type: "CHANNEL.PRESS"; channel: ColorNumericChannel; percent: number }
    | { type: "CHANNEL.DRAG"; percent: number }
    | { type: "CHANNEL.DRAG_END"; moved: boolean }
    /** `api.setChannelValue` — in the channel's own unit, never the field's per cent. */
    | { type: "CHANNEL.SET"; channel: ColorNumericChannel; value: number }
    | { type: "CHANNEL.ENGAGE"; target: ColorPickerEngageTarget }
    | { type: "CHANNEL.RELEASE"; committed: boolean }
    /** The modality a value control's focus arrived under, held until it leaves. */
    | { type: "FOCUS.IN" }
    /** A Tab out of a held control ends the hold by committing (§6.0). */
    | { type: "FOCUS.OUT" }
    | { type: "INPUT.CHANGE"; channel: ColorChannel; text: string }
    | { type: "INPUT.COMMIT"; channel: ColorChannel }
    | { type: "INPUT.REVERT"; channel: ColorChannel }
    | { type: "FORMAT.SET"; format: ColorFormat }
    | { type: "SWATCH.SELECT"; index: number }
    | { type: "SWATCH.HIGHLIGHT"; index: number }
    | { type: "SWATCH.ADD" }
    | { type: "EYEDROPPER.OPEN" }
    | { type: "EYEDROPPER.RESULT"; sRGBHex: string }
    | { type: "EYEDROPPER.DISMISS"; reason: "abort" | "error" }
    | { type: "VALUE.SET"; value: string }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "PRESENTATION.SYNC" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "ENVIRONMENT.SYNC"; density: Density }
    | { type: "PARTS.SYNC" }
    | { type: "FORM.RESET" };
  action:
    | "openSurface"
    | "closeSurface"
    | "setOpen"
    | "captureFinalFocus"
    | "snapshotColor"
    | "snapshotOpenColor"
    | "restoreOpenColor"
    | "restoreEntryColor"
    | "clearSnapshot"
    | "startAreaDrag"
    | "endAreaDrag"
    | "setAreaFromPoint"
    | "setAreaAxis"
    | "adjustArea"
    | "setAreaExtreme"
    | "focusAreaInput"
    | "startChannelDrag"
    | "endChannelDrag"
    | "setChannelFromPercent"
    | "setChannelValue"
    | "adjustChannel"
    | "setChannelExtreme"
    | "focusChannelThumb"
    | "engageTarget"
    | "releaseTarget"
    | "captureFocusSource"
    | "clearFocusSource"
    | "setDraft"
    | "commitDraft"
    | "clearDraft"
    | "clearDrafts"
    | "setFormat"
    | "selectSwatch"
    | "highlightSwatch"
    | "saveCurrentSwatch"
    | "openEyedropper"
    | "applyEyedropper"
    | "clearEyedropper"
    | "setValueFromString"
    | "resetToInitialValue"
    | "invokeChangeEnd"
    | "invokeOnDismiss"
    | "syncEnvironment"
    | "syncPlacement"
    | "syncParts"
    | "syncEyedropper";
  guard:
    | "isInteractive"
    | "isOpen"
    | "isAreaDragging"
    | "isChannelDragging"
    | "isEngaged"
    | "canEngage"
    | "canDismiss"
    | "canEyedrop";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackParts"
    | "trackFormReset"
    | "detectEyedropper"
    | "trackSurfaceDir"
    | "trackDismissable"
    | "trackAnchorPosition"
    | "trackFocusTrap"
    | "hideOutside"
    | "lockPageScroll"
    | "captureSurfaceIntents"
    | "captureSelectIntent"
    | "trackEngage"
    | "trackAreaPointer"
    | "trackChannelPointer";
}

// --- prop-getter inputs ------------------------------------------------------

export interface ColorPickerChannelProps {
  readonly channel: ColorNumericChannel;
}

export interface ColorPickerInputProps {
  /** `"hex"` is the text field the hex format shows; everything else is numeric. */
  readonly channel: ColorChannel;
}

export interface ColorPickerSwatchRowProps {
  readonly row: number;
}

export interface ColorPickerSwatchProps {
  readonly index: number;
}

export interface ColorPickerApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  /** The colour formatted in the current format. */
  readonly value: string;
  readonly color: ColorValue;
  readonly rgb: RgbColor;
  readonly format: ColorFormat;
  readonly formats: readonly ColorFormat[];
  /** The channels that get a slider, in tab order. */
  readonly channels: readonly ColorNumericChannel[];
  readonly swatches: readonly string[];
  readonly swatchColumns: number;
  readonly swatchRows: number;
  readonly highlightedSwatch: number;
  readonly presentation: ColorPickerPresentation;
  readonly placement: Placement;
  readonly dragging: boolean;
  readonly engaged: boolean;
  readonly engagedTarget: ColorPickerEngageTarget | null;
  readonly disabled: boolean;
  /** `false` until an effect has looked — never read at render time (§5.2). */
  readonly eyedropperSupported: boolean;
  readonly focusSource: InputModality | null;
  readonly focusVisible: boolean;
  readonly triggerId: string;
  readonly contentId: string;

  setOpen(open: boolean): void;
  setValue(value: string): void;
  setColor(color: ColorValue): void;
  setFormat(format: ColorFormat): void;
  setChannelValue(channel: ColorNumericChannel, value: number): void;
  getChannelValue(channel: ColorNumericChannel): number;
  /** The 0…1 position of a channel along its own track. */
  getChannelPercent(channel: ColorNumericChannel): number;
  /**
   * What to write as a channel's visible label — `translations.channelLabel` when
   * a consumer supplied one, and the library's own name otherwise ("Opacity" for
   * `alpha`). The composed layer printed the raw
   * machine key until this existed, so an `alpha` slider was labelled "alpha";
   * and the name was reachable only through the `aria-label` of a channel whose
   * label is *not* rendered, which is the opposite of the case that needs it.
   */
  getChannelName(channel: ColorChannel): string;
  addSwatch(): void;
  selectSwatch(index: number): void;
  openEyedropper(): void;

  getRootProps(): T["element"];
  getLabelProps(): T["element"];
  getTriggerProps(): T["button"];
  getTriggerSwatchProps(): T["element"];
  getValueTextProps(): T["element"];
  getHiddenInputProps(): T["input"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getArrowProps(): T["element"];
  getTitleProps(): T["element"];
  getCancelTriggerProps(): T["button"];
  getCloseTriggerProps(): T["button"];
  getAreaProps(): T["element"];
  getAreaBackgroundProps(): T["element"];
  getAreaThumbProps(): T["element"];
  getAreaXInputProps(): T["input"];
  getAreaYInputProps(): T["input"];
  getChannelSliderProps(props: ColorPickerChannelProps): T["element"];
  /** Takes any channel, `hex` included: the label names a field as well as a thumb. */
  getChannelLabelProps(props: ColorPickerInputProps): T["element"];
  getChannelSliderTrackProps(props: ColorPickerChannelProps): T["element"];
  getChannelSliderRangeProps(props: ColorPickerChannelProps): T["element"];
  getChannelSliderThumbProps(props: ColorPickerChannelProps): T["element"];
  getChannelInputProps(props: ColorPickerInputProps): T["input"];
  getFormatSelectProps(): T["select"];
  getSwatchGroupProps(): T["element"];
  getSwatchRowProps(props: ColorPickerSwatchRowProps): T["element"];
  getSwatchProps(props: ColorPickerSwatchProps): T["element"];
  getSwatchIndicatorProps(props: ColorPickerSwatchProps): T["element"];
  getSwatchTriggerProps(): T["button"];
  getEyedropperTriggerProps(): T["button"];
  getTransparencyGridProps(): T["element"];
}
