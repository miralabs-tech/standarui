import type { RovingAction } from "../../focus/roving-focus";
import type { DismissReason } from "../../interaction/layer-stack";
import type { TypeaheadState } from "../../interaction/typeahead";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema, Service } from "../../machine/types";
import type { IntentScopeHost } from "../../nav";
import type { Placement } from "../../positioner/compute-position";
import type { Density, Direction, InputModality, Rect } from "../../types";

/** What the surface actually is once the density has had its say. */
export type MenuPresentation = "popup" | "sheet";

export type MenuPresentationProp = "auto" | MenuPresentation;

/** The three roles an item can carry. The value state itself is never the menu's. */
export type MenuOptionType = "checkbox" | "radio";

export interface MenuPoint {
  readonly x: number;
  readonly y: number;
}

export interface MenuOpenChangeDetails {
  readonly open: boolean;
}

export interface MenuSelectDetails {
  readonly value: string;
}

export interface MenuHighlightChangeDetails {
  readonly value: string | null;
}

export interface MenuDismissDetails {
  readonly reason: DismissReason;
}

export interface MenuMachineProps {
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly presentation?: MenuPresentationProp | undefined;

  // --- positioning, handed straight to the positioner ------------------------
  /**
   * Left undefined on purpose. A root menu falls back to `bottom-start` and a
   * submenu to `right-start`, and which of the two applies is only known once the
   * parent has been wired — so the resolution is a `computed`, not a default.
   */
  readonly placement?: Placement | undefined;
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  readonly matchWidth?: boolean | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;
  /** Anchor to a rect rather than an element — a caret, a canvas, a pointer. */
  readonly getAnchorRect?: (() => Rect) | undefined;

  // --- collection ------------------------------------------------------------
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly loopFocus?: boolean | undefined;
  readonly typeahead?: boolean | undefined;
  /** Overridable per item through `getItemProps({ closeOnSelect })`. */
  readonly closeOnSelect?: boolean | undefined;
  readonly highlightedValue?: string | null | undefined;
  readonly defaultHighlightedValue?: string | null | undefined;

  // --- dismissal -------------------------------------------------------------
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  /**
   * The native behaviour, and the one the reference app's own context menu had (parity M5):
   * the click that closes a menu must not also activate whatever was under it.
   */
  readonly preventOutsideActivation?: boolean | undefined;
  /**
   * `false`, and that is a decision rather than an omission. `layer-stack`
   * documents `modal` as "inert plus scroll lock" — the dialog's contract, and
   * disproportionate for a menu. Confinement comes from the dismissable layer and
   * the intent stack instead.
   */
  readonly modal?: boolean | undefined;
  /** Defaults to the `sheet` presentation and is ignored in `popup`. */
  readonly preventScroll?: boolean | undefined;

  // --- focus -----------------------------------------------------------------
  readonly autoFocus?: boolean | undefined;
  readonly restoreFocus?: boolean | undefined;
  readonly initialFocus?: (() => HTMLElement | null) | undefined;
  readonly finalFocus?: (() => HTMLElement | null) | undefined;

  // --- submenus and motion ---------------------------------------------------
  readonly submenuOpenDelay?: number | undefined;
  readonly submenuCloseDelay?: number | undefined;
  /** The selection blink. Off in `sheet` and under reduced motion, whatever is asked. */
  readonly selectionFlash?: boolean | undefined;

  readonly disabled?: boolean | undefined;
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;
  readonly parentId?: string | undefined;
  /** The accessible name when the surface has no trigger to be labelled by. */
  readonly label?: string | undefined;
  readonly intents?: IntentScopeHost | null | undefined;

  readonly onOpenChange?: ((details: MenuOpenChangeDetails) => void) | undefined;
  readonly onSelect?: ((details: MenuSelectDetails) => void) | undefined;
  readonly onHighlightChange?: ((details: MenuHighlightChangeDetails) => void) | undefined;
  readonly onDismiss?: ((details: MenuDismissDetails) => void) | undefined;
}

export interface ResolvedMenuMachineProps extends MenuMachineProps {
  readonly defaultOpen: boolean;
  readonly presentation: MenuPresentationProp;
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
  readonly autoFocus: boolean;
  readonly restoreFocus: boolean;
  readonly submenuOpenDelay: number;
  readonly submenuCloseDelay: number;
  readonly selectionFlash: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface MenuSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedMenuMachineProps;
  context: {
    /** The single source of truth; the state is a projection of it. */
    open: boolean;
    density: Density;
    /**
     * The direction the portalled surface is drawn in, resolved from the anchor
     * when it opens. `null` until then — and on the server — which is what keeps
     * the first client render agreeing with the markup it hydrates.
     */
    surfaceDir: Direction | null;
    /** Where the surface landed — the preferred placement may have flipped. */
    currentPlacement: Placement;
    highlightedValue: string | null;
    /** Whether the checkmark gutter is reserved, derived from the rendered parts. */
    hasSelectionGutter: boolean;
    /** Whether any row draws a glyph, and so whether the symbol track is reserved for all of them. */
    hasSymbolGutter: boolean;
    /**
     * Whether a `trigger` part is really rendered. Read from the DOM alongside the
     * gutter, and for the same reason `connect` cannot ask: a menu composed only
     * with `getContextTriggerProps` has no trigger at all, and naming its surface
     * after one leaves `aria-labelledby` pointing at an id nobody ever wrote.
     */
    hasTrigger: boolean;
    hasParent: boolean;
    /** The item mid-blink; the close is deferred until it ends. */
    flashingValue: string | null;
    /**
     * The modality the highlight arrived under, held until it moves again. Not a
     * copy of `data-snav-input`, which is the modality of *now* and flips to
     * `pointer` after 300 ms of mouse movement whether the focus moved or not.
     */
    focusSource: InputModality | null;
  };
  computed: {
    presentation: MenuPresentation;
    isSubmenu: boolean;
    /** `bottom-start` at the root, `right-start` once a parent is wired. */
    placement: Placement;
  };
  refs: {
    finalFocusEl: HTMLElement | null;
    /** Where a right click or a long press landed — the context-menu anchor. */
    anchorPoint: MenuPoint | null;
    parent: Service<MenuSchema> | null;
    child: Service<MenuSchema> | null;
    typeahead: TypeaheadState;
    /** Owned by `trackPointerIntent`; the submenu open/close delay lives on it. */
    intentTimer: VoidFunction | null;
    /** Owned by `trackSelectionFlash`; cancelled the moment the surface leaves. */
    flashTimer: VoidFunction | null;
    /** The last few pointer positions — the safe triangle reads this. */
    pointerTrail: readonly MenuPoint[];
    /** Press-drag-release: the click that follows the opening press is not a toggle. */
    openedAt: number;
    /**
     * Where the highlight goes the moment the surface exists. The keyboard asks
     * for it *before* the content is mounted, so the request has to outlive the
     * event that made it.
     */
    pendingHighlight: RovingAction | null;
  };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "TRIGGER.POINTERDOWN" }
    | { type: "TRIGGER.KEYDOWN"; action: RovingAction }
    | { type: "TRIGGER.CONTEXTMENU"; x: number; y: number }
    | { type: "TRIGGER.LONGPRESS"; x: number; y: number }
    | { type: "ITEM.POINTERMOVE"; value: string; x: number; y: number }
    | { type: "ITEM.POINTERLEAVE"; value: string }
    | { type: "ITEM.CLICK"; value: string; closeOnSelect?: boolean | undefined }
    | { type: "ITEM.SELECT"; value: string; closeOnSelect?: boolean | undefined }
    | { type: "ITEM.ACTIVATE" }
    | { type: "HIGHLIGHT.MOVE"; action: RovingAction }
    /** `null` clears it — there is no second event for that. */
    | { type: "HIGHLIGHT.SET"; value: string | null }
    | { type: "TYPEAHEAD.KEY"; key: string }
    | { type: "FLASH.END" }
    /**
     * `value` names the trigger item the request is *about*. A click carries it,
     * because a synthetic or touch activation reaches the item with no
     * `pointermove` before it and therefore no highlight to read. Left out — the
     * arrow key, the d-pad, the hover timer — the highlight is the subject, which
     * is what makes the request refusable when it sits on a plain item.
     */
    | { type: "CHILD.OPEN"; focus?: boolean | undefined; value?: string | undefined }
    | { type: "CHILD.CLOSE" }
    | { type: "CHILD.SET"; child: Service<MenuSchema> | null }
    | { type: "PARENT.SET"; parent: Service<MenuSchema> | null }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "TREE.CLOSE" }
    | { type: "CANCEL.CLICK" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "OPEN.SET"; open: boolean; highlight?: RovingAction | undefined }
    | { type: "OPEN.SYNC" }
    | { type: "PRESENTATION.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density }
    | { type: "PARTS.SYNC" };
  action:
    | "toggleMenu"
    | "openMenu"
    | "closeMenu"
    | "closeTree"
    | "setOpen"
    | "setAnchorPoint"
    | "captureFinalFocus"
    | "highlightInitial"
    | "highlightItem"
    | "moveHighlight"
    | "focusHighlighted"
    | "typeaheadHighlight"
    | "recordPointer"
    | "scheduleChild"
    | "scheduleChildClose"
    | "activateHighlighted"
    | "invokeOnSelect"
    | "flashSelection"
    | "clearFlash"
    | "openChild"
    | "closeChild"
    | "closeStaleChild"
    | "setChild"
    | "setParent"
    | "invokeOnDismiss"
    | "syncEnvironment"
    | "syncPlacement"
    | "syncParts";
  guard:
    | "isEnabled"
    | "isOpen"
    | "isSubmenu"
    | "canDismiss"
    | "isItemEnabled"
    | "isTriggerItem"
    | "isPointerHeadingToChild"
    | "hasOpenChild"
    | "hasChildFor"
    | "shouldCloseOnSelect"
    | "shouldFlash"
    | "isTypeaheadEnabled";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackSurfaceDir"
    | "trackContextTrigger"
    | "trackDismissable"
    | "lockPageScroll"
    | "trackAnchorPosition"
    | "focusContent"
    | "proxyTabs"
    | "hideOutside"
    | "captureIntents"
    | "trackPointerIntent"
    | "trackSelectionFlash"
    | "trackParts"
    | "trackScrollEdges";
}

// --- prop-getter inputs ------------------------------------------------------

export interface MenuItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  /** A destructive action. First class on both densities. */
  readonly destructive?: boolean | undefined;
  /** Typeahead text and `data-label`; falls back to the `itemText` part. */
  readonly label?: string | undefined;
  /** Overrides the machine's `closeOnSelect` for this item alone. */
  readonly closeOnSelect?: boolean | undefined;
  /** Announced through `aria-keyshortcuts`; the `itemShortcut` part is decoration. */
  readonly shortcut?: string | undefined;
  /** The item renders an `itemDescription` part — wires `aria-describedby`. */
  readonly description?: boolean | undefined;
}

/**
 * Controlled by the consumer, and deliberately so — a divergence from
 * `radio-group` and `checkbox-group`, which do hold bindables. A menu is a
 * transient surface that unmounts; the checked state belongs to the app's model,
 * not to an overlay, and keeping it out is also what keeps the budget.
 */
export interface MenuOptionItemProps extends MenuItemProps {
  readonly type: MenuOptionType;
  readonly checked?: boolean | undefined;
  readonly onCheckedChange?: ((checked: boolean) => void) | undefined;
}

export interface MenuItemGroupProps {
  /** Ties the group to its label. Any stable string the consumer owns. */
  readonly id: string;
  /**
   * The group renders an `itemGroupLabel` part — wires `aria-labelledby`. Same
   * shape as `MenuItemProps.description` and declared for the same reason:
   * `connect` is pure, so it cannot look for the label. Written unconditionally
   * the attribute is worse than absent — the group ends with no accessible name
   * *and* a dangling IDREF, which axe reports as `incomplete` rather than a
   * violation, so no test catches it.
   */
  readonly label?: boolean | undefined;
  readonly orientation?: "vertical" | "horizontal" | undefined;
}

export interface MenuItemGroupLabelProps {
  readonly htmlFor: string;
}

export interface MenuItemDescriptionProps {
  readonly value: string;
}

export interface MenuItemIndicatorProps {
  readonly checked?: boolean | undefined;
}

export interface MenuApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly presentation: MenuPresentation;
  /** Where the surface landed, which is not necessarily what was asked for. */
  readonly placement: Placement;
  readonly highlightedValue: string | null;
  readonly isSubmenu: boolean;
  readonly triggerId: string;
  readonly contentId: string;

  setOpen(open: boolean): void;
  setHighlightedValue(value: string | null): void;
  /** Closes every level, root included — what Tab and the cancel button do. */
  closeTree(): void;
  /** Call from an adapter **effect**, never during render: it sends an event. */
  setParent(parent: Service<MenuSchema> | null): void;
  /** Call from an adapter **effect**, never during render: it sends an event. */
  setChild(child: Service<MenuSchema> | null): void;

  getTriggerProps(): T["button"];
  getContextTriggerProps(): T["element"];
  getIndicatorProps(): T["element"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getItemGroupProps(props: MenuItemGroupProps): T["element"];
  getItemGroupLabelProps(props: MenuItemGroupLabelProps): T["element"];
  getItemProps(props: MenuItemProps): T["element"];
  getOptionItemProps(props: MenuOptionItemProps): T["element"];
  /** The parent's item props and the child's trigger props, on one node. */
  getTriggerItemProps(child: MenuApi<T>, props: MenuItemProps): T["element"];
  getItemSymbolProps(): T["element"];
  getItemTextProps(): T["element"];
  getItemDescriptionProps(props: MenuItemDescriptionProps): T["element"];
  getItemIndicatorProps(props: MenuItemIndicatorProps): T["element"];
  getItemShortcutProps(): T["element"];
  getSeparatorProps(): T["element"];
  getCancelTriggerProps(): T["button"];
}
