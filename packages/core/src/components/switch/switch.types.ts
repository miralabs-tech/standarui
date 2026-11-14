import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface SwitchCheckedChangeDetails {
  readonly checked: boolean;
}

export type SwitchSize = "sm" | "md";

export interface SwitchMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Controlled. */
  readonly checked?: boolean | undefined;
  readonly defaultChecked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly required?: boolean | undefined;
  /** Blocks the toggle and the drag, and unlike `disabled` leaves the control focusable and still submitted with its form. */
  readonly readOnly?: boolean | undefined;
  readonly name?: string | undefined;
  /** What the hidden input submits while checked. Defaults to `"on"`, as a checkbox does. */
  readonly value?: string | undefined;
  readonly form?: string | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /** The iOS gesture: drag the thumb across the track. On by default. */
  readonly draggable?: boolean | undefined;
  /** Pure presentation: `data-size` on the root, the sheet does the rest. Defaults to `"md"`. */
  readonly size?: SwitchSize | undefined;
  readonly onCheckedChange?: ((details: SwitchCheckedChangeDetails) => void) | undefined;
}

export interface ResolvedSwitchMachineProps extends SwitchMachineProps {
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly value: string;
  readonly draggable: boolean;
  readonly size: SwitchSize;
}

export interface SwitchSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedSwitchMachineProps;
  context: {
    checked: boolean;
    focusSource: InputModality | null;
    /** 0…1 while dragging, `null` when the thumb is parked at its state. */
    dragProgress: number | null;
    pressed: boolean;
  };
  event:
    | { type: "CHECKED.TOGGLE" }
    | { type: "CHECKED.SET"; checked: boolean }
    | { type: "THUMB.DRAG_START" }
    | { type: "THUMB.DRAG"; progress: number }
    | { type: "THUMB.DRAG_END"; progress: number; moved: boolean }
    | { type: "ROOT.FOCUS" }
    | { type: "ROOT.BLUR" };
  action:
    | "toggleChecked"
    | "setChecked"
    | "captureFocusSource"
    | "clearFocusSource"
    | "startDrag"
    | "trackDrag"
    | "endDrag";
  guard: "isInteractive";
  effect: "trackModality" | "trackThumbDrag";
}

export interface SwitchApi<T extends PropTypes = PropTypes> {
  readonly checked: boolean;
  readonly disabled: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  readonly dragging: boolean;
  setChecked(checked: boolean): void;
  toggle(): void;
  getRootProps(): T["label"];
  getLabelProps(): T["element"];
  getControlProps(): T["element"];
  getThumbProps(): T["element"];
  getHiddenInputProps(): T["input"];
}
