import type { IntentScopeHost } from "@standarx/nav";
import type { RovingAction } from "../../focus/roving-focus";
import type { DismissReason } from "../../interaction/layer-stack";
import type { TypeaheadState } from "../../interaction/typeahead";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Placement } from "../../positioner/compute-position";
import type { Density, Direction, InputModality, Rect } from "../../types";

/** What the surface actually is once the density has had its say. */
export type SelectPresentation = "popup" | "sheet";

export type SelectPresentationProp = "auto" | SelectPresentation;

export interface SelectValueChangeDetails {
  readonly value: string | null;
}

export interface SelectOpenChangeDetails {
  readonly open: boolean;
}

export interface SelectHighlightChangeDetails {
  readonly value: string | null;
}

export interface SelectDismissDetails {
  readonly reason: DismissReason;
}

export interface SelectMachineProps {
  // --- value -----------------------------------------------------------------
  /** Single, `string | null`. Multi-select is `listbox`/`combobox` territory. */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly onValueChange?: ((details: SelectValueChangeDetails) => void) | undefined;

  // --- openness --------------------------------------------------------------
  /** Controlled. */
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((details: SelectOpenChangeDetails) => void) | undefined;
  /** Defaults to `auto`, which the density resolves into `popup` or `sheet`. */
  readonly presentation?: SelectPresentationProp | undefined;

  // --- positioning, handed straight to the positioner ------------------------
  readonly placement?: Placement | undefined;
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  /**
   * `true` by default — the select's divergence from the menu (ROADMAP): a
   * surface of options is a widened trigger, so its width is the anchor's.
   */
  readonly matchWidth?: boolean | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;
  /** Anchor to a rect rather than an element — a caret, a canvas, a cell. */
  readonly getAnchorRect?: (() => Rect) | undefined;

  // --- collection ------------------------------------------------------------
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly loopFocus?: boolean | undefined;
  readonly typeahead?: boolean | undefined;
  /**
   * No per-item override, a deliberate divergence from the menu: a select that
   * stays open after a choice is a setting of the surface, not of one item.
   */
  readonly closeOnSelect?: boolean | undefined;
  /** The keyboard cursor, not the selection: arrows and typeahead move it, and `value` only follows once a choice is committed. */
  readonly highlightedValue?: string | null | undefined;
  readonly defaultHighlightedValue?: string | null | undefined;
  readonly onHighlightChange?: ((details: SelectHighlightChangeDetails) => void) | undefined;

  // --- dismissal (the menu's defaults) ----------------------------------------
  /** Governs the gamepad `back` intent as well: B and Escape share one lock. */
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  /** The click that closes the select must not activate what was under it. */
  readonly preventOutsideActivation?: boolean | undefined;
  /** `false` — the menu's justification, verbatim: inert + scroll lock is the dialog's contract. */
  readonly modal?: boolean | undefined;
  /** Defaults to the `sheet` presentation and is ignored in `popup`. */
  readonly preventScroll?: boolean | undefined;
  readonly onDismiss?: ((details: SelectDismissDetails) => void) | undefined;
  /**
   * The layer this select opened from — required once either end is portalled,
   * or a click inside the portalled listbox reads as outside the surface that
   * holds the trigger. Adapters default it from their layer context.
   */
  readonly parentId?: string | undefined;

  // --- focus -----------------------------------------------------------------
  /** On by default. Turned off, focus is left wherever the dismissal put it and `finalFocus` is never consulted. */
  readonly restoreFocus?: boolean | undefined;
  /** Outranks the element that had focus when the select opened; ignored entirely while `restoreFocus` is off. */
  readonly finalFocus?: (() => HTMLElement | null) | undefined;

  // --- form ------------------------------------------------------------------
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly required?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly disabled?: boolean | undefined;

  // --- misc ------------------------------------------------------------------
  /** The selection blink. Popup only; off in `sheet` and under reduced motion. */
  readonly selectionFlash?: boolean | undefined;
  /**
   * The accessible name of both halves when nothing else names them: the
   * listbox stops borrowing the trigger's name, and the trigger — a
   * `role="combobox"`, which takes no name from its contents — gets one at all.
   * Inside a `field`, prefer the field's label; `labelledBy` outranks this.
   */
  readonly label?: string | undefined;
  /** `aria-describedby` for the trigger — what a field's helper text wires in. */
  readonly describedBy?: string | undefined;
  /** `aria-labelledby` for the trigger, for a label `label[for]` cannot reach. */
  readonly labelledBy?: string | undefined;
  /** Spared by both the outside-interaction test and the modal inert treatment — what must stay live under an open listbox. */
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;
  /** The intent bus engage mode pushes its scope onto. `null` by default, so the pad is off until a host is supplied. */
  readonly intents?: IntentScopeHost | null | undefined;
}

export interface ResolvedSelectMachineProps extends SelectMachineProps {
  readonly defaultValue: string | null;
  readonly defaultOpen: boolean;
  readonly presentation: SelectPresentationProp;
  readonly placement: Placement;
  readonly gap: number;
  readonly offset: number;
  readonly flip: boolean;
  readonly shift: boolean;
  readonly padding: number;
  readonly matchWidth: boolean;
  readonly strategy: "absolute" | "fixed";
  readonly loopFocus: boolean;
  readonly typeahead: boolean;
  readonly closeOnSelect: boolean;
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly preventOutsideActivation: boolean;
  readonly modal: boolean;
  readonly restoreFocus: boolean;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly selectionFlash: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface SelectSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedSelectMachineProps;
  context: {
    /** The single source of truth; the state is a projection of it. */
    open: boolean;
    /** The app's value. The machine never invents one — no native-style "first item" fallback. */
    value: string | null;
    /**
     * The label captured for `value`, and the trigger's text while the surface
     * is closed. Back-filled from the DOM by `syncCollection`; when the item of
     * `value` disappears (a filter, a re-render) the **last capture survives** —
     * the value belongs to the app, and the machine will not mutate it d'office.
     */
    valueLabel: string | null;
    highlightedValue: string | null;
    density: Density;
    /**
     * The direction the portalled surface is drawn in, resolved from the anchor
     * when it opens. `null` until then — and on the server — which is what keeps
     * the first client render agreeing with the markup it hydrates.
     */
    surfaceDir: Direction | null;
    /** Where the surface landed — the preferred placement may have flipped. */
    currentPlacement: Placement;
    /** Whether any row draws a glyph. The selection gutter has no twin: it is constant. */
    hasSymbolGutter: boolean;
    /** The item mid-blink; the close is deferred until it ends. */
    flashingValue: string | null;
    /** The modality the highlight arrived under, held until it moves again. */
    focusSource: InputModality | null;
  };
  computed: {
    presentation: SelectPresentation;
    hasValue: boolean;
  };
  refs: {
    finalFocusEl: HTMLElement | null;
    typeahead: TypeaheadState;
    /** The keystroke that *opened* the select, honoured once the items exist. */
    pendingTypeaheadKey: string | null;
    /** Where the keyboard asked the highlight to land before there was a surface. */
    pendingHighlight: RovingAction | null;
    /** Owned by `trackSelectionFlash`; cancelled the moment the surface leaves. */
    flashTimer: VoidFunction | null;
    /** Press-drag-release: the click that follows the opening press is not a toggle. */
    openedAt: number;
    /** The last close asked for was `ITEM.COMMIT` — the one a held modal Tab rides on. */
    closedByCommit: boolean;
    /** The photo `FORM.RESET` restores. */
    initialValue: string | null;
    /** Which value the current `valueLabel` was captured for — see `syncCollection`. */
    labelValue: string | null;
  };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "TRIGGER.POINTERDOWN" }
    | { type: "TRIGGER.KEYDOWN"; action: RovingAction }
    | { type: "ITEM.POINTERMOVE"; value: string }
    | { type: "ITEM.POINTERLEAVE"; value: string }
    | { type: "ITEM.CLICK"; value: string }
    | { type: "ITEM.ACTIVATE" }
    /**
     * Commit the highlight and close, without the blink. Tab and Alt+ArrowUp:
     * both hand the focus somewhere else in the same gesture, so the 150ms the
     * blink holds the surface open would be spent on a surface nobody is
     * looking at — and Tab's proxy would carry the focus out from under it.
     */
    | { type: "ITEM.COMMIT" }
    | { type: "HIGHLIGHT.MOVE"; action: RovingAction }
    /** PageUp/PageDown — a page is ten options, clamped at either end. */
    | { type: "HIGHLIGHT.PAGE"; direction: "next" | "prev" }
    /** `null` clears it — there is no second event for that. */
    | { type: "HIGHLIGHT.SET"; value: string | null }
    | { type: "TYPEAHEAD.KEY"; key: string }
    /** `api.setValue`/`clearValue` — never touches `open`. */
    | { type: "VALUE.SET"; value: string | null }
    | { type: "FLASH.END" }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CANCEL.CLICK" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "PRESENTATION.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density }
    | { type: "COLLECTION.SYNC" }
    | { type: "FORM.RESET" };
  action:
    | "openSelect"
    | "closeSelect"
    | "setOpen"
    | "captureFinalFocus"
    | "clearTransient"
    | "highlightInitial"
    | "highlightItem"
    | "clearHighlight"
    | "moveHighlight"
    | "pageHighlight"
    | "focusHighlighted"
    | "typeaheadHighlight"
    | "deferTypeaheadKey"
    | "selectItem"
    | "commitHighlighted"
    | "activateHighlighted"
    | "flashSelection"
    | "clearFlash"
    | "invokeOnDismiss"
    | "setValue"
    | "resetToInitialValue"
    | "syncEnvironment"
    | "syncPlacement"
    | "syncCollection";
  guard:
    | "isEnabled"
    | "isOpen"
    | "isItemEnabled"
    | "hasHighlight"
    | "isLeavingHighlighted"
    | "shouldCloseOnSelect"
    | "shouldFlash"
    | "isTypeaheadEnabled"
    | "canDismiss"
    | "isWithinReopenGrace";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackSurfaceDir"
    | "trackCollection"
    | "trackFormReset"
    | "trackDismissable"
    | "lockPageScroll"
    | "trackAnchorPosition"
    | "focusContent"
    | "proxyTabs"
    | "hideOutside"
    | "captureIntents"
    | "trackSelectionFlash"
    | "trackScrollEdges";
}

// --- prop-getter inputs ------------------------------------------------------

export interface SelectItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  /** Typeahead text and `data-label`; falls back to the `itemText` part. */
  readonly label?: string | undefined;
}

export interface SelectItemGroupProps {
  /** Ties the group to its label. Any stable string the consumer owns. */
  readonly id: string;
  /**
   * The group renders an `itemGroupLabel` part — wires `aria-labelledby`.
   * Declared, never assumed: written blind, the attribute is a dead IDREF *and*
   * no accessible name at once (same shape as `MenuItemGroupProps.label`).
   */
  readonly label?: boolean | undefined;
}

export interface SelectItemGroupLabelProps {
  readonly htmlFor: string;
}

export interface SelectItemIndicatorProps {
  readonly value: string;
}

export interface SelectApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly value: string | null;
  /** Captured label of the value (see the schema's `valueLabel`); `null` until anything resolved. */
  readonly valueLabel: string | null;
  readonly hasValue: boolean;
  readonly highlightedValue: string | null;
  readonly presentation: SelectPresentation;
  /** Where the surface landed, which is not necessarily what was asked for. */
  readonly placement: Placement;
  readonly triggerId: string;
  readonly contentId: string;

  setOpen(open: boolean): void;
  setValue(value: string | null): void;
  /** Sugar for `setValue(null)`. */
  clearValue(): void;
  setHighlightedValue(value: string | null): void;

  getTriggerProps(): T["button"];
  getValueTextProps(): T["element"];
  getIndicatorProps(): T["element"];
  getHiddenSelectProps(): T["select"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getItemGroupProps(props: SelectItemGroupProps): T["element"];
  getItemGroupLabelProps(props: SelectItemGroupLabelProps): T["element"];
  getItemProps(props: SelectItemProps): T["element"];
  getItemTextProps(): T["element"];
  getItemSymbolProps(): T["element"];
  getItemIndicatorProps(props: SelectItemIndicatorProps): T["element"];
  getSeparatorProps(): T["element"];
  getCancelTriggerProps(): T["button"];
}
