import { visuallyHiddenStyle } from "../../a11y/visually-hidden";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { isComposingEvent, isPrimaryPointer } from "../../dom/event";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction, type RovingAction } from "../../focus/roving-focus";
import { isTypeaheadKey } from "../../interaction/typeahead";
import type { HTMLProps, NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Align, Side } from "../../positioner/compute-position";
import { parts } from "./select.anatomy";
import {
  getBackdropId,
  getCancelTriggerId,
  getContentEl,
  getContentId,
  getHiddenSelectId,
  getIndicatorId,
  getItemGroupId,
  getItemGroupLabelId,
  getItemId,
  getPositionerId,
  getTriggerId,
  getValueTextId,
} from "./select.dom";
import type {
  SelectApi,
  SelectItemGroupLabelProps,
  SelectItemGroupProps,
  SelectItemIndicatorProps,
  SelectItemProps,
  SelectSchema,
} from "./select.types";

/**
 * A mirror of `interaction/typeahead`'s DEFAULT_TIMEOUT, restated because the
 * buffer keeps that number private and the Space arbitration below needs it: a
 * Space *during* a live search is a search character (APG), and "during" is
 * exactly the window the buffer itself would still extend.
 */
const TYPEAHEAD_WINDOW_MS = 350;

/**
 * Which end of the list a key on the **trigger** opens onto. Unlike the menu's
 * table, Enter and the arrows answer `next`/`prev` rather than `first`/`last`:
 * `highlightInitial` gives the *selected* item priority over either end, and
 * only Home and End are allowed to force their way past it.
 */
function getTriggerOpenAction(key: string): RovingAction | null {
  switch (key) {
    case "Enter":
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

export function connect<T extends PropTypes>(
  service: Service<SelectSchema>,
  normalize: NormalizeProps<T>,
): SelectApi<T> {
  const { context, computed, prop, refs, send, scope } = service;

  const open = context.get("open");
  const disabled = prop("disabled");
  const invalid = prop("invalid");
  const required = prop("required");
  const presentation = computed("presentation");
  const dir = prop("dir");
  const state = open ? "open" : "closed";
  const placement = context.get("currentPlacement");
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const triggerId = getTriggerId(scope);
  const contentId = getContentId(scope);
  const value = context.get("value");
  const valueLabel = context.get("valueLabel");
  const hasValue = computed("hasValue");
  const highlightedValue = context.get("highlightedValue");
  const flashingValue = context.get("flashingValue");
  const hasSymbols = context.get("hasSymbolGutter");
  const focusSource = context.get("focusSource");

  /**
   * Whether a Space right now is a search character rather than a commit. Read
   * off the shared buffer at event time, never at render: the answer changes
   * with the clock, not with the props.
   */
  function isTypeaheadActive(): boolean {
    const buffer = refs.get("typeahead");
    return buffer.query !== "" && Date.now() - buffer.lastKeyAt <= TYPEAHEAD_WINDOW_MS;
  }

  /**
   * Every key the surface answers, on `content` alone: a keydown bubbles out of
   * the focused option to here, so one table serves the whole listbox.
   */
  function onContentKeyDown(event: KeyboardEvent): void {
    if (isComposingEvent(event)) return;

    const { key } = event;

    // The one combination that survives the modifier gate below, and the mirror
    // of the Alt+ArrowDown that opens the surface: APG select-only gives
    // Alt+ArrowUp the same outcome as Enter — commit the highlighted option,
    // close, hand the focus back to the trigger. It used to be swallowed whole,
    // because the gate ran first and answered every `altKey` with "not ours".
    if (key === "ArrowUp" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      send({ type: "ITEM.COMMIT" });
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // APG select-only: Tab commits the highlighted option and closes, then
    // `proxyTabFocus` places the focus after the trigger. Answered ahead of the
    // `defaultPrevented` gate for the menu's exact reason — the proxy listens on
    // the document in capture and prevents the default on the roving item.
    //
    // It commits, which is what the APG asks for and the only coherent answer
    // here: moving the highlight does not move the value in this component, so a
    // Tab that dropped the highlight would silently discard the only thing the
    // keyboard user had done. The default is left alone — the focus still has to
    // leave.
    if (key === "Tab") {
      send({ type: "ITEM.COMMIT" });
      return;
    }

    if (event.defaultPrevented) return;

    // Escape belongs to the dismissable layer, which listens on the document in
    // capture and only answers for the top-most layer.
    if (key === "Escape") return;

    if (key === "Enter") {
      if (event.repeat) return;
      event.preventDefault();
      send({ type: "ITEM.ACTIVATE" });
      return;
    }

    // Space commits on keyup (the APG split) — unless a search is live, in
    // which case it is a character of that search and never a commit.
    if (key === " ") {
      event.preventDefault();
      if (prop("typeahead") && isTypeaheadActive()) send({ type: "TYPEAHEAD.KEY", key: " " });
      return;
    }

    // The optional half of the APG select-only table, and it is answered rather
    // than left to the browser. The claim it replaces — "the focus is real and
    // inside the scroller, so the browser pages the list itself" — is half true
    // and therefore wrong: the browser scrolls the scroller and leaves the
    // roving tabindex behind, so the highlight ends up off-screen and the next
    // arrow key snaps the view back to where the eye no longer is.
    if (key === "PageDown" || key === "PageUp") {
      event.preventDefault();
      send({ type: "HIGHLIGHT.PAGE", direction: key === "PageDown" ? "next" : "prev" });
      return;
    }

    // Resolved here rather than at the `dir` hoist in `connect`: with no `dir`
    // prop the answer is read off the surface, and a DOM read at the top of
    // `connect` would run on the server.
    const action = getRovingKeyAction(key, {
      orientation: "vertical",
      dir: resolveDir(dir, getContentEl(scope)),
    });
    if (action !== null) {
      event.preventDefault();
      send({ type: "HIGHLIGHT.MOVE", action });
      return;
    }

    if (prop("typeahead") && isTypeaheadKey(key)) {
      event.preventDefault();
      send({ type: "TYPEAHEAD.KEY", key });
    }
  }

  function onContentKeyUp(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key !== " ") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // The keydown half just fed this very Space to the buffer, so the window is
    // still open — which is exactly what marks the release as "not a commit".
    if (prop("typeahead") && isTypeaheadActive()) return;
    event.preventDefault();
    send({ type: "ITEM.ACTIVATE" });
  }

  function itemProps(item: SelectItemProps): HTMLProps {
    const itemDisabled = disabled || item.disabled === true;
    const highlighted = !itemDisabled && highlightedValue === item.value;
    const selected = value === item.value;

    return {
      id: getItemId(scope, item.value),
      role: "option",
      // Roving: exactly one stop in the tab order, and it is the highlighted
      // item. Never `aria-activedescendant` — the focus is real (règle dure).
      tabIndex: highlighted ? 0 : -1,
      // The selection, never the highlight: `aria-selected` is what the value
      // owns, and the moving focus already announces itself.
      "aria-selected": boolAttr(selected),
      "aria-disabled": ariaAttr(itemDisabled),
      "data-value": item.value,
      "data-label": item.label,
      "data-state": selected ? "checked" : "unchecked",
      "data-highlighted": dataAttr(highlighted),
      "data-disabled": dataAttr(itemDisabled),
      "data-highlighted-flash": dataAttr(flashingValue === item.value),
      "data-focus-source": highlighted ? (focusSource ?? undefined) : undefined,
      onPointerMove(event) {
        // A touch pointermove is a scroll or a long press, never a hover.
        if (event.pointerType === "touch" || itemDisabled) return;
        send({ type: "ITEM.POINTERMOVE", value: item.value });
      },
      onPointerLeave(event) {
        if (event.pointerType === "touch") return;
        send({ type: "ITEM.POINTERLEAVE", value: item.value });
      },
      onClick(event) {
        if (event.defaultPrevented || itemDisabled) return;
        send({ type: "ITEM.CLICK", value: item.value });
      },
    };
  }

  return {
    open,
    value,
    valueLabel,
    hasValue,
    highlightedValue,
    presentation,
    placement,
    triggerId,
    contentId,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    setValue(next: string | null): void {
      send({ type: "VALUE.SET", value: next });
    },

    clearValue(): void {
      send({ type: "VALUE.SET", value: null });
    },

    setHighlightedValue(next: string | null): void {
      send({ type: "HIGHLIGHT.SET", value: next });
    },

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: triggerId,
        type: "button",
        disabled,
        // The APG Combobox select-only pattern: the trigger *is* the combobox,
        // and its value is its contents — which is what `valueText` renders.
        role: "combobox",
        "aria-haspopup": "listbox",
        "aria-expanded": boolAttr(open),
        // Unconditional, unlike the menu's: the content is always mounted, so
        // the IDREF always resolves.
        "aria-controls": contentId,
        "aria-required": ariaAttr(required),
        "aria-invalid": ariaAttr(invalid),
        "aria-describedby": prop("describedBy"),
        "aria-labelledby": prop("labelledBy"),
        // `role="combobox"` takes no name from its contents — the contents are
        // the *value* — so a select composed outside a field would be nameless
        // (axe: `aria-input-field-name`). The `label` prop names the combobox
        // too, exactly as the spec reads; `labelledBy` outranks it by ARIA
        // precedence, and it is withheld under one only to keep one voice.
        "aria-label": prop("labelledBy") === undefined ? prop("label") : undefined,
        "data-state": state,
        "data-placeholder": dataAttr(!hasValue),
        "data-disabled": dataAttr(disabled),
        "data-invalid": dataAttr(invalid),
        "data-presentation": presentation,
        onPointerDown(event) {
          if (event.defaultPrevented || disabled || !isPrimaryPointer(event)) return;
          // Touch waits for the click: a surface that opened under a finger
          // would swallow the tap that was meant to reach the button.
          if (event.pointerType === "touch") return;
          send({ type: "TRIGGER.POINTERDOWN" });
        },
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || disabled || isComposingEvent(event)) return;
          if (event.ctrlKey || event.metaKey) return;
          // Alt is only ever part of the APG's Alt+Arrow openers.
          if (event.altKey && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

          // Space opens on keyup — the APG split, and what stops the press from
          // leaking into the surface it opens (see the menu trigger).
          if (event.key === " ") {
            event.preventDefault();
            return;
          }

          const action = getTriggerOpenAction(event.key);
          if (action !== null) {
            // The arrows must not scroll the page, and Enter on a real <button>
            // would otherwise synthesise a click read as a second press.
            event.preventDefault();
            send({ type: "TRIGGER.KEYDOWN", action });
            return;
          }

          // APG select-only: a printable character opens and highlights the
          // first match. The machine defers the key until the items exist.
          if (prop("typeahead") && isTypeaheadKey(event.key)) {
            event.preventDefault();
            send({ type: "TYPEAHEAD.KEY", key: event.key });
          }
        },
        onKeyUp(event) {
          if (event.defaultPrevented || disabled || event.key !== " ") return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          send({ type: "TRIGGER.KEYDOWN", action: "next" });
        },
      }),

    getValueTextProps: (): T["element"] =>
      normalize.element({
        ...parts.valueText.attrs,
        id: getValueTextId(scope),
        "data-placeholder": dataAttr(!hasValue),
      }),

    // The double chevron. Decoration — the consumer draws an inline SVG in it,
    // never a text glyph, whose baseline would sink the ink below the centre.
    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
      }),

    /**
     * The form mirror: a real `<select>`, visually hidden, carrying only the
     * selection (the adapter renders the one `<option>`). Never focusable and
     * never named — the trigger is the control people use; this one is what the
     * form submits, validates and autofills.
     */
    getHiddenSelectProps: (): T["select"] =>
      normalize.select({
        ...parts.hiddenSelect.attrs,
        id: getHiddenSelectId(scope),
        style: visuallyHiddenStyle,
        tabIndex: -1,
        "aria-hidden": ariaAttr(true),
        name: prop("name"),
        form: prop("form"),
        required,
        disabled,
        value: value ?? "",
        onChange(event) {
          // Autofill is the only writer that can reach a hidden mirror; report
          // it into the machine rather than silently diverging from it.
          const mirror = event.currentTarget as HTMLSelectElement | null;
          if (mirror === null) return;
          send({ type: "VALUE.SET", value: mirror.value === "" ? null : mirror.value });
        },
      }),

    getBackdropProps: (): T["element"] =>
      normalize.element({
        ...parts.backdrop.attrs,
        id: getBackdropId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-presentation": presentation,
      }),

    /**
     * The floating element. `data-side`/`data-align` are deliberately absent
     * here — the position effect writes onto this node directly, and an adapter
     * that also rendered them would fight it over every commit. They are
     * published on `content`, from `currentPlacement`.
     */
    getPositionerProps: (): T["element"] =>
      normalize.element({
        ...parts.positioner.attrs,
        id: getPositionerId(scope),
        "data-sui-layer-parent": prop("parentId"),
        "data-state": state,
        "data-presentation": presentation,
      }),

    getContentProps: (): T["element"] =>
      normalize.element({
        ...parts.content.attrs,
        id: contentId,
        role: "listbox",
        dir: context.get("surfaceDir") ?? dir,
        tabIndex: -1,
        "aria-orientation": "vertical",
        // The trigger names the surface; an explicit `label` prop wins over it
        // (the menu's arbitrage). Never both.
        "aria-labelledby": prop("label") === undefined ? triggerId : undefined,
        "aria-label": prop("label"),
        "data-state": state,
        "data-presentation": presentation,
        "data-side": side,
        "data-align": align,
        "data-placement": placement,
        // Constant, and constant on purpose: a select always reserves the
        // checkmark gutter, because any row can become the checked one — unlike
        // the menu, which has to detect whether a checkmark exists at all.
        "data-has-selection": "",
        "data-has-symbols": dataAttr(hasSymbols),
        // The surface applies the glass material, so the surface owes
        // its contents the on-glass palette (architecture.md).
        "data-sui-on-glass": "",
        "data-snav": "container",
        "data-snav-enter": "first",
        "data-snav-wrap": prop("loopFocus") ? "y" : undefined,
        "data-snav-trap": prop("modal") ? "" : undefined,
        onKeyDown: onContentKeyDown,
        onKeyUp: onContentKeyUp,
      }),

    getItemGroupProps: (group: SelectItemGroupProps): T["element"] =>
      normalize.element({
        ...parts.itemGroup.attrs,
        id: getItemGroupId(scope, group.id),
        role: "group",
        // Declared, never assumed — written blind it is a dead IDREF and no
        // accessible name at once (the menu's lesson, kept).
        "aria-labelledby": group.label === true ? getItemGroupLabelId(scope, group.id) : undefined,
      }),

    // Not `role="presentation"`: it is referenced by the group's
    // `aria-labelledby`, and a presentational node names nothing.
    getItemGroupLabelProps: (label: SelectItemGroupLabelProps): T["element"] =>
      normalize.element({
        ...parts.itemGroupLabel.attrs,
        id: getItemGroupLabelId(scope, label.htmlFor),
      }),

    getItemProps: (item: SelectItemProps): T["element"] =>
      normalize.element({ ...parts.item.attrs, ...itemProps(item) }),

    getItemTextProps: (): T["element"] => normalize.element({ ...parts.itemText.attrs }),

    // The reserved symbol column, sharing its cell with the checkmark — one
    // leading track, never two (the `_menu.scss` rule, inherited).
    getItemSymbolProps: (): T["element"] =>
      normalize.element({ ...parts.itemSymbol.attrs, "aria-hidden": ariaAttr(true) }),

    // The checkmark. The state is `aria-selected` on the item, never the glyph
    // — so this node is hidden and the two can never disagree.
    getItemIndicatorProps: (indicator: SelectItemIndicatorProps): T["element"] =>
      normalize.element({
        ...parts.itemIndicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-state": value === indicator.value ? "checked" : "unchecked",
      }),

    /**
     * `role="none"`, a deliberate divergence from the menu's `role="separator"`:
     * a `role="listbox"` owns nothing but options and groups, so a semantic
     * separator inside one is an `aria-required-children` violation. The
     * platform agrees — the `<hr>` HTML allows inside `<select>` is
     * presentational.
     */
    getSeparatorProps: (): T["element"] =>
      normalize.element({
        ...parts.separator.attrs,
        role: "none",
        "aria-hidden": ariaAttr(true),
      }),

    /**
     * Sheet only, and a sibling of the listbox — never inside it, where a bare
     * button would be the same owned-children violation as the separator.
     * `tabindex="-1"`: a pointer/touch affordance whose keyboard and screen
     * reader path is Escape/B (the `tabs:closeTrigger` precedent). Not
     * `aria-hidden` — explore-by-touch must be able to land on it.
     */
    getCancelTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        id: getCancelTriggerId(scope),
        type: "button",
        tabIndex: -1,
        "data-state": state,
        "data-presentation": presentation,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.CLICK" });
        },
      }),
  };
}
