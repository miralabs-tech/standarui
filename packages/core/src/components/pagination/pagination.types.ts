import type { IntentScopeHost } from "@standarx/nav";
import type { RovingAction } from "../../focus/roving-focus";
import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction, InputModality } from "../../types";

export type PaginationItemKind = "button" | "link";

export interface PaginationPageChangeDetails {
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginationPageSizeChangeDetails {
  readonly pageSize: number;
}

/** The window of visible items: `start` inclusive (0-based), `end` exclusive. */
export interface PaginationPageRange {
  readonly start: number;
  readonly end: number;
}

export type PaginationPageItem =
  | { readonly type: "page"; readonly value: number }
  | { readonly type: "ellipsis" };

export interface PaginationTranslations {
  /** Defaults to `"pagination"`. */
  readonly rootLabel?: string | undefined;
  /** Defaults to `"previous page"`. */
  readonly prevTriggerLabel?: string | undefined;
  /** Defaults to `"next page"`. */
  readonly nextTriggerLabel?: string | undefined;
  /** Defaults to `` `page ${page}` ``. */
  readonly itemLabel?: ((details: { page: number; totalPages: number }) => string) | undefined;
}

export interface PaginationItemProps {
  readonly page: number;
}

export interface PaginationEllipsisProps {
  /** Where this ellipsis sits in the page model — presentation only. */
  readonly index: number;
}

export interface PaginationMachineProps {
  /** Not defaulted, deliberately: left unset the resolved page direction governs, so a subtree inside an RTL region inherits instead of being reset to `ltr`. */
  readonly dir?: Direction | undefined;
  /** Total number of paginated items. Required. */
  readonly count: number;
  /** Controlled. 1-based. */
  readonly page?: number | undefined;
  readonly defaultPage?: number | undefined;
  /** Controlled. */
  readonly pageSize?: number | undefined;
  readonly defaultPageSize?: number | undefined;
  /** Pages adjacent to the current one, on each side. Default 1; 0 is allowed. */
  readonly siblingCount?: number | undefined;
  /** Pages pinned at each end. Default 1. */
  readonly boundaryCount?: number | undefined;
  /** `"button"` (default) or `"link"` — a crawlable pagination, one href per page. */
  readonly type?: PaginationItemKind | undefined;
  /** Required when `type === "link"`. */
  readonly getPageUrl?: ((details: { page: number }) => string) | undefined;
  readonly disabled?: boolean | undefined;
  readonly translations?: PaginationTranslations | undefined;
  /** Where LT/RT arrive from. `null` when the app runs no input system. */
  readonly intents?: IntentScopeHost | null | undefined;
  /**
   * Also fired *correctively*: a `count` that shrinks under the current page, or
   * a page held out of bounds by a controlled consumer, is re-clamped by the
   * machine's watch — the same re-settle policy as `tabs.syncTriggers`.
   */
  readonly onPageChange?: ((details: PaginationPageChangeDetails) => void) | undefined;
  readonly onPageSizeChange?: ((details: PaginationPageSizeChangeDetails) => void) | undefined;
}

export interface ResolvedPaginationMachineProps extends PaginationMachineProps {
  readonly count: number;
  readonly defaultPage: number;
  readonly defaultPageSize: number;
  readonly siblingCount: number;
  readonly boundaryCount: number;
  readonly type: PaginationItemKind;
  readonly disabled: boolean;
  readonly intents: IntentScopeHost | null;
}

export interface PaginationSchema extends MachineSchema {
  state: "idle";
  props: ResolvedPaginationMachineProps;
  context: {
    /** Bindable — controlled/uncontrolled resolved through `prop("page")`. */
    page: number;
    pageSize: number;
    /** `"prev"` | `"next"` | `String(page)` of the focused control, else `null`. */
    focusedValue: string | null;
    /** Read once when the focus lands, and held until it leaves (button/tabs pattern). */
    focusSource: InputModality | null;
    /** The control that is visually pressed (pointer down, or Enter/Space down). */
    pressedValue: string | null;
  };
  computed: {
    /** `max(1, ceil(count / pageSize))`. */
    totalPages: number;
    /** `clamp(context.page, 1, totalPages)` — THE readable truth. */
    page: number;
    pages: readonly PaginationPageItem[];
    pageRange: PaginationPageRange;
    canPrev: boolean;
    canNext: boolean;
  };
  event:
    | { type: "ITEM.CLICK"; page: number }
    | { type: "PREV.CLICK" }
    | { type: "NEXT.CLICK" }
    | { type: "PAGE.SET"; page: number }
    | { type: "PAGE.PREV" }
    | { type: "PAGE.NEXT" }
    | { type: "PAGESIZE.SET"; size: number }
    | { type: "ROOT.FOCUS"; value: string }
    | { type: "ROOT.BLUR" }
    | { type: "ROOT.PRESS_START"; value: string }
    | { type: "ROOT.PRESS_END" }
    | { type: "ROOT.NAVIGATE"; action: RovingAction };
  action:
    | "setPage"
    | "stepPrev"
    | "stepNext"
    | "setPageSize"
    | "clampPage"
    | "setFocused"
    | "clearFocused"
    | "setPressed"
    | "clearPressed"
    | "navigate";
  guard: "isInteractive" | "canPrev" | "canNext";
  effect: "trackModality" | "captureIntents";
}

export interface PaginationApi<T extends PropTypes = PropTypes> {
  /** Clamped — the displayable truth, whatever a controlled consumer holds. */
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly pages: readonly PaginationPageItem[];
  readonly pageRange: PaginationPageRange;
  readonly isFirstPage: boolean;
  readonly isLastPage: boolean;
  setPage(page: number): void;
  setPageSize(size: number): void;
  nextPage(): void;
  prevPage(): void;
  getRootProps(): T["element"];
  /** `normalize.element` (an anchor) when `type` is `"link"`. */
  getItemProps(props: PaginationItemProps): T["button"];
  getEllipsisProps(props: PaginationEllipsisProps): T["element"];
  getPrevTriggerProps(): T["button"];
  getNextTriggerProps(): T["button"];
}
