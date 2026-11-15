import { ariaAttr, dataAttr } from "../../dom/attrs";
import { resolveDir } from "../../dom/text-dir";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality, isTextEntryTarget } from "../../nav";
import type { Orientation } from "../../types";
import { parts } from "./toolbar.anatomy";
import { getItemId, getRootEl, getRootId } from "./toolbar.dom";
import type {
  ToolbarApi,
  ToolbarItemProps,
  ToolbarSchema,
  ToolbarSeparatorProps,
  ToolbarTitleProps,
} from "./toolbar.types";

export function connect<T extends PropTypes>(
  service: Service<ToolbarSchema>,
  normalize: NormalizeProps<T>,
): ToolbarApi<T> {
  const { context, prop, send, scope } = service;

  const orientation = prop("orientation");
  const focusedValue = context.get("focusedValue");
  // Read once, when focus lands, and held: the modality of `now` flips to
  // pointer after 300ms of mouse movement whether or not the focus moved.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);
  // The single tab stop, settled by the machine against the real item list.
  const tabbableValue = context.get("tabbableValue");

  return {
    focusedValue,

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        role: "toolbar",
        dir: prop("dir"),
        // APG requires the name. A consumer who would rather point at a visible
        // heading spreads their own `aria-labelledby`, which wins the merge.
        "aria-label": prop("label"),
        // Only the vertical case is worth spelling out: horizontal is the
        // implicit value of `aria-orientation` on a toolbar.
        "aria-orientation": orientation === "vertical" ? "vertical" : undefined,
        "data-orientation": orientation,
        // One spatial zone on its own axis. The engine's default entry strategy
        // (`last`, geometric fallback) coincides with the keyboard memory below,
        // so the d-pad and Tab come back to the same control for free. No
        // `data-snav-wrap`: a spatial wrap at the edge would make the bar
        // impossible to *leave* with a d-pad.
        "data-snav": "container",
      }),

    getGroupProps: (): T["element"] =>
      normalize.element({
        ...parts.group.attrs,
        role: "group",
        "data-orientation": orientation,
      }),

    getSeparatorProps: (separatorProps: ToolbarSeparatorProps = {}): T["element"] => {
      // A rule between two groups runs across the bar, so its own orientation is
      // the perpendicular of the toolbar's — which is what makes the default the
      // right one and the prop a rarity.
      const own: Orientation =
        separatorProps.orientation ?? (orientation === "horizontal" ? "vertical" : "horizontal");

      return normalize.element({
        ...parts.separator.attrs,
        role: "separator",
        "aria-orientation": own === "vertical" ? "vertical" : undefined,
        "data-orientation": own,
      });
    },

    getSpacerProps: (): T["element"] =>
      normalize.element({
        ...parts.spacer.attrs,
        "aria-hidden": ariaAttr(true),
      }),

    getTitleProps: (titleProps: ToolbarTitleProps = {}): T["element"] =>
      normalize.element({
        ...parts.title.attrs,
        "data-size": titleProps.size ?? "inline",
      }),

    getItemProps: (itemProps: ToolbarItemProps & { value: string }): T["element"] => {
      const { value } = itemProps;
      const focused = focusedValue === value;

      return normalize.element({
        ...parts.item.attrs,
        id: getItemId(scope, value),
        // The value lives on the element because the DOM is where the item order
        // is read from — this is what keeps the machine out of a registry.
        "data-value": value,
        "data-orientation": orientation,
        // Tri-state, and the third state is the point. Until the first
        // `ITEMS.SYNC` the machine has read no items, and writing `-1` on every
        // one of them would take the whole bar out of the tab order of a
        // server-rendered page. Absent, the native focusables keep their natural
        // order until hydration settles the stop.
        tabIndex: tabbableValue === null ? undefined : value === tabbableValue ? 0 : -1,
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused item only: the bar has one focus, and an attribute
        // claiming otherwise on every control describes nothing.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        // Memory only. A toolbar visits, it does not choose: the activation
        // belongs to the control that was clicked.
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.CLICK", value });
        },
        onKeyDown(event) {
          // The cohabitation rule, in the order it has to be read.
          //
          // A composed control that claimed the key has already won, whatever
          // order the handlers were merged in — a menu trigger opening on Down
          // must not also move the focus sideways.
          if (event.defaultPrevented) return;
          // A modifier means an application shortcut, and Shift+arrow is the
          // range-extend gesture of the components that have ranges. Neither is
          // ever a toolbar move (the `getRovingKeyAction` convention).
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          // A caret owns its arrows, Home and End. An item that *is* a text field
          // is unusual but legal, and the field wins.
          if (isTextEntryTarget(event.target)) return;

          // `bothAxes: false` always: the toolbar holds strictly to its own axis
          // so the perpendicular one stays free for the page to scroll, or for a
          // spinbutton inside the bar. That is the deliberate difference with the
          // radio mode of `toggle-group`. The RTL mirror lives in the shared key
          // map, once per composite, never in the intent keymap.
          const action = getRovingKeyAction(event.key, {
            orientation,
            dir: resolveDir(prop("dir"), getRootEl(scope)),
            bothAxes: false,
          });
          if (action === null) return;
          event.preventDefault();
          send({ type: "ITEM.NAVIGATE", action, value });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.FOCUS", value });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.BLUR" });
        },
      });
    },
  };
}
