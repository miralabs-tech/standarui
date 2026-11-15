/**
 * `<Menu items={…}/>` — the deepest composed layer in the library, and the only
 * one with a recursive branch: a submenu is a `<MenuRoot>` nested inside its
 * parent's content whose first child is a `<MenuTriggerItem>`, which is the shape
 * the part imposes and documents, so the layer walks the tree the consumer hands
 * it and writes that shape at every level.
 *
 * **Nothing here holds the collection.** `menu.tsx` opens on the invariant — "the
 * items are composition, never an `items` prop; the machine reads the live DOM" —
 * and mapping an array into `<MenuItem>` elements before the render does not
 * contradict it: no registry, no memo, no state. Five call sites can still be five
 * different lists; four of them can now be four arrays. That is the reference app's
 * `ContextMenu`, which is one hand-written surface repeated five times with
 * neither typeahead nor submenus.
 *
 * Three translations that are a11y defects if they are skipped, and one that is
 * merely a shape:
 *
 *  - **A group's `label` is the text here and a boolean flag on the part.**
 *    Passing the string through would be truthy, so `aria-labelledby` would be
 *    written and point at a label part nobody rendered — a dead IDREF and a
 *    nameless group at once. `id` is required on a group so the two ends meet.
 *  - **A row's `description` is the text here and a boolean flag on the part**,
 *    for exactly the same reason: `getItemProps` writes `aria-describedby` only
 *    when `description === true`, at an id derived from the row's value, so the
 *    text and the flag have to arrive together or neither should.
 *  - **A row's `label` is required** where the part leaves it optional. It is the
 *    typeahead text, the `data-label` *and* the words `MenuItemText` shows, and
 *    the composed layer is the only place all three come from.
 *  - **The checkmark cell is placed on checkable rows alone.** The gutter is a
 *    decision of the *surface*: the machine reads whether any row owns an
 *    `item-indicator` and reserves the leading track for every row when one does.
 *    An indicator on a plain `menuitem` would open that column in menus that have
 *    nothing to check.
 *
 * `cancelLabel` travels to `MenuContent`, which already withholds the Cancel row
 * outside the `sheet` presentation — the façade passes it, it does not
 * reimplement it. Selection comes back through `onSelect` on the root, never a
 * handler per row: the machine has that event and inventing a second name for it
 * would be a closure per line and a second truth about what was chosen.
 */

import type {
  MenuItemProps as CoreMenuItemProps,
  MenuOptionItemProps as CoreMenuOptionItemProps,
} from "@standarui/core/menu";
import type { ReactNode } from "react";
import type {
  ComposedDecoration,
  ComposedGroup,
  ComposedSeparator,
  ComposedTrigger,
} from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  MenuBackdrop,
  MenuContent,
  type MenuContentProps,
  MenuContextTrigger,
  MenuItem,
  MenuItemDescription,
  MenuItemGroup,
  MenuItemGroupLabel,
  type MenuItemGroupProps,
  MenuItemIndicator,
  MenuItemShortcut,
  MenuItemSymbol,
  MenuItemText,
  MenuOptionItem,
  MenuPortal,
  type MenuPortalProps,
  MenuPositioner,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  MenuTriggerItem,
  type UseMenuProps,
} from "./menu";

/**
 * A plain row: the part's own props — an intersection, never a `Pick`, so a field
 * added to `MenuItemProps` shows up here without anyone thinking about it — plus
 * the two fields no machine owns, with `label` narrowed to required and
 * `description` from a flag to its text (see the header for both).
 *
 * `shortcut` is the part's own field and is spent twice on purpose: it reaches
 * assistive technology as `aria-keyshortcuts` on the row and it is drawn by
 * `MenuItemShortcut`, which is `aria-hidden`, so the same string can never be
 * announced twice. A consumer who needs the announced form to differ from the
 * drawn one writes the parts.
 */
export type MenuAction<V extends string = string, Meta = never> = Omit<
  CoreMenuItemProps,
  "value" | "label" | "description"
> &
  ComposedDecoration<Meta> & {
    readonly value: V;
    readonly label: string;
    /** The iOS subtitle. Text here, a boolean flag plus a part on the row. */
    readonly description?: string | undefined;
  };

/**
 * A checkable or radio row. The checked state stays the consumer's, exactly as it
 * does on the part: a menu is a transient surface, and the value belongs to the
 * model behind it rather than to an overlay that unmounts.
 */
export type MenuCheckable<V extends string = string, Meta = never> = Omit<
  CoreMenuOptionItemProps,
  "value" | "label" | "description"
> &
  ComposedDecoration<Meta> & {
    readonly value: V;
    readonly label: string;
    readonly description?: string | undefined;
  };

/** Every entry that ends up as a `menu:item` — the two the escape hatch reaches. */
export type MenuRow<V extends string = string, Meta = never> =
  | MenuAction<V, Meta>
  | MenuCheckable<V, Meta>;

/**
 * The one recursive branch in the library, and the depth is the consumer's data.
 * `items` rather than `options` so the narrowing stays a single `in` test against
 * a group.
 */
export interface MenuSubmenu<V extends string = string, Meta = never> {
  readonly value: V;
  readonly label: string;
  /**
   * The nested machine's scope id, and the one field a group's `id` and this one
   * do not share a reason for. A group needs it or its `aria-labelledby` dangles;
   * a submenu without it is correct — `useMachine` mints one from React's own id
   * hook, and the server and the client agree on it. What it buys is what a
   * group's key buys: every id under this surface becomes the consumer's rather
   * than React's, which is what a server render has to match to the character.
   */
  readonly id?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly icon?: ReactNode;
  readonly items: readonly MenuEntry<V, Meta>[];
}

/**
 * Narrowed structurally, in this order: `"separator" in e`, then `"options" in e`
 * (a group), then `"items" in e` (a submenu), then `"type" in e` (a checkable
 * row), else a plain row. No `kind` field anywhere, and the collection names
 * differ on purpose so each test is one `in`.
 */
export type MenuEntry<V extends string = string, Meta = never> =
  | MenuRow<V, Meta>
  | MenuSubmenu<V, Meta>
  | ComposedGroup<MenuEntry<V, Meta>>
  | ComposedSeparator;

/**
 * The escape hatch, applied **last** on every part: the layer's own defaults are
 * defaults, and the consumer's entry wins over them.
 *
 * Sixteen keys: the fifteen parts of `menu.anatomy.ts` this layer places, plus
 * `portal` — which is no part at all but the React container the parts form wraps
 * the surface in. Two of the anatomy's seventeen are absent, because this layer
 * never places them: `indicator` is the chevron on a trigger whose content is the
 * consumer's own element, and `cancelTrigger` is placed by `MenuContent` itself
 * out of `cancelLabel`, which is where it has to stay — the part withholds
 * itself outside the `sheet` presentation and only the part knows that.
 */
export interface MenuParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly contextTrigger?: PartProps<"div"> | undefined;
  /** Reaches every surface in the tree, the root's and each submenu's. */
  readonly portal?: MenuPortalProps | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: MenuContentProps | undefined;
  /** Applied to EVERY group — `id` and `label` are the entry's, one per group. */
  readonly itemGroup?: Omit<MenuItemGroupProps, "id" | "label"> | undefined;
  readonly itemGroupLabel?: PartProps<"div"> | undefined;
  /**
   * Applied to EVERY row, hence no `id` **and no IDREF**: one id repeated down a
   * menu is a broken reference per row, and one `aria-labelledby` repeated gives
   * every row the same name — which no dangling-IDREF check can see, because the
   * id it points at does resolve. `ref` goes for the same reason: a single ref
   * held by N rows ends up holding the last one.
   */
  readonly item?:
    | Omit<
        PartProps<"div">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  /** Applied to EVERY submenu row, and repeated for the same reasons. */
  readonly triggerItem?:
    | Omit<
        PartProps<"div">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemSymbol?:
    | Omit<
        PartProps<"span">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemText?:
    | Omit<
        PartProps<"span">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemDescription?:
    | Omit<
        PartProps<"span">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemIndicator?:
    | Omit<
        PartProps<"span">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemShortcut?:
    | Omit<
        PartProps<"kbd">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly separator?: PartProps<"div"> | undefined;
}

export interface MenuComposedProps<V extends string = string, Meta = never> extends UseMenuProps {
  readonly items: readonly MenuEntry<V, Meta>[];
  /**
   * Handed to `MenuTrigger` as `render` — never as its children. The trigger *is*
   * a `<button>`, and a button inside a button is `nested-interactive`. Exactly
   * one of `trigger` and `contextTrigger`; the function's own signature refuses
   * both at once.
   */
  readonly trigger?: ComposedTrigger | undefined;
  /**
   * The region a right click, a long press, Shift+F10, the ≣ key or the pad's
   * `contextMenu` intent opens the surface from. Children rather than `render`,
   * because `MenuContextTrigger` is a plain container with no handler of its own
   * — the listeners are installed natively by the machine, since they have to be
   * listening while the surface is closed.
   *
   * A surface with neither anchor is legal and is the store-driven shape:
   * `open` on one side, `label` for the name the trigger would have given it.
   */
  readonly contextTrigger?: ReactNode;
  /**
   * The action sheet's Cancel row, handed straight to `MenuContent`, which
   * renders it in the `sheet` presentation and nowhere else. The library ships no
   * copy of its own; `null` is read as absent for the reason the part reads
   * `undefined` that way — `getCancelTriggerProps` writes no accessible name, so
   * an empty button would be a nameless one.
   */
  readonly cancelLabel?: ReactNode;
  /** Reaches every portal in the tree, so a submenu cannot escape its parent's host. */
  readonly container?: PortalProps["container"] | undefined;
  /** Keeps every surface in the tree mounted while closed; the sheet hides them. */
  readonly keepMounted?: boolean | undefined;
  /**
   * Replaces the CHILDREN of a row, never the row. `defaults` is what the layer
   * would have rendered — the checkmark cell on a checkable, the symbol, the
   * text, the subtitle, the shortcut — and it is handed over so that
   * **decorating** is the cheapest thing to do, not because replacing is
   * impossible. Rendering something else instead of `defaults` is the consumer's
   * to do and costs them the part that names the row (`MenuItemText`), the
   * checkmark, and the leading column those two share.
   *
   * Decorate as a **sibling** of `defaults`, never by wrapping it in an element:
   * a row's children are its grid cells (`_menu.scss`, `grid-template-columns` on
   * `menu:item`), each one placed by `grid-column`, so a wrapper takes all of
   * them out of the grid at once.
   *
   * Rows only. A group is not one, a separator is not one, and a submenu's
   * trigger item is not one either — it opens a surface rather than choosing, and
   * the sheet draws its chevron as a pseudo-element on the row itself.
   */
  readonly renderItem?: ((item: MenuRow<V, Meta>, defaults: ReactNode) => ReactNode) | undefined;
  readonly parts?: MenuParts | undefined;
}

/**
 * What every level of the tree needs and nothing else. Passed down rather than
 * closed over so the recursion stays a plain function: the module runs no hook,
 * which is what `scripts/composed-grammar.test.ts` reads it for.
 */
interface MenuTree<V extends string, Meta> {
  readonly parts: MenuParts | undefined;
  readonly container: PortalProps["container"] | undefined;
  readonly keepMounted: boolean | undefined;
  readonly render: ((item: MenuRow<V, Meta>, defaults: ReactNode) => ReactNode) | undefined;
  readonly inherited: MenuInherited;
}

/**
 * What every surface of the tree answers to, and the reason the recursion carries
 * it: each `MenuSubmenu` is its own machine, and `invokeOnSelect` reads the
 * `onSelect` of the machine that received the event. A nested root given only its
 * `id` therefore closed the tree and told the consumer nothing — `<Menu onSelect>`
 * never fired for a row chosen in a submenu, in flat contradiction of the promise
 * at the top of this module (audit of 2026-09-05).
 *
 * These are the props that describe how a menu *surface* behaves. What stays on
 * the root alone is what belongs to one surface: its `id`, its open state and the
 * callbacks around it, its focus props, `modal` and `preventScroll` (a submenu
 * inside a modal tree is already inside that layer; a second lock is not the same
 * request), and `preventOutsideActivation`, which the tree's outermost layer owns.
 */
type MenuInherited = Pick<
  UseMenuProps,
  | "onSelect"
  | "onHighlightChange"
  | "closeOnSelect"
  | "typeahead"
  | "loopFocus"
  | "submenuOpenDelay"
  | "submenuCloseDelay"
  | "selectionFlash"
>;

/**
 * One row. `icon` and `meta` are lifted out because the rest of the entry is
 * spread straight onto the part: `icon` belongs to a part of its own and `meta`
 * belongs to the consumer, and neither is an attribute of a `<div>`. `description`
 * is lifted for the third reason in the header — the part takes the flag, the
 * subtitle part takes the words.
 */
function renderRow<V extends string, Meta>(
  row: MenuRow<V, Meta>,
  tree: MenuTree<V, Meta>,
): ReactNode {
  const { parts, render } = tree;
  const defaults = (
    <>
      {"type" in row ? <MenuItemIndicator {...parts?.itemIndicator} /> : null}
      {row.icon === undefined ? null : (
        <MenuItemSymbol {...parts?.itemSymbol}>{row.icon}</MenuItemSymbol>
      )}
      <MenuItemText {...parts?.itemText}>{row.label}</MenuItemText>
      {row.description === undefined ? null : (
        <MenuItemDescription {...parts?.itemDescription}>{row.description}</MenuItemDescription>
      )}
      {row.shortcut === undefined ? null : (
        <MenuItemShortcut {...parts?.itemShortcut}>{row.shortcut}</MenuItemShortcut>
      )}
    </>
  );
  const children = render === undefined ? defaults : render(row, defaults);

  if ("type" in row) {
    const { icon, meta, description, ...item } = row;
    return (
      <MenuOptionItem
        key={row.value}
        {...item}
        description={description !== undefined}
        {...parts?.item}
      >
        {children}
      </MenuOptionItem>
    );
  }

  const { icon, meta, description, ...item } = row;
  return (
    <MenuItem key={row.value} {...item} description={description !== undefined} {...parts?.item}>
      {children}
    </MenuItem>
  );
}

/**
 * A submenu, written the way the part imposes: a nested `<MenuRoot>` whose first
 * child is the `<MenuTriggerItem>`, which is what puts both apis on one node —
 * the parent's item props and this menu's own trigger props, under one part
 * token. The surface below it is the root's own tree again, which is the whole
 * recursion.
 */
function renderSubmenu<V extends string, Meta>(
  entry: MenuSubmenu<V, Meta>,
  tree: MenuTree<V, Meta>,
): ReactNode {
  const { parts, container, keepMounted, inherited } = tree;

  return (
    <MenuRoot key={entry.value} id={entry.id} keepMounted={keepMounted} {...inherited}>
      <MenuTriggerItem
        value={entry.value}
        label={entry.label}
        disabled={entry.disabled}
        {...parts?.triggerItem}
      >
        {entry.icon === undefined ? null : (
          <MenuItemSymbol {...parts?.itemSymbol}>{entry.icon}</MenuItemSymbol>
        )}
        <MenuItemText {...parts?.itemText}>{entry.label}</MenuItemText>
      </MenuTriggerItem>
      <MenuPortal container={container} {...parts?.portal}>
        <MenuBackdrop {...parts?.backdrop} />
        <MenuPositioner {...parts?.positioner}>
          <MenuContent {...parts?.content}>
            {entry.items.map((child, at) => renderEntry(child, at, tree))}
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

function renderEntry<V extends string, Meta>(
  entry: MenuEntry<V, Meta>,
  index: number,
  tree: MenuTree<V, Meta>,
): ReactNode {
  const { parts } = tree;

  // A separator is not focusable, holds no state and has no subtree to unmount,
  // where an index on a row would move the focus mid-interaction — the collection
  // being the live DOM the machine reads.
  if ("separator" in entry) {
    return <MenuSeparator key={`sep:${index}`} {...parts?.separator} />;
  }
  if ("options" in entry) {
    return (
      <MenuItemGroup key={entry.id} id={entry.id} label {...parts?.itemGroup}>
        <MenuItemGroupLabel {...parts?.itemGroupLabel}>{entry.label}</MenuItemGroupLabel>
        {entry.options.map((child, at) => renderEntry(child, at, tree))}
      </MenuItemGroup>
    );
  }
  if ("items" in entry) return renderSubmenu(entry, tree);
  return renderRow(entry, tree);
}

export function Menu<V extends string = string, Meta = never>(
  props: MenuComposedProps<V, Meta> &
    ({ readonly contextTrigger?: undefined } | { readonly trigger?: undefined }),
): ReactNode {
  const {
    items,
    trigger,
    contextTrigger,
    cancelLabel,
    container,
    keepMounted,
    renderItem,
    parts,
    onSelect,
    onHighlightChange,
    closeOnSelect,
    typeahead,
    loopFocus,
    submenuOpenDelay,
    submenuCloseDelay,
    selectionFlash,
    ...root
  }: MenuComposedProps<V, Meta> = props;
  const inherited: MenuInherited = {
    onSelect,
    onHighlightChange,
    closeOnSelect,
    typeahead,
    loopFocus,
    submenuOpenDelay,
    submenuCloseDelay,
    selectionFlash,
  };
  const tree: MenuTree<V, Meta> = {
    parts,
    container,
    keepMounted,
    render: renderItem,
    inherited,
  };

  return (
    <MenuRoot {...root} {...inherited} keepMounted={keepMounted}>
      {trigger === undefined ? null : <MenuTrigger render={trigger} {...parts?.trigger} />}
      {contextTrigger == null ? null : (
        <MenuContextTrigger {...parts?.contextTrigger}>{contextTrigger}</MenuContextTrigger>
      )}
      <MenuPortal container={container} {...parts?.portal}>
        <MenuBackdrop {...parts?.backdrop} />
        <MenuPositioner {...parts?.positioner}>
          <MenuContent cancelLabel={cancelLabel ?? undefined} {...parts?.content}>
            {items.map((entry, index) => renderEntry(entry, index, tree))}
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}
