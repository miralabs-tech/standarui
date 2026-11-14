/**
 * Pure, DOM-free, replayable on a server.
 *
 * The keyboard is entirely native (APG Breadcrumb defines no keys of its own):
 * Tab traverses links and the ellipsis button in document order, `hidden` items
 * are out of the tab order for free, Enter navigates the link, Enter/Space
 * activate the real `<button>` — whose native `click` also covers assistive
 * technologies, which is why there is no `interaction/press` here. No roving
 * tabindex, no arrow keys: adding them would diverge from the pattern.
 *
 * `list` carries a permanent `tabindex="-1"`: it is the focus target of a
 * pointer/touch reveal (D-BC-4) — never in the Tab order, never styled with a
 * ring, so the focus is not lost and no ring appears under a mouse.
 */

import { boolAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./breadcrumb.anatomy";
import { getEllipsisTriggerId, getListId, getRootId } from "./breadcrumb.dom";
import type {
  BreadcrumbApi,
  BreadcrumbItemProps,
  BreadcrumbLinkProps,
  BreadcrumbSchema,
} from "./breadcrumb.types";

export function connect<T extends PropTypes>(
  service: Service<BreadcrumbSchema>,
  normalize: NormalizeProps<T>,
): BreadcrumbApi<T> {
  const { context, prop, send, scope } = service;

  const expanded = context.get("expanded");
  const state = expanded ? "expanded" : "collapsed";

  return {
    expanded,

    setExpanded(next: boolean): void {
      // Never `ELLIPSIS.CLICK`: the programmatic path moves no focus.
      send({ type: "EXPANDED.SET", expanded: next });
    },

    expand(): void {
      send({ type: "EXPANDED.SET", expanded: true });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        // The landmark's name. Two breadcrumbs on a page need two labels.
        "aria-label": prop("label"),
        "data-state": state,
      }),

    getListProps: (): T["element"] =>
      normalize.element({
        ...parts.list.attrs,
        id: getListId(scope),
        dir: prop("dir"),
        tabIndex: -1,
        "data-state": state,
      }),

    getItemProps: (itemProps?: BreadcrumbItemProps): T["element"] => {
      const collapsed = itemProps?.collapsed === true;
      return normalize.element({
        ...parts.item.attrs,
        // `hidden` removes the level from layout AND from the accessibility
        // tree while the trail is collapsed. `data-collapsed` stays posted once
        // revealed — the reveal fade and the re-collapse rescue key on it.
        hidden: collapsed && !expanded ? true : undefined,
        "data-collapsed": dataAttr(collapsed),
        // Only the items that take part in the disclosure wear the state; an
        // attribute on every crumb would describe nothing.
        "data-state": collapsed ? state : undefined,
      });
    },

    getLinkProps: (linkProps?: BreadcrumbLinkProps): T["element"] => {
      const current = linkProps?.current === true;
      return normalize.element({
        ...parts.link.attrs,
        // `"page"` and no other value — and `aria-current` is a global
        // attribute, valid on the `span` a consumer substitutes for the
        // current level.
        "aria-current": current ? "page" : undefined,
        "data-current": dataAttr(current),
      });
    },

    getEllipsisProps: (): T["element"] =>
      normalize.element({
        ...parts.ellipsis.attrs,
        // A real list item: it participates in the sheet's chevron adjacency,
        // and it leaves layout and the accessibility tree once revealed.
        hidden: expanded ? true : undefined,
        "data-state": state,
      }),

    getEllipsisTriggerProps: (): T["button"] =>
      normalize.button({
        ...parts.ellipsisTrigger.attrs,
        id: getEllipsisTriggerId(scope),
        type: "button",
        "aria-expanded": boolAttr(expanded),
        "aria-controls": getListId(scope),
        // The glyph is the sheet's three dots, never text — so the name has to
        // come from somewhere, and it is this label.
        "aria-label": prop("ellipsisLabel"),
        "data-state": state,
        onClick(event) {
          if (event.defaultPrevented) return;
          send({ type: "ELLIPSIS.CLICK" });
        },
      }),
  };
}
