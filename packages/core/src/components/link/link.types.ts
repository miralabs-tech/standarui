import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

/** `tint` paints `--sui-color-link`; `plain` rides `currentColor`. */
export type LinkVariant = "tint" | "plain";

export type LinkUnderline = "hover" | "always" | "none";

/** Values of `aria-current`; `true` serialises as `aria-current="true"`. */
export type LinkCurrent = boolean | "page" | "step" | "location" | "date" | "time";

export interface LinkPressDetails {
  readonly originalEvent: Event;
}

export interface LinkMachineProps {
  readonly dir?: Direction | undefined;
  /**
   * Stripped from the DOM while `disabled` — a prevented attribute can still be
   * reached around (middle click, the context menu), an absent href cannot.
   */
  readonly href?: string | undefined;
  readonly target?: string | undefined;
  readonly rel?: string | undefined;
  /**
   * An outbound link: `target="_blank"` + `rel="noopener noreferrer"` by
   * default, `data-external` on the root, and the externalIcon/externalLabel
   * parts come alive.
   */
  readonly external?: boolean | undefined;
  /** `aria-current` — the router's hook for "you are here". */
  readonly current?: LinkCurrent | undefined;
  readonly variant?: LinkVariant | undefined;
  /**
   * Defaults to `"hover"` for `tint` and `"always"` for `plain`: a link in the
   * colour of its surrounding text with no underline is not identifiable as a
   * link at all (WCAG 1.4.1).
   */
  readonly underline?: LinkUnderline | undefined;
  readonly disabled?: boolean | undefined;
  /** Keeps the link reachable on Tab while disabled (`tabIndex 0` + `role="link"`). */
  readonly focusableWhenDisabled?: boolean | undefined;
  /**
   * False when the root is not a real `<a>` (a `span role="link"`). The adapter
   * infers it from what it renders; it decides who synthesises Enter.
   */
  readonly nativeLink?: boolean | undefined;
  /**
   * Auxiliary (analytics, JS-only links without an href). It never replaces the
   * native or router navigation and never calls `preventDefault`.
   */
  readonly onPress?: ((details: LinkPressDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedLinkMachineProps extends LinkMachineProps {
  readonly external: boolean;
  readonly current: LinkCurrent;
  readonly variant: LinkVariant;
  readonly underline: LinkUnderline;
  readonly disabled: boolean;
  readonly focusableWhenDisabled: boolean;
  readonly nativeLink: boolean;
}

export interface LinkSchema extends MachineSchema {
  state: "idle" | "focused";
  props: ResolvedLinkMachineProps;
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
    | "clearFocusSource";
  guard: "isInteractive";
  effect: "trackModality" | "trackPointerPress";
}

export interface LinkApi<T extends PropTypes = PropTypes> {
  readonly disabled: boolean;
  readonly external: boolean;
  readonly current: LinkCurrent;
  /** True between press-start and press-end — what drives the press dim. */
  readonly pressed: boolean;
  /** The modality focus arrived under, or `null` while this is not focused. */
  readonly focusSource: InputModality | null;
  /** True only while focused, and only when that source warrants a ring. */
  readonly focusVisible: boolean;
  getRootProps(): T["a"];
  getExternalIconProps(): T["element"];
  getExternalLabelProps(): T["element"];
}
