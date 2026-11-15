import type { ReactElement, ReactNode } from "react";
import { BOLT, type ParityCase } from "../../composed.harness";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "../collapsible/collapsible";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
} from "../dialog/dialog";
import { DrawerBackdrop, DrawerContent, DrawerPositioner, DrawerRoot } from "../drawer/drawer";
import { Sidebar, SidebarBlock, SidebarEntry } from "./composed";
import {
  drawerInitialFocus,
  SidebarContent,
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
  SidebarSection,
  SidebarSectionHeader,
  SidebarTrailing,
} from "./sidebar";

// biome-ignore lint/a11y/useAnchorContent: the anchor is a substitution handed to `useRender`, which fills it with the link part's children.
const HOME: ReactElement = <a href="/home" />;
// biome-ignore lint/a11y/useAnchorContent: see above.
const MOVIES: ReactElement = <a href="/movies" />;
const PRESS: ReactElement = <button type="button" />;

type Presentation = "auto" | "inline" | "drawer";

/** Everything the composed form hands the dialog, written out as parts. */
function drawerOf(
  label: string,
  presentation: Presentation | undefined,
  body: ReactNode,
  options: { readonly open?: boolean; readonly id?: string; readonly inline?: boolean } = {},
): ReactElement {
  const { open, id, inline } = options;
  return (
    <DialogRoot
      id={id}
      label={label}
      presentation="sheet"
      initialFocus={drawerInitialFocus}
      open={open}
    >
      <DrawerRoot edge="start" detents={[1]}>
        <DialogPortal disabled={inline}>
          <DialogBackdrop render={<DrawerBackdrop />} />
          <DialogPositioner render={<DrawerPositioner />}>
            <DialogContent
              render={<DrawerContent render={<SidebarDrawer presentation={presentation} />} />}
            >
              <SidebarRoot label={label} presentation={presentation} placement="drawer">
                {body}
              </SidebarRoot>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DrawerRoot>
    </DialogRoot>
  );
}

const PLAIN_BODY: ReactNode = (
  <>
    <SidebarHeader>
      <SidebarHeaderLabel>Acme</SidebarHeaderLabel>
    </SidebarHeader>
    <SidebarContent>
      <SidebarSection>
        <SidebarSectionHeader>Browse</SidebarSectionHeader>
        <SidebarGroup>
          <SidebarItem current>
            <SidebarLink render={HOME} current>
              <SidebarLeading>{BOLT}</SidebarLeading>
              <SidebarLabel>Home</SidebarLabel>
            </SidebarLink>
          </SidebarItem>
          <SidebarItem>
            <SidebarLink render={MOVIES}>
              <SidebarLabel>Movies</SidebarLabel>
              <SidebarTrailing>24</SidebarTrailing>
            </SidebarLink>
          </SidebarItem>
        </SidebarGroup>
      </SidebarSection>
    </SidebarContent>
    <SidebarFooter>
      <SidebarFooterLabel>v1</SidebarFooterLabel>
    </SidebarFooter>
  </>
);

const RICH_HEADER: ReactNode = (
  <>
    <SidebarHeaderLabel>Acme</SidebarHeaderLabel>
    <button type="button">Account</button>
  </>
);

const RICH_BODY: ReactNode = (
  <>
    <SidebarHeader>{RICH_HEADER}</SidebarHeader>
    <SidebarContent />
    <SidebarFooter>
      <button type="button">Sync</button>
    </SidebarFooter>
  </>
);

const PLAIN_COMPOSED: ReactNode = (
  <SidebarBlock header="Browse">
    <SidebarEntry link={HOME} leading={BOLT} label="Home" current />
    <SidebarEntry link={MOVIES} label="Movies" trailing="24" />
  </SidebarBlock>
);

export const parity: readonly ParityCase[] = [
  {
    name: "sidebar",
    composed: (
      <Sidebar id="nav" label="Library" header="Acme" footer="v1">
        {PLAIN_COMPOSED}
      </Sidebar>
    ),
    parts: (
      <>
        <SidebarRoot id="nav" label="Library">
          {PLAIN_BODY}
        </SidebarRoot>
        {drawerOf("Library", undefined, PLAIN_BODY)}
      </>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <Sidebar
        id="nav"
        label="Library"
        header="Acme"
        footer="v1"
        open
        drawerId="side"
        parts={{ portal: { disabled: true } }}
      >
        {PLAIN_COMPOSED}
      </Sidebar>
    ),
    parts: (
      <>
        <SidebarRoot id="nav" label="Library">
          {PLAIN_BODY}
        </SidebarRoot>
        {drawerOf("Library", undefined, PLAIN_BODY, { open: true, id: "side", inline: true })}
      </>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <Sidebar id="fixed" label="Library" presentation="drawer">
        {false}
      </Sidebar>
    ),
    parts: (
      <>
        <SidebarRoot id="fixed" label="Library" presentation="drawer">
          <SidebarContent />
        </SidebarRoot>
        {drawerOf("Library", "drawer", <SidebarContent />)}
      </>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <Sidebar
        id="rich"
        label="Library"
        presentation="inline"
        header={RICH_HEADER}
        footer={<button type="button">Sync</button>}
      />
    ),
    parts: (
      <>
        <SidebarRoot id="rich" label="Library" presentation="inline">
          {RICH_BODY}
        </SidebarRoot>
        {drawerOf("Library", "inline", RICH_BODY)}
      </>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <Sidebar
        id="counted"
        label="Library"
        presentation="inline"
        header={3}
        footer={0}
        parts={{
          headerLabel: { id: "counted:header-label", className: "title" },
          footerLabel: { id: "counted:footer-label", className: "note" },
        }}
      />
    ),
    parts: (
      <>
        <SidebarRoot id="counted" label="Library" presentation="inline">
          <SidebarHeader>
            <SidebarHeaderLabel id="counted:header-label" className="title">
              {3}
            </SidebarHeaderLabel>
          </SidebarHeader>
          <SidebarContent />
          <SidebarFooter>
            <SidebarFooterLabel id="counted:footer-label" className="note">
              {0}
            </SidebarFooterLabel>
          </SidebarFooter>
        </SidebarRoot>
        {drawerOf(
          "Library",
          "inline",
          <>
            <SidebarHeader>
              <SidebarHeaderLabel id="counted:header-label" className="title">
                {3}
              </SidebarHeaderLabel>
            </SidebarHeader>
            <SidebarContent />
            <SidebarFooter>
              <SidebarFooterLabel id="counted:footer-label" className="note">
                {0}
              </SidebarFooterLabel>
            </SidebarFooter>
          </>,
        )}
      </>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <SidebarBlock id="library" header="Library" collapsible defaultOpen>
        <SidebarEntry link={HOME} label="Home" />
      </SidebarBlock>
    ),
    parts: (
      <CollapsibleRoot id="library" defaultOpen render={<SidebarSection />}>
        <SidebarSectionHeader>
          <CollapsibleTrigger>
            Library
            <CollapsibleIndicator />
          </CollapsibleTrigger>
        </SidebarSectionHeader>
        <CollapsibleContent render={<SidebarGroup />}>
          <SidebarItem>
            <SidebarLink render={HOME}>
              <SidebarLabel>Home</SidebarLabel>
            </SidebarLink>
          </SidebarItem>
        </CollapsibleContent>
      </CollapsibleRoot>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <SidebarBlock id="bare">
        <SidebarEntry link={HOME} label="Home" />
      </SidebarBlock>
    ),
    parts: (
      <SidebarSection id="bare">
        <SidebarGroup>
          <SidebarItem>
            <SidebarLink render={HOME}>
              <SidebarLabel>Home</SidebarLabel>
            </SidebarLink>
          </SidebarItem>
        </SidebarGroup>
      </SidebarSection>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <SidebarEntry
        id="settings"
        link={PRESS}
        leading={false}
        label="Settings"
        trailing={false}
        disabled
      />
    ),
    parts: (
      <SidebarItem id="settings">
        <SidebarLink render={PRESS} disabled>
          <SidebarLabel>Settings</SidebarLabel>
        </SidebarLink>
      </SidebarItem>
    ),
  },
  {
    name: "sidebar",
    composed: (
      <SidebarBlock
        id="tuned"
        header="Tuned"
        parts={{
          header: { id: "tuned:header", className: "title" },
          group: { id: "tuned:group", className: "entries" },
        }}
      >
        <SidebarEntry
          id="tuned-entry"
          link={HOME}
          label="Home"
          current
          trailing="3"
          parts={{
            link: { className: "hit", "aria-label": "Open home" },
            label: { className: "name" },
            trailing: { className: "count" },
          }}
        />
      </SidebarBlock>
    ),
    parts: (
      <SidebarSection id="tuned">
        <SidebarSectionHeader id="tuned:header" className="title">
          Tuned
        </SidebarSectionHeader>
        <SidebarGroup id="tuned:group" className="entries">
          <SidebarItem id="tuned-entry" current>
            <SidebarLink render={HOME} current className="hit" aria-label="Open home">
              <SidebarLabel className="name">Home</SidebarLabel>
              <SidebarTrailing className="count">3</SidebarTrailing>
            </SidebarLink>
          </SidebarItem>
        </SidebarGroup>
      </SidebarSection>
    ),
  },
];
