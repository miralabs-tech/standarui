import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./tabs.anatomy";
import {
  getCloseTriggerId,
  getContentId,
  getIndicatorId,
  getListEl,
  getListId,
  getRootId,
  getScrollbarId,
  getThumbId,
  getTriggerId,
} from "./tabs.dom";
import type {
  TabsApi,
  TabsCloseTriggerProps,
  TabsContentProps,
  TabsSchema,
  TabsTriggerProps,
} from "./tabs.types";

export function connect<T extends PropTypes>(
  service: Service<TabsSchema>,
  normalize: NormalizeProps<T>,
): TabsApi<T> {
  const { context, computed, prop, refs, send, scope } = service;

  const selected = computed("selected");
  const disabled = !computed("interactive");
  const orientation = prop("orientation");
  const closable = prop("closable");
  const lazyMount = prop("lazyMount");
  const keepMounted = prop("keepMounted");

  const focusedValue = context.get("focusedValue");
  // Read once, when the focus landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved, and a
  // ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const tabbableValue = context.get("tabbableValue");
  const offset = context.get("indicatorOffset");
  const size = context.get("indicatorSize");

  const isSelected = (value: string): boolean => value === selected;

  /** The `lazyMount` gate: whether the panel should be rendered at all. */
  const isMounted = (value: string): boolean =>
    !lazyMount || value === selected || refs.get("visited").has(value);

  /**
   * Whether the panel is expected in the document *right now*, which is what
   * `aria-controls` may name. Without `keepMounted` an inactive panel is unmounted
   * by the adapter's presence path, and an IDREF pointing at what it left behind is
   * exactly the `aria-valid-attr-value` violation. Missing is allowed here —
   * `aria-controls` is recommended on `role="tab"`, not required — dangling is not.
   */
  const hasPanel = (value: string): boolean =>
    isMounted(value) && (value === selected || keepMounted);

  return {
    value: selected,
    focusedValue,
    disabled,
    isSelected,
    isMounted,

    setValue(value: string | null): void {
      send({ type: "VALUE.SET", value });
    },

    selectNext(): void {
      send({ type: "LIST.NEXT" });
    },

    selectPrev(): void {
      send({ type: "LIST.PREV" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        "data-orientation": orientation,
        "data-disabled": dataAttr(disabled),
      }),

    getListProps: (): T["element"] =>
      normalize.element({
        ...parts.list.attrs,
        id: getListId(scope),
        role: "tablist",
        // Always emitted: `aria-orientation` is valid on `tablist` in both axes,
        // and a horizontal tab list that says so is one an AT can describe.
        "aria-orientation": orientation,
        "aria-describedby": prop("describedBy"),
        "data-orientation": orientation,
        "data-disabled": dataAttr(disabled),
        // Coming back to the bar lands on the tab that was left (default entry
        // strategy `last`, geometric fallback).
        "data-snav": "container",
        style: {
          // Kept for the equal-column presentations and for reading parity with
          // `toggle-group` — but they do not place this indicator. Tabs are as wide
          // as their labels, so an index is no longer a position.
          "--sui-active-index": String(context.get("activeIndex")),
          "--sui-item-count": String(context.get("itemCount")),
          "--sui-indicator-offset": offset === null ? undefined : `${offset}px`,
          "--sui-indicator-size": size === null ? undefined : `${size}px`,
        },
      }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        "aria-hidden": ariaAttr(true),
        "data-orientation": orientation,
        "data-empty": dataAttr(offset === null),
        // The pill must not play a spring because the window moved, a font
        // finished loading, or the page has only just been painted.
        "data-immediate": dataAttr(!context.get("indicatorAnimated")),
      }),

    getScrollbarProps: (): T["element"] =>
      normalize.element({
        ...parts.scrollbar.attrs,
        id: getScrollbarId(scope),
        "aria-hidden": ariaAttr(true),
        "data-orientation": "horizontal",
      }),

    getThumbProps: (): T["element"] =>
      normalize.element({ ...parts.thumb.attrs, id: getThumbId(scope) }),

    getTriggerProps: (triggerProps: TabsTriggerProps): T["button"] => {
      const { value } = triggerProps;
      const active = isSelected(value);
      const itemDisabled = disabled || triggerProps.disabled === true;
      const focused = focusedValue === value;

      return normalize.button({
        ...parts.trigger.attrs,
        id: getTriggerId(scope, value),
        type: "button",
        role: "tab",
        disabled: itemDisabled,
        "aria-selected": boolAttr(active),
        "aria-controls": hasPanel(value) ? getContentId(scope, value) : undefined,
        // Roving: the tab list holds exactly one stop in the tab order. It rides on
        // the selection when there is one — but it cannot be *derived* from it. A
        // controlled consumer may hold `value` at `null`, which the types call a
        // value rather than an absence, and `syncTriggers` is right not to settle it
        // on their behalf; deriving the stop from the selection then left every
        // trigger at `-1` and took the whole list out of the tab order.
        // `tabbableValue` is that tab, and it is never a disabled one.
        //
        // And when there is neither — no selection and no sync, which is what a
        // server render of an unselected list is — nothing is written at all. `-1`
        // on every trigger was that same disappearance one render earlier. The
        // triggers are buttons, so saying nothing leaves them in the browser's
        // order until the first sync, which is where "exactly one selected tab"
        // gets settled for a consumer who named none.
        tabIndex:
          tabbableValue === null && selected === null
            ? undefined
            : active || value === tabbableValue
              ? 0
              : -1,
        // The value lives on the element because the DOM is where the tab order is
        // read from — this is what keeps the machine out of a registry.
        "data-value": value,
        "data-label": triggerProps.label,
        "data-state": active ? "active" : "inactive",
        "data-disabled": dataAttr(itemDisabled),
        "data-orientation": orientation,
        "data-closable": dataAttr(closable),
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused tab only: the composite has one focus, and an attribute
        // claiming otherwise on every tab describes nothing.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        onClick(event) {
          if (event.defaultPrevented || itemDisabled) return;
          send({ type: "TRIGGER.CLICK", value });
        },
        // Middle click closes, the universal convention of editor tab bars. It is
        // `auxclick` and not `mousedown` because Chromium starts autoscroll on the
        // latter.
        onAuxClick(event) {
          if (event.defaultPrevented || event.button !== 1 || !closable || itemDisabled) return;
          event.preventDefault();
          send({ type: "TRIGGER.CLOSE", value });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          // Shift+arrow is the range-selection gesture and belongs to the components
          // that have ranges; consuming it here would move the focus mid-selection.
          if (event.shiftKey) return;

          if (event.key === "Delete") {
            // Auto-repeat is a key being held, not a second press. Without the
            // filter a leaned-on Delete asks the consumer to close tabs it has
            // already been asked to remove.
            if (!closable || itemDisabled || event.repeat) return;
            event.preventDefault();
            send({ type: "TRIGGER.CLOSE", value });
            return;
          }

          // Enter activates on keydown and Space on keyup — the APG split that
          // `research/input.md` §1 makes a rule across the library, and that
          // `button` already keeps. Not prevented: on a real `<button>` the browser
          // turns both into a click and the second commit is a no-op. This path is
          // what keeps a substituted element correct.
          if (event.key === "Enter") {
            if (itemDisabled || event.repeat) return;
            send({ type: "TRIGGER.ACTIVATE", value });
            return;
          }
          // Space is claimed here so the arrow lookup below cannot see it, and
          // answered on keyup.
          if (event.key === " ") return;

          // `bothAxes: false`: off-axis the arrow stays the browser's and scrolls
          // the page, so the key is only prevented when it was actually claimed.
          const action = getRovingKeyAction(event.key, {
            orientation,
            dir: resolveDir(prop("dir"), getListEl(scope)),
            bothAxes: false,
          });
          if (action === null) return;
          event.preventDefault();
          send({ type: "TRIGGER.NAVIGATE", action, value });
        },
        // The other half of the Enter/Space split. A person who pressed Space, then
        // moved off the tab before letting go, has cancelled — which is what the
        // browser's own button does, and what falls out of listening on keyup.
        onKeyUp(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.shiftKey || event.key !== " " || itemDisabled) return;
          send({ type: "TRIGGER.ACTIVATE", value });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.FOCUS", value });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.BLUR" });
        },
      });
    },

    getContentProps: (contentProps: TabsContentProps): T["element"] => {
      const { value } = contentProps;
      const active = isSelected(value);

      return normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope, value),
        role: "tabpanel",
        "aria-labelledby": getTriggerId(scope, value),
        // Measured, not assumed: a panel with nothing tabbable in it needs a stop
        // of its own, and one that has a link or a field must not add an empty one
        // in front of it.
        tabIndex: active && context.get("contentTabbable") ? 0 : undefined,
        // Only in `keepMounted` mode. Without it the panel is unmounted by the
        // adapter's presence path, and `hidden` would kill its exit animation.
        hidden: !active && keepMounted ? true : undefined,
        "data-state": active ? "active" : "inactive",
        "data-orientation": orientation,
      });
    },

    getCloseTriggerProps: (closeProps: TabsCloseTriggerProps): T["button"] => {
      const { value } = closeProps;
      const itemDisabled = disabled || closeProps.disabled === true;

      return normalize.button({
        ...parts.closeTrigger.attrs,
        id: getCloseTriggerId(scope, value),
        type: "button",
        // A redundant pointer affordance, and it says so. `role="tablist"` may only
        // own `role="tab"`, so a close button standing in the bar is
        // `aria-required-children` however it is dressed — measured, not reasoned:
        // `role="none"` adds three violations of its own, a `presentation` wrapper
        // changes nothing because axe walks through it, and nesting the button
        // inside the tab trades the rule for `nested-interactive`. Hiding it is the
        // one clean composition, and it costs an assistive technology nothing: APG's
        // own keyboard route to closing is `Delete` on the tab, which the machine
        // implements. `tabindex="-1"` is focusable and not tabbable, the one shape
        // `aria-hidden-focus` accepts outright — so this is zero violations *and*
        // zero incompletes, not a rule traded for another.
        "aria-hidden": ariaAttr(true),
        // The tab list exposes exactly one stop in the tab order, and it is the
        // selected tab. The keyboard route to closing is `Delete`, per APG.
        tabIndex: -1,
        disabled: itemDisabled,
        "data-value": value,
        "data-disabled": dataAttr(itemDisabled),
        onClick(event) {
          if (event.defaultPrevented || itemDisabled) return;
          send({ type: "TRIGGER.CLOSE", value });
        },
      });
    },
  };
}
