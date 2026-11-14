import type { IntentScopeHost } from "@standarx/nav";
import type { DismissReason } from "../../interaction/layer-stack";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Placement } from "../../positioner/compute-position";
import type { Direction, Rect } from "../../types";

export interface TooltipOpenChangeDetails {
  readonly open: boolean;
}

export interface TooltipDismissDetails {
  readonly reason: DismissReason;
}

export interface TooltipMachineProps {
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;

  // --- delays ----------------------------------------------------------------
  /**
   * How long a pointer has to rest on the trigger before the tooltip appears.
   * Long enough that a pointer merely crossing the control never opens one.
   */
  readonly openDelay?: number | undefined;
  /**
   * The delay once the family is warm — a tooltip is up, or one was up within
   * `warmDuration`. The long delay buys the user protection from tooltips they
   * did not ask for; once they have stopped to read one, they have asked.
   */
  readonly warmDelay?: number | undefined;
  /** How long the family stays warm after the last tooltip closed. */
  readonly warmDuration?: number | undefined;

  // --- positioning, handed straight to the positioner -------------------------
  readonly placement?: Placement | undefined;
  readonly gap?: number | undefined;
  readonly offset?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly padding?: number | undefined;
  readonly strategy?: "absolute" | "fixed" | undefined;
  readonly boundary?: (() => Rect) | undefined;

  // --- dismissal --------------------------------------------------------------
  /** Governs the gamepad `back` intent as well: B and Escape share one lock. */
  readonly closeOnEscape?: boolean | undefined;
  /** The anchor is moving out from under the surface; following it is worse. */
  readonly closeOnScroll?: boolean | undefined;

  /**
   * Opt-in, and off by default on purpose: a touch device has no hover, so a
   * tooltip there hides its content behind a gesture nothing advertises. Turn it
   * on only where the same information is reachable another way.
   */
  readonly longPress?: boolean | undefined;
  /** Disables the tooltip, not the trigger. */
  readonly disabled?: boolean | undefined;
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly parentId?: string | undefined;
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onOpenChange?: ((details: TooltipOpenChangeDetails) => void) | undefined;
  readonly onDismiss?: ((details: TooltipDismissDetails) => void) | undefined;
}

export interface ResolvedTooltipMachineProps extends TooltipMachineProps {
  readonly defaultOpen: boolean;
  readonly openDelay: number;
  readonly warmDelay: number;
  readonly warmDuration: number;
  readonly placement: Placement;
  readonly gap: number;
  readonly offset: number;
  readonly flip: boolean;
  readonly shift: boolean;
  readonly padding: number;
  readonly strategy: "absolute" | "fixed";
  readonly closeOnEscape: boolean;
  readonly closeOnScroll: boolean;
  readonly longPress: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface TooltipSchema extends MachineSchema {
  /** `opening` is the delay: the surface is not mounted and `open` is still false. */
  state: "closed" | "opening" | "open";
  props: ResolvedTooltipMachineProps;
  context: {
    /** The single source of truth; the state is a projection of it. */
    open: boolean;
    /** Where the surface actually landed — the preferred placement may have flipped. */
    currentPlacement: Placement;
    /**
     * The direction the portalled surface is drawn in, resolved from the anchor
     * when it opens. `null` until then — and on the server — which is what keeps
     * the first client render agreeing with the markup it hydrates.
     */
    surfaceDir: Direction | null;
  };
  event:
    | { type: "TRIGGER.POINTER_ENTER"; pointerType: string }
    | { type: "TRIGGER.POINTER_LEAVE" }
    | { type: "TRIGGER.POINTER_DOWN" }
    | { type: "TRIGGER.FOCUS" }
    | { type: "TRIGGER.BLUR" }
    | { type: "TRIGGER.LONG_PRESS" }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CONTENT.SCROLL" }
    | { type: "DELAY.ELAPSED" }
    | { type: "POSITION.SYNC"; placement: Placement }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" };
  action: "openTooltip" | "closeTooltip" | "setOpen" | "invokeOnDismiss" | "syncPlacement";
  guard: "isOpen" | "canHover" | "canFocus" | "canDismiss";
  effect:
    | "trackModality"
    | "trackTouchGesture"
    | "waitOpenDelay"
    | "trackAnchorPosition"
    | "trackDismissable"
    | "trackSurfaceDir"
    | "dismissOnScroll"
    | "captureIntents"
    | "holdVisibleSlot";
}

export interface TooltipApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  /** Where the surface landed, which is not necessarily what was asked for. */
  readonly placement: Placement;
  setOpen(open: boolean): void;
  getTriggerProps(): T["button"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
}
