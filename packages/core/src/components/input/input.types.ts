import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface InputValueChangeDetails {
  readonly value: string;
}

/**
 * How the field is drawn (CDC §4.2, amendment of 2026-08-31). `capsule` is the
 * default and the shape search has always had; `rect` is the rounded
 * rect; `soft` is the value between the two. The type
 * still says what a field *is* — it cannot say how it is drawn.
 */
export type InputShape = "capsule" | "soft" | "rect";

export interface InputMachineProps {
  readonly dir?: Direction | undefined;
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly type?: string | undefined;
  readonly shape?: InputShape | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly autoComplete?: string | undefined;
  readonly inputMode?: string | undefined;
  readonly maxLength?: number | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /** Escape empties the control. Off by default; a search field turns it on. */
  readonly clearOnEscape?: boolean | undefined;
  /** Starts masked when the type is `password`; the trigger flips it. */
  readonly defaultMasked?: boolean | undefined;
  readonly onValueChange?: ((details: InputValueChangeDetails) => void) | undefined;
}

export interface ResolvedInputMachineProps extends InputMachineProps {
  readonly type: string;
  readonly shape: InputShape;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly clearOnEscape: boolean;
}

export interface InputSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedInputMachineProps;
  context: { value: string; masked: boolean; focusSource: InputModality | null };
  computed: { isPassword: boolean; resolvedType: string };
  event:
    | { type: "VALUE.SET"; value: string }
    | { type: "VALUE.CLEAR" }
    | { type: "VISIBILITY.TOGGLE" }
    | { type: "CONTROL.FOCUS" }
    | { type: "CONTROL.BLUR" };
  action: "setValue" | "clearValue" | "toggleMasked" | "captureFocusSource" | "clearFocusSource";
  guard: "isInteractive";
  effect: "trackModality";
}

export interface InputApi<T extends PropTypes = PropTypes> {
  readonly value: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  /** Only meaningful for a password: whether the characters are hidden. */
  readonly masked: boolean;
  setValue(value: string): void;
  clear(): void;
  toggleVisibility(): void;
  getRootProps(): T["element"];
  getControlProps(): T["input"];
  getTextareaProps(): T["textarea"];
  getVisibilityTriggerProps(): T["button"];
}
