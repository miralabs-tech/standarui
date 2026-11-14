import type { IntentScopeHost } from "@standarx/nav";
import type { DismissReason } from "../../interaction/layer-stack";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Placement } from "../../positioner/compute-position";
import type { Density, Direction, Rect } from "../../types";

/** What the surface actually is once the density has had its say. */
export type PopoverPresentation = "anchored" | "sheet";

export type PopoverPresentationProp = "auto" | PopoverPresentation;

export interface PopoverOpenChangeDetails {
  readonly open: boolean;
}

export interface PopoverDismissDetails {
  readonly reason: DismissReason;
}

export interface PopoverMachineProps {
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  /**
   * `false`, which is the inverse of the dialog and is the definition of a
   * popover: the page behind it stays live, readable and clickable.
   */
  readonly modal?: boolean | undefined;
  readonly presentation?: PopoverPresentationProp | undefined;

  // --- positioning, handed straight to the positioner ------------------------
  readonly placement?: Placement | undefined;
  /**
   * Air between the anchor and the surface. The arrow's depth is **added to this
   * by the effect**, which measures the rendered node: `arrowSize` only ever
   * clamps the cross axis, it never offsets the surface, so a popover that
   * forgot the addition would drive its own tip into the anchor.
   */
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  /** How far the arrow is kept from a corner, measured to its **box** edge. */
  readonly arrowPadding?: number | undefined;
  readonly matchWidth?: boolean | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;
  /** Anchor to a rect instead of an element — a caret, a range, a point. */
  readonly getAnchorRect?: (() => Rect) | undefined;

  // --- focus, dismissal, the rest identical to `DialogMachineProps` -----------------
  readonly autoFocus?: boolean | undefined;
  /** Forced off when the popover is not modal — there is nothing to trap against. */
  readonly trapFocus?: boolean | undefined;
  readonly restoreFocus?: boolean | undefined;
  /** Ignored when the popover is not modal. */
  readonly preventScroll?: boolean | undefined;
  /** Governs the gamepad `back` intent as well: B and Escape share one lock. */
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  /**
   * Separate from the pointer lock, and only expressible since `interact-outside`
   * stopped reporting a focus departure as a pointer one. A popover hung off a
   * text field wants "close on a click outside" without "close when the caret
   * moves on", and that combination is this pair of booleans.
   */
  readonly closeOnFocusOutside?: boolean | undefined;
  /** Disables the trigger, not the popover. */
  readonly disabled?: boolean | undefined;
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly initialFocus?: (() => HTMLElement | null) | undefined;
  readonly finalFocus?: (() => HTMLElement | null) | undefined;
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;
  readonly parentId?: string | undefined;
  readonly describedBy?: string | undefined;
  /** The accessible name used when no `title` part is rendered. */
  readonly label?: string | undefined;
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onOpenChange?: ((details: PopoverOpenChangeDetails) => void) | undefined;
  readonly onDismiss?: ((details: PopoverDismissDetails) => void) | undefined;
}

export interface ResolvedPopoverMachineProps extends PopoverMachineProps {
  readonly defaultOpen: boolean;
  readonly modal: boolean;
  readonly presentation: PopoverPresentationProp;
  readonly placement: Placement;
  readonly gap: number;
  readonly offset: number;
  readonly flip: boolean;
  readonly shift: boolean;
  readonly padding: number;
  readonly arrowPadding: number;
  readonly matchWidth: boolean;
  readonly strategy: "absolute" | "fixed";
  readonly autoFocus: boolean;
  readonly trapFocus: boolean;
  readonly restoreFocus: boolean;
  readonly preventScroll: boolean;
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly closeOnFocusOutside: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface PopoverSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedPopoverMachineProps;
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
    /** Where the surface actually landed — the preferred placement may have flipped. */
    currentPlacement: Placement;
    hasTitle: boolean;
    hasDescription: boolean;
  };
  computed: { presentation: PopoverPresentation };
  refs: { finalFocusEl: HTMLElement | null };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "TRIGGER.KEYDOWN"; key: string; shiftKey: boolean }
    | { type: "CLOSE.CLICK" }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CONTENT.FOCUS" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "PRESENTATION.SYNC" }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density }
    | { type: "PARTS.SYNC" };
  action:
    | "togglePopover"
    | "closePopover"
    | "setOpen"
    | "invokeOnDismiss"
    | "captureFinalFocus"
    | "syncEnvironment"
    | "syncParts"
    | "syncPlacement"
    | "focusInitial"
    | "focusInitialIfAuto"
    | "focusFirstInside";
  guard: "isEnabled" | "isOpen" | "canDismiss" | "shouldEnterOnTab";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackSurfaceDir"
    | "trackDismissable"
    | "lockPageScroll"
    | "trackAnchorPosition"
    | "trapPopoverFocus"
    | "proxyTabs"
    | "hideOutside"
    | "captureIntents"
    | "trackParts";
}

export interface PopoverApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly modal: boolean;
  readonly presentation: PopoverPresentation;
  /** Where the surface landed, which is not necessarily what was asked for. */
  readonly placement: Placement;
  setOpen(open: boolean): void;
  focusInitial(): void;
  getTriggerProps(): T["button"];
  getAnchorProps(): T["element"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getArrowProps(): T["element"];
  getArrowTipProps(): T["element"];
  getTitleProps(): T["element"];
  getDescriptionProps(): T["element"];
  getCloseTriggerProps(): T["button"];
}
