import type { IntentScopeHost } from "@standarx/nav";
import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality, Orientation } from "../../types";

/**
 * `automatic` is the default, which diverges from how `components.md` §4 reads.
 * It is the APG recommendation whenever a panel is cheap, and it is what a tab
 * bar feels like under a d-pad. `manual` is the documented answer for an
 * expensive panel — pair it with `lazyMount` — not a fork of the machine.
 */
export type TabsActivationMode = "automatic" | "manual";

export interface TabsValueChangeDetails {
  readonly value: string | null;
}

export interface TabsFocusChangeDetails {
  readonly value: string | null;
}

export interface TabsCloseDetails {
  readonly value: string;
}

export interface TabsTriggerProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
  /**
   * The tab's own text, repeated so the styles can reserve the width the label
   * takes at the selected weight. Without it the tab widens when it is selected,
   * and the indicator — which is *measured* — chases a width it just caused.
   * Optional; the weight change is gated on the attribute being there.
   */
  readonly label?: string | undefined;
}

export interface TabsContentProps {
  readonly value: string;
}

export interface TabsCloseTriggerProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
}

export interface TabsMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  readonly orientation?: Orientation | undefined;
  /** Controlled. `null` is a value — it means no tab is selected. */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly activationMode?: TabsActivationMode | undefined;
  readonly loopFocus?: boolean | undefined;
  /** The whole tab list. Individual tabs disable themselves on the trigger. */
  readonly disabled?: boolean | undefined;
  /** Opens the close trigger, the `Delete` key and the middle click. */
  readonly closable?: boolean | undefined;
  /** A panel does not exist until its tab has been activated once. */
  readonly lazyMount?: boolean | undefined;
  /** A panel stays rendered, `hidden`, after it is deactivated. */
  readonly keepMounted?: boolean | undefined;
  /** Brings the selected tab back into view when the list overflows. */
  readonly scrollActiveIntoView?: boolean | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  /** Where LB/RB arrive from. `null` when the app runs no input system. */
  readonly intents?: IntentScopeHost | null | undefined;
  readonly onValueChange?: ((details: TabsValueChangeDetails) => void) | undefined;
  readonly onFocusChange?: ((details: TabsFocusChangeDetails) => void) | undefined;
  /** The consumer removes the tab; the machine only says which one and moves on. */
  readonly onClose?: ((details: TabsCloseDetails) => void) | undefined;
}

export interface ResolvedTabsMachineProps extends TabsMachineProps {
  readonly orientation: Orientation;
  readonly activationMode: TabsActivationMode;
  readonly loopFocus: boolean;
  readonly disabled: boolean;
  readonly closable: boolean;
  readonly lazyMount: boolean;
  readonly keepMounted: boolean;
  readonly scrollActiveIntoView: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface TabsSchema extends MachineSchema {
  state: "idle";
  props: ResolvedTabsMachineProps;
  context: {
    value: string | null;
    /** The tab that actually holds DOM focus, if any. */
    focusedValue: string | null;
    /** Read once, when the focus lands, and held until it leaves. */
    focusSource: InputModality | null;
    /** Where the selected tab sits. `-1` when nothing is selected. */
    activeIndex: number;
    /**
     * The tab carrying the list's single tab stop. It is the selected tab whenever
     * there is one, and the first enabled tab when there is not — a controlled
     * consumer is allowed to hold `value` at `null`, and a tab list that answered
     * that by leaving the tab order entirely would be unreachable by keyboard.
     * `null` only when nothing in the list can be selected at all.
     */
    tabbableValue: string | null;
    itemCount: number;
    /** Measured, in CSS pixels, from the list's padding-box start. */
    indicatorOffset: number | null;
    indicatorSize: number | null;
    /** False for a first paint, a resize or a font swap — never a spring then. */
    indicatorAnimated: boolean;
    /** The selected panel has no tabbable descendant, so it needs a tab stop. */
    contentTabbable: boolean;
  };
  refs: {
    /**
     * A ref rather than context: a first activation is always *caused* by a change
     * of `value`, which has already asked for a render. Nothing here is ever the
     * reason to paint.
     */
    visited: Set<string>;
    /**
     * The tab a closed one hands the focus to, with the number of tabs there were
     * when it was closed: revealed once the list has fewer.
     */
    reveal: { target: HTMLElement; count: number } | null;
  };
  computed: {
    selected: string | null;
    interactive: boolean;
  };
  event:
    | { type: "TRIGGER.CLICK"; value: string }
    | { type: "TRIGGER.FOCUS"; value: string }
    | { type: "TRIGGER.BLUR" }
    | { type: "TRIGGER.NAVIGATE"; action: RovingAction; value: string }
    | { type: "TRIGGER.ACTIVATE"; value: string }
    | { type: "TRIGGER.CLOSE"; value: string }
    | { type: "LIST.NEXT" }
    | { type: "LIST.PREV" }
    | { type: "VALUE.SET"; value: string | null }
    | { type: "TRIGGERS.SYNC" }
    | { type: "INDICATOR.MEASURE"; animated: boolean };
  action:
    | "selectValue"
    | "setValue"
    | "setFocusedValue"
    | "clearFocus"
    | "navigate"
    | "stepValue"
    | "closeTab"
    | "syncTriggers"
    | "syncIndicator"
    | "syncContentTabbable"
    | "scrollActiveIntoView"
    | "revealClosedSuccessor";
  guard: "isInteractive" | "isAutomatic" | "isClosable";
  effect:
    | "trackModality"
    | "trackTriggers"
    | "trackIndicator"
    | "trackScrollEdges"
    | "trackScrollbar"
    | "captureIntents";
}

export interface TabsApi<T extends PropTypes = PropTypes> {
  readonly value: string | null;
  readonly focusedValue: string | null;
  readonly disabled: boolean;
  isSelected(value: string): boolean;
  /** Whether the panel should be rendered at all — the `lazyMount` gate. */
  isMounted(value: string): boolean;
  setValue(value: string | null): void;
  /** The LB/RB step, exposed so an app can drive it from its own chrome. */
  selectNext(): void;
  selectPrev(): void;
  getRootProps(): T["element"];
  getListProps(): T["element"];
  getTriggerProps(props: TabsTriggerProps): T["button"];
  getIndicatorProps(): T["element"];
  getScrollbarProps(): T["element"];
  getThumbProps(): T["element"];
  getContentProps(props: TabsContentProps): T["element"];
  getCloseTriggerProps(props: TabsCloseTriggerProps): T["button"];
}
