import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./toggle-group.anatomy";
import {
  getFrameId,
  getIndicatorId,
  getItemId,
  getLabelId,
  getRootEl,
  getRootId,
  getScrollbarId,
  getThumbId,
} from "./toggle-group.dom";
import type { ToggleGroupApi, ToggleGroupItemProps, ToggleGroupSchema } from "./toggle-group.types";

export function connect<T extends PropTypes>(
  service: Service<ToggleGroupSchema>,
  normalize: NormalizeProps<T>,
): ToggleGroupApi<T> {
  const { context, prop, send, scope } = service;

  const value = context.get("value");
  const groupDisabled = prop("disabled");
  const multiple = prop("multiple");
  const orientation = prop("orientation");
  const activeIndex = context.get("activeIndex");
  const contentSized = prop("sizing") === "content";
  const indicatorOffset = context.get("indicatorOffset");
  const indicatorSize = context.get("indicatorSize");
  const focusedValue = context.get("focusedValue");
  // Read once, when focus lands on an item, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  const isSelected = (item: string): boolean => value.includes(item);

  // The single tab stop, settled by the machine against the real item list.
  const tabbableValue = context.get("tabbableValue");

  return {
    value,
    disabled: groupDisabled,
    isSelected,

    setValue(next: readonly string[]): void {
      send({ type: "VALUE.SET", value: next });
    },

    getFrameProps: (): T["element"] =>
      normalize.element({
        ...parts.frame.attrs,
        id: getFrameId(scope),
        dir: prop("dir"),
        "data-orientation": orientation,
      }),

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        // Two patterns, one presentation: single selection is a radio group,
        // multiple is a group of pressed buttons (APG).
        role: multiple ? "group" : "radiogroup",
        // Only when the label part is actually rendered: a dangling IDREF names
        // nothing and stops a consumer's own `aria-label` from winning.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        "aria-describedby": prop("describedBy"),
        // `aria-orientation` is supported on `radiogroup` and not on `group`
        // (ARIA 1.2). The styles read `data-orientation` either way.
        "aria-orientation": multiple ? undefined : orientation,
        "data-orientation": orientation,
        "data-disabled": dataAttr(groupDisabled),
        "data-multiple": dataAttr(multiple),
        // Only in `"content"`, so the markup of the default sizing is untouched.
        "data-sizing": contentSized ? "content" : undefined,
        // The pill is placed from the measurement below, and the count is what
        // gates it into view.
        style: {
          "--sui-segment-count": String(Math.max(context.get("itemCount"), 1)),
          // On the root because the root is the indicator's containing block: the
          // offset is measured against that box, and an `inset` resolves against
          // the same one.
          "--sui-indicator-offset": indicatorOffset !== null ? `${indicatorOffset}px` : undefined,
          "--sui-indicator-size": indicatorSize !== null ? `${indicatorSize}px` : undefined,
        },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, id: getLabelId(scope) }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        "aria-hidden": ariaAttr(true),
        "data-orientation": orientation,
        // Nothing to point at — either nothing is selected, or several things
        // are and one travelling pill cannot honestly represent them. In
        // multiple mode the selected items carry their own background instead.
        "data-empty": dataAttr(activeIndex < 0 || multiple),
        // The pill must not play a spring because the page has only just been
        // painted or a segment was added. It has to be on the markup that first
        // carries the real numbers, not removed in the same commit that writes
        // them: a transition compares two computed styles and reads its property
        // list off the second one, so an attribute that leaves as the position
        // arrives animates exactly the frame it was meant to suppress.
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

    getItemProps: (itemProps: ToggleGroupItemProps): T["button"] => {
      const { value: itemValue } = itemProps;
      const selected = isSelected(itemValue);
      const disabled = groupDisabled || itemProps.disabled === true;
      const focused = focusedValue === itemValue;

      return normalize.button({
        ...parts.item.attrs,
        id: getItemId(scope, itemValue),
        type: "button",
        disabled,
        // The value lives on the element because the DOM is where the item order
        // is read from — this is what lets the machine stay out of a registry.
        "data-value": itemValue,
        // Read by the styles, never by the machine: it is what the width
        // reservation is rendered from.
        "data-label": itemProps.label,
        role: multiple ? undefined : "radio",
        "aria-checked": multiple ? undefined : boolAttr(selected),
        "aria-pressed": multiple ? boolAttr(selected) : undefined,
        // Tri-state, like the toolbar, and for a reason the toolbar does not
        // have: the stop is chosen by `syncItems` from the item order, which is
        // read from the DOM. A prerendered group has no DOM to read, so writing
        // `-1` on every item — the selected one included — took the whole
        // control out of the tab order until hydration. Absent, the items are
        // buttons and keep their natural order; the roving stop appears with
        // the first sync.
        tabIndex: tabbableValue === null ? undefined : itemValue === tabbableValue ? 0 : -1,
        "data-state": selected ? "on" : "off",
        "data-disabled": dataAttr(disabled),
        "data-orientation": orientation,
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused item only: the composite has one focus, and an
        // attribute claiming otherwise on every segment describes nothing.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "ITEM.CLICK", value: itemValue });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          // Shift+arrow is the range-selection gesture and belongs to the
          // component that has ranges; here it means nothing, and consuming it
          // would move the focus while a selection was being extended.
          if (event.shiftKey) return;
          // The key map is pure, so `connect` may resolve it: that is what lets
          // the arrow be prevented from scrolling the page only when it was
          // actually claimed.
          // APG: in a radio group Right *or* Down moves to and checks the next
          // item, whatever the orientation. A group of independent toggles keeps
          // to its own axis, so the other one still scrolls the page.
          const action = getRovingKeyAction(event.key, {
            orientation,
            dir: resolveDir(prop("dir"), getRootEl(scope)),
            bothAxes: !multiple,
          });
          if (action === null) return;
          event.preventDefault();
          send({ type: "ITEM.NAVIGATE", action, value: itemValue });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.FOCUS", value: itemValue });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.BLUR" });
        },
      });
    },
  };
}
