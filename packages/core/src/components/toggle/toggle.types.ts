import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface TogglePressedChangeDetails {
  readonly pressed: boolean;
}

export interface ToggleMachineProps {
  readonly dir?: Direction | undefined;
  /** Controlled: present means the consumer owns the value. */
  readonly pressed?: boolean | undefined;
  readonly defaultPressed?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onPressedChange?: ((details: TogglePressedChangeDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedToggleMachineProps extends ToggleMachineProps {
  readonly disabled: boolean;
}

export interface ToggleSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedToggleMachineProps;
  /**
   * `focusSource` is the modality focus arrived under, held until focus leaves.
   * Not the modality of *now*: that one flips to pointer after 300ms of mouse
   * movement whether or not the focus moved, and a ring that blinks out from
   * under a keyboard user's hands is the bug it caused.
   */
  context: { pressed: boolean; focusSource: InputModality | null };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "PRESSED.SET"; pressed: boolean }
    | { type: "ROOT.FOCUS" }
    | { type: "ROOT.BLUR" };
  action: "togglePressed" | "setPressed" | "captureFocusSource" | "clearFocusSource";
  guard: "isDisabled";
  effect: "trackModality";
}

export interface ToggleApi<T extends PropTypes = PropTypes> {
  readonly pressed: boolean;
  readonly disabled: boolean;
  /** The modality focus arrived under, or `null` while the control is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  setPressed(pressed: boolean): void;
  toggle(): void;
  getRootProps(): T["button"];
  getIndicatorProps(): T["element"];
}
