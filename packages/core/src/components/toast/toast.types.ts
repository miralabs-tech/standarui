/**
 * Two objects, one machine.
 *
 * `Toaster` is a pure store — a queue, a ceiling, timers and statuses, with no
 * DOM and no framework anywhere near it. It is created imperatively, which is the
 * whole point: an error strip spawned from an event handler in a module that is
 * not a component has nowhere to hang a hook.
 *
 * The machine below it is the bridge to the page: it subscribes to the store,
 * posts the ARIA, pauses on hover and focus, answers the hotkey, measures the
 * stack and hands the focus over when a toast the person is standing on leaves.
 * **An individual toast has no machine of its own** — it is a store record plus a
 * presence in the adapter, because the runtime spawns no dynamic actors.
 */

import type { IntentScopeHost } from "@standarx/nav";
import type { Politeness } from "../../a11y/live-announcer";
import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction } from "../../types";

export type ToastType = "info" | "success" | "warning" | "error" | "loading";

export type ToastPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end";

/** `dismissing` is on screen and on its way out — the adapter's presence owns the exit. */
export type ToastStatus = "visible" | "dismissing";

export type ToastDismissReason =
  | "timeout"
  | "close-trigger"
  | "escape"
  | "back"
  | "programmatic"
  | "action";

export interface ToastDismissDetails {
  readonly reason: ToastDismissReason;
}

export interface ToastActionOptions {
  readonly label: string;
  onClick(): void;
  /** Default `true`: activating the action closes the toast, with reason `"action"`. */
  readonly dismissOnClick?: boolean | undefined;
}

export interface ToastOptions {
  /** Defaults to a counter-derived `"toast:n"` — never random, so a server render matches. */
  readonly id?: string | undefined;
  readonly type?: ToastType | undefined;
  /** Required: this is what the announcer says. */
  readonly title: string;
  readonly description?: string | undefined;
  /** ms, or `null` for sticky. Defaults to the toaster's, except `error`/`loading` → `null`. */
  readonly duration?: number | null | undefined;
  readonly closable?: boolean | undefined;
  readonly action?: ToastActionOptions | undefined;
  /** Overrides the politeness derived from the type (`error` speaks assertively). */
  readonly politeness?: Politeness | undefined;
  readonly onDismiss?: ((details: ToastDismissDetails) => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  /** Opaque to the library, carried through to the app's own rendering. */
  readonly meta?: Record<string, unknown> | undefined;
}

export interface ToastRecord {
  readonly id: string;
  readonly type: ToastType;
  readonly title: string;
  readonly description: string | undefined;
  readonly duration: number | null;
  readonly closable: boolean;
  readonly action: ToastActionOptions | undefined;
  readonly politeness: Politeness;
  readonly status: ToastStatus;
  readonly meta: Record<string, unknown> | undefined;
  /**
   * Bumped on every mutation of the record, and it is load-bearing twice over: it
   * is what the context's `isEqual` compares, and it is what stops the announcer
   * from repeating a toast that merely re-rendered.
   */
  readonly version: number;
}

export interface ToasterOptions {
  /** Default `"top-end"` — the native desktop notification corner. Touch apps pass `"top"`. */
  readonly placement?: ToastPlacement | undefined;
  /** Ceiling on *visible* toasts; the rest queue. Default 3 (the iOS stack shows 1 + 2). */
  readonly max?: number | undefined;
  readonly duration?: number | undefined;
  /** Default `true` — the stack. `false` lays the toasts out as a spaced list. */
  readonly overlap?: boolean | undefined;
}

export interface ToastPromiseOptions<T> {
  readonly loading: ToastOptions;
  readonly success: ToastOptions | ((value: T) => ToastOptions);
  readonly error: ToastOptions | ((error: unknown) => ToastOptions);
}

export type ToastSubscriber = (toasts: readonly ToastRecord[]) => void;

export interface Toaster {
  create(options: ToastOptions): string;
  update(id: string, options: Partial<Omit<ToastOptions, "id">>): void;
  /**
   * Without an id: every toast, visible and queued alike. `reason` is not in the
   * spec's signature and has to be — it is the only way `onDismiss` can tell an
   * Escape from a timeout, and the machine has that answer at the call site.
   */
  dismiss(id?: string | undefined, reason?: ToastDismissReason | undefined): void;
  /** Skips the exit animation entirely. Without an id: all of them. */
  remove(id?: string | undefined): void;
  /** Reason-counted, so hover and a hidden page cannot release each other's hold. */
  pause(reason?: string | undefined): void;
  resume(reason?: string | undefined): void;
  promise<T>(promise: Promise<T>, options: ToastPromiseOptions<T>): Promise<T>;
  /** Mounted — a toast still playing its exit is one of these. */
  isVisible(id: string): boolean;
  /** Index 0 is the most recent, which is the front of the stack. */
  getVisibleToasts(): readonly ToastRecord[];
  getQueuedCount(): number;
  readonly placement: ToastPlacement;
  readonly overlap: boolean;
  /**
   * Also the clock's gate: with no subscriber nothing is mounted, and a toast that
   * expires without ever having been shown was never perceived.
   */
  subscribe(callback: ToastSubscriber): () => void;
}

/**
 * Both halves stay optional through the resolution — the machine's props type is
 * the *input* type as well as the output one, so promoting them to required here
 * would make an adapter that passes one of the two fail to typecheck. The
 * fallbacks live in `connect`, which is pure and where the count is anyway.
 */
export interface ToastTranslations {
  regionLabel?: ((count: number) => string) | undefined;
  dismissLabel?: string | undefined;
}

export interface ToastGroupMachineProps {
  /** Required — the store this region renders. No default: there is nothing to invent. */
  readonly toaster: Toaster;
  /**
   * Every entry must match: modifier flags by name (`"altKey"`…), everything else
   * against `event.code` then `event.key`. Default `["F6"]`, the APG's own key for
   * moving to a notification region.
   */
  readonly hotkey?: readonly string[] | undefined;
  readonly pauseOnInteraction?: boolean | undefined;
  readonly pauseOnPageIdle?: boolean | undefined;
  /**
   * Default `true`: the region asks the Popover API for the top layer, which is
   * the only way to sit above a modal `<dialog>`. `false` is for a region an app
   * lays out itself — docked in a panel, or four of them in a documentation
   * matrix — where being lifted out of the page is exactly wrong.
   */
  readonly topLayer?: boolean | undefined;
  readonly translations?: ToastTranslations | undefined;
  readonly dir?: Direction | undefined;
  /** Where the gamepad scope is pushed; the adapter hands its `InputSystem` in. */
  readonly intents?: IntentScopeHost | null | undefined;
}

export interface ResolvedToastGroupMachineProps extends ToastGroupMachineProps {
  readonly hotkey: readonly string[];
  readonly pauseOnInteraction: boolean;
  readonly pauseOnPageIdle: boolean;
  readonly topLayer: boolean;
  readonly translations: ToastTranslations;
  readonly intents: IntentScopeHost | null;
}

export interface ToastGroupSchema extends MachineSchema {
  state: "empty" | "active";
  props: ResolvedToastGroupMachineProps;
  context: {
    /**
     * The store's mirror. `isEqual` is not optional here: without it every
     * notification — a pause, a queued create nobody can see — would re-render
     * every adapter that has a toast on screen.
     */
    toasts: readonly ToastRecord[];
    pausedByInteraction: boolean;
  };
  computed: { visibleCount: number; frontId: string | null };
  refs: {
    /** Who had the focus before it entered the region. */
    returnFocusEl: HTMLElement | null;
    /** The last version announced per id — a re-render is not a new announcement. */
    announced: Map<string, number>;
  };
  event:
    | { type: "STORE.SYNC"; toasts: readonly ToastRecord[] }
    | { type: "TOASTS.CHANGED" }
    | { type: "GROUP.POINTER_ENTER" }
    | { type: "GROUP.POINTER_LEAVE" }
    | { type: "GROUP.FOCUS_ENTER"; relatedTarget: EventTarget | null }
    | { type: "GROUP.FOCUS_LEAVE"; relatedTarget: EventTarget | null }
    | { type: "GROUP.HOTKEY" }
    | { type: "TOAST.NAVIGATE"; to: RovingAction }
    | { type: "TOAST.DISMISS"; id: string | undefined; reason: ToastDismissReason }
    | { type: "TOAST.EXITED"; id: string }
    | { type: "DOC.VISIBILITY"; hidden: boolean };
  action:
    | "syncToasts"
    | "pauseForInteraction"
    | "pauseForInteractionIfEnabled"
    | "resumeInteraction"
    | "resumeInteractionIfEnabled"
    | "pauseForPageIdle"
    | "resumePageIdle"
    | "rememberReturnFocus"
    | "forgetReturnFocus"
    | "focusGroup"
    | "moveFocus"
    | "dismissToast"
    | "removeToast"
    | "restoreFocusIfInside"
    | "clearInteractionPause";
  guard:
    | "hasToasts"
    | "canPauseOnInteraction"
    | "canResumePointer"
    | "isHiddenAndPausable"
    | "canResumePageIdle";
  effect:
    | "subscribeStore"
    | "trackHotkey"
    | "trackDocumentVisibility"
    | "measureStack"
    | "announceToasts"
    | "captureIntents"
    | "presentGroup"
    | "trackGroupScrollEdges";
}

export interface ToastApi<T extends PropTypes = PropTypes> {
  readonly toasts: readonly ToastRecord[];
  readonly count: number;
  readonly queuedCount: number;
  readonly paused: boolean;
  /** The one focus move the library initiates, and it answers a key the user pressed. */
  focusGroup(): void;
  dismiss(id?: string | undefined): void;
  /** The adapter's presence, reporting that a toast has finished leaving. */
  notifyExit(id: string): void;
  getGroupProps(): T["element"];
  getRootProps(toast: ToastRecord): T["element"];
  getIndicatorProps(toast: ToastRecord): T["element"];
  getTitleProps(toast: ToastRecord): T["element"];
  getDescriptionProps(toast: ToastRecord): T["element"];
  getActionTriggerProps(toast: ToastRecord): T["button"];
  getCloseTriggerProps(toast: ToastRecord): T["button"];
}
