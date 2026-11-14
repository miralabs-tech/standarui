import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction } from "../../types";

export interface BreadcrumbExpandedChangeDetails {
  readonly expanded: boolean;
}

export interface BreadcrumbMachineProps {
  readonly dir?: Direction | undefined;
  /**
   * Accessible name of the `nav` landmark. Defaults to `"Breadcrumb"` — the
   * consumer localises it, and two breadcrumbs on one page MUST carry two
   * different labels or the landmarks are indistinguishable.
   */
  readonly label?: string | undefined;
  /** Accessible name of the ellipsis button. Defaults to `"Show hidden items"`. */
  readonly ellipsisLabel?: string | undefined;
  /** Controlled: present means the consumer owns the value. */
  readonly expanded?: boolean | undefined;
  readonly defaultExpanded?: boolean | undefined;
  readonly onExpandedChange?: ((details: BreadcrumbExpandedChangeDetails) => void) | undefined;
}

/** What the machine sees once the defaults are applied. */
export interface ResolvedBreadcrumbMachineProps extends BreadcrumbMachineProps {
  readonly label: string;
  readonly ellipsisLabel: string;
}

export interface BreadcrumbItemProps {
  /**
   * An intermediate level hidden behind the ellipsis. `hidden` while the trail
   * is collapsed — removed from layout AND from the accessibility tree — and
   * `data-collapsed` stays posted once revealed, which is what the reveal fade
   * and the re-collapse rescue both key on.
   */
  readonly collapsed?: boolean | undefined;
}

export interface BreadcrumbLinkProps {
  /**
   * The current page. `aria-current="page"` is a global attribute, so the level
   * may be rendered as a `span` through `render` and stay valid.
   */
  readonly current?: boolean | undefined;
}

export interface BreadcrumbSchema extends MachineSchema {
  state: "idle";
  props: ResolvedBreadcrumbMachineProps;
  /** Bindable, primitive — no `isEqual` needed. */
  context: { expanded: boolean };
  /**
   * Where the focus is owed after the next render, or `null` when nobody moved
   * it. `"reveal"` is posted only by `ELLIPSIS.CLICK` — a programmatic
   * `EXPANDED.SET` never steals the focus — and `"rescue"` only by a collapse
   * that is about to hide the element holding it.
   */
  refs: { pendingFocus: "reveal" | "rescue" | null };
  event: { type: "ELLIPSIS.CLICK" } | { type: "EXPANDED.SET"; expanded: boolean };
  action: "expand" | "markPendingReveal" | "setExpanded" | "focusAfterExpandedChange";
  guard: "isExpanded";
  effect: "trackModality";
}

export interface BreadcrumbApi<T extends PropTypes = PropTypes> {
  readonly expanded: boolean;
  /** Programmatic — never moves the focus, unlike an ellipsis activation. */
  setExpanded(expanded: boolean): void;
  /** Sugar for `setExpanded(true)`. */
  expand(): void;
  getRootProps(): T["element"];
  getListProps(): T["element"];
  getItemProps(props?: BreadcrumbItemProps): T["element"];
  getLinkProps(props?: BreadcrumbLinkProps): T["element"];
  getEllipsisProps(): T["element"];
  getEllipsisTriggerProps(): T["button"];
}
