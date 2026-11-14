import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, realKey, unmountAll } from "../../render-harness";
import { List, ListItem } from "./composed";
import {
  ListAction,
  ListFooter,
  ListGroup,
  ListHeader,
  ListLeading,
  ListRoot,
  ListRow,
  ListSection,
  ListSubtitle,
  ListTitle,
  ListTrailing,
} from "./list";

// biome-ignore lint/a11y/useHeadingContent: the headings are substitutions handed to `useRender`, which fills them with the header's text.
const H2: ReactElement = <h2 />;
// biome-ignore lint/a11y/useHeadingContent: see above.
const H4: ReactElement = <h4 />;

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="list:${name}"]`);
  if (node === null) throw new Error(`no list part "${name}"`);
  return node;
}

const PART_NAMES = [
  "root",
  "section",
  "header",
  "group",
  "row",
  "action",
  "leading",
  "title",
  "subtitle",
  "trailing",
  "footer",
] as const;

function Scene(): ReactNode {
  return (
    <ListRoot>
      <ListSection>
        <ListHeader>Account</ListHeader>
        <ListGroup>
          <ListRow size="tall">
            <ListAction>
              <ListLeading>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" />
              </ListLeading>
              <ListTitle>Profile</ListTitle>
              <ListSubtitle>Name, photo</ListSubtitle>
              <ListTrailing />
            </ListAction>
          </ListRow>
          <ListRow>
            <ListTitle>Storage</ListTitle>
            <ListTrailing>128 GB</ListTrailing>
          </ListRow>
        </ListGroup>
        <ListFooter>Changes apply to every device.</ListFooter>
      </ListSection>
    </ListRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("List: what the adapter adds", () => {
  it("renders all eleven parts on their native elements", () => {
    const { container } = mount(<Scene />);

    for (const name of PART_NAMES) {
      expect(part(container, name)).toBeTruthy();
    }
    expect(part(container, "root").tagName).toBe("DIV");
    expect(part(container, "section").tagName).toBe("SECTION");
    expect(part(container, "header").tagName).toBe("H3");
    expect(part(container, "group").tagName).toBe("UL");
    expect(part(container, "row").tagName).toBe("LI");
    expect(part(container, "action").tagName).toBe("BUTTON");
    expect(part(container, "footer").tagName).toBe("P");
    expect(part(container, "root").getAttribute("data-variant")).toBe("inset");
  });

  it("gives the group the list role and leaves the listitem to the native li", () => {
    const { container } = mount(<Scene />);

    expect(part(container, "group").getAttribute("role")).toBe("list");
    for (const row of container.querySelectorAll('[data-part~="list:row"]')) {
      expect(row.hasAttribute("role")).toBe(false);
      expect(row.parentElement).toBe(part(container, "group"));
    }
  });

  it("sizes each row on its own", () => {
    const { container } = mount(<Scene />);
    const rows = [...container.querySelectorAll('[data-part~="list:row"]')];

    expect(rows.map((row) => row.getAttribute("data-size"))).toEqual(["tall", "regular"]);
  });

  it("renders the action as a button that cannot submit a form", () => {
    const { container } = mount(<Scene />);

    expect(part(container, "action").getAttribute("type")).toBe("button");
  });

  it("substitutes a link on the action without a button type, and keeps both identities", () => {
    const { container } = mount(
      <ListRoot>
        <ListSection>
          <ListGroup>
            <ListRow>
              <ListAction render={<a href="/profile" className="hit" />}>
                <ListTitle>Profile</ListTitle>
              </ListAction>
            </ListRow>
          </ListGroup>
        </ListSection>
      </ListRoot>,
    );

    const action = part(container, "action");
    expect(action.tagName).toBe("A");
    expect(action.hasAttribute("type")).toBe(false);
    expect(action.className).toBe("hit");
    expect(action.getAttribute("href")).toBe("/profile");
    expect(action.getAttribute("data-part")).toBe("list:action");
  });

  it("keeps a consumer's own button type", () => {
    const { container } = mount(
      <ListRoot>
        <ListSection>
          <ListGroup>
            <ListRow>
              <ListAction type="submit">
                <ListTitle>Send</ListTitle>
              </ListAction>
            </ListRow>
          </ListGroup>
        </ListSection>
      </ListRoot>,
    );

    expect(part(container, "action").getAttribute("type")).toBe("submit");
  });

  it("introduces no tabindex and tabs through the actions alone", async () => {
    const { container } = mount(
      <List header="Links">
        <ListItem title="One" action={<button type="button" />} />
        <ListItem title="Two" />
        <ListItem title="Three" action={<button type="button" />} />
      </List>,
    );

    expect(container.querySelectorAll("[tabindex]").length).toBe(0);
    (document.activeElement as HTMLElement | null)?.blur();
    const order: (string | null)[] = [];
    for (let step = 0; step < 3; step += 1) {
      await realKey("{Tab}");
      const active = document.activeElement;
      order.push(container.contains(active) ? (active?.textContent ?? null) : null);
    }
    expect(order).toEqual(["One", "Three", null]);
  });

  it("makes the header an h3 by default and lets render correct the level", () => {
    const { container } = mount(
      <List header="Default" parts={{ header: { render: H4 } }}>
        <ListItem title="Row" />
      </List>,
    );

    expect(part(container, "header").tagName).toBe("H4");
    expect(part(container, "header").getAttribute("data-part")).toBe("list:header");
  });

  it("places the composed row's content inside its action", () => {
    const { container } = mount(
      <List>
        <ListItem title="Profile" subtitle="Name" action={<a href="/p" />} />
      </List>,
    );

    const action = part(container, "action");
    expect(part(container, "title").parentElement).toBe(action);
    expect(part(container, "subtitle").parentElement).toBe(action);
    expect(container.querySelector('[data-part~="list:trailing"]')).toBeNull();
  });

  it("writes data-chevron none on the row only when asked", () => {
    const { container } = mount(
      <List>
        <ListItem title="Kept" action={<a href="/k" />} />
        <ListItem title="Withdrawn" chevron="none" action={<a href="/w" />} />
      </List>,
    );

    const rows = container.querySelectorAll<HTMLElement>('[data-part~="list:row"]');
    expect(rows[0]?.getAttribute("data-chevron")).toBeNull();
    expect(rows[1]?.getAttribute("data-chevron")).toBe("none");
  });
});

describe("List: axe", () => {
  it("passes as an inset list with acting and plain rows", async () => {
    const handle = mount(
      <main>
        <h1>Settings</h1>
        <h2>Preferences</h2>
        <List header="Account" footer="Changes apply to every device.">
          <ListItem
            title="Profile"
            subtitle="Name, photo"
            size="tall"
            action={<a href="/profile" />}
          />
          <ListItem title="Storage" trailing="128 GB" />
          <ListItem title="Language" action={<button type="button" />} />
        </List>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes as a plain list with a leading image", async () => {
    const handle = mount(
      <main>
        <h1>Library</h1>
        <List variant="plain" header="Albums" parts={{ header: { render: H2 } }}>
          <ListItem
            title="Overtones"
            subtitle="Liquid session"
            size="tall"
            leading={<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />}
            action={<a href="/overtones" />}
          />
          <ListItem title="Rooftop" action={<a href="/rooftop" />} />
        </List>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes as two sections under a page heading", async () => {
    const handle = mount(
      <main>
        <h1>Settings</h1>
        <h2>Preferences</h2>
        <ListRoot>
          {["General", "Privacy"].map((name) => (
            <ListSection key={name}>
              <ListHeader>{name}</ListHeader>
              <ListGroup>
                <ListItem title={`${name} one`} />
                <ListItem title={`${name} two`} action={<a href={`/${name}`} />} />
              </ListGroup>
            </ListSection>
          ))}
        </ListRoot>
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
