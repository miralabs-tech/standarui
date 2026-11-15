import { visuallyHiddenStyle } from "@standarui/core";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, server, userEvent } from "vitest/browser";
import type { InputSystem } from "../../nav";
import { NavProvider, spatialPlugin, useInputSystem } from "../../nav";
import {
  expectNoAxeViolations,
  fire,
  mount,
  realKey,
  settle,
  twoFrames,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { DrawerBackdrop, DrawerContent, DrawerPositioner, DrawerRoot } from "../drawer/drawer";
import { ListAction, ListGroup, ListRoot, ListRow } from "../list/list";
import { Sidebar, SidebarBlock, SidebarEntry } from "./composed";
import {
  drawerInitialFocus,
  SidebarContent,
  SidebarDrawer,
  SidebarGroup,
  SidebarItem,
  SidebarLabel,
  SidebarLink,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeader,
  SidebarTrigger,
} from "./sidebar";

// biome-ignore lint/a11y/useAnchorContent: the anchors are substitutions handed to `useRender`, which fills them with the link part's children.
const HOME: ReactElement = <a href="#home" />;
// biome-ignore lint/a11y/useAnchorContent: see above.
const MOVIES: ReactElement = <a href="#movies" />;
// biome-ignore lint/a11y/useAnchorContent: see above.
const MUSIC: ReactElement = <a href="#music" />;
const PRESS: ReactElement = <button type="button" />;

function part(container: ParentNode, name: string, index = 0): HTMLElement {
  const node = container.querySelectorAll<HTMLElement>(`[data-part~="sidebar:${name}"]`)[index];
  if (node === undefined) throw new Error(`no sidebar part "${name}" #${index}`);
  return node;
}

function count(container: ParentNode, name: string): number {
  return container.querySelectorAll(`[data-part~="sidebar:${name}"]`).length;
}

const drawer = (container: ParentNode): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-part~="sidebar:drawer"]');

afterEach(() => {
  unmountAll();
  document.documentElement.removeAttribute("data-sui-density");
  document.documentElement.removeAttribute("data-snav-input");
});

async function realClick(target: Element): Promise<void> {
  if (!document.hasFocus()) window.focus();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await userEvent.click(target);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
  await twoFrames();
}

const touch = (): void => {
  document.documentElement.dataset.suiDensity = "touch";
};

function Entries(): ReactNode {
  return (
    <SidebarBlock header="Browse">
      <SidebarEntry link={HOME} label="Home" current />
      <SidebarEntry link={MOVIES} label="Movies" trailing="24" />
      <SidebarEntry link={MUSIC} label="Music" disabled />
    </SidebarBlock>
  );
}

interface ShellProps {
  readonly presentation?: "auto" | "inline" | "drawer";
  readonly initiallyOpen?: boolean;
  readonly portaled?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
}

function Shell(props: ShellProps): ReactNode {
  const { presentation, initiallyOpen = false, portaled = false, onOpenChange, children } = props;
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <>
      <SidebarTrigger
        aria-label="Show the sidebar"
        open={open}
        presentation={presentation}
        onClick={() => setOpen(true)}
      />
      <Sidebar
        label="Library"
        header="Acme"
        presentation={presentation}
        open={open}
        onOpenChange={({ open: next }) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        parts={portaled ? undefined : { portal: { disabled: true } }}
      >
        {children ?? <Entries />}
      </Sidebar>
    </>
  );
}

describe("Sidebar: what the adapter adds", () => {
  it("renders the parts on their native elements, the group with the list role", () => {
    const { container } = mount(<Sidebar label="Library" header="Acme" footer="v1" />);
    expect(part(container, "root").tagName).toBe("NAV");
    expect(part(container, "header-label").tagName).toBe("SPAN");
    expect(part(container, "header-label").parentElement).toBe(part(container, "header"));
    expect(part(container, "header-label").textContent).toBe("Acme");
    expect(part(container, "footer-label").tagName).toBe("SPAN");
    expect(part(container, "footer-label").parentElement).toBe(part(container, "footer"));
    expect(part(container, "footer-label").textContent).toBe("v1");

    const stripped = mount(
      <SidebarRoot label="Library">
        <SidebarContent>
          <SidebarSection>
            <SidebarSectionHeader>Browse</SidebarSectionHeader>
            <SidebarGroup>
              <SidebarItem current>
                <SidebarLink render={HOME} current>
                  <SidebarLabel>Home</SidebarLabel>
                </SidebarLink>
              </SidebarItem>
            </SidebarGroup>
          </SidebarSection>
        </SidebarContent>
      </SidebarRoot>,
    );

    expect(part(stripped.container, "section").tagName).toBe("DIV");
    expect(part(stripped.container, "section-header").tagName).toBe("H3");
    expect(part(stripped.container, "group").tagName).toBe("UL");
    expect(part(stripped.container, "group").getAttribute("role")).toBe("list");
    expect(part(stripped.container, "item").tagName).toBe("LI");
    expect(part(stripped.container, "link").tagName).toBe("A");
    expect(part(stripped.container, "root").getAttribute("aria-label")).toBe("Library");
    expect(part(stripped.container, "root").getAttribute("data-snav")).toBe("container");
  });

  it("marks only the current link with aria-current, never aria-selected", () => {
    const { container } = mount(<Sidebar label="Library">{<Entries />}</Sidebar>);
    const links = container
      .querySelector('[data-part~="sidebar:root"]')
      ?.querySelectorAll<HTMLElement>('[data-part~="sidebar:link"]');

    expect([...(links ?? [])].map((link) => link.getAttribute("aria-current"))).toEqual([
      "page",
      null,
      null,
    ]);
    expect(container.querySelector("[aria-selected]")).toBeNull();
    expect(part(container, "item", 0).hasAttribute("data-current")).toBe(true);
    expect(part(container, "item", 1).hasAttribute("data-current")).toBe(false);
  });

  it("accepts a button as the link and keeps aria-current on it", () => {
    const { container } = mount(
      <Sidebar label="Library">
        <SidebarBlock header="Browse">
          <SidebarEntry link={PRESS} label="Home" current />
        </SidebarBlock>
      </Sidebar>,
    );

    const link = part(container, "link");
    expect(link.tagName).toBe("BUTTON");
    expect(link.getAttribute("type")).toBe("button");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("data-part")).toBe("sidebar:link");
  });

  it("puts no id and no tabindex on any part of the column", () => {
    const { container } = mount(
      <Sidebar label="Library" header="Acme" footer="v1">
        <Entries />
      </Sidebar>,
    );
    const root = part(container, "root");

    expect(root.querySelectorAll("[id]").length).toBe(0);
    expect(root.querySelectorAll("[tabindex]").length).toBe(0);
  });

  // WebKit's Tab leaves anchors out of the sequence unless the system asks for
  // them, so the order of real anchors is measured on the other two engines and
  // the order of buttons, which every engine tabs to, on all three.
  it.skipIf(server.browser === "webkit")(
    "tabs through every anchor in order, disabled one included, and claims no arrow key",
    async () => {
      const { container } = mount(
        <>
          <button type="button">Before</button>
          <Sidebar label="Library">
            <Entries />
          </Sidebar>
        </>,
      );

      fire(() => container.querySelector<HTMLElement>("button")?.focus());
      const order: (string | null)[] = [];
      for (let step = 0; step < 3; step += 1) {
        await realKey("{Tab}");
        order.push(document.activeElement?.textContent ?? null);
      }
      expect(order).toEqual(["Home", "Movies24", "Music"]);

      const before = document.activeElement;
      await realKey("{ArrowDown}");
      expect(document.activeElement).toBe(before);
    },
  );

  it("tabs through every button link in order, and claims no arrow key", async () => {
    const { container } = mount(
      <>
        <button type="button">Before</button>
        <Sidebar label="Library">
          <SidebarBlock header="Browse">
            <SidebarEntry link={PRESS} label="Home" current />
            <SidebarEntry link={PRESS} label="Movies" trailing="24" />
            <SidebarEntry link={PRESS} label="Music" disabled />
          </SidebarBlock>
        </Sidebar>
      </>,
    );

    fire(() => container.querySelector<HTMLElement>("button")?.focus());
    const order: (string | null)[] = [];
    for (let step = 0; step < 3; step += 1) {
      await realKey("{Tab}");
      order.push(document.activeElement?.textContent ?? null);
    }
    expect(order).toEqual(["Home", "Movies24", "Music"]);
    expect(container.querySelectorAll("[tabindex]").length).toBe(0);

    const before = document.activeElement;
    await realKey("{ArrowDown}");
    expect(document.activeElement).toBe(before);
  });

  it("cancels the activation of a disabled link and leaves the others alone", () => {
    const { container } = mount(
      <Sidebar label="Library">
        <Entries />
      </Sidebar>,
    );
    const seen: boolean[] = [];
    container.addEventListener("click", (event) => seen.push(event.defaultPrevented));

    part(container, "link", 1).click();
    part(container, "link", 2).click();

    expect(seen).toEqual([false, true]);
    expect(part(container, "link", 2).getAttribute("aria-disabled")).toBe("true");
  });

  it("folds a collapsible block behind a button in its title", async () => {
    const { container } = mount(
      <Sidebar label="Library">
        <SidebarBlock header="Library" collapsible defaultOpen>
          <SidebarEntry link={HOME} label="Home" />
        </SidebarBlock>
      </Sidebar>,
    );
    const root = part(container, "root");
    const trigger = root.querySelector<HTMLElement>("h3 button");

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector('[data-part~="sidebar:group"]')?.tagName).toBe("UL");
    expect(
      root.querySelector('[data-part~="sidebar:group"][data-part~="collapsible:content"]'),
    ).not.toBeNull();

    fire(() => trigger?.click());
    await settle();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Sidebar: the drawer", () => {
  beforeEach(touch);

  it("mounts the drawer only while open, over a second copy of the same markup", () => {
    const closed = mount(<Shell />);
    expect(drawer(closed.container)).toBeNull();
    expect(count(closed.container, "root")).toBe(1);
    closed.unmount();

    const { container } = mount(<Shell initiallyOpen />);
    const surface = drawer(container);
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-part")).toContain("dialog:content");
    expect(surface?.getAttribute("data-part")).toContain("drawer:content");
    expect(surface?.getAttribute("data-edge")).toBe("start");
    expect(surface?.getAttribute("aria-label")).toBe("Library");

    const roots = container.querySelectorAll<HTMLElement>('[data-part~="sidebar:root"]');
    expect([...roots].map((root) => root.getAttribute("data-placement"))).toEqual([
      "inline",
      "drawer",
    ]);
    expect(surface?.contains(roots[1] ?? null)).toBe(true);
    expect(roots[1]?.querySelectorAll("[id]").length).toBe(0);
  });

  it("opens from the trigger, traps, closes on Escape and gives the focus back", async () => {
    const { container } = mount(<Shell />);
    const trigger = part(container, "trigger");

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    fire(() => trigger.focus());
    await realKey("{Enter}");
    await waitFor(() => {
      expect(drawer(container)).not.toBeNull();
      expect(drawer(container)?.contains(document.activeElement)).toBe(true);
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await realKey("{Tab}");
    await realKey("{Tab}");
    await realKey("{Tab}");
    await realKey("{Tab}");
    expect(drawer(container)?.contains(document.activeElement)).toBe(true);

    await realKey("{Escape}");
    await waitFor(() => {
      expect(drawer(container)?.getAttribute("data-state") ?? "closed").toBe("closed");
      expect(document.activeElement).toBe(trigger);
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when a link is followed, and stays open on a disabled one", async () => {
    const onOpenChange = vi.fn();
    const { container } = mount(<Shell initiallyOpen onOpenChange={onOpenChange} />);
    await settle();
    const links = drawer(container)?.querySelectorAll<HTMLElement>('[data-part~="sidebar:link"]');

    fire(() => links?.[2]?.click());
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    fire(() => links?.[1]?.click());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closes when the density turns desktop, under auto, from a real attribute change", async () => {
    document.documentElement.dataset.suiDensity = "touch";
    const onOpenChange = vi.fn();
    mount(<Shell initiallyOpen onOpenChange={onOpenChange} />);
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    document.documentElement.dataset.suiDensity = "desktop";
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open through the same change when the presentation is pinned to the drawer", async () => {
    document.documentElement.dataset.suiDensity = "touch";
    const onOpenChange = vi.fn();
    const { container } = mount(
      <Shell presentation="drawer" initiallyOpen onOpenChange={onOpenChange} />,
    );
    await settle();

    document.documentElement.dataset.suiDensity = "desktop";
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(drawer(container)).not.toBeNull();
  });

  it("does not close an auto drawer on mount in an app with no environment provider", async () => {
    const onOpenChange = vi.fn();
    const { container } = mount(<Shell initiallyOpen onOpenChange={onOpenChange} />);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(drawer(container)).not.toBeNull();
  });

  it("publishes the presentation on the root and on the trigger", () => {
    const { container } = mount(<Shell presentation="inline" />);

    expect(part(container, "root").getAttribute("data-presentation")).toBe("inline");
    expect(part(container, "trigger").getAttribute("data-presentation")).toBe("inline");
  });
});

describe("Sidebar: where the focus goes", () => {
  beforeEach(touch);

  const current = (container: ParentNode, placement: "inline" | "drawer"): HTMLElement => {
    const link = container.querySelector<HTMLElement>(
      `[data-part~="sidebar:root"][data-placement="${placement}"] [aria-current="page"]`,
    );
    if (link === null) throw new Error(`no current link in the ${placement} copy`);
    return link;
  };

  it("opens on the page on screen, not on the first link", async () => {
    const { container } = mount(
      <Shell>
        <SidebarBlock header="Browse">
          <SidebarEntry link={HOME} label="Home" />
          <SidebarEntry link={MOVIES} label="Movies" current />
        </SidebarBlock>
      </Shell>,
    );
    const trigger = part(container, "trigger");

    fire(() => trigger.focus());
    await realKey("{Enter}");
    await waitFor(() => expect(document.activeElement).toBe(current(container, "drawer")));
    expect(document.activeElement?.textContent).toBe("Movies");
  });

  it("gives the focus back to the trigger after a pointer opened it, whatever the engine focuses", async () => {
    const { container } = mount(<Shell />);
    const trigger = part(container, "trigger");

    await realClick(trigger);
    await waitFor(() => expect(drawer(container)?.contains(document.activeElement)).toBe(true));

    await realKey("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("gives it back to the trigger after a followed link too", async () => {
    const { container } = mount(<Shell />);
    const trigger = part(container, "trigger");

    await realClick(trigger);
    await waitFor(() => expect(drawer(container)).not.toBeNull());
    const movies = drawer(container)?.querySelectorAll<HTMLElement>(
      '[data-part~="sidebar:link"]',
    )[1];
    if (movies === undefined) throw new Error("no link in the drawer");
    await realClick(movies);

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("puts the focus on the current link of the column when the density closes the drawer", async () => {
    const { container } = mount(<Shell initiallyOpen />);
    await settle();
    expect(drawer(container)).not.toBeNull();

    document.documentElement.dataset.suiDensity = "desktop";
    await waitFor(() => expect(document.activeElement).toBe(current(container, "inline")));
  });

  it("moves a focus held in the column to the trigger when the density turns touch", async () => {
    document.documentElement.dataset.suiDensity = "desktop";
    const { container } = mount(<Shell />);
    const link = current(container, "inline");
    fire(() => link.focus());
    expect(document.activeElement).toBe(link);

    document.documentElement.dataset.suiDensity = "touch";
    await waitFor(() => expect(document.activeElement).toBe(part(container, "trigger")));
  });

  it("moves a focus held in the column to the trigger when only a subtree around it turns touch", async () => {
    document.documentElement.dataset.suiDensity = "desktop";
    const { container } = mount(
      <div data-sui-density="desktop">
        <Shell />
      </div>,
    );
    const link = current(container, "inline");
    fire(() => link.focus());
    expect(document.activeElement).toBe(link);

    (container.firstElementChild as HTMLElement).dataset.suiDensity = "touch";
    await waitFor(() => expect(document.activeElement).toBe(part(container, "trigger")));
  });

  it("leaves a focus that is not in the column alone when the density turns touch", async () => {
    document.documentElement.dataset.suiDensity = "desktop";
    const { container } = mount(
      <>
        <button type="button" id="elsewhere">
          Elsewhere
        </button>
        <Shell />
      </>,
    );
    const elsewhere = container.querySelector<HTMLElement>("#elsewhere");
    fire(() => elsewhere?.focus());

    document.documentElement.dataset.suiDensity = "touch";
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("Sidebar: the drawer follows the density it is opened under", () => {
  it("closes at once an auto drawer opened under a desktop density", async () => {
    document.documentElement.dataset.suiDensity = "desktop";
    const onOpenChange = vi.fn();
    mount(<Shell initiallyOpen onOpenChange={onOpenChange} />);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps a drawer pinned by the app open under the same density", async () => {
    document.documentElement.dataset.suiDensity = "desktop";
    const onOpenChange = vi.fn();
    const { container } = mount(
      <Shell presentation="drawer" initiallyOpen onOpenChange={onOpenChange} />,
    );
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(drawer(container)).not.toBeNull();
  });
});

describe("Sidebar: the drawer reads the density where the sidebar lives", () => {
  it("opens an auto drawer under a touch density set on a subtree, the page being desktop", async () => {
    const onOpenChange = vi.fn();
    mount(
      <div data-sui-density="touch">
        <Shell portaled onOpenChange={onOpenChange} />
      </div>,
    );

    await realClick(part(document.body, "trigger"));
    await waitFor(() => expect(drawer(document.body)).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(drawer(document.body)).not.toBeNull();
    expect(drawer(document.body)?.getAttribute("data-state")).toBe("open");
  });

  it("closes that drawer when the subtree turns desktop", async () => {
    const onOpenChange = vi.fn();
    const { container } = mount(
      <div data-sui-density="touch">
        <Shell portaled initiallyOpen onOpenChange={onOpenChange} />
      </div>,
    );
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onOpenChange).not.toHaveBeenCalled();

    (container.firstElementChild as HTMLElement).dataset.suiDensity = "desktop";
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

interface PaneProps {
  readonly label: string;
  readonly withTrigger?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

function Pane(props: PaneProps): ReactNode {
  const { label, withTrigger = true, onOpenChange } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      {withTrigger ? (
        <SidebarTrigger aria-label={`Show ${label}`} open={open} onClick={() => setOpen(true)} />
      ) : null}
      <Sidebar
        label={label}
        open={open}
        onOpenChange={({ open: next }) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
      >
        <Entries />
      </Sidebar>
    </>
  );
}

interface PartsDrawerProps {
  readonly named: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
}

function PartsDrawer(props: PartsDrawerProps): ReactNode {
  const { named, onOpenChange, children } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <SidebarTrigger aria-label="Show the parts" open={open} onClick={() => setOpen(true)} />
      <DialogRoot
        {...(named ? { label: "Library" } : {})}
        presentation="sheet"
        initialFocus={drawerInitialFocus}
        open={open}
        onOpenChange={({ open: next }) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
      >
        <DrawerRoot edge="start" detents={[1]}>
          <DialogPortal>
            <DialogBackdrop render={<DrawerBackdrop />} />
            <DialogPositioner render={<DrawerPositioner />}>
              <DialogContent render={<DrawerContent render={<SidebarDrawer />} />}>
                {named ? null : <DialogTitle>Library</DialogTitle>}
                <SidebarRoot label="Library" placement="drawer">
                  <SidebarContent>
                    <SidebarSection>
                      <SidebarGroup>
                        <SidebarItem current>
                          <SidebarLink render={HOME} current>
                            <SidebarLabel>Home</SidebarLabel>
                          </SidebarLink>
                        </SidebarItem>
                      </SidebarGroup>
                    </SidebarSection>
                  </SidebarContent>
                </SidebarRoot>
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DrawerRoot>
      </DialogRoot>
      {children}
    </>
  );
}

async function openAndHold(): Promise<void> {
  await realClick(part(document.body, "trigger"));
  await waitFor(() => expect(drawer(document.body)).not.toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 60));
  await settle();
}

describe("Sidebar: the drawer reads the density of the sidebar it belongs to", () => {
  it("stays open when two sidebars share a name and the first sits under a desktop subtree", async () => {
    const onOpenChange = vi.fn();
    mount(
      <>
        <div data-sui-density="desktop">
          <Pane label="Library" withTrigger={false} />
        </div>
        <div data-sui-density="touch">
          <Pane label="Library" onOpenChange={onOpenChange} />
        </div>
      </>,
    );

    await openAndHold();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(drawer(document.body)?.getAttribute("data-state")).toBe("open");
  });

  it("stays open for a drawer written in parts, without a name, placed after a desktop sidebar", async () => {
    const onOpenChange = vi.fn();
    mount(
      <>
        <div data-sui-density="desktop">
          <Pane label="Settings" withTrigger={false} />
        </div>
        <div data-sui-density="touch">
          <PartsDrawer named={false} onOpenChange={onOpenChange} />
        </div>
      </>,
    );

    await openAndHold();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(drawer(document.body)?.getAttribute("data-state")).toBe("open");
  });

  it("reads the column of its own name, not the first column of the page, for a drawer in parts", async () => {
    const onOpenChange = vi.fn();
    mount(
      <PartsDrawer named onOpenChange={onOpenChange}>
        <div data-sui-density="desktop">
          <SidebarRoot label="Settings" />
        </div>
        <div data-sui-density="touch">
          <SidebarRoot label="Library" />
        </div>
      </PartsDrawer>,
    );

    await openAndHold();

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(drawer(document.body)?.getAttribute("data-state")).toBe("open");
  });

  it("puts the focus on the current link of its own column when the density closes it", async () => {
    mount(
      <>
        <div data-sui-density="touch" id="first">
          <Pane label="Library" withTrigger={false} />
        </div>
        <div data-sui-density="touch" id="second">
          <Pane label="Library" />
        </div>
      </>,
    );
    await openAndHold();

    for (const id of ["first", "second"]) {
      const wrap = document.getElementById(id);
      if (wrap === null) throw new Error(`no #${id}`);
      wrap.dataset.suiDensity = "desktop";
    }

    const second = document.getElementById("second");
    await waitFor(() => {
      expect(drawer(document.body)).toBeNull();
      expect(second?.contains(document.activeElement)).toBe(true);
    });
    expect(document.activeElement?.textContent).toBe("Home");
  });
});

describe("Sidebar: what a click on a link asks for", () => {
  beforeEach(touch);

  function open(): { links: HTMLElement[]; onOpenChange: ReturnType<typeof vi.fn> } {
    const onOpenChange = vi.fn();
    const { container } = mount(
      <Shell initiallyOpen onOpenChange={onOpenChange}>
        <SidebarBlock header="Browse">
          <SidebarEntry link={PRESS} label="Home" current />
          <SidebarEntry link={PRESS} label="Movies" />
        </SidebarBlock>
      </Shell>,
    );
    const links = [
      ...(drawer(container)?.querySelectorAll<HTMLElement>('[data-part~="sidebar:link"]') ?? []),
    ];
    return { links, onOpenChange };
  }

  it.each([
    ["control", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("does not close the drawer on a %s click", async (_name, init) => {
    const { links, onOpenChange } = open();
    await settle();

    fire(() => links[1]?.dispatchEvent(new MouseEvent("click", { ...init, bubbles: true })));
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    fire(() => links[1]?.click());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("Sidebar: ids written in the children", () => {
  beforeEach(touch);

  it("tells the developer that a pinned id is rendered twice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(
      <Shell initiallyOpen>
        <SidebarBlock header="Browse">
          <SidebarEntry id="pinned-entry" link={HOME} label="Home" />
        </SidebarBlock>
      </Shell>,
    );
    await settle();

    expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      'the id "pinned-entry"',
    );
    warn.mockRestore();
  });

  it("stays quiet when the children carry no id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(<Shell initiallyOpen />);
    await settle();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("points the button of a pinned section in the drawer at the drawer's own content", async () => {
    const { container } = mount(
      <Shell initiallyOpen>
        <SidebarBlock id="library" header="Library" collapsible defaultOpen>
          <SidebarEntry link={HOME} label="Home" />
        </SidebarBlock>
      </Shell>,
    );
    await settle();

    const surface = drawer(container);
    const button = surface?.querySelector<HTMLElement>("h3 button[aria-controls]");
    const controlled = document.getElementById(button?.getAttribute("aria-controls") ?? "");

    expect(button).not.toBeNull();
    expect(controlled).not.toBeNull();
    expect(surface?.contains(controlled)).toBe(true);
    expect(document.querySelectorAll('[id="library"]').length).toBe(1);
  });
});

describe("Sidebar: the trigger's name", () => {
  it("warns about a trigger nobody can name, and not about one that has a name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(<SidebarTrigger />);
    await settle();
    expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "sidebar trigger has no accessible name",
    );
    warn.mockClear();

    mount(<SidebarTrigger aria-label="Show the library" />);
    mount(<SidebarTrigger>Menu</SidebarTrigger>);
    await settle();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("Sidebar: the count's name", () => {
  const COUNT = (
    <>
      <span aria-hidden="true">24</span>
      <span style={visuallyHiddenStyle}>24 items</span>
    </>
  );

  it("reads as a sentence once the count carries a hidden text", () => {
    mount(
      <Sidebar label="Library">
        <SidebarBlock header="Browse">
          <SidebarEntry link={MOVIES} label="Movies" trailing={COUNT} />
        </SidebarBlock>
      </Sidebar>,
    );

    expect(page.getByRole("link", { name: "Movies 24 items", exact: true }).elements().length).toBe(
      1,
    );
  });

  it("is read as a bare number without it", () => {
    mount(
      <Sidebar label="Library">
        <SidebarBlock header="Browse">
          <SidebarEntry link={MOVIES} label="Movies" trailing="24" />
        </SidebarBlock>
      </Sidebar>,
    );

    expect(page.getByRole("link", { name: /items/ }).elements().length).toBe(0);
    expect(page.getByRole("link", { name: /^Movies ?24$/ }).elements().length).toBe(1);
  });
});

describe("The ring of parts that no machine drives", () => {
  async function tabInto(first: string): Promise<void> {
    const before = document.getElementById("before");
    fire(() => before?.focus());
    await realKey("{Tab}");
    expect(document.activeElement?.textContent).toBe(first);
  }

  it("follows the input modality under bare sidebar parts", async () => {
    mount(
      <>
        <button type="button" id="before">
          Before
        </button>
        <SidebarRoot label="Library">
          <SidebarContent>
            <SidebarSection>
              <SidebarSectionHeader>Browse</SidebarSectionHeader>
              <SidebarGroup>
                <SidebarItem>
                  <SidebarLink render={PRESS}>
                    <SidebarLabel>Home</SidebarLabel>
                  </SidebarLink>
                </SidebarItem>
              </SidebarGroup>
            </SidebarSection>
          </SidebarContent>
        </SidebarRoot>
      </>,
    );
    await tabInto("Home");
    expect(document.documentElement.getAttribute("data-snav-input")).toBe("keyboard");
  });

  it("follows it under bare list parts", async () => {
    mount(
      <>
        <button type="button" id="before">
          Before
        </button>
        <ListRoot>
          <ListGroup>
            <ListRow>
              <ListAction render={PRESS}>Storage</ListAction>
            </ListRow>
          </ListGroup>
        </ListRoot>
      </>,
    );
    await tabInto("Storage");
    expect(document.documentElement.getAttribute("data-snav-input")).toBe("keyboard");
  });
});

describe("Sidebar: the gamepad", () => {
  let input: InputSystem | null = null;

  function Capture(): ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  it("walks the column with the d-pad, link by link", async () => {
    const { container } = mount(
      <NavProvider plugins={[spatialPlugin({ mode: "app" })]}>
        <Capture />
        <Sidebar label="Library">
          <SidebarBlock header="Browse">
            <SidebarEntry link={HOME} label="Home" />
            <SidebarEntry link={MOVIES} label="Movies" />
            <SidebarEntry link={MUSIC} label="Music" />
          </SidebarBlock>
        </Sidebar>
      </NavProvider>,
    );
    await settle();
    const links = container.querySelector('[data-part~="sidebar:root"]')?.querySelectorAll("a");
    const labels = (): string | null => document.activeElement?.textContent ?? null;

    fire(() => (links?.[0] as HTMLElement | undefined)?.focus());
    expect(labels()).toBe("Home");
    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    expect(labels()).toBe("Movies");
    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    expect(labels()).toBe("Music");
    fire(() => input?.emit({ intent: "moveUp", source: "gamepad" }));
    expect(labels()).toBe("Movies");
  });
});

describe("Sidebar: axe", () => {
  it("passes inline, beside a differently named navigation", async () => {
    const handle = mount(
      <main>
        <h1>Library</h1>
        <h2>Pages</h2>
        <Sidebar label="Library" header="Acme" footer="v1">
          <Entries />
        </Sidebar>
        <nav aria-label="Primary">
          <a href="#tabs">Tabs</a>
        </nav>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes with the drawer open", async () => {
    touch();
    const handle = mount(
      <main>
        <h1>Library</h1>
        <h2>Pages</h2>
        <Shell initiallyOpen />
        <nav aria-label="Primary">
          <a href="#tabs">Tabs</a>
        </nav>
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });

  it("passes with a folding block", async () => {
    const handle = mount(
      <main>
        <h1>Library</h1>
        <h2>Pages</h2>
        <Sidebar label="Library">
          <SidebarBlock header="Library" collapsible defaultOpen>
            <SidebarEntry link={HOME} label="Home" current />
          </SidebarBlock>
          <SidebarBlock header="Playlists">
            <SidebarEntry link={PRESS} label="Chill" trailing="12" />
          </SidebarBlock>
        </Sidebar>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
