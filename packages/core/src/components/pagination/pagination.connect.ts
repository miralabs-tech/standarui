/**
 * Pure, DOM-free, replayable on a server.
 *
 * Every control is tabbable — no roving tabindex, which diverges from the other
 * composites on purpose: a pagination is a `navigation` landmark made of
 * links/buttons (the Breadcrumb precedent), so each control stays individually
 * reachable and the arrows are an *enrichment* of Tab, not a replacement.
 *
 * **The declared keyboard divergences, in full**, because "enrichment" is only
 * honest when the bill is written out. Claimed: the on-axis arrows (they move
 * the focus along the bar; off-axis they stay the browser's and scroll) and
 * PageUp/PageDown (they step the page, which is the same thing the gamepad's
 * LT/RT mean — CDC §4.4). Given back: **Home and End**. Those two are free in a
 * single-tab-stop composite, where an end is otherwise reached arrow by arrow;
 * they are not free here, where Tab reaches both ends in a press or two and the
 * browser binds them to the top and the bottom of the document.
 *
 * Activation is the native click: the controls are real `<button>`/`<a>`
 * elements, so Enter and Space are the browser's own, and the keydown handler
 * only mirrors them into the pressed *visual* — the six-line reasoning of
 * `button.connect`. The `if (event.defaultPrevented) return;` at the head of
 * every handler is also the anti-double-step gate: an input system's keymap
 * turns PageUp/PageDown into intents and prevents the native event, so the
 * connect sees `defaultPrevented` and does not replay the step.
 */

import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type {
  ButtonProps,
  EventHandler,
  HTMLProps,
  NormalizeProps,
  PropTypes,
} from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./pagination.anatomy";
import {
  getEllipsisId,
  getItemId,
  getNextTriggerId,
  getPrevTriggerId,
  getRootEl,
  getRootId,
} from "./pagination.dom";
import type {
  PaginationApi,
  PaginationEllipsisProps,
  PaginationItemProps,
  PaginationSchema,
} from "./pagination.types";

type PaginationEvent = PaginationSchema["event"];

/**
 * The two keys a real `<button>` or `<a>` turns into a click. A pair, so it is a
 * comparison rather than the `ReadonlySet` `button.connect` uses over the same
 * two members: a set of two buys no lookup a `===` does not already give.
 */
function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/** `HTMLProps` has no anchor slot; link mode needs exactly one attribute more. */
type AnchorProps = HTMLProps & { readonly href?: string | undefined };

export function connect<T extends PropTypes>(
  service: Service<PaginationSchema>,
  normalize: NormalizeProps<T>,
): PaginationApi<T> {
  const { context, computed, prop, send, scope } = service;

  const totalPages = computed("totalPages");
  const page = computed("page");
  const pageSize = context.get("pageSize");
  const canPrev = computed("canPrev");
  const canNext = computed("canNext");
  const disabled = prop("disabled");
  const translations = prop("translations");
  const isLink = prop("type") === "link";
  const getPageUrl = prop("getPageUrl");

  const focusedValue = context.get("focusedValue");
  // Read once, when the focus landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved, and
  // a ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);
  const pressedValue = context.get("pressedValue");

  /**
   * Up, leave and cancel all mean the same thing — the press is over — so they
   * are one function referenced three times rather than the same three lines
   * written out three times, and it is built once for the whole nav instead of
   * once per control.
   */
  const endPress: EventHandler<PointerEvent> = (event) => {
    if (event.defaultPrevented) return;
    send({ type: "ROOT.PRESS_END" });
  };

  /**
   * The head guard of both keyboard handlers, and it doubles as the
   * anti-double-step gate — see the module comment: a running input system has
   * already turned PageUp/PageDown into a consumed intent and prevented the
   * native event. Shift is deliberately *not* in here: keydown refuses it, keyup
   * must not, or a Space pressed bare and released under Shift leaves the
   * pressed visual stuck on.
   */
  const isChorded = (event: KeyboardEvent): boolean =>
    event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey;

  /**
   * Everything a control wears that is not its own identity: the state
   * attributes, the focus and press mirrors, the keyboard. One function for the
   * item and both triggers, and one spread per control — the state and the
   * handlers were two functions taking the same two arguments and called at the
   * same three sites, which is one function written twice.
   */
  const control = (value: string, refused: boolean): HTMLProps => {
    const focused = focusedValue === value;
    return {
      "data-disabled": dataAttr(refused),
      "data-pressed": dataAttr(pressedValue === value),
      "data-focus-visible": dataAttr(focused && focusVisible),
      // On the focused control only: the composite has one focus, and an
      // attribute claiming otherwise on every cell describes nothing.
      "data-focus-source": focused ? (focusSource ?? undefined) : undefined,

      onFocus(event) {
        if (event.defaultPrevented) return;
        send({ type: "ROOT.FOCUS", value });
      },
      onBlur(event) {
        if (event.defaultPrevented) return;
        send({ type: "ROOT.BLUR" });
      },
      onPointerDown(event) {
        if (event.defaultPrevented || refused) return;
        send({ type: "ROOT.PRESS_START", value });
      },
      onPointerUp: endPress,
      onPointerLeave: endPress,
      onPointerCancel: endPress,
      onKeyDown(event) {
        if (isChorded(event) || event.shiftKey) return;

        if (event.key === "PageUp") {
          event.preventDefault();
          send({ type: "PAGE.PREV" });
          return;
        }
        if (event.key === "PageDown") {
          event.preventDefault();
          send({ type: "PAGE.NEXT" });
          return;
        }

        // Enter and Space are never prevented: on a real button or anchor the
        // browser turns them into the click that actually activates. Only the
        // pressed visual is mirrored, and a held key is one press.
        if (isActivationKey(event.key)) {
          if (!refused && !event.repeat) send({ type: "ROOT.PRESS_START", value });
          return;
        }

        // The RTL mirror lives in `getRovingKeyAction`, once. `bothAxes: false`:
        // off-axis the arrow stays the browser's and scrolls the page.
        const action = getRovingKeyAction(event.key, {
          orientation: "horizontal",
          dir: resolveDir(prop("dir"), getRootEl(scope)),
          bothAxes: false,
        });
        // `first` and `last` are Home and End, and they are given back to the
        // page — the one place this bar parts company with the composites
        // `getRovingKeyAction` was written for. There the two keys are free,
        // because a composite is a *single* tab stop and an end is otherwise
        // reached arrow by arrow. Here every control is tabbable (see the module
        // comment), Tab reaches both ends in a press or two, and the browser binds
        // Home/End to the top and the bottom of the document. An enrichment may
        // not cost more than it adds. Filtered on the action rather than on the
        // key so there is one decision point, not two.
        if (action === null || action === "first" || action === "last") return;
        event.preventDefault();
        send({ type: "ROOT.NAVIGATE", action });
      },
      onKeyUp(event) {
        if (isChorded(event)) return;
        if (isActivationKey(event.key)) send({ type: "ROOT.PRESS_END" });
      },
    };
  };

  /**
   * One dialect call for two elements: the api slot stays `button` while link
   * mode renders an anchor (`normalize.element`) — the contract §3 declares.
   */
  const renderControl = (shared: ButtonProps, href: string | undefined): T["button"] =>
    isLink
      ? // Through `unknown` on purpose: every slot of a concrete `PropTypes` is the
        // same type, but `T["element"]` and `T["button"]` are two unrelated indexed
        // accesses while `T` is still a parameter, and neither is comparable to the
        // other. The api's slot is `button` because that is the contract §3 states;
        // the element under it is the adapter's business.
        (normalize.element({ ...shared, href } as AnchorProps) as unknown as T["button"])
      : normalize.button({ ...shared, type: "button" });

  /**
   * The three controls activate the same way, so the shape is written once: the
   * consumer's veto first, then the refusal — which in link mode must also stop
   * the browser following an href the control is refusing to honour — then the
   * event. Only the event differs, and it is the argument.
   */
  const activate =
    (refused: boolean, event: PaginationEvent): EventHandler<MouseEvent> =>
    (click) => {
      if (click.defaultPrevented) return;
      if (refused) {
        // A dead link must not navigate the page.
        if (isLink) click.preventDefault();
        return;
      }
      send(event);
    };

  return {
    page,
    pageSize,
    totalPages,
    pages: computed("pages"),
    pageRange: computed("pageRange"),
    isFirstPage: page === 1,
    isLastPage: page === totalPages,

    setPage(next: number): void {
      send({ type: "PAGE.SET", page: next });
    },

    setPageSize(size: number): void {
      send({ type: "PAGESIZE.SET", size });
    },

    nextPage(): void {
      send({ type: "PAGE.NEXT" });
    },

    prevPage(): void {
      send({ type: "PAGE.PREV" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "aria-label": translations?.rootLabel ?? "pagination",
        "data-disabled": dataAttr(disabled),
        // The landmark is also the spatial zone: the engine's default entry
        // strategy (`last`) brings a d-pad back to the control it left.
        "data-snav": "container",
      }),

    getItemProps: ({ page: item }: PaginationItemProps): T["button"] => {
      const value = String(item);
      const current = item === page;

      const shared: ButtonProps = {
        ...parts.item.attrs,
        id: getItemId(scope, item),
        "aria-label": translations?.itemLabel?.({ page: item, totalPages }) ?? `page ${item}`,
        // The href stays on the current page in link mode (a link to itself);
        // `aria-current` is what carries the state.
        "aria-current": current ? "page" : undefined,
        "data-value": value,
        "data-current": dataAttr(current),
        ...control(value, disabled),
        onClick: activate(disabled, { type: "ITEM.CLICK", page: item }),
      };
      return renderControl(shared, getPageUrl?.({ page: item }));
    },

    getEllipsisProps: (ellipsisProps: PaginationEllipsisProps): T["element"] =>
      normalize.element({
        ...parts.ellipsis.attrs,
        id: getEllipsisId(scope, ellipsisProps.index),
        // Purely presentational, never focusable; the content is the
        // consumer's (an inline SVG, never a text glyph).
        "aria-hidden": ariaAttr(true),
        "data-index": String(ellipsisProps.index),
      }),

    getPrevTriggerProps: (): T["button"] => {
      // `canPrev` is already `!disabled && page > 1` — the machine folds the
      // disabled state into both computeds, so re-testing it here said the same
      // thing twice.
      const refused = !canPrev;
      const shared: ButtonProps = {
        ...parts.prevTrigger.attrs,
        id: getPrevTriggerId(scope),
        "aria-label": translations?.prevTriggerLabel ?? "previous page",
        // Never the native `disabled`: at the last activation before the bound
        // the button would disable itself under the focus and drop it on
        // `body`. `aria-disabled` keeps the control focusable — the default
        // here, not an opt-in (§2).
        "aria-disabled": ariaAttr(refused),
        ...control("prev", refused),
        onClick: activate(refused, { type: "PREV.CLICK" }),
      };
      return renderControl(shared, getPageUrl?.({ page: Math.max(1, page - 1) }));
    },

    getNextTriggerProps: (): T["button"] => {
      const refused = !canNext;
      const shared: ButtonProps = {
        ...parts.nextTrigger.attrs,
        id: getNextTriggerId(scope),
        "aria-label": translations?.nextTriggerLabel ?? "next page",
        "aria-disabled": ariaAttr(refused),
        ...control("next", refused),
        onClick: activate(refused, { type: "NEXT.CLICK" }),
      };
      return renderControl(shared, getPageUrl?.({ page: Math.min(totalPages, page + 1) }));
    },
  };
}
