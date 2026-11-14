import type { RovingAction } from "../../focus/roving-focus";
import type { Collapse } from "../../interaction/collapse";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { InputModality } from "../../types";

export interface AccordionValueChangeDetails {
  readonly value: readonly string[];
}

export interface AccordionFocusChangeDetails {
  readonly value: string | null;
}

export interface AccordionItemProps {
  readonly value: string;
  readonly disabled?: boolean | undefined;
}

export interface AccordionContentProps {
  readonly value: string;
}

export interface AccordionMachineProps {
  /** Controlled. Always an array — "single" is an array of at most one. */
  readonly value?: readonly string[] | undefined;
  readonly defaultValue?: readonly string[] | undefined;
  /** Several panels open at once. `deselectable` is implied and ignored. */
  readonly multiple?: boolean | undefined;
  /**
   * Whether the open panel can be closed by pressing its own header. Defaults to
   * `true`, which is where this diverges from Radix on purpose: the `<details>`
   * this component replaces close freely, and that is the reference-app parity floor
   * (CDC §4.5).
   */
  readonly deselectable?: boolean | undefined;
  /** The whole accordion. An item disables itself on its own parts. */
  readonly disabled?: boolean | undefined;
  /** Whether ↑/↓ wrap at the ends of the header list. */
  readonly loopFocus?: boolean | undefined;
  /**
   * Renders closed panels as `hidden="until-found"`, so find-in-page reaches
   * their text and opens them. Opt-in: the value degrades to a plain boolean
   * `hidden` in an engine that does not know it, which is correct but is a
   * different reading experience, and a consumer should choose it.
   */
  readonly hiddenUntilFound?: boolean | undefined;
  /** Ids of the text describing this control — a `field` supplies them. */
  readonly describedBy?: string | undefined;
  readonly onValueChange?: ((details: AccordionValueChangeDetails) => void) | undefined;
  readonly onFocusChange?: ((details: AccordionFocusChangeDetails) => void) | undefined;
}

export interface ResolvedAccordionMachineProps extends AccordionMachineProps {
  readonly multiple: boolean;
  readonly deselectable: boolean;
  readonly disabled: boolean;
  readonly loopFocus: boolean;
  readonly hiddenUntilFound: boolean;
}

export interface AccordionSchema extends MachineSchema {
  state: "idle";
  props: ResolvedAccordionMachineProps;
  context: {
    value: readonly string[];
    /** Panels whose exit animation is still running — still visible, already closed. */
    exitingValues: readonly string[];
    /** The header that actually holds DOM focus, if any. */
    focusedValue: string | null;
    /** Read once, when the focus lands, and held until it leaves. */
    focusSource: InputModality | null;
  };
  refs: {
    /** One per value, created on first use, destroyed with the component. */
    collapses: Map<string, Collapse>;
    /** `null` until the mount effect seeds it — the first settle is not a change. */
    prevOpen: Set<string> | null;
    /**
     * Panels that are open because of something other than a choice: what a
     * `defaultValue` opened before anybody looked, and what find-in-page revealed
     * under its own scroll. They carry `data-immediate`, and they lose it the
     * moment a press or the api moves them.
     *
     * Seeded from the initial value rather than released by a mount effect: a ref
     * that flips during `start()` is invisible to an adapter that does not re-render
     * afterwards and instantly obeyed by one that does, which is a `data-immediate`
     * that means two different things in two adapters.
     */
    immediateValues: Set<string>;
  };
  computed: {
    interactive: boolean;
  };
  event:
    | { type: "TRIGGER.TOGGLE"; value: string }
    | { type: "TRIGGER.FOCUS"; value: string }
    | { type: "TRIGGER.BLUR" }
    | { type: "TRIGGER.NAVIGATE"; action: RovingAction; value: string }
    | { type: "VALUE.SET"; value: readonly string[] }
    | { type: "CONTENT.BEFOREMATCH"; value: string };
  action:
    | "toggleValue"
    | "setValue"
    | "setFocusedValue"
    | "clearFocus"
    | "navigate"
    | "openOnMatch"
    | "syncCollapses";
  guard: "isInteractive";
  effect: "trackModality" | "trackCollapses" | "trackBeforematch";
}

export interface AccordionApi<T extends PropTypes = PropTypes> {
  readonly value: readonly string[];
  readonly focusedValue: string | null;
  readonly disabled: boolean;
  isOpen(value: string): boolean;
  setValue(value: readonly string[]): void;
  open(value: string): void;
  close(value: string): void;
  toggle(value: string): void;
  getRootProps(): T["element"];
  getItemProps(props: AccordionItemProps): T["element"];
  getHeaderProps(props: AccordionItemProps): T["element"];
  getTriggerProps(props: AccordionItemProps): T["button"];
  getIndicatorProps(props: AccordionItemProps): T["element"];
  getContentProps(props: AccordionContentProps): T["element"];
  getBodyProps(props: AccordionContentProps): T["element"];
}
