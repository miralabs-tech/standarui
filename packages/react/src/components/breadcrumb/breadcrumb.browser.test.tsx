/**
 * Breadcrumb through React, and only what an adapter can get wrong.
 *
 * The machine is proved in `packages/core/src/components/breadcrumb`. What could
 * not live there is **order**: the core's own harness paints from a tracker to
 * imitate what React gets for free, and this file is the real thing — the commit
 * takes `hidden` off the revealed levels, *then* the layout effect runs the
 * watcher that moves the focus. If those two ever swap, the focus lands on a level
 * that is still `display: none` and quietly falls to `body`.
 *
 * The other adapter-only concern is the overflow-menu composition, and the nesting
 * order in it is deliberate — see the comment on `Overflow` below.
 */

import { setInputModality } from "@standarx/nav";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
} from "../../render-harness";
import {
  MenuContent,
  MenuItem,
  MenuItemText,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "../menu";
import {
  BreadcrumbEllipsis,
  BreadcrumbEllipsisTrigger,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbRoot,
  type BreadcrumbRootProps,
} from "./breadcrumb";

afterEach(() => unmountAll());

interface Crumb {
  readonly label: string;
  readonly collapsed?: boolean;
  readonly current?: boolean;
}

const TRAIL: readonly Crumb[] = [
  { label: "Home" },
  { label: "Library", collapsed: true },
  { label: "Photos", collapsed: true },
  { label: "Iceland" },
  { label: "Fjords", current: true },
];

function Trail(props: Partial<BreadcrumbRootProps>): React.ReactNode {
  const levels: React.ReactNode[] = [];

  for (const [index, crumb] of TRAIL.entries()) {
    levels.push(
      <BreadcrumbItem key={crumb.label} collapsed={crumb.collapsed}>
        <BreadcrumbLink current={crumb.current} href={`#${crumb.label.toLowerCase()}`}>
          {crumb.label}
        </BreadcrumbLink>
      </BreadcrumbItem>,
    );
    // The ellipsis stands where the folded run begins — after the first level.
    if (index === 0) {
      levels.push(
        <BreadcrumbEllipsis key="ellipsis">
          <BreadcrumbEllipsisTrigger />
        </BreadcrumbEllipsis>,
      );
    }
  }

  return (
    <BreadcrumbRoot {...props}>
      <BreadcrumbList>{levels}</BreadcrumbList>
    </BreadcrumbRoot>
  );
}

function links(container: ParentNode): HTMLElement[] {
  return queryParts(container, "link");
}

function trail(container: ParentNode): HTMLButtonElement | null {
  return queryPart<HTMLButtonElement>(container, "ellipsis-trigger");
}

describe("BreadcrumbRoot — the landmark and its levels", () => {
  it("renders the six parts on the elements the pattern names", () => {
    const { container } = mount(<Trail />);

    expect(queryPart(container, "root")?.localName).toBe("nav");
    expect(queryPart(container, "root")?.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(queryPart(container, "list")?.localName).toBe("ol");
    expect(queryParts(container, "item")[0]?.localName).toBe("li");
    expect(links(container)[0]?.localName).toBe("a");
    expect(queryPart(container, "ellipsis")?.localName).toBe("li");

    const trigger = trail(container);
    expect(trigger?.localName).toBe("button");
    expect(trigger?.type).toBe("button");
    // No children of its own: the three dots are the sheet's, never a text glyph.
    expect(trigger?.textContent).toBe("");
    expect(trigger?.getAttribute("aria-controls")).toBe(queryPart(container, "list")?.id);
  });

  it("carries `collapsed` and `current` from the part props to the DOM", () => {
    const { container } = mount(<Trail />);
    const items = queryParts(container, "item");

    expect(items[0]?.hasAttribute("data-collapsed")).toBe(false);
    expect(items[1]?.getAttribute("data-collapsed")).toBe("");
    expect(items[1]?.hasAttribute("hidden")).toBe(true);
    expect(links(container).at(-1)?.getAttribute("aria-current")).toBe("page");
    expect(links(container)[0]?.hasAttribute("aria-current")).toBe(false);
  });

  it("forwards a ref to the element a part rendered", () => {
    const seen: (HTMLAnchorElement | null)[] = [];
    mount(
      <BreadcrumbRoot>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href="#home"
              ref={(node: HTMLAnchorElement | null) => {
                seen.push(node);
              }}
            >
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>,
    );

    expect(seen[0]?.localName).toBe("a");
    expect(seen[0]?.getAttribute("data-part")).toBe("breadcrumb:link");
  });

  it("reveals the run and lands the focus on its first level, under a keyboard", () => {
    const onExpandedChange = vi.fn();
    const { container } = mount(<Trail onExpandedChange={onExpandedChange} />);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    fire(() => trail(container)?.click());

    expect(onExpandedChange).toHaveBeenCalledTimes(1);
    expect(onExpandedChange).toHaveBeenCalledWith({ expanded: true });
    expect(queryParts(container, "item")[1]?.hasAttribute("hidden")).toBe(false);
    expect(queryPart(container, "ellipsis")?.hasAttribute("hidden")).toBe(true);
    // The commit took `hidden` off before the watcher went looking. This is the
    // assertion the whole file exists for.
    expect(document.activeElement).toBe(links(container)[1]);
  });

  it("parks the focus on the list under a pointer, where no ring is styled", () => {
    const { container } = mount(<Trail />);

    setInputModality(document, "pointer");
    fire(() => trail(container)?.click());

    expect(document.activeElement).toBe(queryPart(container, "list"));
    expect(container.querySelectorAll('[data-part~="breadcrumb:link"]:focus-visible')).toHaveLength(
      0,
    );
  });

  it("reports without writing while controlled, and follows the prop back down", () => {
    const onExpandedChange = vi.fn();
    const handle = mount(<Trail expanded={false} onExpandedChange={onExpandedChange} />);

    fire(() => trail(handle.container)?.click());

    expect(onExpandedChange).toHaveBeenCalledWith({ expanded: true });
    expect(queryParts(handle.container, "item")[1]?.hasAttribute("hidden")).toBe(true);

    handle.render(<Trail expanded onExpandedChange={onExpandedChange} />);

    expect(queryParts(handle.container, "item")[1]?.hasAttribute("hidden")).toBe(false);
    expect(trail(handle.container)?.getAttribute("aria-expanded")).toBe("true");
  });
});

/**
 * The overflow-menu presentation, and the nesting is the point.
 *
 * The spec wrote it the other way round — `<BreadcrumbEllipsisTrigger render={<MenuTrigger/>}>`
 * — and that order does not survive contact with `mergeProps`, whose rule for
 * values is "later wins": the *outer* part's `id`, `aria-expanded` and
 * `aria-controls` overwrite the inner one's. The menu looks its own trigger up by
 * that id to anchor the surface, and `aria-expanded` would then describe the
 * breadcrumb's inline disclosure while the menu is what actually opened. With the
 * menu outside, every one of those stays the menu's, both `onClick`s still run,
 * and `data-part` merges either way — which is all the breadcrumb needs here,
 * since the dots and the plate are drawn off that token.
 *
 * `expanded={false}` is pinned for a related reason: in menu mode there is no
 * folded run in the list to disclose, and letting the state flip would put
 * `hidden` on the very `li` that hosts the open menu's trigger.
 */
function Overflow(): React.ReactNode {
  return (
    <BreadcrumbRoot expanded={false}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#home">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbEllipsis>
          <MenuRoot>
            <MenuTrigger render={<BreadcrumbEllipsisTrigger />} />
            <MenuPortal>
              <MenuPositioner>
                <MenuContent>
                  <MenuItem value="library">
                    <MenuItemText>Library</MenuItemText>
                  </MenuItem>
                </MenuContent>
              </MenuPositioner>
            </MenuPortal>
          </MenuRoot>
        </BreadcrumbEllipsis>
        <BreadcrumbItem>
          <BreadcrumbLink current href="#fjords">
            Fjords
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}

describe("BreadcrumbEllipsisTrigger composed with a menu", () => {
  it("wears both identities and opens the menu", async () => {
    const { container } = mount(<Overflow />);
    const trigger = trail(container);

    expect(trigger?.getAttribute("data-part")?.split(" ").sort()).toEqual([
      "breadcrumb:ellipsis-trigger",
      "menu:trigger",
    ]);
    expect(trigger?.getAttribute("data-scope")?.split(" ").sort()).toEqual(["breadcrumb", "menu"]);
    // The menu's own props reached the element rather than being overwritten.
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");

    fire(() => trigger?.click());
    await settle();

    expect(queryPart(document.body, "content")?.getAttribute("role")).toBe("menu");
    // The `li` that hosts the trigger is still in the tree: the pinned state is
    // what keeps `hidden` off it while the menu is open.
    expect(queryPart(container, "ellipsis")?.hasAttribute("hidden")).toBe(false);
  });
});

describe("BreadcrumbRoot — axe", () => {
  it("passes folded", async () => {
    const { container } = mount(<Trail />);
    await expectNoAxeViolations(container);
  });

  it("passes revealed", async () => {
    const { container } = mount(<Trail defaultExpanded />);
    await expectNoAxeViolations(container);
  });

  it("passes composed with a menu", async () => {
    const { container } = mount(<Overflow />);
    await expectNoAxeViolations(container);
  });
});
