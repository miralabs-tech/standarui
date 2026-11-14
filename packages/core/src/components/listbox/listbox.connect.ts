import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { isComposingEvent } from "../../dom/event";
import { contains } from "../../dom/query";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import { isTypeaheadKey } from "../../interaction/typeahead";
import type { HTMLProps, NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./listbox.anatomy";
import {
  getContentEl,
  getContentId,
  getItemGroupId,
  getItemGroupLabelId,
  getItemId,
  getLabelId,
  getRootId,
} from "./listbox.dom";
import type {
  ListboxApi,
  ListboxItemGroupLabelProps,
  ListboxItemGroupProps,
  ListboxItemIndicatorProps,
  ListboxItemProps,
  ListboxSchema,
} from "./listbox.types";

export function connect<T extends PropTypes>(
  service: Service<ListboxSchema>,
  normalize: NormalizeProps<T>,
): ListboxApi<T> {
  const { context, computed, prop, send, scope } = service;

  const value = context.get("value");
  const highlightedValue = context.get("highlightedValue");
  const disabled = prop("disabled");
  const orientation = prop("orientation");
  const dir = prop("dir");
  const multiple = computed("multiple");
  const itemCount = context.get("itemCount");
  const empty = itemCount === 0;
  // Read once, when the highlight landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved, and a
  // ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  /**
   * The single tab stop. Published by the machine, because its precedence — the
   * first *selected* row, then the memory, then the top — is a fact about DOM order
   * and `connect` has no DOM.
   *
   * The fallback covers the one pass where the machine has not read the collection
   * yet: a server render, and the client render that has to match it byte for byte.
   * A selection is the only thing knowable without the document, and a listbox that
   * has one is better entered there than not entered at all.
   */
  const tabbableValue =
    context.get("tabbableValue") ?? (itemCount === -1 ? (value[0] ?? null) : null);

  const isSelected = (item: string): boolean => value.includes(item);

  /**
   * Every key the list answers, on `content` alone: a keydown bubbles out of the
   * focused row to here, so one table serves the whole collection instead of one
   * per row.
   *
   * Ctrl and Meta are deliberately *not* dismissed wholesale the way the menu
   * dismisses them — Ctrl+A, Ctrl+Space and Ctrl+Shift+Home are all part of the
   * pattern here.
   */
  function onContentKeyDown(event: KeyboardEvent): void {
    if (isComposingEvent(event)) return;
    // APG: Tab leaves the composite, and it is the one key answered ahead of the
    // `defaultPrevented` gate — nothing here may claim it, whatever else did.
    if (event.key === "Tab") return;
    // The anti-double-play gate: an `InputSystem` that consumed this key as an
    // intent has already prevented it, and this handler stands down.
    if (event.defaultPrevented) return;

    const { key } = event;
    const mod = event.ctrlKey || event.metaKey;

    if (key === " ") {
      // Claimed here so the page cannot scroll and the typeahead cannot see it;
      // answered on keyup — the APG split `research/input.md` §1 makes a rule.
      event.preventDefault();
      return;
    }

    if (mod && (key === "a" || key === "A")) {
      // Single mode leaves it alone: "select all" of a list that holds one value is
      // not a gesture, and the browser's own select-all is worth more than a no-op.
      if (!multiple || disabled) return;
      event.preventDefault();
      send({ type: "SELECTION.ALL" });
      return;
    }

    if (key === "PageUp" || key === "PageDown") {
      event.preventDefault();
      send({
        type: "HIGHLIGHT.PAGE",
        delta: key === "PageDown" ? 1 : -1,
        extend: event.shiftKey,
      });
      return;
    }

    // The RTL mirror lives here, once, and never in a key table (architecture.md).
    // An off-axis arrow resolves to `null` and stays the browser's, so the page
    // still scrolls under a list that has not claimed that direction.
    //
    // Resolved here rather than at the `dir` hoist above: with no `dir` prop the
    // answer comes from the rendered list, and reading the DOM at the top of
    // `connect` would run on the server.
    const action = getRovingKeyAction(key, {
      orientation,
      dir: resolveDir(dir, getContentEl(scope)),
    });
    if (action !== null) {
      event.preventDefault();
      send({
        type: "HIGHLIGHT.MOVE",
        action,
        extend: event.shiftKey,
        // Ctrl/Cmd moves without choosing, which is the only way to walk a
        // single-selection list without dragging the selection along.
        quiet: mod && !event.shiftKey,
      });
      return;
    }

    if (prop("typeahead") && !mod && !event.altKey && isTypeaheadKey(key)) {
      event.preventDefault();
      send({ type: "TYPEAHEAD.KEY", key });
    }
  }

  /**
   * The other half of the Enter/Space split — and here there is no Enter at all: a
   * bare listbox has nothing to commit (that belongs to `select` and `combobox`),
   * so Enter stays the page's.
   */
  function onContentKeyUp(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key !== " " || event.altKey) return;
    event.preventDefault();
    // Shift+Space extends the range from the anchor; Ctrl+Space is the toggle's
    // documented alias, so it takes the same path as a bare Space.
    send(event.shiftKey ? { type: "SELECTION.EXTEND" } : { type: "ITEM.TOGGLE" });
  }

  function itemProps(item: ListboxItemProps): HTMLProps {
    const itemDisabled = disabled || item.disabled === true;
    const selected = isSelected(item.value);
    const highlighted = !itemDisabled && highlightedValue === item.value;

    return {
      id: getItemId(scope, item.value),
      role: "option",
      // Roving: exactly one stop in the tab order. Never `aria-activedescendant` —
      // the focus is real (règle dure), which is also what lets a gamepad drive it.
      tabIndex: item.value === tabbableValue ? 0 : -1,
      // Always present, and it carries the *selection*: the highlight is a focus and
      // announces itself by moving.
      "aria-selected": boolAttr(selected),
      // `aria-disabled`, never the native attribute: APG wants a disabled option
      // reachable, unlike a natively disabled form control (dom-collection).
      "aria-disabled": ariaAttr(itemDisabled),
      "data-value": item.value,
      "data-label": item.label,
      "data-state": selected ? "selected" : "unselected",
      "data-highlighted": dataAttr(highlighted),
      "data-disabled": dataAttr(itemDisabled),
      "data-orientation": orientation,
      // On the highlighted row only: the composite has one focus, and an attribute
      // claiming otherwise on every row describes nothing.
      "data-focus-visible": dataAttr(highlighted && focusVisible),
      "data-focus-source": highlighted ? (focusSource ?? undefined) : undefined,
      onClick(event) {
        if (event.defaultPrevented || itemDisabled) return;
        send({
          type: "ITEM.CLICK",
          value: item.value,
          shift: event.shiftKey,
          // One gesture, two spellings: Ctrl on a PC, Cmd on a Mac.
          toggle: event.ctrlKey || event.metaKey,
        });
      },
      onFocus(event) {
        if (event.defaultPrevented) return;
        send({ type: "ITEM.FOCUS", value: item.value });
      },
    };
  }

  return {
    value,
    highlightedValue,
    selectionMode: prop("selectionMode"),
    disabled,
    empty,
    isSelected,

    setValue(next: readonly string[]): void {
      send({ type: "VALUE.SET", value: next });
    },

    setHighlightedValue(next: string | null): void {
      send({ type: "HIGHLIGHT.SET", value: next });
    },

    select(next: string): void {
      send({ type: "SELECTION.SELECT", value: next });
    },

    toggle(next: string): void {
      send({ type: "ITEM.TOGGLE", value: next });
    },

    selectAll(): void {
      send({ type: "SELECTION.ALL" });
    },

    clearSelection(): void {
      send({ type: "SELECTION.CLEAR" });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir,
        "data-orientation": orientation,
        "data-disabled": dataAttr(disabled),
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, id: getLabelId(scope) }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope),
        role: "listbox",
        dir,
        // Only when it is true: `aria-multiselectable="false"` is the default and
        // saying it out loud on every single-selection list is noise.
        "aria-multiselectable": ariaAttr(multiple),
        // Vertical is ARIA's own implicit default for a listbox, so only the other
        // axis is worth an attribute.
        "aria-orientation": orientation === "horizontal" ? "horizontal" : undefined,
        // Never both. A rendered `label` part wins, and the prop is what names a
        // list that renders none — a dangling IDREF would name nothing at all.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        "aria-label": context.get("hasLabel") ? undefined : prop("label"),
        "aria-disabled": ariaAttr(disabled),
        // A list with no rows has no roving stop to be reached through, so the
        // container takes one: an empty state a keyboard cannot reach is an empty
        // state nobody is told about.
        tabIndex: empty ? 0 : undefined,
        "data-empty": dataAttr(empty),
        "data-orientation": orientation,
        "data-disabled": dataAttr(disabled),
        // A spatial zone with a memory: coming back to the list lands on the row it
        // was left on. No trap and no declarative wrap — the wrap is `loopFocus`,
        // which the machine owns, and a trap would silence the engine that walks the
        // focus out of a list that has ended.
        "data-snav": "container",
        onKeyDown: onContentKeyDown,
        onKeyUp: onContentKeyUp,
        onFocusOut(event) {
          if (event.defaultPrevented) return;
          const next = event.relatedTarget as HTMLElement | null;
          // A move *within* the list is not a departure. `relatedTarget` is `null`
          // both when the focus leaves the page and when the focused row was removed
          // from under it — the second case is the collection's to answer, and
          // `syncItems` does, so all this has to get right is "still inside".
          if (contains(event.currentTarget as HTMLElement | null, next)) return;
          send({ type: "CONTENT.BLUR" });
        },
      }),

    getItemGroupProps: (group: ListboxItemGroupProps): T["element"] =>
      normalize.element({
        ...parts.itemGroup.attrs,
        id: getItemGroupId(scope, group.id),
        role: "group",
        // Declared, never assumed: written blind it is a dead IDREF *and* no
        // accessible name at once, which axe reports as `incomplete` rather than as
        // a violation — so nothing would ever catch it (the menu's lesson, kept).
        "aria-labelledby": group.label === true ? getItemGroupLabelId(scope, group.id) : undefined,
      }),

    // Not `role="presentation"`: it is what the group's `aria-labelledby` points at,
    // and a presentational node names nothing.
    getItemGroupLabelProps: (label: ListboxItemGroupLabelProps): T["element"] =>
      normalize.element({
        ...parts.itemGroupLabel.attrs,
        id: getItemGroupLabelId(scope, label.htmlFor),
      }),

    getItemProps: (item: ListboxItemProps): T["element"] =>
      normalize.element({ ...parts.item.attrs, ...itemProps(item) }),

    getItemTextProps: (): T["element"] => normalize.element({ ...parts.itemText.attrs }),

    // The checkmark. The state is `aria-selected` on the row, never this glyph — so
    // the node is hidden and the two can never disagree. The sheet shows it in touch
    // and hides it on the desktop, where the plate says the same thing — but only
    // the mark the sheet draws itself: a glyph composed into this part keeps the
    // cell in both densities.
    getItemIndicatorProps: (indicator: ListboxItemIndicatorProps): T["element"] =>
      normalize.element({
        ...parts.itemIndicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-state": isSelected(indicator.value) ? "selected" : "unselected",
      }),
  };
}
