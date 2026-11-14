import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { isComposingEvent, isPrimaryPointer } from "../../dom/event";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import { isTypeaheadKey } from "../../interaction/typeahead";
import type { HTMLProps, NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import type { Align, Side } from "../../positioner/compute-position";
import { parts } from "./menu.anatomy";
import {
  CANCEL_VALUE,
  getBackdropId,
  getCancelTriggerId,
  getContentEl,
  getContentId,
  getContextTriggerId,
  getIndicatorId,
  getItemDescriptionId,
  getItemGroupId,
  getItemGroupLabelId,
  getItemId,
  getPositionerId,
  getTriggerId,
} from "./menu.dom";
import { getSubmenuKeyAction, getTriggerOpenAction, toRovingKey } from "./menu.keys";
import type {
  MenuApi,
  MenuItemDescriptionProps,
  MenuItemGroupLabelProps,
  MenuItemGroupProps,
  MenuItemIndicatorProps,
  MenuItemProps,
  MenuOptionItemProps,
  MenuSchema,
} from "./menu.types";

/**
 * How deep this menu sits, for `data-level` — the sheet stacks its drill-in by it.
 * Bounded rather than cycle-checked with a `Set`: a menu tree deeper than this is
 * a bug in the wiring, and the attribute is a styling hook, not a proof.
 */
function getLevel(service: Service<MenuSchema>): number {
  let level = 0;
  let parent = service.refs.get("parent");
  while (parent !== null && level < 16) {
    level++;
    parent = parent.refs.get("parent");
  }
  return level;
}

export function connect<T extends PropTypes>(
  service: Service<MenuSchema>,
  normalize: NormalizeProps<T>,
): MenuApi<T> {
  const { context, computed, prop, send, scope } = service;

  const open = context.get("open");
  const disabled = prop("disabled");
  const presentation = computed("presentation");
  const isSubmenu = computed("isSubmenu");
  const dir = prop("dir");
  const state = open ? "open" : "closed";
  const placement = context.get("currentPlacement");
  // Split here rather than imported: `compute-position` keeps its parser private,
  // and re-exporting one to save this line would widen the positioner's surface.
  const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];

  const triggerId = getTriggerId(scope);
  const contentId = getContentId(scope);
  const highlightedValue = context.get("highlightedValue");
  const flashingValue = context.get("flashingValue");
  const hasSelection = context.get("hasSelectionGutter");
  const hasSymbols = context.get("hasSymbolGutter");
  const hasTrigger = context.get("hasTrigger");
  // Read once, when the highlight landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved, and a
  // ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const level = getLevel(service);

  /**
   * Every key the surface answers, on `content` alone. Items carry pointer
   * handlers and nothing else: a keydown bubbles out of the focused item to here,
   * so one table serves the whole menu instead of one per item.
   */
  function onContentKeyDown(event: KeyboardEvent): void {
    if (isComposingEvent(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const { key } = event;

    // APG Menu Button: Tab leaves the menu entirely. Deliberately not prevented
    // here — either the native Tab carries the focus on from the trigger the
    // restore just handed it back to, or `proxyTabFocus` has already placed it
    // after the trigger itself.
    //
    // **Answered ahead of the `defaultPrevented` gate, and it is the only key that
    // is.** That proxy listens on the document in capture and prevents the default
    // whenever the focus sits on the surface's last tabbable — which, under a
    // roving tabindex, is the highlighted item and therefore *always*. Read after
    // the gate, this branch never ran: Tab moved the focus and left the whole tree
    // open behind it.
    if (key === "Tab") {
      send({ type: "TREE.CLOSE" });
      return;
    }

    if (event.defaultPrevented) return;

    // Escape belongs to the dismissable layer, which listens on the document in
    // capture and only answers for the top-most layer. Handling it here as well
    // would close two levels on one press.
    if (key === "Escape") return;

    if (key === "Enter") {
      if (event.repeat) return;
      event.preventDefault();
      send({ type: "ITEM.ACTIVATE" });
      return;
    }
    // Claimed here so the typeahead cannot see it, and answered on keyup — the APG
    // split `research/input.md` §1 makes a rule across the library.
    if (key === " ") {
      event.preventDefault();
      return;
    }

    // Resolved here and not at the `dir` hoist in `connect`: with no `dir` prop
    // the answer is read off the surface, and a DOM read at the top of `connect`
    // would run on the server. Read once — both lookups below want the same one.
    const keyDir = resolveDir(dir, getContentEl(scope));

    const submenu = getSubmenuKeyAction(key, keyDir);
    if (submenu !== null) {
      event.preventDefault();
      // `CHILD.CLOSE` reads as "close the child, or close me if I am one", so the
      // same event is `back` at every depth and a no-op at the root.
      send(submenu === "open" ? { type: "CHILD.OPEN", focus: true } : { type: "CHILD.CLOSE" });
      return;
    }

    const action = getRovingKeyAction(toRovingKey(key), {
      orientation: "vertical",
      dir: keyDir,
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
    event.preventDefault();
    send({ type: "ITEM.ACTIVATE" });
  }

  /**
   * The shape shared by `item`, `optionItem` and `triggerItem`. The three differ in
   * their role and in what opens, never in their geometry — which is why the sheet
   * can say `:is([data-part~="menu:item"], [data-part~="menu:trigger-item"])`.
   */
  function itemProps(item: MenuItemProps, role: string): HTMLProps {
    const itemDisabled = disabled || item.disabled === true;
    const highlighted = !itemDisabled && highlightedValue === item.value;

    return {
      id: getItemId(scope, item.value),
      role,
      // Roving: exactly one stop in the tab order, and it is the highlighted item.
      // Never `aria-activedescendant` — the focus is real (règle dure).
      tabIndex: highlighted ? 0 : -1,
      "aria-disabled": ariaAttr(itemDisabled),
      "aria-keyshortcuts": item.shortcut,
      "aria-describedby":
        item.description === true ? getItemDescriptionId(scope, item.value) : undefined,
      "data-value": item.value,
      "data-label": item.label,
      "data-highlighted": dataAttr(highlighted),
      "data-disabled": dataAttr(itemDisabled),
      "data-destructive": dataAttr(item.destructive),
      "data-highlighted-flash": dataAttr(flashingValue === item.value),
      // On the highlighted item only: the composite has one focus, and an attribute
      // claiming otherwise on every item describes nothing. No `data-focus-visible`
      // beside it — architecture.md makes the source the single truth and the ring
      // derives from it in the sheet, so a second attribute would be a live mirror
      // with nothing to keep it honest.
      "data-focus-source": highlighted ? (focusSource ?? undefined) : undefined,
      onPointerMove(event) {
        // A touch `pointermove` is a scroll or the start of a long press, never a
        // hover: taking it would highlight whatever the finger passes over.
        if (event.pointerType === "touch" || itemDisabled) return;
        send({
          type: "ITEM.POINTERMOVE",
          value: item.value,
          x: event.clientX,
          y: event.clientY,
        });
      },
      onPointerLeave(event) {
        if (event.pointerType === "touch") return;
        send({ type: "ITEM.POINTERLEAVE", value: item.value });
      },
    };
  }

  return {
    open,
    presentation,
    placement,
    highlightedValue,
    isSubmenu,
    triggerId,
    contentId,

    setOpen(next: boolean): void {
      send({ type: "OPEN.SET", open: next });
    },

    setHighlightedValue(value: string | null): void {
      send({ type: "HIGHLIGHT.SET", value });
    },

    closeTree(): void {
      send({ type: "TREE.CLOSE" });
    },

    setParent(parent: Service<MenuSchema> | null): void {
      send({ type: "PARENT.SET", parent });
    },

    setChild(child: Service<MenuSchema> | null): void {
      send({ type: "CHILD.SET", child });
    },

    getTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.trigger.attrs,
        id: triggerId,
        type: "button",
        disabled,
        "aria-haspopup": "menu",
        "aria-expanded": boolAttr(open),
        // Only while open — a dangling IDREF names nothing.
        "aria-controls": open ? contentId : undefined,
        "data-state": state,
        "data-disabled": dataAttr(disabled),
        "data-placement": placement,
        onPointerDown(event) {
          if (event.defaultPrevented || disabled || !isPrimaryPointer(event)) return;
          // Touch waits for the click: a menu that opened under a finger would
          // swallow the tap that was meant to reach the button.
          if (event.pointerType === "touch") return;
          send({ type: "TRIGGER.POINTERDOWN" });
        },
        onClick(event) {
          if (event.defaultPrevented || disabled) return;
          send({ type: "TRIGGER.CLICK" });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || disabled || isComposingEvent(event)) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const action = getTriggerOpenAction(event.key);
          if (action === null) return;
          // Prevented for two reasons at once: the arrows must not scroll the page,
          // and Enter or Space on a real `<button>` would otherwise synthesise a
          // click that `toggleMenu` would read as a second press.
          event.preventDefault();
          // Space opens on keyup, and that is not a stylistic reading of the APG
          // split — it is what stops the key press leaking into the surface it
          // opens. Space's keyup lands on whatever holds the focus *then*, and by
          // then the menu is open with its first item focused, so opening on
          // keydown would activate that item the instant it appeared.
          if (event.key !== " ") send({ type: "TRIGGER.KEYDOWN", action });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || disabled || event.key !== " ") return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          send({ type: "TRIGGER.KEYDOWN", action: "first" });
        },
      }),

    /**
     * Any container. It carries no handler: the `contextmenu` listener and the long
     * press are installed natively by `trackContextTrigger`, because they have to be
     * listening while the surface is closed and must not be routed through an
     * adapter's synthetic system.
     */
    getContextTriggerProps: (): T["element"] =>
      normalize.element({
        ...parts.contextTrigger.attrs,
        id: getContextTriggerId(scope),
        // Programmatically focusable, never in the tab order: this part *is* the
        // anchor, so it has to be able to take the focus back when the surface
        // goes. A right mousedown blurs whatever was focused before the machine
        // ever sees the gesture, so `captureFinalFocus` reads BODY and stores
        // `null`, and the documented fallback — `getAnchorEl` — is this node.
        // Without a tabindex `focusElement` was a silent no-op on it and the focus
        // fell to BODY when the portal unmounted (WCAG 2.4.3). `tabindex="-1"` puts
        // the node in `FOCUSABLE_SELECTOR` without entering `getTabbables`, which
        // keeps only what the engine's `isTabbable` admits: the Tab order is unchanged.
        tabIndex: -1,
        // `aria-haspopup` is a global property and legal on anything. `aria-expanded`
        // is NOT — it is allowed only on a handful of roles, and this part is a bare
        // container the consumer brings, which maps to `generic`. Emitting it raised
        // an `aria-allowed-attr` violation on the one element the whole context-menu
        // preset is built from, and the React suite was staying green by excluding
        // the region from its axe run. The state is still readable: `data-state` is
        // the styling contract, and the surface itself carries the ARIA.
        "aria-haspopup": "menu",
        "data-state": state,
        "data-disabled": dataAttr(disabled),
      }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        id: getIndicatorId(scope),
        "aria-hidden": ariaAttr(true),
        "data-state": state,
        "data-placement": placement,
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
     * The floating element. **`data-side` and `data-align` are deliberately absent
     * here** — the position effect writes them onto this node directly, and an
     * adapter that also rendered them would fight the effect over the same two
     * attributes on every commit. They are published on `content` instead, from
     * `currentPlacement`, which is the same value one step later.
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
        role: "menu",
        dir: context.get("surfaceDir") ?? dir,
        tabIndex: -1,
        "aria-orientation": "vertical",
        // Never both: the trigger names it when there is one, and a submenu's
        // trigger item *is* its trigger — `getTriggerItemProps` gives that node the
        // child's own trigger id precisely so this IDREF resolves.
        //
        // **And only when a trigger was really rendered.** A menu composed with
        // `getContextTriggerProps` alone has none, so this pointed at an id nobody
        // wrote — a dangling IDREF, which names nothing and which axe reports as
        // `incomplete` rather than as a violation. Unnamed is the better failure,
        // and `trackParts` says so in dev.
        "aria-labelledby": prop("label") === undefined && hasTrigger ? triggerId : undefined,
        "aria-label": prop("label"),
        "data-state": state,
        "data-presentation": presentation,
        "data-side": side,
        "data-align": align,
        "data-placement": placement,
        "data-has-selection": dataAttr(hasSelection),
        // Both gutters are decisions of the container, never of a row: the
        // axes are named for the menu, and the alignment they buy is *between*
        // rows. Published here so one row without a glyph cannot slide its label
        // left of the one above it.
        "data-has-symbols": dataAttr(hasSymbols),
        "data-level": String(level),
        // The surface applies the glass material, so the surface is what
        // owes its contents the on-glass palette (architecture.md).
        "data-sui-on-glass": "",
        "data-snav": "container",
        "data-snav-enter": "first",
        "data-snav-wrap": prop("loopFocus") ? "y" : undefined,
        // Confinement is declared here rather than by trapping the intent scope: a
        // trapped scope silences the spatial engine at the bottom of the stack and
        // makes the menu's own interior unreachable to a d-pad.
        "data-snav-trap": prop("modal") ? "" : undefined,
        onKeyDown: onContentKeyDown,
        onKeyUp: onContentKeyUp,
      }),

    getItemGroupProps: (group: MenuItemGroupProps): T["element"] =>
      normalize.element({
        ...parts.itemGroup.attrs,
        id: getItemGroupId(scope, group.id),
        role: "group",
        // Declared, not assumed — same shape as `description` on an item. Written
        // unconditionally it left every group without a rendered label holding a
        // dead IDREF *and* no accessible name at once.
        "aria-labelledby": group.label === true ? getItemGroupLabelId(scope, group.id) : undefined,
        // `horizontal` is reserved for the iOS Control Group, which is out of scope
        // for this version: the attribute exists now so adding it later costs no
        // machine change.
        "data-orientation": group.orientation ?? "vertical",
      }),

    // Not `role="presentation"`: it is referenced by the group's `aria-labelledby`,
    // and a presentational node names nothing.
    getItemGroupLabelProps: (label: MenuItemGroupLabelProps): T["element"] =>
      normalize.element({
        ...parts.itemGroupLabel.attrs,
        id: getItemGroupLabelId(scope, label.htmlFor),
      }),

    getItemProps: (item: MenuItemProps): T["element"] =>
      normalize.element({
        ...parts.item.attrs,
        ...itemProps(item, "menuitem"),
        onClick(event) {
          if (event.defaultPrevented || disabled || item.disabled === true) return;
          send({ type: "ITEM.CLICK", value: item.value, closeOnSelect: item.closeOnSelect });
        },
      }),

    getOptionItemProps: (item: MenuOptionItemProps): T["element"] =>
      normalize.element({
        ...parts.item.attrs,
        ...itemProps(item, item.type === "radio" ? "menuitemradio" : "menuitemcheckbox"),
        "aria-checked": boolAttr(item.checked),
        "data-checked": dataAttr(item.checked),
        onClick(event) {
          if (event.defaultPrevented || disabled || item.disabled === true) return;
          // The consumer owns the value; the menu only reports the flip. Reached by
          // the keyboard too, because `ITEM.ACTIVATE` clicks the element rather
          // than shortcutting past it.
          item.onCheckedChange?.(item.checked !== true);
          send({ type: "ITEM.CLICK", value: item.value, closeOnSelect: item.closeOnSelect });
        },
      }),

    /**
     * The parent's item and the child's trigger, on one node and under one part
     * token. It takes the **child's** trigger id, which is what makes the child's
     * `aria-labelledby` resolve and what gives its positioner an anchor without
     * anybody rendering a second element.
     */
    getTriggerItemProps: (child: MenuApi<T>, item: MenuItemProps): T["element"] =>
      normalize.element({
        ...parts.triggerItem.attrs,
        ...itemProps(item, "menuitem"),
        id: child.triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": boolAttr(child.open),
        "aria-controls": child.open ? child.contentId : undefined,
        "data-state": child.open ? "open" : "closed",
        onClick(event) {
          if (event.defaultPrevented || disabled || item.disabled === true) return;
          // Named, because a tap and a synthetic click arrive with no `pointermove`
          // before them and therefore no highlight for the guard to read.
          send({ type: "CHILD.OPEN", focus: true, value: item.value });
        },
      }),

    // The reserved symbol column. Decoration:
    // the name comes from `itemText`.
    getItemSymbolProps: (): T["element"] =>
      normalize.element({ ...parts.itemSymbol.attrs, "aria-hidden": ariaAttr(true) }),

    getItemTextProps: (): T["element"] => normalize.element({ ...parts.itemText.attrs }),

    getItemDescriptionProps: (description: MenuItemDescriptionProps): T["element"] =>
      normalize.element({
        ...parts.itemDescription.attrs,
        id: getItemDescriptionId(scope, description.value),
      }),

    // The checkmark. The state is carried by `aria-checked` on the item, never by
    // the glyph — so this node is hidden and the two can never disagree.
    getItemIndicatorProps: (indicator: MenuItemIndicatorProps): T["element"] =>
      normalize.element({
        ...parts.itemIndicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-checked": dataAttr(indicator.checked),
      }),

    // A `<kbd>`, and hidden: the shortcut reaches assistive technology through
    // `aria-keyshortcuts` on the item, where it is a machine-readable string
    // rather than a row of glyphs.
    getItemShortcutProps: (): T["element"] =>
      normalize.element({ ...parts.itemShortcut.attrs, "aria-hidden": ariaAttr(true) }),

    getSeparatorProps: (): T["element"] =>
      normalize.element({
        ...parts.separator.attrs,
        role: "separator",
        "aria-orientation": "horizontal",
        "data-orientation": "horizontal",
      }),

    // Added by the adapter in the `sheet` presentation (components.md §3). Its
    // accessible name is checked in dev by `trackParts`.
    //
    // `role="menuitem"` because it is drawn *inside* the surface, and a `role="menu"`
    // owns nothing but `menuitem`, `menuitemcheckbox`, `menuitemradio`, `group` and
    // `separator`: a bare button there is an `aria-required-children` violation, and
    // the sheet is the one presentation that renders one. It is also the honest
    // reading — cancelling is an action of the sheet, and iOS draws it as one.
    //
    // **And because it is a `menuitem`, it is an item.** It goes through the same
    // `itemProps` as every other row — roving tabindex, highlight, pointer
    // handlers — for the reason the role implies: the roving list is the only way
    // into this surface, so a `menuitem` outside it is a control that no keyboard
    // and no d-pad can reach. It was outside it until 2026-09-02, and `End` in the
    // sheet stopped one row short of the only button the sheet has. Its value is
    // namespaced (`CANCEL_VALUE`) rather than borrowed from the label, so a
    // consumer item called `cancel` cannot collide with it, and the id stays the
    // cancel trigger's — `itemProps` writes an item id that is overridden here.
    getCancelTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.cancelTrigger.attrs,
        ...itemProps({ value: CANCEL_VALUE }, "menuitem"),
        id: getCancelTriggerId(scope),
        type: "button",
        "data-state": state,
        "data-presentation": presentation,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "CANCEL.CLICK" });
        },
      }),
  };
}
