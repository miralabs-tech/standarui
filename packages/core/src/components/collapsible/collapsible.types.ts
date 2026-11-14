import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface CollapsibleOpenChangeDetails {
  readonly open: boolean;
}

export interface CollapsibleMachineProps {
  readonly dir?: Direction | undefined;
  /** Controlled: present means the consumer owns the value. */
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  /**
   * Disables the trigger, not the collapsible: a programmatic `setOpen` still
   * lands — the popover's rule, kept.
   */
  readonly disabled?: boolean | undefined;
  /**
   * Closed content stays mounted, `hidden`. That gives up the exit animation —
   * `display: none` runs none — which is the doctrine tabs established.
   */
  readonly keepMounted?: boolean | undefined;
  readonly onOpenChange?: ((details: CollapsibleOpenChangeDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedCollapsibleMachineProps extends CollapsibleMachineProps {
  readonly defaultOpen: boolean;
  readonly disabled: boolean;
  readonly keepMounted: boolean;
}

export interface CollapsibleSchema extends MachineSchema {
  state: "open" | "closed";
  props: ResolvedCollapsibleMachineProps;
  /**
   * `open` is the single source of truth — the state is a projection of it, the
   * popover's shape. `focusSource` is the modality focus arrived under, held
   * until focus leaves (see `toggle`). `animated` is a latch: `false` until the
   * first open/close transition after `start()`, and it drives `data-immediate`
   * — a `defaultOpen` first paint must be there, not arrive.
   */
  context: {
    open: boolean;
    focusSource: InputModality | null;
    animated: boolean;
  };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "TRIGGER.FOCUS" }
    | { type: "TRIGGER.BLUR" }
    | { type: "OPEN.SET"; open: boolean }
    | { type: "OPEN.SYNC" };
  action:
    | "toggleOpen"
    | "setOpen"
    | "syncSize"
    | "returnFocus"
    | "markAnimated"
    | "captureFocusSource"
    | "clearFocusSource";
  guard: "isEnabled" | "isOpen";
  effect: "trackModality";
}

export interface CollapsibleApi<T extends PropTypes = PropTypes> {
  readonly open: boolean;
  readonly disabled: boolean;
  /** The modality focus arrived under, or `null` while the trigger is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  /** Unguarded on purpose: `disabled` disables the trigger, not the API. */
  setOpen(open: boolean): void;
  /** The trigger's own path — respects `disabled`. */
  toggle(): void;
  getRootProps(): T["element"];
  getTriggerProps(): T["button"];
  getIndicatorProps(): T["element"];
  getContentProps(): T["element"];
}
