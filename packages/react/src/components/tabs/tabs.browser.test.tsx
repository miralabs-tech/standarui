/**
 * Tabs through React: what a panel per value costs an adapter, and axe.
 *
 * The machine is proved in `packages/core/src/components/tabs` — the roving
 * order, the measured indicator, the closing rules and the gamepad all live
 * there, against the same DOM this file renders into. What only an adapter can
 * get wrong is *which panels exist*: `lazyMount` decides whether one is built at
 * all, `keepMounted` whether it stays, and the presence keeps the one that is
 * leaving in the tree until its exit has run. The three of them together decide
 * whether `aria-controls` names an element that is really there, which is the
 * one accessibility failure a headless component can ship silently.
 */

import { getTabbables } from "@standarui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  TabsCloseTrigger,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  type TabsRootProps,
  TabsTrigger,
} from "./tabs";

/**
 * A real exit for the presence to wait on. Nothing else in this harness loads
 * the stylesheet, so without these two rules a panel would leave on the very
 * next frame and the presence would be indistinguishable from an unmount.
 */
const SHEET = `
  [data-part~="tabs:content"] { opacity: 1; transition: opacity 80ms linear; }
  [data-part~="tabs:content"][data-state="inactive"] { opacity: 0; }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

interface ProjectProps extends TabsRootProps {
  readonly closable?: boolean;
}

function Project(props: ProjectProps): React.ReactNode {
  const { closable, ...root } = props;
  return (
    <TabsRoot {...root} closable={closable}>
      <TabsList aria-label="Project">
        <TabsIndicator />
        <TabsTrigger value="overview">Overview</TabsTrigger>
        {closable === true ? (
          <TabsCloseTrigger value="overview" aria-label="Close Overview" />
        ) : null}
        <TabsTrigger value="activity">Activity</TabsTrigger>
        {closable === true ? (
          <TabsCloseTrigger value="activity" aria-label="Close Activity" />
        ) : null}
        <TabsTrigger value="settings" disabled>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="activity">Activity panel</TabsContent>
      <TabsContent value="settings">Settings panel</TabsContent>
    </TabsRoot>
  );
}

function panels(container: ParentNode): string[] {
  return queryParts(container, "content").map((node) => node.textContent ?? "");
}

function tab(container: ParentNode, label: string): HTMLButtonElement {
  const node = [
    ...container.querySelectorAll<HTMLButtonElement>('[data-part~="tabs:trigger"]'),
  ].find((candidate) => candidate.textContent === label);
  if (node === undefined) throw new Error(`no tab labelled "${label}"`);
  return node;
}

/**
 * The same run `expectNoAxeViolations` performs, with the verdicts handed back
 * instead of asserted — for the one shape below that owes a named violation.
 */
async function axeViolations(node: Element): Promise<string[]> {
  const { run } = await import("axe-core");
  const results = await run(node as HTMLElement, {
    resultTypes: ["violations", "incomplete"],
    rules: { "color-contrast": { enabled: false } },
  });
  return [...results.violations, ...results.incomplete].map(
    (violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`,
  );
}

/** Every `aria-controls` on the page, and whether it names something real. */
function danglingControls(container: ParentNode): string[] {
  return [...container.querySelectorAll("[aria-controls]")]
    .map((node) => node.getAttribute("aria-controls") ?? "")
    .filter((id) => document.getElementById(id) === null);
}

afterEach(() => {
  unmountAll();
});

describe("TabsRoot — which panels exist", () => {
  it("renders every panel by default, and only the selected one is active", () => {
    const { container } = mount(<Project defaultValue="overview" />);

    expect(panels(container)).toEqual(["Overview panel"]);
    expect(queryPart(container, "content")?.dataset.state).toBe("active");
  });

  it("builds a panel only once its tab has been activated, and then keeps it", async () => {
    const { container } = mount(<Project defaultValue="overview" lazyMount keepMounted />);

    expect(panels(container)).toEqual(["Overview panel"]);

    fire(() => tab(container, "Activity").click());
    await settle();
    expect(panels(container)).toEqual(["Overview panel", "Activity panel"]);

    // Visited once is visited for good: a panel that rebuilt itself every time
    // its tab was left would make `lazyMount` a re-mount on every selection.
    fire(() => tab(container, "Overview").click());
    await settle();
    expect(panels(container)).toEqual(["Overview panel", "Activity panel"]);
  });

  it("keeps a deactivated panel in the tree, hidden, under `keepMounted`", () => {
    const { container } = mount(<Project defaultValue="overview" keepMounted />);
    const rendered = queryParts(container, "content");

    expect(rendered).toHaveLength(3);
    expect(rendered[0]?.hidden).toBe(false);
    expect(rendered[1]?.hidden).toBe(true);
    expect(rendered[1]?.dataset.state).toBe("inactive");
  });

  it("holds the leaving panel in the tree until its exit has run", async () => {
    const { container } = mount(<Project defaultValue="overview" />);

    fire(() => tab(container, "Activity").click());
    await settle();

    // Both, for as long as the transition lasts: the panel that is leaving is
    // never the panel that is arriving, which is why the presence lives on the
    // panel and not on the root.
    expect(panels(container)).toEqual(["Overview panel", "Activity panel"]);
    expect(queryParts(container, "content")[0]?.dataset.state).toBe("inactive");

    await waitFor(() => {
      expect(panels(container)).toEqual(["Activity panel"]);
    });
  });

  it("never points a tab at a panel that is not there", async () => {
    const { container } = mount(<Project defaultValue="overview" lazyMount />);

    // `aria-controls` is recommended on `role="tab"`, not required — missing is
    // allowed, dangling is the `aria-valid-attr-value` violation.
    expect(danglingControls(container)).toEqual([]);
    expect(tab(container, "Activity").hasAttribute("aria-controls")).toBe(false);

    fire(() => tab(container, "Activity").click());
    await waitFor(() => {
      expect(panels(container)).toEqual(["Activity panel"]);
    });

    expect(tab(container, "Activity").getAttribute("aria-controls")).toBe(
      queryPart(container, "content")?.id,
    );
    expect(danglingControls(container)).toEqual([]);
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<TabsTrigger value="x" />)).toThrow(/inside <TabsRoot>/);
    expect(() => mount(<TabsContent value="x" />)).toThrow(/inside <TabsRoot>/);
  });
});

describe("TabsRoot — axe", () => {
  it("passes over three tabs, one of them disabled", async () => {
    const { container } = mount(
      <main>
        <Project defaultValue="overview" />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });

  it("passes vertically, in RTL, named by its list", async () => {
    const { container } = mount(
      <main>
        <Project defaultValue="activity" orientation="vertical" dir="rtl" />
      </main>,
    );
    await settle();

    expect(queryPart(container, "list")?.getAttribute("aria-label")).toBe("Project");
    expect(queryPart(container, "list")?.getAttribute("aria-orientation")).toBe("vertical");
    await expectNoAxeViolations(container);
  });

  it("adds a named close button and no second tab stop", async () => {
    const { container } = mount(
      <main>
        <Project defaultValue="overview" closable />
      </main>,
    );
    await settle();

    const closers = queryParts(container, "close-trigger");
    expect(closers).toHaveLength(2);
    expect(closers.every((node) => node.getAttribute("aria-label") !== null)).toBe(true);
    // The list exposes exactly one stop in the tab order, and it is the selected
    // tab; the keyboard route to closing is `Delete`.
    expect(closers.every((node) => node.tabIndex === -1)).toBe(true);
    expect(getTabbables(container).filter((node) => closers.includes(node))).toEqual([]);
  });

  /**
   * `tablist` may only own `role="tab"`, so a close button standing in the bar is
   * `aria-required-children` however it is dressed — measured, not
   * reasoned: `role="none"` on it adds three violations of its own, a
   * `role="presentation"` wrapper changes nothing (axe walks through it), and
   * nesting the button inside the tab trades this rule for `nested-interactive`,
   * because `tab` has children-presentational and a `tabindex="-1"` descendant
   * still counts as focusable.
   *
   * So the close button is hidden from assistive technology **by default**, which
   * is what a redundant pointer affordance is: APG's own keyboard route to closing
   * is `Delete` on the tab, and the machine implements it. This was carried as a
   * named debt asserting the violation until 2026-09-01; it is not a debt any more.
   */
  it("passes with `closable`, because the close button says what it is", async () => {
    const { container } = mount(
      <main>
        <Project defaultValue="overview" closable />
      </main>,
    );
    await settle();

    // Zero violations *and* zero incompletes: `tabindex="-1"` is focusable and
    // not tabbable, which is the one shape `aria-hidden-focus` accepts outright.
    await expectNoAxeViolations(container);
    expect(await axeViolations(container)).toEqual([]);

    const closers = queryParts(container, "close-trigger");
    expect(closers).toHaveLength(2);
    expect(closers.every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("passes while `lazyMount` is holding two of its panels back", async () => {
    const { container } = mount(
      <main>
        <Project defaultValue="overview" lazyMount />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });
});
