import type { DismissReason } from "../../interaction/layer-stack";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { IntentScopeHost } from "../../nav";
import type { Density, Direction } from "../../types";

export type DialogRole = "dialog" | "alertdialog";

/** What the surface actually is once the density has had its say. */
export type DialogPresentation = "center" | "sheet";

/**
 * `drawer` is deliberately absent: it is not a presentation of this machine but
 * the Phase 7 extension that decorates it with detents and drag. `sheet-top` is
 * dropped too — it assumes a window anchor the library does not own (spec §8).
 */
export type DialogPresentationProp = "auto" | DialogPresentation;

export interface DialogOpenChangeDetails {
  readonly open: boolean;
}

export interface DialogActionTriggerProps {
  /**
   * Styling only, and deliberately not a behaviour: the button that deletes and
   * the button that saves close the dialog the same way. What changes is that the
   * reader has to be able to tell them apart before pressing.
   */
  readonly destructive?: boolean | undefined;
  /**
   * Which of the row this button is. A surface with a single action needs none —
   * the id is then the part's, as it always was — but a row of them does, or they
   * all answer to the same id (`getActionTriggerId`). Spelled `index` because
   * `getSwatchProps` already spells it that way.
   */
  readonly index?: number | undefined;
}

export interface DialogCancelTriggerProps {
  /**
   * Which of the row this way out is. Left out — which is what a surface drawing
   * one cancel does, and what every fixture written before 2026-09-06 does — the id
   * is the part's own, and that is a guarantee rather than a default:
   * `getCancelTriggerEl` reads exactly that id to open an alert on its least
   * destructive answer.
   */
  readonly index?: number | undefined;
}

export interface DialogDismissDetails {
  readonly reason: DismissReason;
}

export interface DialogMachineProps {
  /** `alertdialog` is what lets `alert-dialog` reuse this machine instead of forking it. */
  readonly role?: DialogRole | undefined;
  /** Controlled. */
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly modal?: boolean | undefined;
  readonly presentation?: DialogPresentationProp | undefined;
  /** Forced off when the dialog is not modal — there is nothing to trap against. */
  readonly trapFocus?: boolean | undefined;
  readonly restoreFocus?: boolean | undefined;
  /** Ignored when the dialog is not modal. */
  readonly preventScroll?: boolean | undefined;
  /** Governs the gamepad `back` intent as well: B and Escape share one lock. */
  readonly closeOnEscape?: boolean | undefined;
  readonly closeOnInteractOutside?: boolean | undefined;
  /** Disables the trigger, not the dialog. */
  readonly disabled?: boolean | undefined;
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly initialFocus?: (() => HTMLElement | null) | undefined;
  readonly finalFocus?: (() => HTMLElement | null) | undefined;
  /**
   * Nodes that live outside the surface but belong to it — Monaco and xterm mount
   * widgets straight onto `body`. They are excluded from `hideOthers` and from the
   * outside-detection, so they stay usable and clicking one does not dismiss.
   */
  readonly persistentElements?: (() => readonly HTMLElement[]) | undefined;
  /** The layer this one opened from. Declared, because the DOM cannot tell once portalled. */
  readonly parentId?: string | undefined;
  readonly describedBy?: string | undefined;
  /** The accessible name used when no `title` part is rendered. */
  readonly label?: string | undefined;
  /**
   * Where the gamepad scope is pushed. The core owns no singleton, so the adapter
   * hands the `InputSystem` in — same contract as `pushEngageScope`. Without one
   * the gamepad drives nothing and the keyboard still works, because Escape comes
   * from the dismissable layer and not from the bus.
   */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onOpenChange?: ((details: DialogOpenChangeDetails) => void) | undefined;
  readonly onDismiss?: ((details: DialogDismissDetails) => void) | undefined;
}

export interface ResolvedDialogMachineProps extends DialogMachineProps {
  readonly role: DialogRole;
  readonly defaultOpen: boolean;
  readonly modal: boolean;
  readonly presentation: DialogPresentationProp;
  readonly trapFocus: boolean;
  readonly restoreFocus: boolean;
  readonly preventScroll: boolean;
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface DialogSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedDialogMachineProps;
  context: {
    /**
     * The single source of truth. The state is only a projection of it, made by
     * the watch — which is what makes the controlled semantics free: a consumer
     * that refuses to update `open` keeps the dialog open, and that is correct.
     */
    open: boolean;
    density: Density;
    /**
     * The direction the portalled surface is drawn in, resolved from the anchor
     * when it opens. `null` until then — and on the server — which is what keeps
     * the first client render agreeing with the markup it hydrates.
     */
    surfaceDir: Direction | null;
    hasTitle: boolean;
    hasDescription: boolean;
  };
  computed: { presentation: DialogPresentation };
  refs: {
    /**
     * Who had focus when the dialog opened. Needed because the non-modal path
     * installs no focus trap (the trap captures its own), and because the trigger
     * can be unmounted while the dialog is open — a confirm/prompt queue does
     * exactly that.
     */
    finalFocusEl: HTMLElement | null;
  };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "CLOSE.CLICK" }
    | { type: "CONTENT.DISMISS"; reason: DismissReason }
    | { type: "CONTENT.FOCUS" }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density }
    | { type: "PARTS.SYNC" };
  action:
    | "openDialog"
    | "closeDialog"
    | "setOpen"
    | "invokeOnDismiss"
    | "captureFinalFocus"
    | "syncEnvironment"
    | "syncParts"
    | "focusInitial";
  guard: "isEnabled" | "isOpen" | "canDismiss";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackSurfaceDir"
    | "trackDismissable"
    | "lockPageScroll"
    | "trapDialogFocus"
    | "proxyTabs"
    | "hideOutside"
    | "captureIntents"
    | "trackParts";
}

export interface DialogApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly modal: boolean;
  readonly presentation: DialogPresentation;
  setOpen(open: boolean): void;
  /**
   * Asks to close *for a reason*, which is what `setOpen(false)` cannot do: that
   * one skips `canDismiss` and never calls `onDismiss`, so a surface configured to
   * refuse dismissal would be closed anyway and a consumer listening for why would
   * hear nothing. The path a decorator uses — `drawer` sends `"drag"` — and useful
   * to any future one.
   */
  dismiss(reason: DismissReason): void;
  /**
   * Replays the initial focus without closing. A queue that swaps one question
   * for the next keeps the same dialog mounted, and the new question has to get
   * the focus the way the first one did.
   */
  focusInitial(): void;
  getTriggerProps(): T["button"];
  getBackdropProps(): T["element"];
  getPositionerProps(): T["element"];
  getContentProps(): T["element"];
  getTitleProps(): T["element"];
  getDescriptionProps(): T["element"];
  getCloseTriggerProps(): T["button"];
  /** `alert-dialog`'s three: the row, then the two buttons it lays out. */
  getActionsProps(): T["element"];
  getCancelTriggerProps(props?: DialogCancelTriggerProps): T["button"];
  getActionTriggerProps(props?: DialogActionTriggerProps): T["button"];
}
