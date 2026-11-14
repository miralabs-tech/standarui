/**
 * The other half of `ssr.test.tsx`, and the half that was missing: `hydrateRoot`
 * appeared nowhere in the repository.
 *
 * That mattered more than a coverage gap, because the reasoning behind two
 * shipped decisions rests on it and nothing was checking either one:
 *
 *  - **the `dir` correction.** Every machine used to default `dir` to `"ltr"` and
 *    emit it as an attribute, which reset every miralabs.tech subtree nested in an RTL
 *    region. The default is gone, and portalled surfaces resolve their direction
 *    *in an effect* — the argument being that the server then emits nothing and
 *    the first client render has nothing to disagree with. That argument is a
 *    hydration claim, and this file is where it is answered.
 *  - **`hidden="until-found"`.** React DOM keeps `hidden` in its boolean
 *    attribute list, so the string used to be destroyed on the way to the DOM.
 *    The normalizer fixes it for client renders; server markup takes a different
 *    path through React, so the round trip is worth pinning here too.
 *
 * A React hydration mismatch is a `console.error`, not a thrown error and not a
 * visible difference — it is reconciled away and the page looks right. So the
 * assertion is on the console, and it has to be, or this file would pass while
 * proving nothing.
 */

import { act, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from "./components/accordion";
import { AvatarFallback, AvatarImage, AvatarRoot } from "./components/avatar";
import { BadgeRoot } from "./components/badge";
import { ButtonRoot } from "./components/button";
import { CheckboxControl, CheckboxRoot } from "./components/checkbox";
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from "./components/collapsible";
import { LinkRoot } from "./components/link";
import { MeterLabel, MeterRange, MeterRoot, MeterTrack } from "./components/meter";
import { PaginationItem, PaginationRoot } from "./components/pagination";
import { Sidebar, SidebarBlock, SidebarEntry, SidebarTrigger } from "./components/sidebar";
import { SwitchControl, SwitchRoot, SwitchThumb } from "./components/switch";
import { Tabs, TabsContent, TabsList, TabsRoot, TabsTrigger } from "./components/tabs";
import { ToggleGroup, ToggleGroupItem, ToggleGroupRoot } from "./components/toggle-group";
import { ToolbarItem, ToolbarRoot } from "./components/toolbar";

const hosts: HTMLElement[] = [];
let errors: unknown[][];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

afterEach(() => {
  spy.mockRestore();
  for (const host of hosts.splice(0, hosts.length)) host.remove();
});

/**
 * Server-render, put the markup in the page, hydrate the same tree over it.
 *
 * `StrictMode` on purpose: React only reports the full set of hydration
 * differences under it, and a double-invoked render is also the cheapest way to
 * catch an effect that writes during the first commit.
 */
async function hydrate(element: React.ReactElement, wrapper?: (html: string) => string) {
  const html = renderToString(element);
  const host = document.createElement("div");
  host.innerHTML = wrapper === undefined ? html : wrapper(html);
  document.body.append(host);
  hosts.push(host);

  const target = host.firstElementChild as HTMLElement;
  await act(async () => {
    hydrateRoot(wrapper === undefined ? host : target, <StrictMode>{element}</StrictMode>);
  });
  // A second flush, and it is not superstition: hydration commits the tree before
  // it runs the effects that read the DOM (a measured height, a resolved
  // direction), and those effects schedule the render that shows their result.
  await act(async () => {});
  return { host, html };
}

/** Everything React says about hydration, and nothing it says about anything else. */
function hydrationErrors(): string[] {
  return errors
    .map((args) => args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "))
    .filter((message) => /hydrat|did not match|server (?:HTML|render)|mismatch/i.test(message));
}

describe("hydration", () => {
  it("hydrates the controls that carry a machine without a single mismatch", async () => {
    await hydrate(
      <div>
        <ButtonRoot>Save</ButtonRoot>
        <CheckboxRoot defaultChecked>
          <CheckboxControl />
        </CheckboxRoot>
        <SwitchRoot defaultChecked>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
        </SwitchRoot>
        <TabsRoot defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First</TabsContent>
          <TabsContent value="two">Second</TabsContent>
        </TabsRoot>
      </div>,
    );

    expect(hydrationErrors()).toEqual([]);
  });

  it("hydrates the composed toggle-group and tabs, drawn bar included, without a mismatch", async () => {
    const { host } = await hydrate(
      <div>
        <ToggleGroup
          aria-label="Range"
          defaultValue={["day"]}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
        />
        <Tabs
          defaultValue="one"
          items={[
            { value: "one", label: "One", content: "First" },
            { value: "two", label: "Two", content: "Second" },
          ]}
        />
      </div>,
    );

    expect(hydrationErrors()).toEqual([]);
    expect(host.querySelectorAll('[data-part~="toggle-group:scrollbar"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-part~="tabs:scrollbar"]')).toHaveLength(1);
  });

  it("hydrates the presentational eighteen, whose whole output is the first render", async () => {
    await hydrate(
      <div>
        <BadgeRoot kind="count" tone="danger">
          12
        </BadgeRoot>
        <LinkRoot href="#a">the release notes</LinkRoot>
        <AvatarRoot label="Ada Lovelace">
          <AvatarImage alt="" />
          <AvatarFallback>AL</AvatarFallback>
        </AvatarRoot>
        <MeterRoot value={40} low={30} high={70}>
          <MeterLabel>Battery</MeterLabel>
          <MeterTrack>
            <MeterRange />
          </MeterTrack>
        </MeterRoot>
        <PaginationRoot count={100} pageSize={10} defaultPage={3}>
          <PaginationItem page={3} />
        </PaginationRoot>
        <ToolbarRoot label="Formatting">
          <ToolbarItem value="bold" render={<ButtonRoot variant="plain" />}>
            Bold
          </ToolbarItem>
        </ToolbarRoot>
      </div>,
    );

    expect(hydrationErrors()).toEqual([]);
  });

  it("hydrates the sidebar, its trigger and its closed drawer under both densities", async () => {
    // Nothing the markup says depends on the density: the stylesheet picks the
    // column or the drawer, so the two ends have nothing to disagree about, and the
    // drawer is a portal that is not rendered while it is closed.
    for (const density of ["desktop", "touch"]) {
      document.documentElement.dataset.suiDensity = density;
      const { host } = await hydrate(
        <div>
          <SidebarTrigger aria-label="Show the sidebar" open={false} />
          <Sidebar label="Library" header="Acme" footer="v1" open={false}>
            <SidebarBlock header="Browse">
              <SidebarEntry link={<a href="#home" />} label="Home" current trailing="24" />
            </SidebarBlock>
            <SidebarBlock header="Playlists" collapsible defaultOpen>
              <SidebarEntry link={<a href="#mix" />} label="Mix" />
            </SidebarBlock>
          </Sidebar>
        </div>,
      );

      expect(hydrationErrors(), density).toEqual([]);
      expect(host.querySelectorAll('[data-part~="sidebar:root"]').length, density).toBe(1);
      expect(host.querySelector('[data-part~="sidebar:drawer"]'), density).toBeNull();
    }
    document.documentElement.removeAttribute("data-sui-density");
  });

  it("emits no `dir` on the server, and adds none on the client, inside an RTL region", async () => {
    // The correction's actual claim, and the one nothing was checking. A `dir`
    // written by the library would both reset the region *and* be a hydration
    // difference if it were decided on the client — so the absence has to hold on
    // both sides of the round trip, not just on one.
    const { host, html } = await hydrate(
      <TabsRoot defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
      </TabsRoot>,
      (markup) => `<div dir="rtl">${markup}</div>`,
    );

    expect(html).not.toContain("dir=");
    expect(hydrationErrors()).toEqual([]);
    for (const node of host.querySelectorAll("[data-scope]")) {
      expect(node.hasAttribute("dir"), node.outerHTML).toBe(false);
    }
    // And the subtree really does inherit, which is the whole point of not
    // declaring it: the computed direction is the region's.
    const list = host.querySelector<HTMLElement>('[data-part~="tabs:list"]');
    expect(list).not.toBeNull();
    expect(getComputedStyle(list as HTMLElement).direction).toBe("rtl");
  });

  it("ships a closed disclosure as plain `hidden` and puts the keyword back on hydration", async () => {
    // The exact handoff `normalize-props` describes, and the half nothing was
    // checking. React owns the attribute's *lifecycle*: it is handed
    // `hidden: true`, so the server writes the only value React can express —
    // `hidden=""` — and hydration matches it without a murmur. The keyword is put
    // back afterwards by a callback ref, which React attaches in the layout phase
    // of the same commit.
    //
    // Asserting the server markup carried the keyword would be asserting a
    // mismatch: React would have had to disagree with itself for that to happen.
    // What is worth pinning is that the two ends meet — no hydration error, and
    // the keyword on the node once the commit is done.
    //
    // The gap this leaves is real and inherent: between the response arriving and
    // hydration finishing, a closed panel is plain `hidden` and Ctrl+F does not
    // reach it. There is no attribute React would emit that closes it.
    //
    // `hiddenUntilFound` is opt-in, so both halves are checked here — the panel
    // that asked for find-in-page and the one that did not.
    const { host, html } = await hydrate(
      <AccordionRoot hiddenUntilFound>
        <AccordionItem value="shipping">
          <AccordionHeader>
            <AccordionTrigger>Shipping</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>Orders leave within two working days.</AccordionContent>
        </AccordionItem>
      </AccordionRoot>,
    );

    expect(html).toContain('hidden=""');
    expect(html).not.toContain("until-found");
    expect(hydrationErrors()).toEqual([]);

    const content = host.querySelector<HTMLElement>('[data-part~="accordion:content"]');
    expect(content?.getAttribute("hidden")).toBe("until-found");

    // And the opt-out really is the default, so a page that never asked for
    // find-in-page never pays the callback ref for it.
    const plain = await hydrate(
      <AccordionRoot>
        <AccordionItem value="returns">
          <AccordionHeader>
            <AccordionTrigger>Returns</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>Thirty days.</AccordionContent>
        </AccordionItem>
      </AccordionRoot>,
    );
    expect(
      plain.host
        .querySelector<HTMLElement>('[data-part~="accordion:content"]')
        ?.getAttribute("hidden"),
    ).toBe("");
  });

  it("hydrates an open disclosure whose height is measured only after the mount", async () => {
    // The height is read from the DOM, so the server has no number for it. What
    // this pins is that the absence is a *stable* absence: the markup carries no
    // measured length, and the first client render agrees before any effect runs.
    const { host, html } = await hydrate(
      <CollapsibleRoot defaultOpen>
        <CollapsibleTrigger>Billing</CollapsibleTrigger>
        <CollapsibleContent>The card ending 4242.</CollapsibleContent>
      </CollapsibleRoot>,
    );

    expect(html).not.toContain("--sui-collapsible-height");
    expect(hydrationErrors()).toEqual([]);
    const content = host.querySelector<HTMLElement>('[data-part~="collapsible:content"]');
    expect(content?.getAttribute("data-state")).toBe("open");
  });

  it("ships a segmented control the keyboard can reach before it hydrates", async () => {
    // The single tab stop is chosen from the item order, which is read from the
    // DOM, so a server render has no stop to name. It used to name `-1` anyway,
    // on every segment including the selected one, and the whole control sat
    // outside the tab order until hydration finished. Both ends are pinned here:
    // nothing said on the server, exactly one stop once the items are read.
    //
    // The assertion is on the *attribute* on purpose. A `<button>` reports
    // `tabIndex === 0` when it carries no attribute at all, so reading the
    // property would pass on the bug and on the fix alike.
    const { host, html } = await hydrate(
      <ToggleGroupRoot defaultValue={["list"]}>
        <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroupRoot>,
    );

    expect(html).not.toContain("tabindex");
    expect(hydrationErrors()).toEqual([]);

    const items = [...host.querySelectorAll<HTMLElement>('[data-part~="toggle-group:item"]')];
    expect(items.map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0"]);
  });

  it("ships an unselected tab list the keyboard can reach before it hydrates", async () => {
    // The same window as the segmented control above, reached by a different
    // route: the stop rides on the selection, and a list whose consumer named no
    // `defaultValue` has none until `syncTriggers` settles APG's "exactly one
    // selected tab" — which needs the document. Every trigger used to ship `-1`,
    // and the list was gone from the tab order for that pass.
    const { host, html } = await hydrate(
      <TabsRoot>
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
        <TabsContent value="two">Second</TabsContent>
      </TabsRoot>,
    );

    expect(html).not.toContain("tabindex");
    expect(hydrationErrors()).toEqual([]);

    const triggers = [...host.querySelectorAll<HTMLElement>('[data-part~="tabs:trigger"]')];
    expect(triggers.map((trigger) => trigger.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });
});
