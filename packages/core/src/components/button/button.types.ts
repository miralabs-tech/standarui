import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

/** Button styles (CDC §4.5, research/components.md T1). */
export type ButtonVariant = "filled" | "tinted" | "gray" | "plain" | "glass";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ButtonPressDetails {
  readonly originalEvent: Event;
}

export interface ButtonMachineProps {
  readonly dir?: Direction | undefined;
  readonly type?: "button" | "submit" | "reset" | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly disabled?: boolean | undefined;
  /**
   * Busy: activation is refused, the label keeps its width and `aria-busy` says so.
   */
  readonly loading?: boolean | undefined;
  /**
   * Announced politely when `loading` turns on. Without it nothing is announced —
   * a spinner appearing is not news a screen reader has to interrupt for.
   */
  readonly loadingText?: string | undefined;
  /**
   * Keeps the control focusable while disabled: `aria-disabled` instead of the
   * native attribute. Off by default — a disabled button has no reason to stay in
   * the tab order unless it is a toolbar item (APG).
   */
  readonly focusableWhenDisabled?: boolean | undefined;
  /**
   * False when the root is not a real `<button>` (a substituted `<div>`, a card).
   * The adapter sets it from what it renders; it decides who activates the
   * control — the browser's click, or the press primitive's synthesised keyboard.
   */
  readonly nativeButton?: boolean | undefined;
  readonly onPress?: ((details: ButtonPressDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedButtonMachineProps extends ButtonMachineProps {
  readonly type: "button" | "submit" | "reset";
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly focusableWhenDisabled: boolean;
  readonly nativeButton: boolean;
}

export interface ButtonSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedButtonMachineProps;
  context: { pressed: boolean; focusSource: InputModality | null };
  event:
    | { type: "ROOT.CLICK"; originalEvent: Event }
    | { type: "ROOT.PRESS"; originalEvent: Event }
    | { type: "ROOT.PRESS_START" }
    | { type: "ROOT.PRESS_END" }
    | { type: "ROOT.FOCUS" }
    | { type: "ROOT.BLUR" };
  action:
    | "invokeOnPress"
    | "setPressed"
    | "clearPressed"
    | "captureFocusSource"
    | "clearFocusSource"
    | "announceLoading";
  guard: "isInteractive";
  effect: "trackModality" | "trackPointerPress";
}

export interface ButtonApi<T extends PropTypes = PropTypes> {
  readonly disabled: boolean;
  readonly loading: boolean;
  /** True between press-start and press-end — what drives the press motion. */
  readonly pressed: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  getRootProps(): T["button"];
  getLoadingIndicatorProps(): T["element"];
}
