/**
 * The menu in React: the popover's shape — a root that renders no element, a
 * portalled surface, two presences — plus the two things no overlay before it had.
 *
 * **A collection.** The items are composition, never a `items` prop (parity M1):
 * five call sites, five different lists. Nothing here holds them; the machine reads
 * the live DOM, and an item only has to publish its own value to its own parts.
 *
 * **A tree.** A submenu is a `<MenuRoot>` nested inside its parent's content, and
 * the two services have to know each other — the parent to aim, open and close its
 * child, the child to walk back up on `TREE.CLOSE`. The core makes that wiring two
 * events and says where it belongs ("call from an adapter effect, never during
 * render"), so it lives here, in `useMenuTree` and `claimChild`.
 *
 * Both hooks are keyed on **services**, never on apis: an api object is rebuilt on
 * every render, but every method on it sends into a service whose identity never
 * changes — so an api captured by an effect stays as good as the day it was made.
 */

import { type AnyProps, invariant, mergeProps, type Service } from "@standarui/core";
import * as menu from "@standarui/core/menu";
import { type ReactNode, type Ref, useId, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { LayerProvider, useParentLayerId } from "../../layer-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { Portal, type PortalProps } from "../../portal";
import { type PresenceApi, usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";
import { useSafeLayoutEffect } from "../../use-safe-layout-effect";

export type MenuApi = menu.MenuApi<ReactPropTypes>;

export interface UseMenuProps extends menu.MenuMachineProps, MachineRuntimeProps {}

interface MenuContextValue {
  readonly api: MenuApi;
  readonly service: Service<menu.MenuSchema>;
  /**
   * The menu this one drills out of, and the adapter's only truth about being a
   * submenu. The machine's `isSubmenu` cannot be it: `parentId` also carries the
   * layer a menu was opened *from*, and a dialog is not a parent menu.
   */
  readonly parent: MenuContextValue | null;
  readonly keepMounted: boolean;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

/** An item publishes its identity so its parts do not have to repeat it. */
interface MenuItemContextValue {
  readonly value: string;
  readonly checked: boolean | undefined;
}

const MenuContext = createPartContext<MenuContextValue>("Menu");
const MenuItemContext = createPartContext<MenuItemContextValue>("Menu");
const MenuGroupContext = createPartContext<string>("Menu");

function useMenuService(
  props: UseMenuProps,
  parent: MenuContextValue | null,
): Service<menu.MenuSchema> {
  const parentLayerId = useParentLayerId();
  const host = useIntentScopeHost();

  return useMachine(menu.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // surface answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    parentId: props.parentId ?? parentLayerId,
    // A menu opened from inside another surface carries that surface's layer id so
    // the dismissable stack chains — but being inside a dialog does not make it a
    // submenu, and the machine's placement fallback has only `parentId` to go on.
    // React knows better: a submenu is a menu nested in another *menu's* context,
    // so the root case states its half of the fallback rather than inheriting
    // `right-start` from a layer that happens to exist.
    placement: props.placement ?? (parent === null ? "bottom-start" : undefined),
  });
}

/**
 * The machine on its own, for a consumer who would rather write the markup than
 * compose the parts. Nested inside another menu it wires itself up like `MenuRoot`
 * does — the parent is read from the same context either way.
 */
export function useMenu(props: UseMenuProps): MenuApi {
  const parent = MenuContext.useOptional();
  const service = useMenuService(props, parent);
  const api = menu.connect(service, normalizeProps);
  useMenuTree(api, service, parent);
  return api;
}

export function useMenuContext(): MenuApi {
  return MenuContext.usePart("MenuContext").api;
}

/**
 * The two links between a submenu and its parent. In an effect because both are
 * events: sending one while React renders would run somebody else's transition
 * mid-pass.
 *
 * Only the parent's half is undone. By the time this cleanup runs, this service is
 * already stopped — `useMachine` registered its own cleanup first — so telling it
 * to forget a parent would be an event sent to a dead machine. What has to be
 * cleared is the *parent's* reference to a child that no longer exists, and only
 * when it is still ours: a sibling may have taken the slot.
 */
function useMenuTree(
  api: MenuApi,
  service: Service<menu.MenuSchema>,
  parent: MenuContextValue | null,
): void {
  const parentService = parent?.service ?? null;

  // The two services and nothing else. Keying this on the apis would re-run it on
  // every render, and re-running it is not free: the effect would hand the slot
  // back to itself after a sibling had rightfully claimed it (`claimChild` below).
  useSafeLayoutEffect(() => {
    if (parent === null || parentService === null) return;
    api.setParent(parentService);
    parent.api.setChild(service);
    return () => {
      // React unmounts a deletion from the top down, so the parent is usually gone
      // before this runs — and an event sent to a stopped service is a dev warning
      // about nothing. What matters is the case where the parent outlives us.
      if (parentService.status() !== "started") return;
      if (parentService.refs.get("child") === service) parent.api.setChild(null);
    };
  }, [service, parentService]);
}

/**
 * Hand this submenu its parent's one child slot.
 *
 * The machine holds a single child, so a menu with two submenus has to pass the
 * slot along as the highlight moves — otherwise hovering the first trigger item
 * opens the second submenu, anchored to a node the pointer is nowhere near.
 * Handing it over also has to close whatever was in it: once the slot is gone
 * nothing holds that service any more, and it would stay open with no way back.
 *
 * Driven by the parent's own highlight rather than by the pointer, which is what
 * keeps the safe triangle intact: a pointer cutting across this item towards an
 * already-open sibling never moves the highlight, so it never takes the slot.
 *
 * `CHILD.CLOSE` is sent only while a child is actually open — with none, the
 * parent reads the very same event as `back` and closes *itself*.
 */
function claimChild(parent: MenuContextValue, child: Service<menu.MenuSchema>): void {
  const current = parent.service.refs.get("child");
  if (current === child) return;
  if (current?.context.get("open") === true) parent.service.send({ type: "CHILD.CLOSE" });
  parent.api.setChild(child);
}

export interface MenuRootProps extends UseMenuProps {
  readonly keepMounted?: boolean | undefined;
  readonly children?: ReactNode;
}

export function MenuRoot(props: MenuRootProps): ReactNode {
  const { children, keepMounted, ...machineProps } = props;
  const parent = MenuContext.useOptional();
  const service = useMenuService(machineProps, parent);
  const api = menu.connect(service, normalizeProps);
  const { motion } = useEnvironment();
  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const immediate = motion === "none";

  // Two presences: the scrim and the surface run different exits, and one presence
  // can only measure the animations of the node it holds.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  useMenuTree(api, service, parent);

  const value: MenuContextValue = {
    api,
    service,
    parent,
    keepMounted: keepMounted === true,
    backdrop,
    content,
  };

  return (
    <LayerProvider layerId={menu.getContentId(service.scope)}>
      <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence: the
 * interpreter installs the open state's effects in the layout effect of the very
 * commit that opened it, and every one of them looks the surface up by id. The
 * presence only ever extends the mount past the close.
 */
function isMounted(context: MenuContextValue, presence: PresenceApi): boolean {
  return context.keepMounted || context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const MenuTrigger: (props: PartProps<"button">) => ReactNode = createPart(MenuContext, {
  name: "MenuTrigger",
  element: "button",
  props: (context) => context.api.getTriggerProps(),
});

/**
 * Any container, and it carries no handler of its own: the `contextmenu` listener
 * and the long press are installed natively by the machine, because they have to
 * be listening while the surface is closed.
 */
export const MenuContextTrigger: (props: PartProps<"div">) => ReactNode = createPart(MenuContext, {
  name: "MenuContextTrigger",
  element: "div",
  props: (context) => context.api.getContextTriggerProps(),
});

/** The chevron on the trigger. Decoration — `aria-hidden`, no name of its own. */
export const MenuIndicator: (props: PartProps<"span">) => ReactNode = createPart(MenuContext, {
  name: "MenuIndicator",
  element: "span",
  props: (context) => context.api.getIndicatorProps(),
});

export interface MenuPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function MenuPortal(props: MenuPortalProps): ReactNode {
  const { children, disabled, ...portalProps } = props;
  const context = MenuContext.usePart("MenuPortal");
  const present = isMounted(context, context.backdrop) || isMounted(context, context.content);

  // A submenu in the `sheet` presentation is drilled in, not cascaded: its surface
  // is stacked inside its parent's. That is also what lets the machine tell the two
  // item lists apart — `getItemEls` stops at the nearest `content` — so portalling
  // it would hand the parent's roving list a second menu's items.
  const drillIn = context.parent !== null && context.api.presentation === "sheet";

  if (!present) return null;
  return (
    <Portal {...portalProps} disabled={disabled ?? drillIn}>
      {children}
    </Portal>
  );
}

/**
 * The scrim, and the sheet's alone (spec §3). An anchored menu that dimmed the page
 * would swallow the very click that is meant to dismiss it, and a scrim left in the
 * tree for CSS to hide is still a full-page surface catching pointers.
 */
export function MenuBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = MenuContext.usePart("MenuBackdrop");
  const composed = usePresenceRef(context.backdrop, ref);

  // Rendered then discarded rather than returned early: `useRender` is a hook, and
  // a density flip must not change how many of them this component runs.
  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getBackdropProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  if (context.api.presentation !== "sheet") return null;
  return isMounted(context, context.backdrop) ? element : null;
}

export function MenuPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = MenuContext.usePart("MenuPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  return isMounted(context, context.content) ? element : null;
}

export interface MenuContentProps extends PartProps<"div"> {
  /**
   * The action sheet's Cancel button, rendered for you (components.md §3-1): pass
   * the word and the part appears in the `sheet` presentation and nowhere else.
   * Left out, nothing is added — the library ships no copy of its own, and a
   * nameless button is worse than none (the machine warns about one in dev).
   */
  readonly cancelLabel?: ReactNode;
}

/**
 * The scroll affordance, and the reason it is two nodes the adapter writes rather
 * than a part or a pseudo-element.
 *
 * Not a part: nothing composes into it, nothing is rendered inside it, and the
 * anatomy is the list of what a consumer can reach. It is decoration the surface
 * owes itself, like the submenu chevron and the glass rim — both of which are
 * pseudo-elements, and both of which are why these cannot be: `::before` is the
 * rim already, and one `::after` cannot be at two edges at once.
 *
 * They must be the **outermost** children on both sides: the top band is what the
 * first row slides under, and the bottom band has to cover the sheet's Cancel row,
 * which is still inside the scroller.
 */
const SCROLL_EDGES = {
  up: <div data-scroll-edge="up" aria-hidden="true" />,
  down: <div data-scroll-edge="down" aria-hidden="true" />,
};

export function MenuContent(props: MenuContentProps): ReactNode {
  const { render, asChild, children, cancelLabel, ref, ...elementProps } = props;
  const context = MenuContext.usePart("MenuContent");
  const composed = usePresenceRef(context.content, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children: (
      <>
        {SCROLL_EDGES.up}
        {children}
        {cancelLabel === undefined ? null : <MenuCancelTrigger>{cancelLabel}</MenuCancelTrigger>}
        {SCROLL_EDGES.down}
      </>
    ),
  });

  return isMounted(context, context.content) ? element : null;
}

export interface MenuItemGroupProps extends PartProps<"div", menu.MenuItemGroupProps> {
  /** Any stable key of the consumer's; a `useId()` when they have none. */
  readonly id?: string | undefined;
  /**
   * **A flag, not the text.** Say `label` when the group renders a
   * `MenuItemGroupLabel`, and `aria-labelledby` is wired to it. Left out, the
   * group carries no reference at all — which is deliberate: written blind, the
   * attribute points at an element nobody rendered, and a group with a dead IDREF
   * has no accessible name *and* nothing to report it, since axe grades that
   * `incomplete` rather than a violation. Same shape as `description` on an item.
   */
  readonly label?: boolean | undefined;
  /** `horizontal` is reserved for the iOS Control Group, out of scope for v1. */
  readonly orientation?: "vertical" | "horizontal" | undefined;
}

export function MenuItemGroup(props: MenuItemGroupProps): ReactNode {
  const [group, rest] = splitProps(props, ["id", "label", "orientation"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = MenuContext.usePart("MenuItemGroup");
  const fallback = useId();
  // Published so the label does not have to repeat it — the two ids are derived
  // from the same key, which is the whole of `aria-labelledby` here.
  const key = group.id ?? fallback;

  return (
    <MenuGroupContext.Provider value={key}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getItemGroupProps({
          id: key,
          label: group.label,
          orientation: group.orientation,
        }),
        elementProps,
        children,
      })}
    </MenuGroupContext.Provider>
  );
}

export function MenuItemGroupLabel(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = MenuContext.usePart("MenuItemGroupLabel");
  const htmlFor = MenuGroupContext.usePart("MenuItemGroupLabel");

  return useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getItemGroupLabelProps({ htmlFor }),
    elementProps,
    children,
  });
}

const ITEM_KEYS = [
  "value",
  "disabled",
  "destructive",
  "label",
  "closeOnSelect",
  "shortcut",
  "description",
] as const;

const OPTION_KEYS = [...ITEM_KEYS, "type", "checked", "onCheckedChange"] as const;

export interface MenuItemProps extends menu.MenuItemProps, PartProps<"div", menu.MenuItemProps> {}

export function MenuItem(props: MenuItemProps): ReactNode {
  const [item, rest] = splitProps(props, ITEM_KEYS);
  const { render, asChild, children, ...elementProps } = rest;
  const context = MenuContext.usePart("MenuItem");

  return (
    <MenuItemContext.Provider value={{ value: item.value, checked: undefined }}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getItemProps(item),
        elementProps,
        children,
      })}
    </MenuItemContext.Provider>
  );
}

export interface MenuOptionItemProps
  extends menu.MenuOptionItemProps,
    PartProps<"div", menu.MenuOptionItemProps> {}

/**
 * Checkable and radio items, and the checked state stays the consumer's — the menu
 * reports the flip and never stores it. A transient surface is the wrong place for
 * a value the app already owns.
 */
export function MenuOptionItem(props: MenuOptionItemProps): ReactNode {
  const [item, rest] = splitProps(props, OPTION_KEYS);
  const { render, asChild, children, ...elementProps } = rest;
  const context = MenuContext.usePart("MenuOptionItem");

  return (
    <MenuItemContext.Provider value={{ value: item.value, checked: item.checked }}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getOptionItemProps(item),
        elementProps,
        children,
      })}
    </MenuItemContext.Provider>
  );
}

export interface MenuTriggerItemProps
  extends menu.MenuItemProps,
    PartProps<"div", menu.MenuItemProps> {}

/**
 * The item that opens a submenu — written **inside** the nested `<MenuRoot>`, which
 * is what puts both apis within reach: the parent's item props and this menu's own
 * trigger props land on one node, under one part token.
 */
export function MenuTriggerItem(props: MenuTriggerItemProps): ReactNode {
  const [item, rest] = splitProps(props, ITEM_KEYS);
  const { render, asChild, children, ...elementProps } = rest;
  const context = MenuContext.usePart("MenuTriggerItem");
  const { parent, service } = context;
  const parentService = parent?.service ?? null;
  const isCurrent = parent !== null && parent.api.highlightedValue === item.value;

  useSafeLayoutEffect(() => {
    if (parent === null || !isCurrent) return;
    claimChild(parent, service);
  }, [parentService, isCurrent, service]);

  invariant(parent !== null, "<MenuTriggerItem> must be rendered inside a nested <MenuRoot>");

  return useRender({
    render,
    asChild,
    element: "div",
    props: parent.api.getTriggerItemProps(context.api, item),
    // The claim again, ahead of the machine's own click: a tap never produces the
    // `pointermove` that moves the highlight, so touch would otherwise open
    // whichever sibling happened to mount last.
    elementProps: mergeProps(
      { onClick: () => claimChild(parent, service) },
      elementProps as AnyProps,
    ),
    children,
  });
}

/**
 * The reserved symbol column — a reserved symbol space. Give it an
 * inline SVG, never a text glyph: text stands on its font's baseline inside the
 * centred line box, so its ink paints below the box's centre while an SVG's
 * viewBox fills the square.
 */
export const MenuItemSymbol: (props: PartProps<"span">) => ReactNode = createPart(MenuContext, {
  name: "MenuItemSymbol",
  element: "span",
  props: (context) => context.api.getItemSymbolProps(),
});

/** The item's accessible name. */
export const MenuItemText: (props: PartProps<"span">) => ReactNode = createPart(MenuContext, {
  name: "MenuItemText",
  element: "span",
  props: (context) => context.api.getItemTextProps(),
});

/** Decoration: the shortcut reaches assistive tech as `aria-keyshortcuts`. */
export const MenuItemShortcut: (props: PartProps<"kbd">) => ReactNode = createPart(MenuContext, {
  name: "MenuItemShortcut",
  element: "kbd",
  props: (context) => context.api.getItemShortcutProps(),
});

export const MenuSeparator: (props: PartProps<"div">) => ReactNode = createPart(MenuContext, {
  name: "MenuSeparator",
  element: "div",
  props: (context) => context.api.getSeparatorProps(),
});

function createItemPart(
  name: string,
  getter: (api: MenuApi, item: MenuItemContextValue) => object,
): (props: PartProps<"span">) => ReactNode {
  return function ItemPart(props: PartProps<"span">): ReactNode {
    const { render, asChild, children, ...elementProps } = props;
    const context = MenuContext.usePart(name);
    const item = MenuItemContext.usePart(name);

    return useRender({
      render,
      asChild,
      element: "span",
      props: getter(context.api, item),
      elementProps,
      children,
    });
  };
}

/** The iOS subtitle; referenced by the item's `aria-describedby`. */
export const MenuItemDescription: (props: PartProps<"span">) => ReactNode = createItemPart(
  "MenuItemDescription",
  (api, item) => api.getItemDescriptionProps({ value: item.value }),
);

/**
 * The checkmark. The state is `aria-checked` on the item, never this glyph — and
 * like the symbol it takes an inline SVG, not a `✓` character, whose baseline
 * would sink the ink below the centre the symbols share.
 */
export const MenuItemIndicator: (props: PartProps<"span">) => ReactNode = createItemPart(
  "MenuItemIndicator",
  (api, item) => api.getItemIndicatorProps({ checked: item.checked }),
);

/**
 * The sheet's Cancel row, and only the sheet's: a desktop menu has none, and one
 * left in the tree for CSS to hide would still be a focusable control in the tab
 * order of a surface that never shows it.
 */
export function MenuCancelTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = MenuContext.usePart("MenuCancelTrigger");

  const element = useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getCancelTriggerProps(),
    elementProps,
    children,
  });

  return context.api.presentation === "sheet" ? element : null;
}
