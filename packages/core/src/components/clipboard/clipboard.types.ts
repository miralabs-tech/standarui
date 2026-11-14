import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export interface ClipboardValueChangeDetails {
  readonly value: string;
}

export interface ClipboardCopiedChangeDetails {
  readonly copied: boolean;
}

export interface ClipboardCopyErrorDetails {
  readonly error: Error;
}

export interface ClipboardMachineProps {
  readonly dir?: Direction | undefined;
  /** Controlled: present means the consumer owns the value. */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** How long the copied/error feedback lasts before idle returns, in ms. */
  readonly copiedDuration?: number | undefined;
  /** Screen-reader announcement on success. Override to localise. */
  readonly copiedText?: string | undefined;
  /** Screen-reader announcement on failure. Override to localise. */
  readonly copyFailedText?: string | undefined;
  /** aria-label for the trigger — required in practice when it is icon-only. */
  readonly copyLabel?: string | undefined;
  readonly onValueChange?: ((details: ClipboardValueChangeDetails) => void) | undefined;
  /** Both edges: `{ copied: true }` entering `copied`, `{ copied: false }` leaving it. */
  readonly onCopiedChange?: ((details: ClipboardCopiedChangeDetails) => void) | undefined;
  readonly onCopyError?: ((details: ClipboardCopyErrorDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedClipboardMachineProps extends ClipboardMachineProps {
  readonly disabled: boolean;
  readonly copiedDuration: number;
  readonly copiedText: string;
  readonly copyFailedText: string;
}

export interface ClipboardSchema extends MachineSchema {
  /**
   * The state axis belongs to the copy cycle. Focus is context rather than a
   * state — a deliberate divergence from `toggle`: crossing focus with the
   * feedback states would multiply four states into eight for one boolean.
   */
  state: "idle" | "copying" | "copied" | "error";
  props: ResolvedClipboardMachineProps;
  /**
   * `focusSource` is the modality focus arrived under, held until focus leaves.
   * Not the modality of *now*: that one flips to pointer after 300ms of mouse
   * movement whether or not the focus moved.
   */
  context: { value: string; focusSource: InputModality | null };
  event:
    | { type: "TRIGGER.CLICK" }
    | { type: "TRIGGER.FOCUS" }
    | { type: "TRIGGER.BLUR" }
    | { type: "COPY.REQUEST" }
    | { type: "COPY.SUCCESS" }
    | { type: "COPY.ERROR"; error: Error }
    | { type: "FEEDBACK.ELAPSED" }
    | { type: "VALUE.SET"; value: string }
    | { type: "VALUE.CHANGED" };
  action:
    | "setValue"
    | "captureFocusSource"
    | "clearFocusSource"
    | "announceCopied"
    | "announceCopyFailed"
    | "invokeCopiedTrue"
    | "invokeCopiedFalse"
    | "invokeOnCopyError";
  guard: "isDisabled";
  effect: "trackModality" | "performCopy" | "waitFeedbackReturn";
}

export interface ClipboardIndicatorPartProps {
  /** Which variant this element is: the copied glyph, or the resting one. */
  readonly copied?: boolean | undefined;
}

export interface ClipboardApi<T extends PropTypes = PropTypes> {
  readonly value: string;
  readonly copied: boolean;
  readonly disabled: boolean;
  /** The modality focus arrived under, or `null` while the trigger is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  copy(): void;
  setValue(value: string): void;
  getRootProps(): T["element"];
  getLabelProps(): T["label"];
  getControlProps(): T["element"];
  getInputProps(): T["input"];
  getTriggerProps(): T["button"];
  getIndicatorProps(props?: ClipboardIndicatorPartProps): T["element"];
}
