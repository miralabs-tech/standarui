/**
 * The navigation column, with no machine on `list`'s precedent: the current page is given
 * by the app, the drawer's `open` belongs to the dialog the adapter lays it on,
 * and a section's fold belongs to `collapsible`. Nothing is left that the sidebar
 * itself would remember, so `connect` takes the props directly.
 *
 * It is a landmark of links, not a widget: Tab walks every link and no arrow key
 * is claimed. The root is a `data-snav="container"`, which is all the spatial
 * engine needs to walk the column with the d-pad.
 *
 * The same parts are rendered twice by the adapter, inline and inside a drawer, so
 * no part emits an id: a second copy would repeat it.
 */

import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";

export type SidebarPart =
  | "root"
  | "header"
  | "headerLabel"
  | "content"
  | "section"
  | "sectionHeader"
  | "group"
  | "item"
  | "link"
  | "leading"
  | "label"
  | "trailing"
  | "footer"
  | "footerLabel"
  | "trigger"
  | "drawer";

export const anatomy: Anatomy<SidebarPart> = createAnatomy("sidebar").parts(
  "root",
  "header",
  "headerLabel",
  "content",
  "section",
  "sectionHeader",
  "group",
  "item",
  "link",
  "leading",
  "label",
  "trailing",
  "footer",
  "footerLabel",
  "trigger",
  "drawer",
);

export const parts: Record<SidebarPart, AnatomyPart> = anatomy.build();

/**
 * `auto` follows the density, decided by the stylesheet so the first paint is
 * right: inline on desktop, a drawer on touch. `inline` and `drawer` pin it for an
 * app that folds at a width of its own.
 */
export type SidebarPresentation = "auto" | "inline" | "drawer";

/** Where a root is drawn: in the page, or inside the drawer. */
export type SidebarPlacement = "inline" | "drawer";

export interface SidebarMachineProps {
  /** The landmark's accessible name. */
  readonly label?: string | undefined;
  /** Defaults to `"auto"`. */
  readonly presentation?: SidebarPresentation | undefined;
}

export interface SidebarRootOptions {
  /** Defaults to `"inline"`. */
  readonly placement?: SidebarPlacement | undefined;
}

export interface SidebarItemOptions {
  readonly current?: boolean | undefined;
}

export interface SidebarLinkOptions {
  /** The page the link leads to is the one on screen: `aria-current="page"`. */
  readonly current?: boolean | undefined;
  /** `aria-disabled`, kept in the tab order, and the activation is cancelled. */
  readonly disabled?: boolean | undefined;
}

export interface SidebarTriggerOptions {
  readonly open?: boolean | undefined;
}

export interface SidebarApi<T extends PropTypes = PropTypes> {
  readonly presentation: SidebarPresentation;
  getRootProps(options?: SidebarRootOptions): T["element"];
  getHeaderProps(): T["element"];
  /** The text of the header, which a rail hides from the eye and keeps in the tree. */
  getHeaderLabelProps(): T["element"];
  getContentProps(): T["element"];
  getSectionProps(): T["element"];
  getSectionHeaderProps(): T["element"];
  getGroupProps(): T["element"];
  getItemProps(options?: SidebarItemOptions): T["element"];
  getLinkProps(options?: SidebarLinkOptions): T["element"];
  getLeadingProps(): T["element"];
  getLabelProps(): T["element"];
  getTrailingProps(): T["element"];
  getFooterProps(): T["element"];
  /** The text of the footer, which a rail hides from the eye and keeps in the tree. */
  getFooterLabelProps(): T["element"];
  getTriggerProps(options?: SidebarTriggerOptions): T["button"];
  getDrawerProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: SidebarMachineProps,
  normalize: NormalizeProps<T>,
): SidebarApi<T> {
  const presentation = props.presentation ?? "auto";

  return {
    presentation,
    getRootProps: (options: SidebarRootOptions = {}): T["element"] => {
      const placement = options.placement ?? "inline";
      return normalize.element({
        ...parts.root.attrs,
        "aria-label": props.label,
        "data-presentation": presentation,
        "data-placement": placement,
        "data-snav": "container",
        // The inline column is the one that wears the material; the copy in the
        // drawer rides the sheet's own surface.
        "data-sui-on-glass": placement === "inline" ? "" : undefined,
      });
    },
    getHeaderProps: (): T["element"] => normalize.element({ ...parts.header.attrs }),
    getHeaderLabelProps: (): T["element"] => normalize.element({ ...parts.headerLabel.attrs }),
    getContentProps: (): T["element"] => normalize.element({ ...parts.content.attrs }),
    getSectionProps: (): T["element"] => normalize.element({ ...parts.section.attrs }),
    getSectionHeaderProps: (): T["element"] => normalize.element({ ...parts.sectionHeader.attrs }),
    getGroupProps: (): T["element"] => normalize.element({ ...parts.group.attrs, role: "list" }),
    getItemProps: (options: SidebarItemOptions = {}): T["element"] =>
      normalize.element({
        ...parts.item.attrs,
        "data-current": options.current === true ? "" : undefined,
      }),
    getLinkProps: (options: SidebarLinkOptions = {}): T["element"] => {
      const disabled = options.disabled === true;
      return normalize.element({
        ...parts.link.attrs,
        "aria-current": options.current === true ? "page" : undefined,
        "aria-disabled": disabled ? "true" : undefined,
        "data-current": options.current === true ? "" : undefined,
        "data-disabled": disabled ? "" : undefined,
        onClick(event) {
          if (disabled) event.preventDefault();
        },
      });
    },
    getLeadingProps: (): T["element"] => normalize.element({ ...parts.leading.attrs }),
    getLabelProps: (): T["element"] => normalize.element({ ...parts.label.attrs }),
    getTrailingProps: (): T["element"] => normalize.element({ ...parts.trailing.attrs }),
    getFooterProps: (): T["element"] => normalize.element({ ...parts.footer.attrs }),
    getFooterLabelProps: (): T["element"] => normalize.element({ ...parts.footerLabel.attrs }),
    getTriggerProps: (options: SidebarTriggerOptions = {}): T["button"] => {
      const open = options.open === true;
      return normalize.button({
        ...parts.trigger.attrs,
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": open ? "true" : "false",
        "data-presentation": presentation,
        "data-state": open ? "open" : "closed",
      });
    },
    getDrawerProps: (): T["element"] => normalize.element({ ...parts.drawer.attrs }),
  };
}
