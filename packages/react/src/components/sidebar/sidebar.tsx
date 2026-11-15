/**
 * The sidebar in React: no machine, a prop-getter per part, and one part that is
 * not a plain element, `SidebarDrawer`.
 *
 * **The inline column and the drawer are the same markup rendered twice**, and
 * the choice between them is made by the stylesheet so the first paint is right
 * before any effect has run. What React adds is what a stylesheet cannot do:
 * closing the drawer when a link is followed, and closing it when an `auto`
 * sidebar finds itself on a desktop density again.
 *
 * `SidebarDrawer` is a co-identity laid on the dialog's content, the way
 * `DrawerContent` is. It reads the dialog's context, so it belongs inside a
 * `DialogRoot`, and that is also why the trigger is a separate part: a
 * `DialogRoot` wrapped around the whole shell would make every popover, menu and
 * dialog of the app a child layer of this one (`DialogRoot` provides a
 * `LayerProvider`).
 */

import { isDev, resolveEnvironment, trackEnvironment, warn } from "@standarui/core";
import * as sidebar from "@standarui/core/sidebar";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { composeRefs } from "../../compose-refs";
import type { PartProps } from "../../create-part";
import { focusElement } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { splitProps } from "../../split-props";
import { useInputModality } from "../../use-input-modality";
import { useRender } from "../../use-render";
import { CollapsibleRoot, type CollapsibleRootProps } from "../collapsible/collapsible";
import { useDialogContext } from "../dialog/dialog";

export type SidebarApi = sidebar.SidebarApi<ReactPropTypes>;

export function useSidebar(props: sidebar.SidebarMachineProps): SidebarApi {
  return sidebar.connect(props, normalizeProps);
}

const api: SidebarApi = sidebar.connect({}, normalizeProps);

export interface SidebarRootProps
  extends sidebar.SidebarMachineProps,
    sidebar.SidebarRootOptions,
    PartProps<"nav", sidebar.SidebarMachineProps> {}

const PlacementContext = createContext<sidebar.SidebarPlacement>("inline");

const ColumnContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * Hands the drawer the inline column it belongs to. The two are siblings, so
 * nothing in the tree says which column goes with which drawer; this is what
 * does, and `<Sidebar>` places it around both. A drawer written in parts without
 * it falls back on a column of its own name, then on the trigger.
 */
export function SidebarScope(props: { readonly children?: ReactNode }): ReactNode {
  const column = useRef<HTMLElement | null>(null);

  return <ColumnContext value={column}>{props.children}</ColumnContext>;
}

const SIDEBAR_TRIGGER = '[data-part~="sidebar:trigger"]';

function visibleTrigger(doc: Document): HTMLElement | null {
  const triggers = doc.querySelectorAll<HTMLElement>(SIDEBAR_TRIGGER);
  return [...triggers].find((trigger) => trigger.getClientRects().length > 0) ?? null;
}

function followFocusToTrigger(root: HTMLElement): VoidFunction {
  const doc = root.ownerDocument;
  return trackEnvironment(root, {
    onChange(environment) {
      if (environment.density !== "touch" || !root.contains(doc.activeElement)) return;
      const trigger = visibleTrigger(doc);
      if (trigger !== null) focusElement(trigger);
    },
  });
}

export function SidebarRoot(props: SidebarRootProps): ReactNode {
  const [ownProps, rest] = splitProps(props, ["label", "presentation", "placement"] as const);
  const { render, asChild, children, ref, ...elementProps } = rest;
  const node = useRef<HTMLElement | null>(null);
  const placement = ownProps.placement ?? "inline";
  const scope = useContext(ColumnContext);
  const chained = useMemo(
    () => composeRefs<HTMLElement>(node, ref, placement === "inline" ? scope : null),
    [ref, scope, placement],
  );
  const follows = placement === "inline" && (ownProps.presentation ?? "auto") === "auto";
  useInputModality(node);

  useEffect(() => {
    if (!follows || node.current === null) return;
    return followFocusToTrigger(node.current);
  }, [follows]);

  return useRender({
    render,
    asChild,
    element: "nav",
    props: useSidebar(ownProps).getRootProps({ placement: ownProps.placement }),
    elementProps: { ...elementProps, ref: chained },
    children: <PlacementContext value={placement}>{children}</PlacementContext>,
  });
}

export function SidebarDisclosure(props: CollapsibleRootProps): ReactNode {
  const placement = useContext(PlacementContext);
  const id = placement === "drawer" && props.id !== undefined ? `${props.id}:drawer` : props.id;

  return <CollapsibleRoot {...props} id={id} />;
}

export function SidebarHeader(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getHeaderProps(),
    elementProps,
    children,
  });
}

/** The text of the header: a rail hides it from the eye and keeps it in the tree. */
export function SidebarHeaderLabel(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getHeaderLabelProps(),
    elementProps,
    children,
  });
}

export function SidebarContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getContentProps(),
    elementProps,
    children,
  });
}

export function SidebarSection(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getSectionProps(),
    elementProps,
    children,
  });
}

export function SidebarSectionHeader(props: PartProps<"h3">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "h3",
    props: api.getSectionHeaderProps(),
    elementProps,
    children,
  });
}

export function SidebarGroup(props: PartProps<"ul">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "ul",
    props: api.getGroupProps(),
    elementProps,
    children,
  });
}

export interface SidebarItemProps
  extends sidebar.SidebarItemOptions,
    PartProps<"li", sidebar.SidebarItemOptions> {}

export function SidebarItem(props: SidebarItemProps): ReactNode {
  const [ownProps, rest] = splitProps(props, ["current"] as const);
  const { render, asChild, children, ...elementProps } = rest;

  return useRender({
    render,
    asChild,
    element: "li",
    props: api.getItemProps(ownProps),
    elementProps,
    children,
  });
}

export interface SidebarLinkProps
  extends sidebar.SidebarLinkOptions,
    PartProps<"a", sidebar.SidebarLinkOptions> {}

export function SidebarLink(props: SidebarLinkProps): ReactNode {
  const [ownProps, rest] = splitProps(props, ["current", "disabled"] as const);
  const { render, asChild, children, ...elementProps } = rest;

  return useRender({
    render,
    asChild,
    element: "a",
    props: api.getLinkProps(ownProps),
    elementProps,
    children,
  });
}

export function SidebarLeading(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getLeadingProps(),
    elementProps,
    children,
  });
}

export function SidebarLabel(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getLabelProps(),
    elementProps,
    children,
  });
}

export function SidebarTrailing(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getTrailingProps(),
    elementProps,
    children,
  });
}

export function SidebarFooter(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getFooterProps(),
    elementProps,
    children,
  });
}

/** The text of the footer: a rail hides it from the eye and keeps it in the tree. */
export function SidebarFooterLabel(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getFooterLabelProps(),
    elementProps,
    children,
  });
}

export interface SidebarTriggerOwnProps
  extends Pick<sidebar.SidebarMachineProps, "presentation">,
    sidebar.SidebarTriggerOptions {}

export interface SidebarTriggerProps
  extends SidebarTriggerOwnProps,
    PartProps<"button", SidebarTriggerOwnProps> {}

export function SidebarTrigger(props: SidebarTriggerProps): ReactNode {
  const [ownProps, rest] = splitProps(props, ["presentation", "open"] as const);
  const { render, asChild, children, ref, ...elementProps } = rest;
  const node = useRef<HTMLElement | null>(null);
  const chained = useMemo(() => composeRefs<HTMLElement>(node, ref), [ref]);

  useEffect(() => {
    const element = node.current;
    warn(
      isDev() &&
        element !== null &&
        element.textContent?.trim() === "" &&
        !["aria-label", "aria-labelledby", "title"].some((name) => element.hasAttribute(name)),
      "a sidebar trigger has no accessible name — give it text, `aria-label` or `title`",
    );
  }, []);

  return useRender({
    render,
    asChild,
    element: "button",
    props: useSidebar(ownProps).getTriggerProps({ open: ownProps.open }),
    elementProps: { ...elementProps, ref: chained },
    children,
  });
}

export interface SidebarDrawerProps extends PartProps<"div"> {
  /** Defaults to `"auto"`, the only presentation that closes the drawer by itself. */
  readonly presentation?: sidebar.SidebarPresentation | undefined;
}

export function drawerInitialFocus(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-part~="sidebar:drawer"] [aria-current="page"]');
}

function namedColumn(doc: Document, name: string | null): HTMLElement | null {
  if (name === null) return null;
  const columns = doc.querySelectorAll<HTMLElement>(
    '[data-part~="sidebar:root"][data-placement="inline"]',
  );
  return [...columns].find((column) => column.getAttribute("aria-label") === name) ?? null;
}

function ownColumn(
  scope: RefObject<HTMLElement | null> | null,
  doc: Document,
  name: string | null,
): HTMLElement | null {
  const own = scope?.current;
  return own?.isConnected ? own : namedColumn(doc, name);
}

function currentLink(column: HTMLElement | null): HTMLElement | null {
  const link = column?.querySelector<HTMLElement>(
    '[aria-current="page"], [data-part~="sidebar:link"]',
  );
  return link != null && link.getClientRects().length > 0 ? link : null;
}

function environmentAnchor(doc: Document, column: HTMLElement | null): HTMLElement {
  return column ?? visibleTrigger(doc) ?? doc.documentElement;
}

function focusIsLost(doc: Document, surface: HTMLElement): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body || surface.contains(active);
}

/**
 * Composed onto the dialog's content with `render`. A click that lands on a link
 * closes the drawer: a client-side navigation unmounts nothing, so the drawer
 * would otherwise stay over the page it just led to. A disabled link, which
 * cancels its own activation, leaves it open, and so does a click that asks for
 * something else than a navigation here (a modifier, a button other than the
 * main one).
 *
 * Under `auto` the drawer also leaves when the density is desktop, whether it was
 * opened under one or the density turned while it was open. The environment is
 * read where the sidebar lives in the page, not from the drawer, which is
 * portalled out of any subtree that sets a density: from the inline column
 * `SidebarScope` ties it to, else from the inline column of the same name, else from
 * the visible trigger, else from the document element.
 * `useEnvironment()` would read `desktop` in an app without a provider and close
 * every drawer on mount.
 *
 * The focus goes back where it came from, which the dialog remembers; what it
 * cannot place, the part does. WebKit does not focus a button a pointer pressed,
 * so nothing was remembered: the visible trigger takes it. A density that closes
 * the drawer hides the trigger, and the column that replaces the drawer takes it
 * on its current link.
 */
export function SidebarDrawer(props: SidebarDrawerProps): ReactNode {
  const { render, asChild, children, ref, presentation, onClick, ...elementProps } = props;
  const dialog = useDialogContext();
  const scope = useContext(ColumnContext);
  const node = useRef<HTMLElement | null>(null);
  const chained = useMemo(() => composeRefs<HTMLElement>(node, ref), [ref]);
  const close = useRef(dialog.setOpen);
  close.current = dialog.setOpen;
  const leftForDesktop = useRef(false);
  const open = dialog.open;
  const follows = (presentation ?? "auto") === "auto";

  useEffect(() => {
    const element = node.current;
    if (!open || element === null) return;
    const doc = element.ownerDocument;
    const column = ownColumn(scope, doc, element.getAttribute("aria-label"));

    const duplicated = [...element.querySelectorAll("[id]")].find(
      (candidate) => doc.getElementById(candidate.id) !== candidate,
    );
    warn(
      isDev() && duplicated !== undefined,
      `a sidebar writes its children twice while the drawer is open, and the id "${duplicated?.id}" is in both — leave the ids out of them`,
    );

    return () => {
      if (leftForDesktop.current) {
        leftForDesktop.current = false;
        const link = currentLink(column);
        if (link !== null) focusElement(link);
        return;
      }
      if (!focusIsLost(doc, element)) return;
      const trigger = visibleTrigger(doc);
      if (trigger !== null) focusElement(trigger);
    };
  }, [open, scope]);

  useEffect(() => {
    const element = node.current;
    if (!open || !follows || element === null) return;
    const doc = element.ownerDocument;
    const anchor = environmentAnchor(
      doc,
      ownColumn(scope, doc, element.getAttribute("aria-label")),
    );
    const leave = (): void => {
      leftForDesktop.current = true;
      close.current(false);
    };
    if (resolveEnvironment(anchor).density === "desktop") {
      leave();
      return;
    }
    return trackEnvironment(anchor, {
      onChange(environment) {
        if (environment.density === "desktop") leave();
      },
    });
  }, [open, follows, scope]);

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getDrawerProps(),
    elementProps: {
      ...elementProps,
      ref: chained,
      onClick(event: MouseEvent<HTMLDivElement>) {
        onClick?.(event);
        const plain =
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey;
        const link = (event.target as Element).closest('[data-part~="sidebar:link"]');
        if (plain && link !== null && link.getAttribute("aria-disabled") !== "true") {
          close.current(false);
        }
      },
    },
    children,
  });
}
