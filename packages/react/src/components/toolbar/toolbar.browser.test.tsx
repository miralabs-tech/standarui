/**
 * The toolbar through React: what only the adapter decides, and axe.
 *
 * The roving, the memory and the cohabitation rule are proved in
 * `packages/core/src/components/toolbar`. What only this layer can get wrong is
 * the *element*: the default `<button type="button">` that must not follow a
 * composed control, the `value` that defaults to a React id, and the composition
 * itself — a `Toggle.Root` dropped into an item has to come out wearing both
 * identities or the sheets stop matching it.
 */

import { act, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  unmountAll,
} from "../../render-harness";
import { ToggleRoot } from "../toggle";
import { Toolbar } from "./composed";
import {
  ToolbarGroup,
  ToolbarItem,
  ToolbarRoot,
  type ToolbarRootProps,
  ToolbarSeparator,
  ToolbarSpacer,
  ToolbarTitle,
} from "./toolbar";

/** Inline SVG, never a text glyph: a glyph's ink sits on its baseline. */
function Star(): React.ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" focusable={false}>
      <path
        d="M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.5 4.3 13.5l.8-4.2L2 6.4l4.2-.5z"
        fill="currentcolor"
      />
    </svg>
  );
}

function Bar(props: Partial<ToolbarRootProps>): React.ReactNode {
  return (
    <ToolbarRoot label="Formatting" {...props}>
      <ToolbarGroup aria-label="Text style">
        <ToolbarItem value="bold">Bold</ToolbarItem>
        <ToolbarItem value="italic">Italic</ToolbarItem>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarSpacer />
      <ToolbarItem value="favourite" aria-label="Favourite">
        <Star />
      </ToolbarItem>
    </ToolbarRoot>
  );
}

function items(container: ParentNode): HTMLElement[] {
  return queryParts(container, "item");
}

/** Dispatched inside `act`, so React commits what the machine did with it. */
function press(node: Element | undefined, key: string): void {
  fire(() => {
    node?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function focus(node: HTMLElement | undefined): void {
  fire(() => node?.focus());
}

function TabBar(props: { current?: string }): React.ReactNode {
  const { current = "home" } = props;
  const link = (value: string, label: string): React.ReactNode => (
    <ToolbarItem
      value={value}
      render={<a href={`#${value}`} aria-current={current === value ? "page" : undefined} />}
    >
      {label}
    </ToolbarItem>
  );
  return (
    <nav aria-label="Primary">
      <ToolbarRoot label="Sections" data-variant="tab-bar">
        <ToolbarGroup aria-label="Pages">
          {link("home", "Home")}
          {link("search", "Search")}
          {link("library", "Library")}
        </ToolbarGroup>
      </ToolbarRoot>
    </nav>
  );
}

function NavigationBar(): React.ReactNode {
  return (
    <ToolbarRoot label="Library" data-variant="navigation-bar">
      <ToolbarGroup aria-label="Navigation">
        <ToolbarItem value="back">Back</ToolbarItem>
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup aria-label="Actions">
        <ToolbarItem value="add">Add</ToolbarItem>
      </ToolbarGroup>
      <ToolbarTitle size="large">Library</ToolbarTitle>
    </ToolbarRoot>
  );
}

afterEach(() => {
  location.hash = "";
  unmountAll();
});

describe("toolbar in React — the element", () => {
  it("renders a real button by default, and lets a consumer say otherwise", () => {
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarItem value="save">Save</ToolbarItem>
        <ToolbarItem value="submit" type="submit">
          Submit
        </ToolbarItem>
      </ToolbarRoot>,
    );
    const [save, submit] = items(container) as HTMLButtonElement[];

    // `type="button"` is the wrapper's, on its own element: a `<button>` inside a
    // form that submits it by default is the classic toolbar bug.
    expect(save?.localName).toBe("button");
    expect(save?.getAttribute("type")).toBe("button");
    expect(submit?.getAttribute("type")).toBe("submit");
  });

  it("never posts a type onto a composed element", () => {
    const { container } = mount(
      <ToolbarRoot label="Links">
        <ToolbarItem render={<a href="#docs">Docs</a>} />
      </ToolbarRoot>,
    );
    const link = queryPart(container, "item");

    expect(link?.localName).toBe("a");
    // An anchor has a `type` and it means a MIME hint. The machine posts none and
    // the wrapper only dresses the element it renders itself.
    expect(link?.hasAttribute("type")).toBe(false);
  });

  it("wears both identities when a control is composed in", () => {
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarItem value="bold" render={<ToggleRoot>Bold</ToggleRoot>} />
        <ToolbarItem value="share">Share</ToolbarItem>
      </ToolbarRoot>,
    );
    const composed = queryPart(container, "item") as HTMLElement;

    // Both sheets have to match this one element — the token lists are what make
    // that possible, and the order between them is not part of the contract.
    expect((composed.getAttribute("data-part") ?? "").split(" ").sort()).toEqual([
      "toggle:root",
      "toolbar:item",
    ]);
    expect((composed.getAttribute("data-scope") ?? "").split(" ").sort()).toEqual([
      "toggle",
      "toolbar",
    ]);
    // And it is still a stop of the roving order, not a bystander.
    expect(composed.tabIndex).toBe(0);
    expect(composed.getAttribute("data-state")).toBe("off");
  });

  it("keeps a composed toggle's own click working under the toolbar's", () => {
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarItem value="bold" render={<ToggleRoot>Bold</ToggleRoot>} />
      </ToolbarRoot>,
    );
    const composed = queryPart(container, "item") as HTMLElement;

    fire(() => composed.click());

    // The toolbar remembers where the pointer went; the toggle does the toggling.
    expect(composed.getAttribute("data-state")).toBe("on");
    expect(composed.tabIndex).toBe(0);
  });

  it("gives every item an identity without asking the author for one", () => {
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarItem>One</ToolbarItem>
        <ToolbarItem>Two</ToolbarItem>
      </ToolbarRoot>,
    );
    const [first, second] = items(container);
    const values = items(container).map((item) => item.dataset.value);

    expect(new Set(values).size).toBe(2);
    // One stop for the pair, and the arrows still find the other one.
    expect([first?.tabIndex, second?.tabIndex]).toEqual([0, -1]);
    focus(first);
    press(first, "ArrowRight");
    expect(document.activeElement).toBe(second);
  });

  it("hands the root's own attributes straight through", () => {
    // The title-bar case: a Tauri drag region, a class, a test hook — none of
    // them are the machine's business and all of them have to land.
    const { container } = mount(
      <ToolbarRoot label="Window" data-tauri-drag-region className="titlebar">
        <ToolbarItem value="close">Close</ToolbarItem>
      </ToolbarRoot>,
    );
    const root = queryPart(container, "root") as HTMLElement;

    expect(root.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(root.className).toBe("titlebar");
    expect(root.getAttribute("role")).toBe("toolbar");
  });

  it("rules across the bar unless told otherwise", () => {
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarSeparator />
        <ToolbarSeparator orientation="horizontal" />
      </ToolbarRoot>,
    );
    const [across, along] = queryParts(container, "separator");

    expect(across?.getAttribute("data-orientation")).toBe("vertical");
    expect(along?.getAttribute("data-orientation")).toBe("horizontal");
  });
});

describe("toolbar in React — axe", () => {
  it("passes named, in both orientations", async () => {
    const horizontal = mount(<Bar />);
    await expectNoAxeViolations(horizontal.container);

    const vertical = mount(<Bar orientation="vertical" />);
    await expectNoAxeViolations(vertical.container);
  });

  it("passes with an island in the bar", async () => {
    // A search field is not an item: it keeps its own tab stop and its own
    // caret, and the bar's arrows step over it. It still has to carry a name of
    // its own — the toolbar's does not cover it.
    const { container } = mount(
      <ToolbarRoot label="Library">
        <ToolbarItem value="new">New</ToolbarItem>
        <ToolbarSpacer />
        <input type="search" aria-label="Search the library" />
      </ToolbarRoot>,
    );

    await expectNoAxeViolations(container);
    expect(queryParts(container, "item")).toHaveLength(1);
  });

  it("passes with a focusable-disabled control in it", async () => {
    // `aria-disabled` rather than `disabled`: APG wants the control discoverable,
    // and the roving visits it precisely so a keyboard user can find out it is
    // unavailable.
    const { container } = mount(
      <ToolbarRoot label="Formatting">
        <ToolbarItem value="undo" aria-disabled="true">
          Undo
        </ToolbarItem>
        <ToolbarItem value="redo">Redo</ToolbarItem>
      </ToolbarRoot>,
    );

    await expectNoAxeViolations(container);
    const [undo, redo] = items(container);
    focus(undo);
    press(undo, "ArrowRight");
    expect(document.activeElement).toBe(redo);
  });
});

describe("toolbar in React — the title", () => {
  it("renders a heading by default and carries the size it was given", () => {
    const { container } = mount(
      <ToolbarRoot label="Library">
        <ToolbarTitle>Library</ToolbarTitle>
        <ToolbarTitle size="large">Large</ToolbarTitle>
      </ToolbarRoot>,
    );
    const [inline, large] = queryParts(container, "title");

    expect(inline?.localName).toBe("h1");
    expect(inline?.getAttribute("data-size")).toBe("inline");
    expect(large?.getAttribute("data-size")).toBe("large");
    expect(items(container)).toHaveLength(0);
  });

  it("lets the page choose the heading level", () => {
    const { container } = mount(
      <ToolbarRoot label="Library">
        {/* biome-ignore lint/a11y/useHeadingContent: the heading is a substitution handed to `useRender`, which fills it with the title's text. */}
        <ToolbarTitle render={<h2 />}>Library</ToolbarTitle>
      </ToolbarRoot>,
    );
    const title = queryPart(container, "title");

    expect(title?.localName).toBe("h2");
    expect(title?.getAttribute("data-part")).toBe("toolbar:title");
  });

  it("is never a tab stop: Tab crosses the bar over its title, from one control to the next outside", async () => {
    const { container } = mount(
      <>
        <button type="button" id="before">
          Before
        </button>
        <ToolbarRoot label="Library" data-variant="navigation-bar">
          <ToolbarTitle size="inline">Library</ToolbarTitle>
          <ToolbarGroup aria-label="Actions">
            <ToolbarItem value="back">Back</ToolbarItem>
            <ToolbarItem value="add">Add</ToolbarItem>
          </ToolbarGroup>
        </ToolbarRoot>
        <button type="button" id="after">
          After
        </button>
      </>,
    );
    const [back, add] = items(container);

    expect(items(container)).toHaveLength(2);
    expect([back?.tabIndex, add?.tabIndex]).toEqual([0, -1]);
    focus(container.querySelector<HTMLElement>("#before") ?? undefined);
    await userEvent.tab();
    expect(document.activeElement).toBe(back);
    await userEvent.tab();
    expect(document.activeElement?.id).toBe("after");
    expect(queryPart(container, "title")?.getAttribute("tabindex")).toBeNull();
  });
});

describe("toolbar in React — the composed entries", () => {
  it("keeps an action that carries a title a button, and refuses it at the type level", () => {
    const { container } = mount(
      <Toolbar
        label="Edit"
        items={[
          // @ts-expect-error `title` is the key of the title entry, not an attribute of a stop
          { value: "save", label: "Save", title: "Save the document" },
        ]}
      />,
    );

    expect(items(container)).toHaveLength(1);
    expect(items(container)[0]?.localName).toBe("button");
    expect(items(container)[0]?.textContent).toBe("Save");
    expect(container.querySelector("h1")).toBeNull();
    expect(queryPart(container, "title")).toBeNull();
  });
});

describe("toolbar in React — links as items", () => {
  it("makes one link the tab stop and moves between the others with the arrows", () => {
    const { container } = mount(<TabBar />);
    const [home, search, library] = items(container);

    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([0, -1, -1]);
    focus(home);
    press(home, "ArrowRight");
    expect(document.activeElement).toBe(search);
    expect(search?.tabIndex).toBe(0);
    expect(home?.tabIndex).toBe(-1);
    press(search, "End");
    expect(document.activeElement).toBe(library);
  });

  it("enters the bar on the current page, not on the first link", async () => {
    const { container } = mount(
      <>
        <button type="button" id="before">
          Before
        </button>
        <TabBar current="library" />
      </>,
    );
    const [home, search, library] = items(container);

    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([-1, -1, 0]);
    focus(container.querySelector<HTMLElement>("#before") ?? undefined);
    await userEvent.tab();
    expect(document.activeElement).toBe(library);
  });

  it("still remembers the stop it was left on, whatever page is current", () => {
    const { container } = mount(<TabBar current="library" />);
    const [home, search, library] = items(container);

    focus(library);
    press(library, "Home");
    expect(document.activeElement).toBe(home);
    fire(() => (home as HTMLElement).blur());
    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([0, -1, -1]);
  });

  it("moves the tab stop to the new page when the route changes while the bar is out of focus", async () => {
    const page = (current: string): React.ReactNode => (
      <>
        <button type="button" id="before">
          Before
        </button>
        <TabBar current={current} />
      </>
    );
    const view = mount(page("home"));
    view.render(page("library"));
    const [home, search, library] = items(view.container);

    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([-1, -1, 0]);
    focus(view.container.querySelector<HTMLElement>("#before") ?? undefined);
    await userEvent.tab();
    expect(document.activeElement).toBe(library);
  });

  it("moves the tab stop when only a link renders, because it computes its own aria-current", async () => {
    let route = "home";
    const listeners = new Set<() => void>();
    const go = async (next: string): Promise<void> => {
      route = next;
      await act(async () => {
        for (const listener of listeners) listener();
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    };
    const subscribe = (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    function NavLink(props: { to: string } & React.ComponentProps<"a">): React.ReactNode {
      const { to, ...rest } = props;
      const active = useSyncExternalStore(subscribe, () => route) === to;
      return <a {...rest} href={`#${to}`} aria-current={active ? "page" : undefined} />;
    }

    function LeafBar(): React.ReactNode {
      return (
        <ToolbarRoot label="Sections" data-variant="tab-bar">
          <ToolbarGroup aria-label="Pages">
            {["home", "search", "library"].map((value) => (
              <ToolbarItem key={value} value={value} render={<NavLink to={value} />}>
                {value}
              </ToolbarItem>
            ))}
          </ToolbarGroup>
        </ToolbarRoot>
      );
    }

    const { container } = mount(
      <>
        <button type="button" id="before">
          Before
        </button>
        <LeafBar />
      </>,
    );
    const [home, search, library] = items(container);

    await go("library");

    expect(library?.getAttribute("aria-current")).toBe("page");
    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([-1, -1, 0]);
    focus(container.querySelector<HTMLElement>("#before") ?? undefined);
    await userEvent.tab();
    expect(document.activeElement).toBe(library);
  });

  it("keeps the remembered stop when the bar re-renders on the same page", () => {
    const view = mount(<TabBar current="home" />);
    const [home, search, library] = items(view.container);

    focus(home);
    press(home, "ArrowRight");
    fire(() => (search as HTMLElement).blur());
    view.render(<TabBar current="home" />);

    expect([home?.tabIndex, search?.tabIndex, library?.tabIndex]).toEqual([-1, 0, -1]);
  });

  it("follows the link on Enter and leaves the bar to the browser", async () => {
    const { container } = mount(<TabBar />);
    const [home, search] = items(container);

    focus(home);
    press(home, "ArrowRight");
    expect(document.activeElement).toBe(search);
    await userEvent.keyboard("{Enter}");

    expect(location.hash).toBe("#search");
  });

  it("carries the current page on the anchor and no selection semantics", () => {
    const { container } = mount(<TabBar current="search" />);
    const [home, search] = items(container);

    expect(home?.localName).toBe("a");
    expect(home?.hasAttribute("aria-current")).toBe(false);
    expect(search?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("[aria-selected], [role=tab], [role=tablist]")).toBeNull();
    expect(home?.hasAttribute("type")).toBe(false);
  });
});

describe("toolbar in React — the bar layouts, axe", () => {
  it("passes as a tab bar inside a named nav", async () => {
    const { container } = mount(<TabBar current="library" />);

    await expectNoAxeViolations(container);
    expect(container.querySelector("nav[aria-label]")).not.toBeNull();
  });

  it("passes as a navigation bar with its title", async () => {
    const { container } = mount(<NavigationBar />);

    await expectNoAxeViolations(container);
  });
});
