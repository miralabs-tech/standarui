import type { EngageIntent, IntentScopeHost } from "@standarx/nav";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Density, Direction, InputModality } from "../../types";

/**
 * A fraction of the sheet's extent on the cross axis.
 *
 * **Never a CSS length.** Resolving `"320px"` or `"40vh"` means a `getComputedStyle`
 * per detent, inside a machine that has to stay pure and server-renderable. A
 * consumer who wants 320 px says it where lengths are said — `--sui-drawer-extent:
 * 320px` on the surface — and keeps passing fractions. The sheet multiplies every
 * detent by that extent and travels in the same unit, so the two stay one
 * arithmetic: `[1]` is the whole panel, `[0.5, 1]` is half of it and all of it. The
 * extent defaults to the viewport, which is why a fraction reads as a fraction of
 * the screen until someone says otherwise — and it is resolved in CSS, so the
 * sheet is already the right size in the first byte a server writes.
 */
export type DrawerDetent = number;

export type DrawerEdge = "bottom" | "top" | "start" | "end";

/** Which logical axis the drawer travels on — derived from `edge`, never passed. */
export type DrawerAxis = "block" | "inline";

/** The eight the engage scope consumes, spelled as its own union so the two cannot drift. */
export type DrawerIntent = EngageIntent;

export interface DrawerDetentChangeDetails {
  readonly detent: DrawerDetent;
  readonly index: number;
}

export interface DrawerDragEndDetails {
  readonly detent: DrawerDetent;
  readonly dismissed: boolean;
  /** Signed px/ms, as the gesture reported it. */
  readonly velocity: number;
}

export interface DrawerMachineProps {
  /**
   * The state of the surface being decorated. The drawer never owns it and cannot
   * open itself — that is what keeps it from becoming a second owner of the
   * `open` truth the dialog already holds.
   */
  readonly open?: boolean | undefined;
  readonly edge?: DrawerEdge | undefined;
  readonly detents?: readonly DrawerDetent[] | undefined;
  readonly detent?: DrawerDetent | undefined;
  readonly defaultDetent?: DrawerDetent | undefined;
  readonly onDetentChange?: ((details: DrawerDetentChangeDetails) => void) | undefined;
  readonly onDragEnd?: ((details: DrawerDragEndDetails) => void) | undefined;
  readonly dismissible?: boolean | undefined;
  /** Fraction of the smallest detent a release has to fall under to dismiss. */
  readonly dismissThreshold?: number | undefined;
  readonly draggable?: boolean | undefined;
  readonly dragFrom?: "content" | "grabber" | undefined;
  /** iOS's receding back page. Opt-in — it needs an element to recede. */
  readonly stack?: boolean | undefined;
  readonly stackElement?: (() => HTMLElement | null) | undefined;
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Freezes the track, never the surface: Escape still closes, that is the dialog's. */
  readonly disabled?: boolean | undefined;
  readonly intents?: IntentScopeHost | null | undefined;
  /**
   * The gesture asking the decorated surface to close. It cannot go through
   * `setOpen(false)`: that would skip `canDismiss` and never call `onDismiss`.
   */
  readonly onDismissRequest?: (() => void) | undefined;
}
// `id` and `getRootNode` are deliberately absent, and the drawer is the only
// machine that ever declared them: they belong to `ServiceRuntime` on the core
// side and to `MachineRuntimeProps` on the adapter's, never to a machine's own
// props — no guard, action or effect here reads either through `prop()`. Keeping
// them was not merely redundant: `getRootNode` was typed `() => Node` where the
// runtime says `() => RootNode`, so an adapter interface extending both could not
// be declared at all, and the widened type would have let a consumer hand a
// machine an element where a document or a shadow root is the contract.

export interface ResolvedDrawerMachineProps extends DrawerMachineProps {
  readonly open: boolean;
  readonly edge: DrawerEdge;
  readonly detents: readonly DrawerDetent[];
  readonly dismissible: boolean;
  readonly dismissThreshold: number;
  readonly draggable: boolean;
  readonly dragFrom: "content" | "grabber";
  readonly stack: boolean;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface DrawerSchema extends MachineSchema {
  /**
   * **There is no `dragging` state, and that is a correction rather than a
   * shorthand.** `trackDragAxis` holds the whole gesture — the captured pointer,
   * the origin, the crossed threshold, the velocity window — in the closure the
   * effect installed. The interpreter tears every effect of the exiting state down
   * and installs the entering one's afresh, with no diff (`service.ts:263`), so a
   * state change *during* a gesture destroys the thing producing it: the listeners
   * came off and the capture was released on the first move past the threshold, and
   * neither the second move nor the release ever reached the machine. Measured on a
   * bare harness — the offset stayed unwritten and the detent never moved.
   * `slider` was already built this way and says so in its own shape: no drag state,
   * `api.dragging` derived from context.
   */
  state: "closed" | "idle" | "engaged";
  props: ResolvedDrawerMachineProps;
  context: {
    detent: DrawerDetent;
    density: Density;
    /** A gesture is in flight. Context and not a state — see the note above. */
    dragging: boolean;
    focusSource: InputModality | null;
  };
  computed: {
    /** Clamped to (0,1], deduplicated at the precision the splitter announces, ascending. */
    detents: number[];
    /** The active detent as a fraction. */
    detentValue: number;
    detentIndex: number;
    minDetent: number;
    maxDetent: number;
    axis: DrawerAxis;
    /** `aria-valuenow` — a whole percentage, and it moves once per commit. */
    percent: number;
    /** One detent is a sheet, not a track: the grabber is not rendered. */
    hasTrack: boolean;
  };
  refs: {
    /** Read once per gesture — a scroll under the finger would drift a cached one. */
    containerSize: number | null;
    /** Signed px, positive toward closed. Written to the node, never to a bindable. */
    dragOffset: number;
    /** The detent the gesture started from, for the settle's continuity. */
    entryDetent: DrawerDetent | null;
    /** Cancelled when a new gesture begins — two settles on one axis is a tremble. */
    settle: Animation | null;
    /**
     * The content's own `touch-action` before a gesture froze it, so a consumer who
     * declared one inline gets theirs back rather than an empty string.
     */
    touchAction: string | null;
  };
  event:
    | { type: "CONTENT.DRAG_START" }
    | { type: "CONTENT.DRAG"; position: number }
    | { type: "CONTENT.DRAG_END"; position: number; velocity: number }
    | { type: "CONTENT.DRAG_CANCEL" }
    | { type: "DETENT.SET"; detent: DrawerDetent }
    | { type: "DETENT.STEP"; delta: number }
    /**
     * One event for the arrow keys and the d-pad both, which is CDC §4.4 to the
     * letter: the physical-to-logical arithmetic — which way "bigger" is for this
     * edge, mirrored for RTL on the inline axis — happens once, in the machine,
     * instead of being restated in every prop getter that can reach a direction.
     */
    | { type: "DETENT.ADJUST"; intent: DrawerIntent }
    | { type: "DETENT.TOGGLE" }
    | { type: "GRABBER.FOCUS" }
    | { type: "GRABBER.BLUR" }
    | { type: "ENGAGE.START" }
    | { type: "ENGAGE.END"; committed: boolean }
    | { type: "OPEN.SYNC" }
    | { type: "ENVIRONMENT.SYNC"; density: Density };
  action:
    | "beginDrag"
    | "updateDrag"
    | "settleDrag"
    | "cancelDrag"
    | "setDetent"
    | "stepDetent"
    | "toggleDetent"
    | "resetDetent"
    | "adjustFromIntent"
    | "snapshotDetent"
    | "restoreDetent"
    | "clearSnapshot"
    | "clearDragOffset"
    | "captureFocusSource"
    | "clearFocusSource"
    | "syncEnvironment";
  guard: "isEnabled" | "isDraggable" | "isOpen" | "canEngage";
  effect:
    | "trackEnvironment"
    | "trackModality"
    | "trackDragInput"
    | "publishProgress"
    | "trackStack"
    | "captureSelectIntent"
    | "trackEngage";
}

/** A part's own props, not a machine input — the `SliderThumbProps` family. */
export interface DrawerGrabberProps {
  /** Opt-in `aria-valuetext`; without it the percentage speaks for itself. */
  readonly valueText?: string | undefined;
}

export interface DrawerApi<T extends PropTypes = PropTypes> {
  readonly detent: DrawerDetent;
  readonly detentIndex: number;
  /** The track as the machine resolved it — clamped, deduplicated, ascending. */
  readonly detents: number[];
  readonly edge: DrawerEdge;
  readonly axis: DrawerAxis;
  readonly dragging: boolean;
  readonly engaged: boolean;
  readonly disabled: boolean;
  /** False on a single-detent sheet, and then the grabber is not rendered. */
  readonly hasTrack: boolean;
  readonly focusSource: InputModality | null;
  readonly focusVisible: boolean;
  setDetent(detent: DrawerDetent): void;
  stepDetent(delta: number): void;
  getPositionerProps(): T["element"];
  getBackdropProps(): T["element"];
  getContentProps(): T["element"];
  getGrabberProps(props?: DrawerGrabberProps): T["element"];
}
