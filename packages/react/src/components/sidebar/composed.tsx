/**
 * `<Sidebar label="…">` — the column and the drawer it folds into, written once.
 *
 * It renders the inline `SidebarRoot` and, next to it, a dialog with an `edge="start"`
 * drawer that is mounted only while open and holds a second `SidebarRoot` of the
 * same children. Which of the two is on screen is the stylesheet's call, so the
 * markup is the same on the server and on the client whatever the density.
 *
 * **The trigger is not here.** `DialogRoot` provides a layer to everything under it,
 * so one wrapped around a shell would turn every popover and menu of the app into a
 * child of the drawer. The app places `SidebarTrigger` where it wants it and passes
 * `open` down: this component takes the controlled `open` and the usual
 * `onOpenChange`.
 *
 * The children are rendered in both copies, so an `id` written in them would be
 * repeated while the drawer is open.
 */

import { isDev, warn } from "@standarui/core";
import type { SidebarMachineProps } from "@standarui/core/sidebar";
import type { ReactNode } from "react";
import type { ComposedTrigger } from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleTrigger,
  type UseCollapsibleProps,
} from "../collapsible/collapsible";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
} from "../dialog/dialog";
import { DrawerBackdrop, DrawerContent, DrawerPositioner, DrawerRoot } from "../drawer/drawer";
import {
  drawerInitialFocus,
  SidebarContent,
  SidebarDisclosure,
  SidebarDrawer,
  SidebarFooter,
  SidebarFooterLabel,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarItem,
  SidebarLabel,
  SidebarLeading,
  SidebarLink,
  SidebarRoot,
  SidebarScope,
  SidebarSection,
  SidebarSectionHeader,
  SidebarTrailing,
} from "./sidebar";

export interface SidebarParts {
  readonly header?: PartProps<"div"> | undefined;
  /** Placed when `header` is a string or a number. */
  readonly headerLabel?: PartProps<"span"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  readonly footer?: PartProps<"div"> | undefined;
  /** Placed when `footer` is a string or a number. */
  readonly footerLabel?: PartProps<"span"> | undefined;
  readonly portal?:
    | {
        readonly container?: PortalProps["container"] | undefined;
        readonly disabled?: boolean | undefined;
      }
    | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly drawer?: PartProps<"div"> | undefined;
}

export interface SidebarComposedProps
  extends Omit<PartProps<"nav", SidebarMachineProps>, "children"> {
  /** The landmark's name, and the drawer's. Required: two landmarks must be told apart. */
  readonly label: string;
  /** Defaults to `"auto"`. */
  readonly presentation?: SidebarMachineProps["presentation"];
  /**
   * Above the content, outside what scrolls. A string or a number is placed in
   * `SidebarHeaderLabel`, which a rail hides from the eye; anything else is placed
   * as it is, and its text belongs in a `SidebarHeaderLabel` of its own.
   */
  readonly header?: ReactNode;
  /** The sections, most often `SidebarBlock`s. */
  readonly children?: ReactNode;
  /**
   * Under the content, outside what scrolls. A string or a number is placed in
   * `SidebarFooterLabel`, as `header` is.
   */
  readonly footer?: ReactNode;
  /** Controls the drawer. The app owns it, since the trigger is not part of this component. */
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((details: { readonly open: boolean }) => void) | undefined;
  /** The dialog's id, to pin the drawer's ids for a server render. */
  readonly drawerId?: string | undefined;
  readonly container?: PortalProps["container"] | undefined;
  readonly parts?: SidebarParts | undefined;
}

const given = (slot: ReactNode): boolean => slot != null && slot !== false;

const textual = (slot: ReactNode): slot is string | number =>
  typeof slot === "string" || typeof slot === "number";

export function Sidebar(props: SidebarComposedProps): ReactNode {
  const {
    label,
    presentation,
    header,
    children,
    footer,
    open,
    defaultOpen,
    onOpenChange,
    drawerId,
    container,
    parts,
    ...root
  } = props;

  const body = (
    <>
      {given(header) ? (
        <SidebarHeader {...parts?.header}>
          {textual(header) ? (
            <SidebarHeaderLabel {...parts?.headerLabel}>{header}</SidebarHeaderLabel>
          ) : (
            header
          )}
        </SidebarHeader>
      ) : null}
      <SidebarContent {...parts?.content}>{children}</SidebarContent>
      {given(footer) ? (
        <SidebarFooter {...parts?.footer}>
          {textual(footer) ? (
            <SidebarFooterLabel {...parts?.footerLabel}>{footer}</SidebarFooterLabel>
          ) : (
            footer
          )}
        </SidebarFooter>
      ) : null}
    </>
  );

  return (
    <SidebarScope>
      <SidebarRoot label={label} presentation={presentation} {...root}>
        {body}
      </SidebarRoot>
      <DialogRoot
        id={drawerId}
        label={label}
        presentation="sheet"
        initialFocus={drawerInitialFocus}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        <DrawerRoot edge="start" detents={[1]}>
          <DialogPortal container={container} {...parts?.portal}>
            <DialogBackdrop render={<DrawerBackdrop />} {...parts?.backdrop} />
            <DialogPositioner render={<DrawerPositioner />} {...parts?.positioner}>
              <DialogContent
                render={
                  <DrawerContent
                    render={<SidebarDrawer presentation={presentation} {...parts?.drawer} />}
                  />
                }
              >
                <SidebarRoot label={label} presentation={presentation} placement="drawer">
                  {body}
                </SidebarRoot>
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DrawerRoot>
      </DialogRoot>
    </SidebarScope>
  );
}

export interface SidebarBlockParts {
  readonly header?: PartProps<"h3"> | undefined;
  readonly trigger?: PartProps<"button"> | undefined;
  readonly indicator?: PartProps<"span"> | undefined;
  readonly group?: PartProps<"ul"> | undefined;
}

type SidebarBlockOwn = Pick<UseCollapsibleProps, "open" | "defaultOpen" | "onOpenChange" | "dir">;

export interface SidebarBlockComposedProps
  extends SidebarBlockOwn,
    Omit<PartProps<"div", SidebarBlockOwn>, "children"> {
  /** The section's title, an `h3` over the group. Required for a `collapsible` block. */
  readonly header?: ReactNode;
  /** The section's entries, most often `SidebarEntry`s. */
  readonly children?: ReactNode;
  /** Folds the group away behind a button in the title. */
  readonly collapsible?: boolean | undefined;
  readonly parts?: SidebarBlockParts | undefined;
}

export function SidebarBlock(props: SidebarBlockComposedProps): ReactNode {
  const { header, children, collapsible, open, defaultOpen, onOpenChange, parts, ...section } =
    props;

  if (collapsible !== true) {
    return (
      <SidebarSection {...section}>
        {given(header) ? (
          <SidebarSectionHeader {...parts?.header}>{header}</SidebarSectionHeader>
        ) : null}
        <SidebarGroup {...parts?.group}>{children}</SidebarGroup>
      </SidebarSection>
    );
  }

  warn(
    isDev() && !given(header),
    "SidebarBlock: a `collapsible` block needs a `header`, which names its button.",
  );

  return (
    <SidebarDisclosure
      {...section}
      render={<SidebarSection />}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <SidebarSectionHeader {...parts?.header}>
        <CollapsibleTrigger {...parts?.trigger}>
          {header}
          <CollapsibleIndicator {...parts?.indicator} />
        </CollapsibleTrigger>
      </SidebarSectionHeader>
      <CollapsibleContent render={<SidebarGroup {...parts?.group} />}>
        {children}
      </CollapsibleContent>
    </SidebarDisclosure>
  );
}

export interface SidebarEntryParts {
  readonly link?: PartProps<"a"> | undefined;
  readonly leading?: PartProps<"span"> | undefined;
  readonly label?: PartProps<"span"> | undefined;
  readonly trailing?: PartProps<"span"> | undefined;
}

export interface SidebarEntryComposedProps extends Omit<PartProps<"li">, "children"> {
  /** An icon, drawn before the label. */
  readonly leading?: ReactNode;
  /** The entry's one line of text. */
  readonly label: Exclude<ReactNode, null | undefined | boolean>;
  /** A count or a detail, as text. */
  readonly trailing?: ReactNode;
  /**
   * The element the entry's content is placed in, handed to the link part's
   * `render`: an `<a href>`, or a `<button>` in a client-side router. Never placed
   * as children.
   */
  readonly link: ComposedTrigger;
  /** The page on screen: `aria-current="page"` on the link. */
  readonly current?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly parts?: SidebarEntryParts | undefined;
}

export function SidebarEntry(props: SidebarEntryComposedProps): ReactNode {
  const { leading, label, trailing, link, current, disabled, parts, ...item } = props;

  return (
    <SidebarItem current={current} {...item}>
      <SidebarLink render={link} current={current} disabled={disabled} {...parts?.link}>
        {given(leading) ? <SidebarLeading {...parts?.leading}>{leading}</SidebarLeading> : null}
        <SidebarLabel {...parts?.label}>{label}</SidebarLabel>
        {given(trailing) ? (
          <SidebarTrailing {...parts?.trailing}>{trailing}</SidebarTrailing>
        ) : null}
      </SidebarLink>
    </SidebarItem>
  );
}
