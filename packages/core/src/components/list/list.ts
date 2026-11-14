/**
 * The grouped list (row, section title, table footer), with no machine on `card`'s precedent: nothing here has
 * a state, an event or an id to derive, so `connect` takes the props directly.
 *
 * The group carries `role="list"`: WebKit drops the native role of a `ul` whose
 * style is `list-style: none`, so the role is written rather than left to the
 * element. The `li` keeps its native listitem semantics, and a row that acts does
 * so through its `action` part, which the consumer renders as the `a` or the
 * `button` that fits.
 */

import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";

export type ListPart =
  | "root"
  | "section"
  | "header"
  | "group"
  | "row"
  | "action"
  | "leading"
  | "title"
  | "subtitle"
  | "trailing"
  | "footer";

export const anatomy: Anatomy<ListPart> = createAnatomy("list").parts(
  "root",
  "section",
  "header",
  "group",
  "row",
  "action",
  "leading",
  "title",
  "subtitle",
  "trailing",
  "footer",
);

export const parts: Record<ListPart, AnatomyPart> = anatomy.build();

/** `inset` is the rounded group, `plain` the same group edge to edge. */
export type ListVariant = "inset" | "plain";

/** `regular` is 52 on touch, `tall` 68 and makes room for a subtitle. */
export type ListRowSize = "regular" | "tall";

export interface ListMachineProps {
  /** Defaults to `"inset"`. */
  readonly variant?: ListVariant | undefined;
}

/** `auto` draws the chevron on a row that has an action, `none` withdraws it. */
export type ListRowChevron = "auto" | "none";

export interface ListRowOptions {
  /** Defaults to `"regular"`. */
  readonly size?: ListRowSize | undefined;
  /** Defaults to `"auto"`. */
  readonly chevron?: ListRowChevron | undefined;
}

export interface ListApi<T extends PropTypes = PropTypes> {
  readonly variant: ListVariant;
  getRootProps(): T["element"];
  getSectionProps(): T["element"];
  getHeaderProps(): T["element"];
  getGroupProps(): T["element"];
  getRowProps(options?: ListRowOptions): T["element"];
  getActionProps(): T["element"];
  getLeadingProps(): T["element"];
  getTitleProps(): T["element"];
  getSubtitleProps(): T["element"];
  getTrailingProps(): T["element"];
  getFooterProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: ListMachineProps,
  normalize: NormalizeProps<T>,
): ListApi<T> {
  const variant = props.variant ?? "inset";

  return {
    variant,
    getRootProps: (): T["element"] =>
      normalize.element({ ...parts.root.attrs, "data-variant": variant }),
    getSectionProps: (): T["element"] => normalize.element({ ...parts.section.attrs }),
    getHeaderProps: (): T["element"] => normalize.element({ ...parts.header.attrs }),
    getGroupProps: (): T["element"] => normalize.element({ ...parts.group.attrs, role: "list" }),
    getRowProps: (options: ListRowOptions = {}): T["element"] =>
      normalize.element({
        ...parts.row.attrs,
        "data-size": options.size ?? "regular",
        ...(options.chevron === "none" ? { "data-chevron": "none" } : {}),
      }),
    getActionProps: (): T["element"] => normalize.element({ ...parts.action.attrs }),
    getLeadingProps: (): T["element"] => normalize.element({ ...parts.leading.attrs }),
    getTitleProps: (): T["element"] => normalize.element({ ...parts.title.attrs }),
    getSubtitleProps: (): T["element"] => normalize.element({ ...parts.subtitle.attrs }),
    getTrailingProps: (): T["element"] => normalize.element({ ...parts.trailing.attrs }),
    getFooterProps: (): T["element"] => normalize.element({ ...parts.footer.attrs }),
  };
}
